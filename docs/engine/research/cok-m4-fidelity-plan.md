# CoK M4 (content-port Milestone 4) — Behavioral-Fidelity Turnkey Plan

**Status:** STATIC-ONLY prep pass (2026-07-18). No DOSBox-X session was launched to produce this
doc — the project's single DOSBox-X/GameLink slot was held by a concurrent RNG round (see
`docs/engine/ROADMAP.md` "Critical path to the two end goals (2026-07-18)", Wave 1). Everything
below that claims a concrete result (build assembles, ECL/GEO/MON bytes match, journal-word
solver exists) was verified statically/locally in this pass. Everything that requires a live
DOSBox-X run is clearly marked **UNVERIFIED (live run required)**.

**Goal this doc unblocks:** `docs/engine/research/cok-content-port-plan.md` Milestone 4 — drive
the `cok-on-dqk` build (CoK's own GEO/MON/ECL content, ported byte-for-byte onto the real
`DQK.EXE` engine) past the front menu, through the copy-protection prompt, into a CoK dungeon, and
into a scripted CoK combat — confirming CoK plays faithfully on the DQK engine (settles residual
risk R1: a CoK-specific native rule baked into `DQK.EXE`). Per `ROADMAP.md`, this is Goal 1's last
open verification gate; GameLink automation removes the "no scriptable debugger" excuse that
parked it previously.

**Required reading before running anything in this doc:**
`docs/engine/research/cok-content-port-plan.md` (esp. §0/§2/§3/§6 Milestone 4),
`docs/engine/research/dosbox-x-gamelink-automation.md` (in full — the focusless-input mechanism
AND the "one DOSBox-X agent at a time" singleton hazard),
`docs/engine/research/dqk-copy-protection.md`,
`docs/engine/research/cok-natural-route.md`.

---

## 1. Build freshness check

### Where the build is assembled

`tools/build-dqk-dir.mts` is the executor around the engine's pure `planDqkBuild`
(`packages/engine/src/loaders/buildDqkDisk.ts`) and `buildDqkGameDataMulti`
(`packages/engine/src/loaders/buildDqkGame.ts`). It reads CoK's `GEO{n}.DAX` / `MON{n}CHA.DAX` /
`ECL{n}.DAX` (auto-discovering all three disks by default), assembles the DQK Gen2 container set
(`GEO.GLB`, `MONCHA.GLB`, `ECL.GLB` + item/save/EXE-patch plan), and writes a bootable directory
tree (`DISK1/2/3`, `DQK.EXE`, `dosbox.conf`, `SAVE/`) by copying passthrough files from a real DQK
release and emitting the generated ones. Output is git-ignored (`build/` holds copyrighted game
art/data) — it must be (re)built locally, never committed.

### Exact rebuild command (verified working against current working tree, 2026-07-18)

```powershell
cd C:\Modding\GoldBox
npx tsx tools/build-dqk-dir.mts `
  --dqk "The Dark Queen of Krynn" --src "Champions of Krynn" --target cok `
  --out build/cok-on-dqk-m4fidelity `
  --save "The Dark Queen of Krynn" --save-area 34 --save-ecl-member 34 --save-dungeon `
  --bypass-protection
```

**This was actually run in this pass.** Real output:

```
[build-dqk] cok (merged 3 GEO / 3 ECL / 3 MON disks): 15 maps, 22 scripts, 57 monsters, 15 playable areas.
[build-dqk] monster slots deduped across disks (byte-identical): 23
[build-dqk] save-drop: resume → ECL area 34 member 34 (dungeon)
[build-dqk] save-drop: C:\Modding\GoldBox\The Dark Queen of Krynn\SAVGAMA.QSV (+ VAULTA.DAT)
[build-dqk] bypass-protection: DQK.EXE 0xFC00-flag gate (1D99:1553) patched. NOTE: does NOT stop
  the journal-word prompt (overlay-12, UNLOCATED) — see dqk-copy-protection.md.
[build-dqk] wrote 8 generated file(s) + copied 43 passthrough file(s) -> build\cok-on-dqk-m4fidelity
[build-dqk] boot it: dosbox -conf "build\cok-on-dqk-m4fidelity\dosbox.conf"
```

**Verdict: the build assembles cleanly today (2026-07-18 working tree, commit `8abeff9` plus
several other agents' uncommitted WIP present — see §6 caveat).** Output tree:
`DISK1/` (audio/engine passthrough), `DISK2/{MONCHA.GLB, art .TLB}`, `DISK3/{ECL.GLB, GEO.GLB,
art .TLB}`, `DQK.EXE` (title- and 0xFC00-gate-patched), `SAVGAMA.QSV` (+ `SAVE/` mirror),
`dosbox.conf`.

**Boot command** (from the emitted `dosbox.conf`'s own `[autoexec]`, confirmed by reading it):

```
mount c "."
c:
DQK SB220 SI7 RB330
```

i.e. `dosbox -conf build/cok-on-dqk-m4fidelity/dosbox.conf`, or for the DOSBox-X/GameLink path,
mount `build/cok-on-dqk-m4fidelity` as the game dir and run `DQK.EXE` (see §3).

### `--amiga` art lift (optional, not required for M4)

`tools/build-dqk-dir.mts --amiga amiga_extracted/ChampionsOfKrynn` lifts the Amiga `BIGPIC`/
`COMSPR` art (see `cok-content-port-plan.md` §1.2). M4's purpose is *behavioral* fidelity (does
CoK's data/rules execute correctly), not art — the plan below deliberately omits `--amiga` to keep
the build minimal and reproducible; add it later for a "final" capture once M4 passes.

### A negative finding worth recording: the shipped CoK pregen save is NOT directly usable

The lead's brief asked to check whether `Champions of Krynn/SAVE/{SAVGAMA.DAT, CHRDATA1..6.SAV}`
(CoK's own shipped pregen party, Gen1 format) is the fast path for `--save`. **It is not.**
`tools/build-dqk-dir.mts --save` requires a directory holding a **Gen2 `SAVGAMA.QSV`** — a
structurally different flat format (see `docs/engine/research/dqk-save-resume.md`'s "Critical
discovery" section: COAB/Gen1 `.DAT` uses a `gbl.area_ptr` struct with separate per-character
`.sav` files; DQK/Gen2 `.QSV` is a flat SAVGAM.TXT-offset format with characters embedded inline).
There is currently no CoK-pregen-party → DQK-QSV encoder in this repo (the existing "character
import" work, `[[goldbox-character-import]]`, is CoK→DoK on the *browser* engine's own save
format, not CoK→DQK-QSV). **The proven fast path instead is the DQK-native resume-save recipe**
(`dqk-save-resume.md` §4, already implemented as `patchDqkSaveResumeArea` /
`--save-area`/`--save-ecl-member`/`--save-dungeon`): copy DQK's own shipped `SAVGAMA.QSV` (which
carries DQK's own valid 6-hero pregen party: SIR DRYDEN, JORIS THE WISE, LENDUIRA, neacail, ALARIC
THE BOLD, MAIGUREIGNE — confirmed by decoding the emitted save, see §4 below) and patch its
resume-area/ECL-member/init-flag bytes to point at CoK content. This is what the rebuild command
above does. **Implication for fidelity:** the party you'll see in-game is DQK's own pregen roster,
not CoK's canonical one — fine for testing whether CoK's GEO/MON/ECL *content* and DQK's *rules
engine* interoperate (M4's actual purpose), but it means "party stats fidelity" in §4 below is
checked against a valid-but-non-canonical party, not CoK's own pregens. Building a CoK-pregen→QSV
encoder is a real, separate future task if literal CoK-character fidelity is ever wanted; out of
scope here.

---

## 2. Journal-word answering

### Whose protection is this?

**DQK.EXE's own native copy-protection**, not CoK's. Two independent facts (already established
in `docs/engine/research/dqk-copy-protection.md` and `cok-copy-protection.md`, re-confirmed by
reading both docs in full this pass):

1. CoK's own protection is invoked by ECL opcode `PROGRAM #0` inside **ECL1 block 18** (the
   overland-transition dispatcher). The M4 route resumes directly into **block 34** (or block 16
   for the overland path) via the save-state injection recipe — neither block calls `PROGRAM #0`,
   so CoK's own ECL-level check is structurally never reached on this route.
2. `DQK.EXE` carries its own journal-word prompt strings (file offset `0x6AC4A`) and fires them on
   the "Begin Adventuring" (and "Load Saved Game" → Begin) path, confirmed live in a prior DOSBox
   session (`dqk-copy-protection.md`'s 2026-07-02 UPDATE): a wrong or empty answer produces a fake
   "DISK READ ERROR" — the check is genuinely live, not DRM-stripped.

The `--bypass-protection` flag used in §1's rebuild patches a *different* gate (the `0xFC00`
resident flag at `1D99:1553`) and is explicitly **known not to stop the journal prompt** (overlay
12's real verify routine is data-only with an indirect, loader-fixed-up call site — see
`dqk-copy-protection.md`'s "Overlay 12 static analysis" section for the full negative). **The
journal prompt WILL appear on this build and must be answered for real** — hence this section.

### The solver already exists and is unit-tested

- `packages/engine/src/loaders/dqkProtection.ts` — pure functions: `parseDqkProtectionPrompt`
  (vision-read prompt text → `{page?, heading, wordNumber}`), `journalParagraphFor` (locate the
  heading's body paragraph, disambiguating credits-vs-rules occurrences), `answerDqkProtection`
  (word #N of that paragraph), `parseDqkCodesVocabulary` (validation set from `Codes.pdf` to catch
  low-confidence mis-counts before typing a wrong answer).
- `tools/dqk-protection-solve.mts` — CLI wrapper: `--journal <text> --prompt "<live prompt>"
  [--codes <text>]` → prints the answer word, or exits 2 (unsolved) / 3 (low-confidence).
- `tools/dosbot/capture-ingame.ps1` already calls this solver in its (host-input, non-GameLink)
  harness — proof the wiring works end-to-end, just not on the focusless transport.

### What the live agent still has to do

1. **Extract text from `The Dark Queen of Krynn/Journal.pdf` and `Codes.pdf` locally** (never
   commit — copyrighted GOG assets): `pdftotext -raw "The Dark Queen of Krynn/Journal.pdf"
   build/dqk_journal.txt` and the same for `Codes.pdf` → `build/dqk_codes.txt`. (Poppler's
   `pdftotext` is the tool used throughout this project's prior protection-solving work; confirm
   it's on PATH or install it.)
2. **Vision-read (or manually transcribe) the live prompt** each boot — the question is
   **randomized per boot** (`dqk-copy-protection.md`), so it cannot be pre-computed; the solver
   must run against whatever heading/word-number the live screen shows.
3. **Type the answer via GameLink**, one letter at a time (`tools/dosbox_gamelink.py`'s
   `SCAN_CODES` already covers a-z and 0-9) then Enter. `tools/cok-m4-gamelink-route.ps1` (§3)
   already wires steps 2-3 together (`Solve-Protection` + `Type-Word`).
4. **On an unsolved/low-confidence result, do not type a guess** — reboot and get a fresh
   (randomized) question rather than risk the "DISK READ ERROR" punishment, which is unrecoverable
   within that boot (per `dqk-copy-protection.md`).

**Note on the CoK-vs-DQK Journal:** because this is DQK's own native check, it uses **DQK's own**
`Journal.pdf`/`Codes.pdf` (from `The Dark Queen of Krynn/`), not CoK's. This is confirmed by the
prompt strings living inside `DQK.EXE` itself (file offset `0x6AC4A`) and the worked examples in
`dqk-copy-protection.md` (headings like "RUNNING AWAY", "SAVING THROWS" — DQK's own rules-book
headings). Do not substitute `Champions of Krynn/Journal.pdf` here.

---

## 3. The keypress script

**File:** `tools/cok-m4-gamelink-route.ps1` (new, written this pass).

**Explicitly UNVERIFIED end-to-end** — the single project DOSBox-X slot was unavailable during
this static-only pass. It is built entirely from proven primitives (reused, not reinvented, per
the lead's instruction):

- **GameLink for all guest input/screenshots** (`tools/dosbox_gamelink.py`), never host-level
  `SendKeys`/`SetForegroundWindow`/`SendInput`, per `CLAUDE.md`'s standing rule for DOSBox-X.
- **`tools/dosbox_x_debugbox_probe.ps1 -GameLink`** to launch (focusless, minimized) — the same
  launcher every other 2026-07-17 GameLink trace in this repo uses.
- **The debugger-console-plus-GameLink division of labor** from
  `tools/trace_pool_ecl2_20_gamelink_route.ps1`: GameLink owns input/framebuffer, the
  process-owned `dosbox_debugger_input` helper (already focus-safe via `AttachConsole`) owns the
  one `RUN` command needed to get past the `DEBUGBOX` pause.
- **The party-menu key sequence** (`L` → `T` → `A` → Enter → `B`) from
  `tools/dosbot/capture-ingame.ps1` — already proven against a real `cok-on-dqk` build, just
  ported from host-input `Send-DosKeys` to GameLink `press`.
- **The "one DOSBox-X agent at a time" contamination guard** (`Wait-ExclusiveDosboxSlot` /
  `Assert-ExclusiveOwnership`) from the same Pool script, called before every GameLink action.
- **The byte-grounded walk** (§4 below) from `docs/engine/research/cok-natural-route.md` +
  `tools/find_geo_path.py`.

### The one genuinely new, untested piece: the launch-menu "PLAY" click

Every prior DOSBox capture of this build family (`tools/dosbot/e62b-explore.ps1`,
`capture-ingame.ps1`) needed a **mouse click** at a fixed pixel (`RelX 35, RelY ch-16`) to get past
DQK's illustrated launch splash — there is no known keyboard equivalent (not established either
way; the script tries a keypress first since it's free). GameLink's mouse model is **relative
delta**, not absolute position (`dosbox_gamelink.py move dx dy` / `click`) — there is no documented
way to place the cursor at an absolute pixel. The script implements the standard trick for
relative-only pointer protocols: a large negative delta (`-5000,-5000`) to pin the cursor at the
guest's origin, then a move by the exact target offset. **This has never been tested against
DOSBox-X's GameLink implementation in this repo — the first live run must screenshot immediately
after the corner-reset move (before the click) to confirm the cursor actually lands where
expected**, and adjust the offset if not. If the corner-reset trick doesn't work at all, see the
failure playbook (§5).

### The other explicitly-flagged unknown: the ATTACK menu keybinding

`docs/engine/research/cok-natural-route.md`'s engine-level golden proves the *ECL-level* menu
choice order (`['ATTACK', 'WAIT', 'LEAVE']`, index 0 = ATTACK) — but the **DQK UI chrome's own
keybinding** for selecting a ported-CoK dialogue menu option (arrow+Enter? number key? letter key?)
has never been observed live for this specific combination. The script tries Enter (assuming
default-highlighted-first-choice, matching every other proven Gen1 GameLink route's convention),
then `1`, then Down+Enter, screenshotting after each attempt.

### Target combat and walk (see §4 for full derivation)

Resumes directly into `GEO1.DAX#34`/`ECL1.DAX#34` (no overland walk needed — the dropped save's
`@18`/`@21` bytes point straight at area 34), then drives the byte-grounded 22-directed-edge-step
walk (37 GameLink key presses incl. turns) from spawn `(14,10,north)` to `(3,15)` facing west,
where the HOBGOBLIN LDR/WARRIOR/BLACK ROBE MAGE encounter fires automatically.

### Usage

```powershell
pwsh tools/cok-m4-gamelink-route.ps1 -MountDir build/cok-on-dqk-m4fidelity `
  -JournalTxt C:\Modding\GoldBox\build\dqk_journal.txt `
  -CodesTxt C:\Modding\GoldBox\build\dqk_codes.txt `
  -OutDir build/cok-m4-run-01
```

Writes screenshots + `report.json` (timeline, verdict flags, expected roster) to `-OutDir`.

---

## 4. Fidelity checklist — concrete expected values, not eyeballing

### 4.0 Static pre-flight (run before any DOSBox session)

**File:** `tools/cok_m4_static_verify.mts` (new, written this pass) — proves the *shipped bytes*
in a built directory are exactly what the live run should expect, without launching DOSBox.
**Actually run against the build from §1 in this pass; real output:**

```
npx tsx tools/cok_m4_static_verify.mts --build build/cok-on-dqk-m4fidelity --src "Champions of Krynn" --area 34

[PASS] DISK3/ECL.GLB exists
[PASS] ECL.GLB has a member for area 34
[PASS] ECL1.DAX has source block 34
[PASS] ported ECL.GLB member === source DAX block sliced(2) -- lengths 6495 vs 6495
[PASS] DISK3/GEO.GLB exists
[PASS] GEO.GLB has area 34 -- areas present: 32,34,48,49,50,64,66,67,68,80,81,82,96,97,99
[PASS] GEO1.DAX has source block 34
[PASS] cell (3,15) descriptor === 156 (0x9c) -- actual=156
[PASS] DISK2/MONCHA.GLB exists
[PASS] monster id 13 -> "HOBGOBLIN LDR" -- actual="HOBGOBLIN LDR"
       stats: HP5 AC5 THAC018 HD1 dmg 1d8 XP20
[PASS] monster id 35 -> "WARRIOR" -- actual="WARRIOR"
       stats: HP14 AC4 THAC018 HD3 dmg 1d8 XP60
[PASS] monster id 38 -> "BLACK ROBE MAGE" -- actual="BLACK ROBE MAGE"
       stats: HP14 AC10 THAC021 HD3 dmg 1d2 XP85
[PASS] SAVGAMA.QSV exists at build root
[PASS] save partySize > 0 (Begin Adventuring selectable) -- partySize=6
[PASS] save resumes into area 34 -- actual=34
[PASS] save ECL member selector === 34 -- actual=34

[cok-m4-static-verify] ALL CHECKS PASSED
```

**A pitfall documented for the next person, discovered while writing this script:** the DQK
`MONCHA.GLB` decoder (`decodeMonchaGlb`) exposes TWO different per-monster maps —
`roster[].memberIndex` (a purely positional HLIB-member-loop index, 1..N in archive order — NOT
the game's own monster id!) and `byId` (a `Map<gameMonsterId, MonsterRecord>` built from the
archive's own id table). **Always query `arch.byId.get(gameMonsterId)`** — querying
`roster.find(r => r.memberIndex === gameMonsterId)` silently returns the WRONG monster (this
project's own author fell into this exact trap while writing the verification script above: it
first reported `id 35 → "STRANGBOURN"` and `id 38 → "EVIL CHAMPION"`, which looked like a real
multi-disk merge collision bug, until re-checked against `byId` and confirmed correct —
`WARRIOR`/`BLACK ROBE MAGE` as expected. **The multi-area merge has no bug here** — the false
alarm was purely an API-usage mistake in the ad hoc check, not a build defect. Recorded here so
nobody re-investigates a phantom "merge collision" lead.).

### 4.1 Party (from the dropped `SAVGAMA.QSV`, decoded via `decodeDqkSaveHeader`)

| Field | Expected value | Source |
|---|---|---|
| `partySize` | 6 | QSV offset 31 |
| `currentModule` / `eclMemberId` | 34 / 34 | QSV offsets 18/21, patched by `--save-area 34 --save-ecl-member 34` |
| `dungeon` (overland flag @1029) | dungeon (4), not overland | `--save-dungeon` |
| Character names (CCH `+96` in each of the 6 inline records at 1047/1555/2089/2648/3174/3716) | SIR DRYDEN, JORIS THE WISE, LENDUIRA, neacail, ALARIC THE BOLD, MAIGUREIGNE | DQK's own shipped pregen party (see §1's negative finding — this is NOT CoK's canonical roster) |

Live check: after "Load Saved Game" resolves, screenshot the party-summary/roster display and
confirm these 6 names and `partySize=6` appear (DQK's own UI, not CoK's — expect DQK-style
character sheets, a known, accepted divergence from original CoK screens per the "shipped visuals
are DQK's" reality, not a fidelity failure).

### 4.2 Map / event trigger

| Item | Expected value | Source |
|---|---|---|
| Area | GEO1.DAX#34 / ECL1.DAX#34 (CoK's own first dungeon, byte-identical port — §4.0) | `cok-natural-route.md` |
| Spawn | `(14,10)` facing north | `find_geo_path.py` |
| Target cell | `(3,15)` facing **west**, descriptor `0x9C` (selector 28, low 6 bits = 28) | `cok-natural-route.md` §"GEO and Reachability Proof" |
| Walk | 22 directed-edge steps: `E S S S W W S W W W N W N W W S W S W S W W` (compass); as DOS-key turns+forwards: `{RIGHT}{UP}{RIGHT}{UP}{UP}{UP}{RIGHT}{UP}{UP}{LEFT}{UP}{RIGHT}{UP}{UP}{UP}{RIGHT}{UP}{LEFT}{UP}{RIGHT}{UP}{LEFT}{UP}{UP}{LEFT}{UP}{RIGHT}{UP}{LEFT}{UP}{RIGHT}{UP}{LEFT}{UP}{RIGHT}{UP}{UP}` (37 tokens) | `tools/find_geo_path.py --geo "Champions of Krynn/GEO1.DAX" --block 34 --start 14,10 --target 3,15 --facing north` (re-run and verified in this pass) |
| Cells crossed en route (harmless flavour, no combat) | selector 27 at `(11,14)` ("AND [0x4c55],#16" — sets an unrelated bit); selector 30 at `(8,12)` ("AND [0x4c44],#1") | `cok-natural-route.md` |
| Opening beat | One-choice: "YOU SEE A MASS OF HOBGOBLINS AND HUMANS..." → "PRESS BUTTON OR RETURN TO CONTINUE." | `packages/engine/test/dungeonEvents.test.ts` golden |
| Real menu | Three-way `["ATTACK", "WAIT", "LEAVE"]`; choice 0 = ATTACK | same golden |

### 4.3 Combat roster (from `MON1CHA.DAX`, cross-verified against the built `MONCHA.GLB` in §4.0)

| Monster id | Name | Count | HP | AC | THAC0 | HD | Damage | XP |
|---|---|---|---|---|---|---|---|---|
| 13 | HOBGOBLIN LDR | 8 | 5 | 5 | 18 | 1 | 1d8 | 20 |
| 35 | WARRIOR | 5 | 14 | 4 | 18 | 3 | 1d8 | 60 |
| 38 | BLACK ROBE MAGE | 2 | 14 | 10 | 21 | 3 | 1d2 | 85 |

(HP/AC/THAC0/HD/damage/XP are `decodeMonchaGlb`'s reconstructed values from the actual ported
`MONCHA.GLB` bytes — i.e. exactly what the live DQK combat screen's stat display, if any, should
show. These are **not independently cross-checked against a printed Monster Manual** in this
pass — if the live combat UI displays stats and they visibly diverge from this table, that is a
concrete, actionable R1 lead, not a vague "something looked off".)

DQK's own combat UI caps visible combatants to some fixed on-screen limit (the browser engine's
own cap is 6 per side, matching every other Gen1 game's tactical screen — `cok-natural-route.md`);
the DOS original may render the full 15-monster group differently (multiple sprite ranks) — do
not treat a rendering/layout difference alone as a rules divergence; only a **wrong roster identity
or count** (different monster names/types, or a materially different total) is R1 evidence.

### 4.4 Persistence signal (secondary — walk far enough to confirm, not blocking)

`DS:[0x4c55]` transitions `0 → 0x20` only **after** victory, following one extra flavour-text beat
(not immediately after combat resolves — `cok-natural-route.md` notes this game's resume sequence
is atypical among the project's proven routes). **This is a Gen1-address (`0x4c55`) reference —
whether it resolves to the correct DS-segment cell under DQK's own resident memory layout is
itself an inferred, unverified fact for the ported build** (see §4.5). If reachable, read it via
the debugger console the same way `trace_pool_ecl2_20_gamelink_route.ps1`'s `Get-EclHostState`
does (`D <DS>:4C55` after resolving the live `DS` register from a stopped snapshot).

### 4.5 Static-verification honesty note: could not fully dry-run the ported ECL body

An attempt was made in this pass to execute the **ported** (Gen2-header) `ECL.GLB` member 34
through this project's own `dialogueForCell`/`primeSearchLocation` TS helpers, as an additional
static proof beyond byte-identity. It did not work: `SearchLocationOptions.dialect` couples two
independent things — (a) **header framing** (magic/vbase/headerLen, which correctly must be Gen2
for the ported bytes) and (b) **runtime seed style** (Gen1 backdrop-byte seeding vs Gen2
cell-descriptor seeding) — and assumes they always travel together. They do NOT for ported CoK
content: the header is Gen2 (no magic, `vbase=0x8000`), but the *body* still dispatches on Gen1
backdrop-byte addresses (per `cok-content-port-plan.md` CRUX 1: "the whole CoK ECL body... ports
unchanged... internally consistent"). Passing `dialect: ECL_GEN2` therefore seeds the WRONG
address and the VM sees no valid SearchLocation entry (`primeSearchLocation` returns `null`);
passing a hand-built hybrid dialect breaks the header's own far-pointer parsing (which reads at a
fixed byte offset that itself shifts with `hasMagic`). **This is a real, minor gap in this
project's own TS harness for testing ported-Gen1-on-Gen2-header content, not a bug in the build
or a reason to doubt the byte-identity proof** (§4.0's check that the ported member is
byte-identical to `slice(2)` of the untouched, already-golden-tested Gen1 source is the strongest
available static evidence, and it passed cleanly). Fixing the harness (adding a genuine
"ported-Gen1-body-on-Gen2-header" dialect variant) is a good, small, separate follow-up task —
**not attempted here** (out of scope: this pass only researches/plans, per the assignment's "do
not modify engine/source code" rule). The live DOSBox run is unaffected by this — it executes the
real `DQK.EXE` machine code directly, which has no such abstraction to get wrong.

### 4.6 The stretch/secondary target: overland entry (area 16)

The lead's brief describes "reach overland → enter the first dungeon". The primary target above
(direct resume into area 34, already a dungeon) is the fast, reliable, byte-verified choice and
sufficiently exercises CoK content + DQK rules. For a fuller "menu → overland → dungeon" capture,
rebuild with `--save-area 16 --save-ecl-member 16` (overland, no `--save-dungeon`) instead — this
was also built and verified in this pass (`decodeDqkSaveHeader` confirms `currentModule=16,
eclMemberId=16, overlandFlag=3`). CoK's overland area 16 does not yet have a byte-grounded "walk
into first dungeon" recipe documented anywhere in this repo (the browser engine's own
`cok-natural-4`/`cok-natural-5` legs took real dedicated research effort to wire even in the
much-more-controllable browser environment — see `docs/engine/research/persistent-natural-routes.md`).
Treat this as an explicit stretch goal, not part of the turnkey path.

---

## 5. Failure playbook

| Symptom | Diagnostic step | Covering doc |
|---|---|---|
| Build doesn't assemble / `npx tsx tools/build-dqk-dir.mts` throws | Check the error against `cok-content-port-plan.md` §4's pipeline stages; re-run `tools/cok_m4_static_verify.mts` after a successful build to isolate which artifact is wrong | `cok-content-port-plan.md` §4 |
| DOSBox-X never shows a window / probe throws "Debugger window did not become ready" | Confirm the DOSBox-X build has a debugger compiled in (`strings <exe> \| grep MEMDUMPBIN`); confirm no foreign `dosbox-x.exe` PID is already running (`Get-Process dosbox-x`) | `dosbox_x_debugbox_probe.ps1` header comment; `dosbox-x-gamelink-automation.md` |
| Launch-menu click lands on the wrong spot / never reaches the party menu | The corner-reset mouse trick (§3) is UNVERIFIED — screenshot immediately after the reset+move, before the click, and adjust the target offset; if GameLink mouse delta doesn't behave as expected at all, fall back to a keyboard-only DOSBox-X `AUTOTYPE` sequence for just this one screen (documented as a fixed, non-adaptive fallback in `dosbox-x-gamelink-automation.md`) | this doc §3; `dosbox-x-gamelink-automation.md` |
| **Protection loop** — "DISK READ ERROR" appears, or the same journal prompt reappears every boot | A wrong/empty answer was typed once (unrecoverable within that boot — reboot fresh); confirm `Solve-Protection` actually got a non-null result BEFORE typing (the script already declines rather than guesses); confirm `Journal.pdf`/`Codes.pdf` text was extracted from **DQK's own** PDFs, not CoK's (§2) | `dqk-copy-protection.md` |
| **Hangs at overland/dungeon load** ("LOAD_FILES"/"LOAD_PIECES" never returns) | This exact symptom is documented as still-open for the DQK-native area-58 resume probes in `dqk-save-resume.md`'s tail section (post-journal input/walker route) — if area 34 hangs the same way, that is new, actionable evidence the resume-save recipe doesn't generalize past DQK's own areas to a ported Gen1 area; capture a debugger-console `D <DS>:002d/0011/001b` read (the same cell-descriptor/facing/area bytes `dqk-save-resume.md` already instruments) to see whether the engine ever populates them for the ported area | `dqk-save-resume.md` (tail section) |
| **Combat doesn't trigger** at `(3,15)` despite reaching it | Re-run `tools/cok_m4_static_verify.mts` against the SAME build dir the DOSBox session mounted (not a stale one) to re-confirm the selector-28 cell byte is really `0x9C` at that position in the shipped `GEO.GLB`; re-check the walk was actually 22 net steps (an extra/missed turn desyncs position) — screenshot the automap/position indicator if the DQK UI exposes one | `cok-natural-route.md`; this doc §4.2 |
| **Combat starts but roster looks wrong** (different names/counts than §4.3) | This is the concrete R1 signal (native DQK rule divergence vs. a port bug) — first re-run `tools/cok_m4_static_verify.mts` to rule out a stale/wrong build; if the static check passes but the LIVE roster still differs, that is real evidence DQK's own combat-setup code path treats ported content differently than its own (needs a targeted follow-up trace of `SETUP_MONSTER`/`COMBAT` opcode handling in `DQK.EXE`, out of scope for this doc) | `cok-content-port-plan.md` §3 "residual technical risks", R1 |
| **DOSBox-X GameLink calls return data that doesn't match what you expect** (wrong `program` string, wrong frame size) | STOP — this is the documented singleton-contamination hazard, not a game bug; another agent's DOSBox-X process is likely running concurrently; check `Get-Process dosbox-x` for foreign PIDs and abort/wait rather than trust the data | `dosbox-x-gamelink-automation.md` "KNOWN HAZARD" section |

---

## 6. Caveats on this pass

- The working tree had several other agents' uncommitted WIP present while this doc was written
  (`git status` showed modifications to `cok-content-port-plan.md`, `tools/build-dqk-dir.mts`,
  `docs/engine/ROADMAP.md`, etc. — none of the files this task was told not to touch). The
  freshness check in §1 therefore reflects "assembles against the current shared working tree",
  not strictly "assembles against a clean `git show HEAD`". Given the shared-non-worktree
  convention this project uses (`[[goldbox-commit-discipline]]`), this is the intended meaning of
  "today" for this kind of check.
- This pass did not modify `packages/engine/src/**` or any game data, per the assignment's scope
  guard — the one harness gap found (§4.5) is reported, not fixed.
- `tools/cok-m4-gamelink-route.ps1` is **new and unrun**. It is designed to be turnkey from proven
  primitives, but the live agent should expect at least one iteration on wait times and the two
  explicitly-flagged unknowns (launch-menu click, ATTACK-menu keybinding) before a clean pass.

---

## 7. Live-run addendum (2026-07-18, held the single DOSBox-X/GameLink slot)

This section records the results of the first actual live DOSBox-X/GameLink execution of this
plan, against `build/cok-on-dqk-m4fidelity` (rebuilt fresh with the exact §1 command;
`tools/cok_m4_static_verify.mts` reconfirmed ALL CHECKS PASSED before spending the slot). Multiple
runs (3 full boots) were performed. **Verdict: genuinely blocked before combat, with the blocker
narrowed to a specific, reproducible symptom — not a smoothed-over "mostly worked."**

### 7.1 What is now PROVEN live (not just planned)

| Checkpoint | Result | Evidence |
|---|---|---|
| §3 launch-menu PLAY click | **SOLVED.** Root cause found: DOSBox-X's `[sdl] mouse_emulation` defaults to `locked`, which discards GameLink-injected mouse motion in any session that never performed a real host click-to-capture (`user_cursor_locked` stays false forever) — confirmed by reading `Mouse_CursorMoved()` in `build/tools/dosbox-x-source-2026.07.02/src/ints/mouse.cpp` against `MOUSE_EMULATION_LOCKED` in `src/gui/sdlmain.cpp`. Fix: `-ExtraSdlConf "mouse_emulation=always"` (new param added to `tools/dosbox_x_debugbox_probe.ps1`, additive/backward-compatible). A SECOND condition was also required: the corner-reset+move+click sequence must fire as one fast Python process with no vision-model (Ollama) round-trip in between confirming the title screen and clicking — DQK's launch menu has a short idle timeout that auto-plays an attract-mode intro and returns to title regardless of input, and a multi-second vision round-trip reliably loses that race. Verified via real pixel diffing (`PIL.ImageChops.difference`), not the unreliable GameLink frame-sequence number (which drifts on its own from game animation). | `build/cok-m4-mousetest2/`, scratchpad `fast_click_test.py` |
| Intro/credit skip | **SOLVED.** ESC (not Enter) reliably advances through the intro slides to the party menu. Enter was tried first (per the original, now-superseded script) and reliably auto-played the full intro then looped back to an unclicked title screen — never reaching the party menu. | 3/3 runs |
| Load Saved Game (L then T then A then Enter) | **PROVEN**, reaches the roster screen. | 3/3 runs |
| Roster displayed matches plan's §4.1 prediction | **CONFIRMED** — DQK's own shipped pregen party (SIR DRYDEN / JORIS THE WISE / LENDUIRA / neacail / ALARIC THE BOLD / MAIGUREIGNE, partySize 6) appears exactly as predicted. | screenshots, 3/3 runs |
| Begin Adventuring (B) leads to DQK's native journal-word protection prompt | **PROVEN reachable and readable.** Prompt text vision-reads cleanly each time. | 3/3 runs |
| Journal-word solver bug | **FOUND AND FIXED.** `packages/engine/src/loaders/dqkProtection.ts`'s `bodyAfter()` only read the FIRST physical PDF line after a heading (`pdftotext -raw` emits one line per physical line, not per paragraph); DQK's real Journal.pdf has multi-line paragraphs, and the word count can span lines (found live: heading "After Combat" has word #9 on the paragraph's SECOND physical line). Rewrote `bodyAfter()` to join continuation lines until a blank line or a new heading-looking line (`looksLikeHeadingLine()`, added), unwrapping PDF line-wrap hyphens. All 152 existing unit tests in `packages/engine/test/dqkProtection.test.ts` still pass (no regression — the old fixtures were all single-line). Validated against the real extracted journal via `tools/dqk-protection-solve.mts`. | working-tree diff of `packages/engine/src/loaders/dqkProtection.ts` |
| Typed-answer on-screen echo | **PROVEN reliable** — typed letters echo correctly on screen when verified via screenshot before pressing Enter (ruled out a keystroke-delivery bug as a cause of anything below). | 3/3 runs |

### 7.2 What is BLOCKED: "DISK READ ERROR" after a verified-correct protection answer

Three separate boots, three different randomized protection questions, each answered with a word
independently cross-checked BOTH against the reconstructed journal paragraph AND the GOG
`Codes.pdf` answer key, and each confirmed via on-screen echo before pressing Enter:

1. Heading "After Combat", word #9 -> "battlefield" (matches `Codes.pdf`'s "After Combat" row) -> typed, echoed correctly -> Enter -> DISK READ ERROR.
2. Heading "Saving Throws", word #2 -> "such" (the module's own long-documented worked example, also cited in `dqkProtection.ts`'s own file-header docstring) -> typed, echoed correctly -> Enter -> DISK READ ERROR.
3. Heading "Magic", word #3 -> "integral" (matches `Codes.pdf`'s "Magic" row) -> typed, echoed correctly -> Enter -> DISK READ ERROR, this time with the debugger's forced `cycles=fixed 25000` OMITTED (closer to the build's own shipped `cycles=max`), ruling out a CPU-cycle-timing keyboard bug as the cause.

This rules out: wrong answer, garbled/mistyped keystrokes (screen-verified before submit), and
CPU cycle-rate timing. The typed word is very unlikely to be the actual cause.

Secondary symptom, IDENTICAL across all 3 runs regardless of the typed answer: the reported
position froze at "7,13", not the plan's §4.2-predicted dungeon spawn "14,10" for area 34, and the
dungeon 3D-view pane stayed solid black in every post-protection frame captured. This matches the
failure playbook's own pre-written "Hangs at overland/dungeon load" row almost exactly (§5,
"LOAD_FILES/LOAD_PIECES never returns... if area 34 hangs the same way, that is new, actionable
evidence the resume-save recipe doesn't generalize past DQK's own areas to a ported Gen1 area") —
this looks like exactly that scenario: "DISK READ ERROR" here is plausibly not actually a
protection-check punishment at all, but a generic failure string DQK shows when it can't
load/render the resumed area's own content (the ported Gen1 area 34 data), which happens to
surface at this exact point in the sequence regardless of what was typed at the protection prompt.

This was NOT confirmed further. A single low-cost attempt was made to read the position/state
bytes the failure playbook names (`D <DS>:0011/001b/002d`) via the debugger-console helper while
the guest was believed paused; it returned an unrelated disassembly/COMMAND.COM view instead of a
memory dump (almost certainly because the guest was not actually paused/breakpointed at a useful
moment — a real DS-relative watch needs a proper breakpoint on the load-dispatch routine, not a
free-run console poke). Given the project's own documented hazard ("one invalid `--command` wedges
the text channel") and the session's time budget, this was not pursued further rather than risk
losing the (very scarce, singleton) DOSBox-X slot to a wedged debugger channel with no useful
result. `dqk-copy-protection.md`'s own prior note stands corrected/extended here: no prior session
had ever typed a genuinely-correct answer and observed the result on this exact resume-into-area-34
path — this pass is the first to do so, and the result is not "protection defeated, game proceeds"
but "protection accepted (implicitly — 3/3 different correct answers all produced the identical
downstream symptom, not 3 different symptoms as a real per-answer protection re-check would
produce), area load then fails."

### 7.3 R1 answer (native DQK rule divergence vs. port bug)

Inconclusive — genuinely not settled. The run never reached the target combat encounter, so R1
(whether DQK's own combat-setup code treats ported content differently) could not be tested at
all. The NEW divergence found (§7.2) is a different, earlier-stage issue: a likely area-34-load
failure that is either (a) a CoK-port bug in how the ported `GEO.GLB`/area-34 resume save
interacts with DQK's own area-load code, or (b) a harness/environment artifact specific to this
headless DOSBox-X GameLink launch path (e.g. missing/misconfigured disk-swap state that a real
interactive DOS session would have set up differently before reaching "Begin Adventuring"). The
concrete next step (not attempted here) is a proper debugger breakpoint (not a free-run console
poke) on DQK's own area/GEO load-dispatch routine, single-stepped through the "DISK READ ERROR"
codepath to see exactly what fails and why — this is squarely a DOSBox-X dynamic-trace task, not a
static one.

### 7.4 What remains before the ported CoK-on-DQK build can be called verified

1. Root-cause the "DISK READ ERROR" / area-34-load failure (§7.2/§7.3) — needs a proper
   breakpoint-based debugger trace, not a free-run console poke. This is the actual current
   blocker; everything else in the plan (§4.2 walk, §4.3 combat roster, §4.4 persistence) is
   unreachable until this is solved.
2. Once past it: drive the 22-step walk (§4.2), verify the combat roster (§4.3), and the
   persistence signal (§4.4) — none of these were reached this pass.
3. The ATTACK-menu keybinding (flagged UNVERIFIED in the original plan) is STILL unverified — the
   3-fallback logic in `tools/cok-m4-gamelink-route.ps1` was written but never exercised live.
4. Re-run `tools/cok-m4-gamelink-route.ps1` (updated this pass with the proven §7.1 fixes) once
   §7.4.1 is solved, to get a clean end-to-end pass with a `report.json` verdict.

### 7.5 Tooling changes made this pass (see commit for full diffs)

- `tools/dosbox_x_debugbox_probe.ps1`: added optional `-ExtraSdlConf` passthrough param (empty by
  default, fully backward-compatible) — used to inject `mouse_emulation=always`.
- `packages/engine/src/loaders/dqkProtection.ts`: fixed the multi-line journal-paragraph bug in
  `bodyAfter()` (§7.1). No API/signature changes; all existing exports unchanged.
- `tools/cok-m4-gamelink-route.ps1`: rewritten to fold in every §7.1 finding (mouse_emulation
  passthrough, fast single-process click with no vision call in the critical window, ESC-based
  intro skip, verify-echo-before-Enter for the protection answer) and to explicitly detect/report
  the §7.2 DISK READ ERROR symptom distinctly from "protection unsolved" in its `report.json`
  output, rather than conflating the two.

---

## 8. Root cause of the §7.2 "DISK READ ERROR" — SOLVED statically (2026-07-18, no DOSBox-X)

**Verdict: single root cause, found, fixed, and verified end-to-end without touching the DOSBox-X
slot.** The Gen2 GEO member header bytes at offsets 2–7 — which `geoEncode.ts` documented as
"6 reserved bytes" and the port wrote as **zeros** — are actually the area's **resource-set id
list**, read by `DQK.EXE`'s dungeon loader immediately after the GEO member payload: bytes 2–4
name the wall/tile sets it looks up in the `8x8d%c` TLB set-id tables, bytes 5–7 the backdrop sets
in `BACK.TLB`, with `0xff` = "no set in this slot". Set id **0 exists in no shipped bank**
(`8X8DB.TLB` carries sets 1–9, `8X8DC.TLB` set 11, `BACK.TLB` 1–17/32–35), and the loader's
not-found path is its floppy-era **wrong-disk retry loop** — on screen: "DISK READ ERROR", with
the 3-D pane black (no wallset ever loads) and the sequence stuck exactly where §7.2 observed it.
Every **native** DQK GEO member carries non-zero ids here (e.g. `01 02 08 01 08 ff`); every ported
member carried `00 00 00 00 00 00`.

### 8.1 How it was proven (all synchronous, static/emulated — the GameLink slot was never taken)

The existing Unicorn harness (`tools/unicorn_dqk_trace.py`, run from a scratchpad copy with one
added log line for non-self INT21/3F reads) drove the ported build through the full proven §7.1
route — title, load-save `L,T,A,Enter,B`, staged journal answer — five times:

1. **Repro (as-shipped build):** save loads, `ECL.glb` member 34 loads (6495 B @0x5e20),
   `GEO.glb` member 34 loads (1032 B @0x49a), then the engine scans `DISK2\8x8db.tlb`'s 9-entry
   set-id table, finds nothing, and loops `DISK2\8x8db.tlb` → `A:\DISK2\8x8db.tlb` **hundreds of
   times** to the 60M-instruction cap. This is the on-screen "DISK READ ERROR" state.
2. **Save-recipe control:** rewriting the QSV "init flags" @1033–1036 from the hackdoc's 240/254
   to genuine-DQK values did NOT remove the loop — the save recipe is not the cause.
3. **Wrong-member patch (accidental but informative):** patching set ids into the WRONG GLB member
   (an off-by-one in a helper script — see §8.4) left the loop intact.
4. **GEO-header patch:** stamping member 34's header bytes 2–7 with a native-DQK sextet
   `01 02 08 01 08 ff` **removed the loop entirely**: three clean `8x8db.tlb` set loads
   (ids 1, 2, 8 — e.g. 34 KB payload @0x31948) followed by a clean `back.tlb` backdrop load
   (7900 B), then the engine settles into its render loop. Re-running this patched-GEO build with
   the ORIGINAL 240/254 save reproduced the same clean load — isolating the GEO header as the
   **single** cause.
5. **Final verification on the real rebuilt dir** (fix landed in code, §8.2): identical clean
   sequence, plus runtime state confirms `@18=0x22 @21=0x22` (area 34) and pose `0x0e,0x0a`
   (14,10) reach the engine's QSV state reader.

Trace logs: scratchpad `cok-m4-trace-60m.log` (repro), `-fixed-` (save control), `-geofix-`
(wrong member), `-geofix2-` (proof), `-ctrl-` (save isolation), `-final-` (rebuilt dir).

### 8.2 The fix (landed this pass)

- `packages/engine/src/loaders/geoEncode.ts`: header bytes 2–7 re-documented as the resource-set
  id list; new exported `DQK_GEO_PLACEHOLDER_SET_IDS = [0x01,0x02,0x08,0x01,0x08,0xff]` — a
  native-DQK dungeon combo empirically proven to load in the ported build.
- `packages/engine/src/loaders/buildDqkGame.ts`: `encodeGen2GeoArchive` is now called with that
  header for every ported area (was: zeros). All engine tests pass (240/240 in the affected files).
- Build command amendment: add `--save-x 14 --save-y 10` to the §1 command — the §7.2 "position
  7,13" secondary symptom was simply the DQK pregen save's own stock pose bytes @1024/1025
  (7,13), never patched because the §1 command omitted the pose flags. Not a wrong-file read:
  the game read exactly our save (proven by `@18/@21 = 34` reaching the runtime record).
  `build/cok-on-dqk-m4fidelity` has been rebuilt with the full amended command and re-verified.

### 8.3 What this means for the M4 run (and what it does NOT yet mean)

- The next live GameLink pass should get past the §7.2 blocker: protection answer → area-34 load →
  walls render (with **DQK placeholder wall art** — see below) → the §4.2 walk becomes reachable.
- **Faithful CoK wall art is still open:** the placeholder stamps one fixed native-DQK set combo
  on every area. The faithful fix is to derive each area's set ids from CoK's own `LOAD_PIECES`
  chain (the web engine already resolves these per area as `loadPieces.setBlockIds`) and pack the
  matching CoK 8×8 wall art into the build's 8x8d banks under those ids. Note area 34's own script
  contains no LOAD_PIECES on any walked path — in Gen1 the piece ids arrive via the predecessor
  area's script and are *saved* in SAVGAM @1033–1036 for resume; Gen2 moved them into the GEO
  header, which is why the port must synthesize them per area.
- The §7.2 hypothesis "generic failure string when the resumed area can't load" is CONFIRMED; the
  three identical failures across three different correct journal answers are fully explained.

### 8.4 Corrections to neighboring docs (recorded here, not yet folded in)

- `hackdocs SAVGAM.TXT` "Initiation flag … 240/254" (and `dqkSave.ts`'s RESUME.initFlags copied
  from it) describe **Gen1 saved piece-set ids**, not universal magic constants: genuine mid-game
  DQK saves (user's own, `The Dark Queen of Krynn/cloud_saves/SAVE/**`) show `@1033 = small set id
  (1/4/5)`, `@1034–1036 = 0`, `@1028 = 0x80`, `@1029 = 4` even overland. Writing 240/254 into a
  DQK save is harmless for the area-load path (proven by run 5 above) but is cargo-culted Gen1
  data; a cleanup pass on `dqkSave.ts`/`dqk-save-resume.md` is recommended, low priority.
  **DONE 2026-08-22**, and the corpus turned out to be stronger than "even overland": across every
  `SAVGAM*` file the project holds (repo + ten GOG installs + loose DOS Buck Rogers, deduplicated,
  `build/` excluded) — 50 saves, 13 with a nonzero second block, DQK areas 4/58/66 and FRUA areas
  5/14 — `@1029` is **4 in 13 of 13** and `F0 FE F0 FE` occurs **0 times anywhere**. Include
  `build/` and 40 saves hold the recipe: all of them ours. `@1029` is therefore not an
  overland/dungeon flag at all, and `patchDqkSaveResumeArea` now defaults it to 4 for every area.
  Write-up + the runtime word widths (`ae67`/`ae57`/`ca03`/`ca05`):
  `dqk-save-resume.md` §CORRECTION 2026-08-22.
- `docs/hlib-format.md` §1c says the id-table's "pointer-#" is "1-based into the pointer list".
  The engine's observed reads (and `geoEncode.ts`'s encoder, which matches) treat it as a **0-based
  DWORD index** into the pointer list (member for table entry `i` = `ptr[pi]` with `pi = i+1`,
  table itself at `ptr[0]`): DQK read the id-34 GEO pair at file offset `16 + pi*4` with `pi=2`,
  i.e. `ptr[2]/ptr[3]`. An analysis helper in this pass used the doc's reading (`ptr[pi-1]`) and
  patched the wrong member (§8.1 run 3) — trust the engine-observed convention.

---

## 9. Live-run RETRY (2026-07-18, second live GameLink session) — the §8 fix WORKS, new blocker found downstream

**This is the run this doc's §7.4.4 called for** ("re-run `tools/cok-m4-gamelink-route.ps1` once
§7.4.1 is solved"). §8's static GEO-header fix was solved without a live session; this section is
the first live confirmation. Held the single DOSBox-X/GameLink slot for one boot. Build used:
`build/cok-on-dqk-m4fidelity` exactly as re-materialized by commit `50ee9ec` (GEO placeholder set
ids + `--save-x 14 --save-y 10`), no rebuild performed in this pass. Output:
`build/cok-m4-run-03/` (screenshots + `report.json`; git-ignored, not committed — reference paths
below are local). A stale leftover `build/cok-m4-run-01/` directory (timestamps 10:30-10:36, an
older script-naming convention, predating even the §7 addendum's script rewrite — most likely
debris from the outage-killed attempt this task's brief mentioned) was found and deleted before
this run; it held no useful data (only reached phase 3, no report.json).

### 9.1 Per-checkpoint verdicts

| # | Checkpoint | Verdict | Evidence |
|---|---|---|---|
| 1 | Boot → PLAY → ESC intro skip → Load Saved Game → Begin Adventuring → protection prompt | **PASS, fully automated.** The route script's proven §7.1 primitives (fast mouse click, ESC skip, L/T/A load sequence) worked unchanged. Journal prompt this boot: "JOURNAL, PAGE (4), WHAT IS WORD #7 AFTER THE HEADING CHARACTER CLASSES" → solver answered "character" → typed, on-screen echo confirmed **"ENTER CHARACTER"** before Enter (screenshot `07-typed-01`, directly viewed, not just vision-OCR'd) → accepted. | `build/cok-m4-run-03/06-after-B.png`, `07-typed-01.png` |
| 2 | Dungeon resume: position 14,10 area 34, live 3-D view, no DISK READ ERROR | **PASS — the §8 fix is confirmed live.** Screenshot `08-after-journal-01` (directly viewed): position reads **14,10**, compass shows **N**, the 3-D viewport renders a real wood-plank dungeon room with a barred window (DQK placeholder wall/backdrop art, exactly as §8.3 predicted — not black, not a DISK READ ERROR). Roster: SIR DRYDEN(140), JORIS THE WISE(101), LENDUIRA(85), NEACAIL(87), ALARIC THE BOLD(84), MAIGUREIGNE(73) — DQK's own pregen party, matching plan §4.1's prediction. This directly falsifies nothing in §7/§8; it is the first-ever live proof the fix holds. | `build/cok-m4-run-03/08-after-journal-01.png` (directly viewed) |
| 3 | Execute the planned 37-key walk (plan §4.2) toward the scripted combat trigger at (3,15) | **DID NOT COMPLETE AS PLANNED — a combat interrupt fired after step 2 of 37.** The very first two keys (`right` = turn to face East, `up` = move forward one cell) took the party from `(14,10)` to `(15,10)` facing East — and combat fired immediately there, 35 steps short of the planned target cell `(3,15)`. Screenshot `09-walk-06` (directly viewed): position **15,10**, compass **E**, bottom banner reads **"MONSTERS ATTACK!"** then a second line **"DISK READ ERROR"**. This is a real, reproducible in-game state (not a vision-OCR artifact — confirmed by directly viewing 4 separate screenshots spanning the remaining ~30 keypresses, all pixel-identical at position 15,10 12:01 AM: the game never advanced past this point, it just alternates its bottom banner between two fixed strings). See §9.2. | `build/cok-m4-run-03/09-walk-06.png` through `09-walk-36.png` (directly viewed) |
| 4 | Combat roster check (§4.3): expected HOBGOBLIN LDR ×8, WARRIOR ×5, BLACK ROBE MAGE ×2; probe ATTACK keybinding | **BLOCKED — never reached a roster/combat screen.** The party is frozen on the "MONSTERS ATTACK!" pre-combat banner, alternating with a "DISK READ ERROR" / "INSERT DISK 2 AND PRESS A KEY" prompt pair (§9.2) that never resolves regardless of keypress. The script's 3 ATTACK-keybinding fallback attempts (Enter, `1`, Down+Enter) were all sent, all landed on the identical frozen state — the ATTACK keybinding remains **genuinely untested**, not because the script didn't try, but because the game never got past the combat-initiation resource load to show a menu at all. No roster was ever visible to compare against the expected HOBGOBLIN LDR/WARRIOR/BLACK ROBE MAGE table. | `build/cok-m4-run-03/10-at-target-cell.png`, `12-after-attack-attempt1.png` through `12c-*.png` (directly viewed) |
| 5 | Persistence signal (§4.4) | **UNREACHABLE** — never reached combat resolution, so `DS:[0x4c55]` was never observable in a meaningful post-victory state (and no debugger breakpoint was attempted this pass — see §9.4). | n/a |

### 9.2 The new blocker: a "DISK READ ERROR" / "INSERT DISK 2" loop at combat initiation, distinct from §7.2/§8's dungeon-load blocker

Directly viewing (not vision-OCR'ing) four screenshots spanning ~30 keypresses after the encounter
fired shows the on-screen bottom banner **toggling between two different real strings**, not one
stuck frame misread twice:

- `09-walk-06`, `09-walk-36`, `12b`, `12c`: `"MONSTERS ATTACK!"` / `"DISK READ ERROR"`
- `10-at-target-cell`, `12-after-attack-attempt1`: `"MONSTERS ATTACK!"` / `"INSERT DISK 2 AND PRESS A KEY"`

Position, party HP, and the in-game clock (`15,10`, `12:01 AM`) are byte-for-byte identical across
all of them — the game state is otherwise completely frozen; only the bottom banner cycles. This
is the classic Gold Box floppy-era pattern: a "please insert disk N" prompt whose retry, when the
requested resource still can't be found (because this build has no literal disk 2 to swap in — it
is one merged hard-disk-style directory tree, matching the real GOG hard-disk install layout that
`dosbox.conf`'s own `mount c .` / `DQK SB220 SI7 RB330` autoexec assumes needs no swap prompts at
all), reports back as `"DISK READ ERROR"`. **This is the same class of bug §8 root-caused for the
dungeon load (a resource-set id the ported content doesn't supply, so DQK.EXE's loader falls into
its wrong-disk retry loop) — but firing for a different subsystem: combat initiation, not area
load.**

A plausible, but **NOT confirmed this pass**, hypothesis: combat setup needs to load
monster-portrait/sprite art or a battle-scene backdrop keyed by an id that isn't covered by
`DQK_GEO_PLACEHOLDER_SET_IDS` (which only stamps the *dungeon 3-D-view* wall/backdrop sets,
`geoEncode.ts` lines 23-35) — e.g. an id carried inside the ported Gen1 ECL bytecode's own
`SETUP_MONSTER`/`COMBAT` opcode operands, which (per this doc's own CRUX 1 / §4.5) still speak
Gen1 addressing conventions even though they now execute under a Gen2 header. If true, this is the
combat-side sibling of the exact bug class §8 fixed for the dungeon side, still open. **This is
flagged UNSETTLED, not asserted** — no debugger trace or static disassembly was done this pass to
confirm which resource id or file DQK.EXE is actually requesting; see §9.4 for the concrete next
step.

### 9.3 A second, independently notable finding: the encounter is NOT the planned selector-28 event

Plan §4.2 predicted the *first* in-game text at area 34 would be the flavour beat **"YOU SEE A MASS
OF HOBGOBLINS AND HUMANS..."** (a one-choice "press button to continue" screen), reached only after
the full 22-compass-step walk to `(3,15)`, and *harmless* flavour cells at `(11,14)` and `(8,12)`
along the way with explicitly **no combat**. What was actually observed, 35 steps early at
`(15,10)`, was the generic **"MONSTERS ATTACK!"** banner — a different string than the planned
selector-28 flavour text, and at a cell this doc's own byte-grounded walk research
(`cok-natural-route.md`) never names. The most likely honest explanation is a **wandering-monster
/ random-encounter check** — a standard Gold Box dungeon mechanic independent of any GEO cell
selector, firing on ordinary movement rather than on reaching a scripted trigger cell. This is
**not necessarily a fidelity bug**: if CoK's original DAX engine also rolls random encounters on
every step, an early wandering-monster fight is faithful behavior, not a divergence — the walk
plan's "harmless, no combat" claim for `(11,14)`/`(8,12)` was about those *specific selectors*, not
a blanket claim that the whole route is combat-free. **This was not verified either way this
pass** — it is recorded as an open, plausible, UNSETTLED explanation, not a confirmed mechanic.
Either way, it means the planned selector-28 HOBGOBLIN LDR/WARRIOR/BLACK ROBE MAGE encounter
(§4.3) was never actually reached or tested — the roster comparison in checkpoint 4 above concerns
a *different*, unidentified encounter (whatever monster group the wandering check spawned), which
never became visible before the DISK READ ERROR loop froze the session.

### 9.4 R1 answer: still UNSETTLED, but narrowed twice this pass

R1 (does DQK's own engine treat ported CoK content differently from its native content) is **still
not settled** — the run never reached a visible combat roster or an ATTACK-menu interaction, so
the specific residual risk this doc exists to close remains open. Two real, load-bearing facts are
now established that narrow the remaining work:

1. **§8's dungeon-load fix generalizes correctly** — this is now proven live, not just by Unicorn
   trace. The protection prompt, save resume, and area-34 dungeon render all now work identically
   to how a native DQK area would behave. This closes out §7.4's item 1 for real.
2. **A second, structurally similar resource-loading gap exists one layer downstream, at combat
   initiation** — genuinely new information this pass, not previously documented anywhere in this
   file. It has the same *symptom signature* as §8's bug (DISK READ ERROR / wrong-disk retry loop)
   but was not root-caused to the same certainty; §9.2's hypothesis is plausible but unconfirmed.

Given the honest state of evidence, this is recorded as **UNSETTLED, narrowed** rather than either
"solved" or "still totally blocked" — a real step forward from §7's report, not a repeat of it.

### 9.5 What remains before the ported CoK-on-DQK build can be called verified

1. **Root-cause the combat-initiation DISK READ ERROR (§9.2)** — needs the same kind of static
   Unicorn/INT21 trace §8 used for the dungeon-load bug (proven far cheaper than a live DOSBox-X
   breakpoint session and doesn't consume the singleton slot), driven through the same
   load-save→journal→one-step-east route to reproduce the combat-initiation call and log which
   file/resource id it requests.
2. **Determine whether the early encounter is a wandering-monster mechanic or a bug (§9.3)** — a
   quick static check of area 34's ECL for a periodic/random-encounter opcode (independent of the
   selector system) would settle this without a live session.
3. Once past both: re-run this exact route, but do NOT execute the first `right`/`up` walk keys
   blind — screenshot after each of the first 2-3 keys to see whether the wandering encounter (if
   confirmed as such) can be avoided or must simply be fought through before continuing toward the
   originally-planned `(3,15)` target, then resume the remaining walk and verify the roster (§4.3)
   and persistence signal (§4.4) as originally planned.
4. The ATTACK-menu keybinding is **still unverified** — three real attempts were made this pass and
   all landed on the same frozen pre-combat state, so nothing was learned about it either way.

### 9.6 Housekeeping

No `dosbox-x.exe` process remained after this run (script's `finally` block stopped it cleanly;
confirmed independently via `Get-Process dosbox-x` returning empty both before and after). No
engine/source code was modified in this pass — this was a live-run-only task per the assignment.

---

## 10. The §9.2 combat-initiation "DISK READ ERROR" — Unicorn trace, distinct bug class from §8, NEW leading candidate found (STATIC ONLY, 2026-07-18)

**Task:** find what file/resource load happens right before the §9.2 retry loop, using
`tools/unicorn_dqk_trace.py` (no DOSBox-X), and check whether it collides with the just-landed
CoK-wall-art commit `c801066`.

### 10.1 c801066 collision check — RULED OUT, with proof, not just timeline

**Not a collision.** Three independent proofs:

1. **Build-graph separation.** `c801066`'s own commit message states the wall-art pass runs as a
   standalone post-processing pass with its own scratch out-dir
   (`build/cok-on-dqk-wallart-scratch`), explicitly "never `build/cok-on-dqk-m4fidelity`" —
   `tools/build-dqk-dir.mts` (the script that produces the M4 build used in §7/§8/§9) is untouched
   by that commit. Confirmed by grep: `appendHlibMasterSets`/`stampCokWallHeaders` (the wall-art
   commit's new exports) are referenced only from `packages/engine/src/index.ts` and
   `tools/build-cok-wallart-scratch.mts` — **zero references** in `tools/build-dqk-dir.mts` or
   `packages/engine/src/loaders/buildDqkGame.ts`.
2. **Scope separation.** The wall-art commit only touches `8X8DB.TLB` (dungeon-wall tile bank) and
   GEO header bytes 2-4 (wall-set ids). It never touches `CBODY.TLB`, `MONCHA.GLB`, or any
   combat-related bank — the §9.2 blocker is downstream of a walk/combat trigger, not a wall render.
3. **Byte-identity proof.** `build/cok-on-dqk-m4fidelity/DISK3/CBODY.TLB` and
   `The Dark Queen of Krynn/DISK3/CBODY.TLB` (stock retail) hash **identical SHA-1**
   (`767b16aefd140bf2d52c2714739f35e15ef5bd8b`) — the M4 build's combat-portrait/icon bank is an
   untouched passthrough, confirming no wall-art (or any other) tooling has modified it.

Also worth noting: chronologically, §9.2 was *discovered* in commit `2941f57`, which **predates**
`c801066` — the combat blocker was already reproduced before the wall-art commit existed, which by
itself would have made a collision impossible even before the proofs above.

### 10.2 Trace method

Extended nothing in `tools/unicorn_dqk_trace.py` itself (its existing `--fake-keys` gate/wait
vocabulary, `_find_game_file()` DISK1/2/3 resolver, and always-on `INT21/3D open` logging already
covered everything needed — see §10.5 for a correction to `c801066`'s own note that this harness
"does not model a mounted external filesystem"). Ran the proven §7/§8/§9 boot-to-dungeon route
(title → ESC intro-skip → `L,T,A,Enter,B` load/begin → `journal-answer` auto-solve, which reads the
live in-memory answer directly from `DS:0xC6F9` rather than needing external PDF text) against
**`build/cok-on-dqk-m4fidelity/DQK.EXE`** (unchanged since commit `50ee9ec`, current HEAD), then
appended the exact two-key walk that triggered combat live in §9.1 (`right` then `up`, matching
`KEY_NAME_AX` scan codes `0x4d00`/`0x4800`):

```
python tools/unicorn_dqk_trace.py --run \
  --exe "build/cok-on-dqk-m4fidelity/DQK.EXE" \
  --load-seg 0x1000 --fake-video --fake-keyboard --fake-key-rearm-after 20 --fake-timer --trace-keys \
  --fake-keys "esc,wait:2500000,space,space,gate:0x0bdb:0x1e3d:title-form-streq,0x1950,gate:0x25a4:0x33c3:party-menu-input-call,l,t,a,enter,b,gate:0x26f8:0x012f:journal-answer-staged,journal-answer,enter,enter,enter,wait:3000000,right,wait:3000000,up,wait:3000000" \
  --max-instr 100000000 \
  --watch-ecl-opcode 0x24 --watch-ecl-opcode-limit 10 \
  --log <scratch>/cok-m4-combat-trace.log
```

### 10.3 What the trace showed

**Boot/journal/dungeon-load path matches §8/§9 exactly** — save loads, `ECL.glb`/`GEO.glb`/three
`8x8db.tlb` opens/two `back.tlb` opens for area 34 (3 wall + 2 backdrop ids, matching the §8
placeholder sextet `01 02 08 01 08 ff` precisely), `moncha.glb` opens once. One new, incidental
observation: right after the QSV load and before the journal prompt even renders, `DISK3\CBODY.TLB`
is opened **5 times** in quick succession (handles 26-30, ~1.7-2.7k instructions apart) — this
matches the same "N opens = N valid ids consumed one at a time" pattern §8 established for
`8x8db.tlb`/`back.tlb`, so this is very likely **normal** DQK resume-time icon preloading, not an
error signature (unlike an unbounded/"hundreds of times" reopen, which is what §8's actual bug
looked like).

`right` (turn) was consumed at instr **18,614,461**; `up` (move) at instr **21,621,876** — matching
§9.1's observation that combat fires immediately on the first move. **The ECL `0x24` COMBAT opcode
never fired** (`ECL-HISTOGRAM` at end of run: opcodes `0x00`-`0x2f` seen via the `[b1c7]` write
watch, no `0x24`) — this is a second, independent piece of evidence (Unicorn-side, not just the live
banner-text mismatch from §9.3) supporting the **wandering-monster/random-encounter** theory: this
encounter is not dispatched through the scripted ECL opcode path this project's tooling already
watches.

**No further `INT21/3D open` calls occur anywhere after `moncha.glb`** (the last one, opened during
initial dungeon load) — through the entire ~21.6M-instruction idle-in-dungeon phase, the `up` move,
and the ~375K post-move instructions the trace managed to execute before an unrelated harness crash
(§10.4). **This rules out the literal "same mechanism as §8" hypothesis** (a resource-set id list
causing a wrong-disk file-reopen loop) as the cause of the combat-side freeze — whatever fails here
does not need to open a new file, meaning any needed combat-art file was already resident from the
dungeon-load phase.

### 10.4 What actually happens after the move: a NEW, reproducible in-memory retry loop — statically disassembled

Following the `up` key (instr 21,621,876), execution continues in DQK's ordinary dungeon
render/idle loop (canonical segment `0x22b7`) for ~297K instructions, then at instr **21,918,433**
enters a short, one-time burst of calls that (by static disassembly, not just live tracing) are
recognizably **combat/encounter setup code**, ending with the freeze:

| instr | live call | canonical (live − 0x1000) | what it is (confirmed by static disasm) |
|---|---|---|---|
| 21,918,433 | `CALLF 10d7:269d` (from `217e:0324`) | — | (setup dispatch, not decoded this pass) |
| 21,918,494 | `CALLF 10d7:2776` (from `3177:25d5`) | `00d7:2776` | **memcpy** (`_fmemcpy`-style; `rep movsb`, direction-aware) |
| 21,918,525 | `CALLF 10d7:0a1c` (from `3177:25fa`) | `00d7:0a1c` | **signed-byte RLE decompressor** — same codec family as CoK/DoK DAX block data (`CLAUDE.md`'s "signed-byte-RLE block data"); decodes a positive control byte as a literal run (`rep movsb`), a negative one as a repeat run (`rep stosb`) |
| *(quiet — no far calls for ~21.8K instructions: local/near code, likely the caller's own loop around the decompressed buffer)* | | | |
| 21,940,376 | `CALLF 10d7:2776` (from `3177:2612`) | `00d7:2776` | memcpy again |
| 21,940,833 | `CALLF 10d7:27a6` (from `3177:265d`) | `00d7:27a6` | **memset** (`rep stosb` with a fixed byte) |
| 21,940,926 | `CALLF 2093:0162` (from `3177:2760`) | `1093:0162` | thin wrapper: pushes a far table pointer (`DS:0xC3A9`), a constant word `0x3D`, and an output buffer, then calls the search routine below |
| 21,940,938 | `CALLF 1df9:02fc` (from `2093:0176`) | `0df9:02fc` | **bitmap slot-search/allocator**: scans a count-prefixed table for a byte-array flags region (`table[i+8]`), bit-tests each flags byte for a free (0) bit, marks it used and returns `table.base + slot × recordSize`, or a null/failure pair if the whole table is exhausted |
| 21,941,151+ | `1df9:0432` → `10d7:2776` | `0df9:0432` / `00d7:2776` | thin memcpy wrapper, called again |

**This exact 4-call cycle (`2093:0162` → `1df9:02fc` → `1df9:0432` → `10d7:2776`) then repeats 115+
times** (confirmed count for `2093:0162` specifically — first occurrence anywhere in the whole
21.6M-instruction trace is at instr 21,940,926, i.e. it is genuinely new, not a pre-existing idle
loop the move just happened to be inside), each iteration ~260-460 instructions apart, and **never
terminates** for the rest of the trace. This loop is the single strongest new finding of this pass:
it starts within ~20K instructions of a documented RLE-decompress call and a documented
combat-encounter-setup routine (the code just before it, at canonical `2177:2600`-ish, checks
struct fields `+0xc`/`+0xe` (far pointer null-check), `+0x28` (monster "type", per
`docs/engine/research/disasm-combat-dqk.md`'s OQ-7 struct map), and `+0x8a`/`+0x81` (morale-type
region) — i.e. it is genuinely monster/encounter setup code, not unrelated rendering), and it is a
**slot/id-table search that keeps being invoked and keeps failing**, the same *shape* of bug as
§8 (an id lookup into a fixed table that never resolves, so the engine retries forever) but
manifesting as an **in-memory table scan**, not a file-reopen — which is exactly why §10.3 found no
new `INT21/3D` activity.

**Leading candidate (not yet proven to file/byte level):** the CoK-native monster/icon id carried
by area 34's ported `MONCHA.GLB` records (or an ECL `SETUP_MONSTER`-adjacent operand — per this
doc's own CRUX 1/§4.5, the ported ECL body still speaks Gen1 addressing conventions) does not
resolve to any valid entry in **`CBODY.TLB`** — confirmed byte-identical to stock retail DQK
(§10.1.3), i.e. a pure, unmodified 98-icon DQK-native table (per `dqkArtMap.ts`'s
`DQK_ART_LAYOUT`, `CBODY.TLB` is a 24×24-icon `leaf` HLIB, disk3, 98 images — small on-map combat
tokens, not the 88×88 portrait libraries `PICA`/`PICB`/`PICC`). Since no CoK content was ever
packed into `CBODY.TLB` (unlike `8X8DB.TLB` in `c801066`), any CoK monster record that still
carries a CoK-native icon index has nothing to resolve to in this table, and the bitmap search
loops forever trying to place/find it. An equally plausible **alternative candidate**: this is not
an id-not-found search at all but a **participant-slot exhaustion** — the table may be a small
combat-participant array (not an icon table) sized for DQK's own typical encounter size, and area
34's spawned group (HOBGOBLIN LDR ×8 + WARRIOR ×5 + BLACK ROBE MAGE ×2 = 15, per §4.3) simply
doesn't fit.

### 10.5 The trace did not reach a clean, conclusive stop — an honest limit, not a smoothed-over gap

The trace terminated at instr 21,996,828 (well under the 100M cap) via `UC_ERR_INSN_INVALID` at
live `CS:IP=614d:72e8` — a segment (canonical `0x514d`) that never appears anywhere else in the
entire log, reached by jumping through what is very likely an uninitialized or never-populated far
pointer (the fetched bytes, `ff ff ff ff ff ff 78 00 00 00 41 64`, decode as nothing valid), roughly
365K instructions (about 3 more loop iterations' worth) after the retry loop above first appeared,
preceded by two spurious `INT 0x03` events (almost certainly `0xCC` filler bytes already being
mis-executed, i.e. the CPU was already off the rails for a short stretch beforehand). **This is
assessed as a harness-fidelity limit, not a real DQK behavior** — the harness's docstring is explicit
that it is "a MINIMAL synthetic-DOS harness, not a full DOS emulator"; the real, live-observed
behavior (§9.2) is that the game sits frozen indefinitely on this exact loop's outcome (the
alternating "MONSTERS ATTACK!"/"DISK READ ERROR" banner, unresponsive to input), which is fully
consistent with an infinite loop that a real DOS session simply never escapes, while this harness's
simplified interrupt/memory model eventually walked off into unmapped territory instead of also
staying stuck forever. Because of this, the trace could not get far enough to directly dump the
`DS:0xC3A9` table's live contents and settle §10.4's two candidates definitively.

**Correction to `c801066`'s own note:** that commit's message states the tracer's "INT21 file-read
model is self-referential-overlay-only, not a mounted external filesystem." This pass shows that
claim is **stale/inaccurate as written** — `tools/unicorn_dqk_trace.py`'s `INT21 AH=3D` handler
(`_find_game_file()`, searching `.`/`SAVE`/`DISK1`/`DISK2`/`DISK3` under whatever `--exe`'s
directory is, case-insensitively) genuinely serves real external files, and this pass's whole route
(including all of §10.3's `DISK1`/`DISK2`/`DISK3` opens) depended on exactly that mechanism working
against `build/cok-on-dqk-m4fidelity`. Recorded here so the next reader doesn't skip a legitimately
usable tool based on that note.

### 10.6 Verdict and next steps

**Root cause: UNLOCATED at the byte/field level, per the "UNLOCATED beats invention" standard** —
but the failure class and code location are now concretely narrowed, a genuine step forward from
§9's "plausible, UNCONFIRMED" hypothesis:

- **Ruled out:** the §9.2 blocker is the same *mechanism* as §8 (a GEO-header resource-set id list
  causing a file-reopen retry loop) — no new file opens occur.
- **Ruled out:** collision with `c801066`'s wall-art work — proven by build-graph separation, scope
  separation, and byte-identical `CBODY.TLB` hashes; that commit isn't even part of this build.
- **Established:** a specific, reproducible, statically-disassembled in-memory retry loop
  (`0df9:02fc`'s bitmap slot-search, invoked via `1093:0162`, canonical addresses given in §10.4)
  starts within ~20K instructions of the walk that triggers "MONSTERS ATTACK!" and never resolves,
  matching the live-observed frozen state.
- **Two ranked, not-yet-discriminated candidates** for what that loop is searching for:
  1. *(leading)* A CoK-native monster icon/portrait id (from ported `MONCHA.GLB`/ECL operands) with
     no match in DQK's untouched, native-only `CBODY.TLB` (98 slots).
  2. A combat-participant slot array too small for area 34's 15-creature spawn group.

**Concrete discriminating test for the next pass** (needs either a deeper Unicorn dump or a
DOSBox-X breakpoint, not attempted here): set a memory-read watch (`--watch-dgroup-read` or a new
one-shot dump hook) on the `DS:0xC3A9` table the moment `1093:0162` is first called, to read its
header word (entry count) and the byte being searched for. If the entry count is small (≈15 or
fewer) and unrelated to any icon-id space, candidate 2 (slot exhaustion) wins; if it's ≈98
(matching `CBODY.TLB`'s image count) and the search key looks like a plausible CoK-native monster
id, candidate 1 (icon-id mismatch) wins. Either way, the fix is content-side (either cap/split the
ported monster group's spawn count to fit DQK's participant array, or build a
CoK-monster-id→`CBODY.TLB`-slot mapping analogous to `c801066`'s wall-set id work) — no evidence
found this pass points at an engine/`DQK.EXE` patch being required.

No engine or build-tooling code was modified in this pass (research/trace-only, per the assignment).
Trace log: scratchpad `cok-m4-combat-trace.log` (not committed — git-ignored scratch output; see
`tools/unicorn_dqk_trace.py`'s own `--log` argument to reproduce with the §10.2 command).

---

## 11. §10.6's discriminating test run — BOTH ranked candidates RULED OUT; a third, more precise
mechanism found (STATIC ONLY, Unicorn tracer, no DOSBox-X, 2026-07-18)

**Task:** run §10.6's own proposed discriminating test (dump the live `DS:0xC3A9` table header and
the value being searched for) and use it to pick candidate 1 (icon-id mismatch) vs candidate 2
(participant-array overflow). **Result: neither candidate survives contact with the live data.**
Both are cleanly falsified by hard evidence below, and a third, better-characterized mechanism is
identified in their place — a genuine step forward, not a repeat of §10's "UNSETTLED."

### 11.1 Harness extension (small, additive, kept for reuse)

`tools/unicorn_dqk_trace.py` gained two new `--watch-exec` dump cases (no existing behavior
changed; both are read-only instrumentation, gated to only fire when their specific canonical
address is watched):

- **`_dqk_c3a9_slot_table_text()`**, hooked at canonical `0x0DF9:0x02FC` (the allocator's own
  entry point). Because the hook fires *before* the callee's own `push bp` executes, `[bp+X]`
  isn't valid yet inside the callee frame — the far-call ABI is used directly instead: `sp+4/+6` =
  out far ptr, `sp+8` = the caller's "record size" word, `sp+0xA/+0xC` = the table far pointer.
  Reads and logs the table's own header (capacity, record size, record-array base far pointer) plus
  the first 32 used/free bitmap bytes and a popcount, **for whichever table this shared allocator
  was actually asked to search** — not hardcoded to `0xC3A9` (this is what caught the two sibling
  tables in §11.2 below that §10's framing hadn't anticipated).
- A second case hooked at canonical `0x1093:0x0162` (the thin `DS:0xC3A9`-requesting wrapper).
  Reads the wrapper's *own* caller's return address straight off the stack (same pre-frame-setup
  trick) and live-disassembles a short window around it (`self.img.md`, the same capstone instance
  `disasm_dqk.py` already uses); also dumps the caller's own `[bp+8]` byte and a few neighboring
  frame words. On the very first hit only (`self._c3a9_wide_dumped` guard, to avoid log bloat) it
  additionally captures a ~300-byte live disassembly window covering the whole enclosing
  per-record routine — this is what produced the §11.3 decode below.

Both cases reuse only existing helpers (`_read_u16_safe`/`_read_u8_safe`/`_fmt_val`, the already-
imported `DqkImage`/capstone instance) — no new dependencies, no change to any existing watch
case, `--dqk-*` report, or CLI flag's default behavior. `python -c "import ast; ast.parse(...)"`
confirms the file still parses; the existing `--dqk-hlib-combat`/`--dqk-combat-map`/etc. static
reports in `disasm_dqk.py` were not touched at all (different file).

### 11.2 What `DS:0xC3A9` (and its two siblings) actually contain, live

Re-ran the exact §10.2 boot→journal→dungeon→`right,up` route with `--watch-exec 0xdf9:0x2fc:c3a9-
slot-alloc --watch-exec-repeat --watch-exec-repeat-limit 3000` against the unchanged
`build/cok-on-dqk-m4fidelity/DQK.EXE`. The trace hit the **exact same** harness-level
`UC_ERR_INSN_INVALID` at `CS:IP=614d:72e8`, instr **21,996,828** as §10.5 (byte-for-byte
reproducible across independent runs — confirms the trace itself is deterministic), yielding
**168 total hits** on the allocator entry point before that unrelated harness limit ended the run.
The allocator is shared by (at least) three distinct tables, not one:

| Table (segment 0x422E = DGROUP) | capacity | record size | record base | peak usage observed | outcome |
|---|---|---|---|---|---|
| `DS:0xB2A4` | 8 | 0x19E (414 bytes) | `5F6C:0000` | 5/8 (last hit instr 9,670,044, then never called again) | plateaus, does not fail |
| `DS:0xBD51` | 0x190 (400) | 0x0009 (9 bytes) | `66C9:0000` | 9/400 (last hit instr ~9,672,282, then never called again) | plateaus, does not fail |
| `DS:0xC3A9` | 0x1B8 (440) | 0x003D (61 bytes) | `603B:0000` | **151/440**, still climbing 1 bit **every single hit** (152 of the 168 total hits), right up to the moment the harness's own unrelated crash cut the trace off | **never fails, never even approaches its stated capacity** |

Every one of the 168 captured entries into the allocator **succeeded** — found a free bit, marked
it, returned a valid far pointer. None returned the null/failure pair the §10.4 decode showed the
function is capable of producing. `DS:0xC3A9`'s bitmap increments by exactly one set bit per hit,
monotonically, with zero stalls or repeats, all the way to the harness's crash — i.e. this
particular call site was working correctly and making real progress for the entire ~12.3M
traced instructions of combat-init, not stuck.

**This directly falsifies both ranked candidates from §10.6:**

- **Candidate 1 (CoK-native monster icon/body id has no match in `CBODY.TLB`) is ruled out.** The
  allocator function itself (fully disassembled in §10.4 and re-confirmed here) takes **no id/key
  parameter at all** — only an output far pointer, an (unused-by-the-callee) record-size word, and
  the table far pointer. There is no comparison-against-a-search-value anywhere in its body. It
  cannot be "looking for an id that isn't there" because it never receives one. `CBODY.TLB` is
  never referenced by any of the traced code.
- **Candidate 2 (area 34's 15-creature group overflows a small fixed participant array) is ruled
  out.** None of the three tables are anywhere near their stated capacity when the trace ends —
  the largest, `DS:0xC3A9`, is at 151/440 (34%) and *still succeeding on every call*. There is no
  small array being overflowed; there is no failure of any kind at the allocator level.

### 11.3 The real mechanism: an outer per-record driver loop with no observed termination write

The second watch (canonical `0x1093:0x0162`) shows every one of the 168 wrapper-caller hits lands
inside the **same enclosing routine**, live at `CS 0x3177` this run (canonical `0x2177` — the same
overlay-relative labeling family the tracer already uses for the previously-documented
`qsv-state-reader` anchors at `2177:28F8` etc., though this specific offset, `0x27FE`/`0x2765`, was
not previously catalogued; which physical overlay file occupies that bank on this route was not
resolved this pass — see §11.5). The one-shot wide capture (first hit, instr 21,940,927) decodes a
clean, self-consistent ~530-byte routine:

```
033e35  push dx | push ax | lcall 1df9:2fc              ; allocate from a chain-node pool (arg = far ptr @[bp+0xa]+4)
033e3f  les bx,[bp+0xa] | les bx,es:[bx+4]               ; P1 := *(param1 + 4)   -- first chain node
033e4e  mov ax,5 | push ax                               ; --- inner bounded loop over P1's chain ---
033e51  push [bp-0x278] | push [bp-0x27a]                ; source = P1 (far ptr)
033e5a  push ss | lea ax,[bp-0x276] | add ax,[bp-0x282] | push ax   ; dest = local staging buf + cursor
033e64  lcall 1df9:432                                    ; memcpy 5 bytes P1 -> staging[cursor]
033e6c  les bx,[bp-0x27a] | mov es:[bx+7],0 | es:[bx+5],0 ; zero P1's own +5/+7 (consumed marker)
033e7c  add [bp-0x282],5                                  ; cursor += 5
033e81  cmp [bp-0x286],1 | jbe 0x33eb4                    ; remaining<=1 ? skip "get next"
033e88  push ds | mov ax,0xbd51 | push ax | mov ax,9 | push ax   ; table = DS:0xBD51, "recsize" hint = 9
033e91  mov dx,[bp-0x278] | mov ax,bx | add ax,5 | push dx | push ax  ; OUTPUT = P1+5 (chain-link field)
033e9c  lcall 1df9:2fc                                    ; allocate next BD51 node, link it into P1+5
033ea4  les bx,[bp-0x27a] | les bx,es:[bx+5] | mov [bp-0x278],es | mov [bp-0x27a],bx  ; P1 := P1->next
033eb4  dec [bp-0x286] | mov ax,[bp-0x286] | or ax,ax | ja 0x33e4e        ; remaining-- ; loop while >0
033ec0  cmp [bp-0x284],0 | jne 0x33eca | jmp 0x33fb2      ; early-exit path (unrelated to the bug)
033eca  cmp byte ptr [bp+8],0 | je 0x33ee2                ; <<< the flag from §10.4's original find
033ed0  lcall 2093:0162                                    ; call the DS:0xC3A9 wrapper directly
033ed5  les bx,[bp+0xa] | mov es:[bx+0xa],dx | es:[bx+8],ax   ; store result into param1+8/+0xa
033ee0  jmp 0x33efe
033ee2  push ds | mov ax,0xc3a9 | push ax | mov ax,0x3d | push ax        ; (else) same table, inline
033eeb  mov dx,[bp+0xc] | mov ax,[bp+0xa] | add ax,8 | push dx | push ax  ; OUTPUT = param1+8 (embedded!)
033ef6  lcall 1df9:2fc
033efe  les bx,[bp+0xa] | les bx,es:[bx+8]                 ; P2 := *(param1 + 8)  -- the newly-built record
033f05  mov [bp-0x27c],es | mov [bp-0x27e],bx
033f0d  les bx,[bp-0x27e] | mov byte ptr es:[bx+5],0 | es:[bx+4],0 | es:[bx+2],0 | es:[bx],0  ; zero P2 header
033f26  mov ax,0x11 | push ax                              ; 0x11 = 17 bytes
033f2a  mov dx,[bp-0x27c] | mov ax,bx | add ax,0x28 | push dx | push ax   ; source = P2 + 0x28  <-- !!
033f35  push ss | lea ax,[bp-0x276] | add ax,[bp-0x282] | push ax         ; dest = staging buf + cursor
033f3f  lcall 1df9:432                                     ; memcpy 17 bytes  P2+0x28 -> staging[cursor]
033f47  les bx,[bp-0x27e] | mov es:[bx+0x3b],0 | es:[bx+0x39],0            ; zero P2's +0x39/+0x3b
033f57  add [bp-0x282],0x11                                ; cursor += 17
033f5c  cmp [bp-0x284],1                                    ; (capture window ends here)
```

Two decisive facts fall out of this decode:

1. **`P2 + 0x28` is copied out.** `docs/engine/research/disasm-combat-dqk.md` already documents,
   independently and much earlier (line ~935, VERIFIED by disassembly of a different code path,
   `0x59AB8`): struct offset **`+0x28`** is the per-combatant **type/class discriminator field**
   (tested against `{0x27, 0x28, 0x49}` to distinguish PC-type combatants from monster-type ones).
   The routine here reads a 17-byte span *starting at* that exact same field. This is strong,
   independent cross-confirmation that `P2` (the record obtained from either the shared
   `DS:0xC3A9` pool or an embedded per-record sub-table, depending on the `[bp+8]` flag) **is a
   genuine combatant/monster struct** — not an icon index, not an unrelated resource — consistent
   with `DS:0xC3A9`'s own 61-byte record size (comfortably larger than `0x28+0x11 = 0x39`, and in
   the same size class as other partial-combatant-record reads this project has already verified
   elsewhere in `DQK.EXE`).
2. **`[bp+8]` — the exact byte §10.4 already flagged as "the flag from" the retry cycle — is never
   written anywhere in this ~530-byte captured window.** It is read once (`cmp byte ptr [bp+8],0`)
   and never assigned. Since `bp+8` is a *positive* frame offset (a parameter this function
   received from its own caller, not a local it computes), the most consistent reading is: this
   whole per-record routine is itself invoked **once per record** by an *enclosing* driver loop
   that this pass's disassembly window does not reach, and that driver keeps re-invoking it with
   the same `[bp+8]` value, over and over, without whatever should eventually flip its own
   loop-continue condition to "done." The 168 repeated hits on the allocator, and the c3a9 table's
   bit count climbing by exactly one *per record* (matching one allocation per pass through this
   routine's `033eca`/`033ee2` branch), is fully consistent with this: **not** one internal
   infinite loop stuck in place, but a **genuinely unbounded outer count of freshly-processed,
   syntactically-valid records**, each one built correctly and then simply followed by another,
   forever.

### 11.4 Verdict

**Neither of §10.6's two ranked candidates is confirmed. Both are ruled out with direct evidence**
(no id comparison exists anywhere in the allocator; no table ever comes close to exhausting its
stated capacity). In their place, a **third, more precise mechanism** is now characterized: an
**outer per-record setup driver with no observed termination write to its own continuation
parameter**, manufacturing new, structurally valid combatant records (confirmed via the `+0x28`
type-field cross-reference against `disasm-combat-dqk.md`) one after another without end. This is
the same general *bug family* as §8 (a resource-count/terminator field the CoK→DQK port doesn't
populate the way DQK's native content does — the CRUX 1 "ported ECL body still speaks Gen1
addressing" theme) but the concrete defect, if it is a port bug at all, is a **loop-termination /
record-count or linked-list-terminator value feeding this per-monster setup driver** — not an icon
id and not a hardcoded small array. **No code fix is implemented this pass** — per the assignment's
own instruction not to force one when the trace is still ambiguous, and it genuinely still is: the
true upstream field (what count or sentinel this driver's caller is *supposed* to supply, and
where in `MONCHA.GLB`/the ported ECL body it lives for area 34) was not located.

### 11.5 What's needed next (concrete, not vague)

1. **Trace one level further out**: find who calls the ~530-byte routine decoded in §11.3 (i.e.
   who supplies its `[bp+8]`/`[bp+0xA]`/`[bp+0xC]` parameters), and where that caller's own loop
   bound or chain-terminator comes from. The most direct route is another `--watch-exec` case at
   that caller's own address (once located by the same "read the return address off the stack at
   entry" trick used here, one frame further up) plus a similar wide one-shot disassembly capture.
2. **Comparison trace against a *native*, unported DQK combat encounter** (any stock DQK save that
   reaches a fight, not a CoK-content build) would be the single most decisive follow-up: if the
   identical code path there terminates cleanly after a small, sane record count, a byte-level diff
   of whatever data structure feeds the loop (between the native and ported case) would likely
   directly identify the missing/malformed terminator field — the same style of proof §8 used for
   the GEO header bug.
3. **Which overlay bank currently occupies live segment `0x3177`/canonical `0x2177` for this exact
   route** was not resolved (§10's own note about overlay-relative canonical addresses shifting
   between runs still applies) — pinning this via `disasm_dqk.py`'s `resolve_ljmp`/stub-scanning
   would let the `033eXX`/`033fXX` addresses in §11.3 be converted to a genuine, comparable-across-
   runs static file offset, which the exec-watch's live-disassembly workaround intentionally
   sidesteps but a permanent doc reference should eventually have.
4. Once the upstream field is found: only then decide whether the correct fix is a port-side data
   patch (supply the right terminator/count when converting CoK's MONCHA/ECL encounter data to
   DQK's Gen2 shape) or something else — do not guess ahead of that evidence.

Harness changes: `tools/unicorn_dqk_trace.py` (`_dqk_c3a9_slot_table_text`, the `0x1093:0x0162`
exec-watch case, `self._c3a9_wide_dumped` init flag — additive only, see §11.1). No engine/build
code, game data, or existing trace-tool behavior was changed. Trace logs (git-ignored scratch
output, not committed): scratchpad `cok-m4-combat-trace2.log` (first `--watch-exec-repeat-limit 30`
pass), `cok-m4-combat-trace3.log` (full run to the harness crash, 168 hits, used for §11.2's table),
`cok-m4-combat-trace4.log`/`cok-m4-combat-trace5.log` (wrapper-caller watch, used for §11.3's wide
capture).

---

## 12. §11.5's own next step executed — the "unbounded loop" is a genuine local STACK-BUFFER
OVERFLOW, its exact victim byte pinned, the harness's "614d" crash explained for the first time,
and §11.2's candidate-1 dismissal corrected (STATIC ONLY, Unicorn tracer, no DOSBox-X, 2026-07-18)

**Task:** §11.5 asked for two things: (1) trace one level further out from the ~530-byte
per-combatant setup routine to find its own caller and where its loop bound/terminator comes from,
and (2) a comparison trace against a native, unported DQK combat encounter. This pass completed
(1) in full, with a materially stronger result than "found the caller" — it found the actual
overflow mechanism and tied it, byte-for-byte, to the previously-unexplained harness crash address.
(2) was not attempted this pass (see §12.6) — the finding below made it a lower-priority
cross-check than pinning down what had already become traceable.

### 12.1 Harness extension: a generic, reusable one-shot wide-disassembly probe

`tools/unicorn_dqk_trace.py` gained a new, general-purpose instrumentation feature, `--wide-disasm-
at SEG:OFF:BEFORE:AFTER[:LABEL]` (parser `parse_wide_disasm`, constructor param
`wide_disasm_specs`, dict `self.wide_disasm_phys`, dispatched from `_on_code` via
`_maybe_dump_wide_disasm`). Unlike §11.1's one-off, hardcoded wide dumps (kept as-is, still fire
from the `(0x1093, 0x0162)` exec-watch case), this is driven entirely by CLI arguments: on the
first time the given canonical `SEG:OFF` executes, it disassembles `BEFORE` bytes back and `AFTER`
bytes forward from LIVE (already-relocated) memory and logs the full listing plus a register
snapshot. This turns "widen an already-known hot address into its surrounding code" from a
hand-edited `elif` case into a one-line CLI flag — used repeatedly below to walk outward from
§11.3's decode without editing the tracer again each time. A second small, targeted addition,
`_dqk_combat_setup_entry_text` (hooked at a specific canonical address once found, see §12.3),
disambiguates near-call vs far-call at a routine's own entry by reading the raw stack under both
interpretations and checking which candidate return address is immediately preceded by a matching
call encoding. Both are additive; `python -c "import ast; ast.parse(...)"` confirms the file still
parses, and `--smoke-test` still passes unchanged.

### 12.2 Finding the routine's true entry point

`--wide-disasm-at 0x2177:0x2865:900:400:combat-loop-tail-first` (0x2865 = the tight bitmap-search
tail loop's own address, found via a `--trace-flow-range 0x2177:0x2500:0x2c00` sweep — see §12.5)
against the unchanged `build/cok-on-dqk-m4fidelity/DQK.EXE` (current HEAD, byte-identical to the
build §8-§11 used — freshness re-confirmed by mtime/commit check before this pass) captured a
900-byte backward window that, unlike §11.3's narrower ±160/+140-byte capture, reaches far enough
back to include the routine's own prologue: canonical `2177:257C` — `push bp | mov bp, sp | sub sp,
0x288` — matching §11.3's independently-observed local-frame size (`0x288` vs. the earlier
`-0x286`/`-0x284`/`-0x282` local offsets) exactly, a strong self-consistency check that the whole
900-byte window is correctly instruction-aligned (x86 is variable-length; a linear disassembly from
an arbitrary byte offset can desync for a few bytes, but by the time it reaches address `033cec` it
already agrees with bytes independently captured from a *different* window centered elsewhere in
§11.3 — alignment is confirmed real, not lucky).

### 12.3 Settling the near/far calling-convention question — RULED OUT as a false lead

The same wide window's *preceding* function (ending in `033ceb retf`, i.e. a clean function
boundary right before `033cec push bp`) contains what first looked like an alarming lead: a NEAR
`call 0x33cec` at file-relative `03402a` (capstone marks it `call`, not `lcall` — the same
convention this whole codebase's disassembly already uses to distinguish them throughout the
listing). Read naively, that would mean the routine — whose own body reads its first real parameter
at `[bp+6]`, only consistent with a FAR call's 4-byte return address (`bp+2/+4`=ret ip/cs, `bp+6`
=first arg) — was being invoked via a near call (2-byte return address) at that specific call site,
a genuine ABI mismatch that would itself explain stack corruption.

**This was checked directly against the LIVE stack, not inferred from static bytes, and is
FALSE.** `--watch-exec 0x2177:0x257c:combat-setup-entry --watch-exec-repeat` fired exactly **once**
in the entire route (instr 21,912,838) — confirming the routine truly is entered only once, not via
repeated calls — and `_dqk_combat_setup_entry_text`'s dual-interpretation stack probe shows
unambiguously: the near-call interpretation's candidate return address (`3177:018f`) is NOT preceded
by any call instruction (`no-call-ending-here`), while the far-call interpretation's candidate
(`35a4:018f`) IS: `MATCH 035bca lcall 0x3177, 0x257c`. **The real, live call site is a genuine far
call** (canonical `25a4:018a`, inside a small wrapper function starting at `035b95` — see §12.4),
fully ABI-consistent with the callee's own `[bp+6]`-based parameter reads. The alarming
`03402a call 0x33cec` byte pattern is a real, statically-present near call to the same address from
*somewhere else in the binary* (plausibly a genuinely different, unrelated call site elsewhere in
this large shared code segment — variable-length x86 makes even a correctly-aligned linear scan
occasionally surface unrelated valid-looking instructions that were never reached on this route) —
it is simply not the call that produced this specific live activation. **Lesson for future passes
using this same technique:** a static "found a call to X" grep/scan is not sufficient by itself;
always confirm against the live stack at the moment of entry, exactly as done here — this is now a
proven, reusable pattern (`_dqk_combat_setup_entry_text`), not a one-off.

### 12.4 The immediate caller: a thin per-record allocation wrapper, one hop from a raw id argument

Widening backward from the confirmed far-call site (`--wide-disasm-at 0x25a4:0x018a:700:20:combat-
setup-callsite`) decodes the small wrapper function calling into `257c`:

```
035b95  push bp | mov bp, sp
035b98  les bx, ptr [bp + 8]                 ; bx = an out-param far pointer (record slot)
035b9b  mov word ptr es:[bx + 2], 0 | mov word ptr es:[bx], 0   ; zero it
035ba6  push ds | mov ax, 0xb7b2 | push ax   ; table = DS:0xB7B2  <-- a THIRD allocator table,
035bab  mov ax, 0x19e | push ax              ;   same 0x19E(414)-byte record size as DS:0xB2A4
035baf  push word ptr [bp + 0xa]
035bb2  push bx
035bb3  lcall 0x1df9, 0x2fc                  ; allocate from DS:0xB7B2 via the shared allocator
035bb8  mov sp, bp
035bba  les bx, ptr [bp + 8]
035bbd  push word ptr es:[bx + 2] | push word ptr es:[bx]
035bc4  mov al, 0 | push ax                  ; --> becomes callee's [bp+8] byte flag (matches
                                              ;     the live-observed bp+8byte:0x00 from §11.3)
035bc7  push word ptr [bp + 6]               ; --> becomes callee's [bp+6] id/pointer argument
035bca  lcall 0x3177, 0x257c                 ; the call proven live in §12.3
```

`DS:0xB7B2` is a table this project's own §11.2 survey did not examine (it only checked
`0xC3A9`/`0xB2A4`/`0xBD51`) — same `0x19E`-byte record size as `0xB2A4`, plausibly a combatant "slot"
table distinct from the small "party" table `0xB2A4` was already guessed to be. This wrapper's own
`[bp+6]` (the id/pointer threading straight through into `257c`'s `[bp+6]`, live value `0x81DE` at
the call site) comes from **its own caller**, one hop further out than this pass traced (the wrapper
itself starts abruptly at `035b95` inside the captured window with no further prologue visible
before it — its own caller was not resolved this pass; see §12.6 for the concrete next step).

### 12.5 The actual overflow mechanism, found by widening the SAME routine forward past §11.3's cutoff

§11.3's own capture window ended at `033f5c` (a hard `+140`-byte forward limit) — before the
routine's own tail. Re-running `--wide-disasm-at 0x2177:0x2865:900:400` (chosen after a
`--trace-flow-range 0x2177:0x2500:0x2c00 --trace-flow-limit 600` sweep flagged `033fc8`-`033ff0` as
a hot, 8-hit branch pair) captures the full remainder of the routine, `033f5c` through `033ff5
retf`. Two loops live there, both walking linked chains built from the SAME kind of resource data
as §11.3's first (`[bp-0x286]`) chain — but this time the second chain's own counter,
**`[bp-0x284]`**, does not stay small:

```
033f5c  cmp word ptr [bp - 0x284], 1 | jbe 0x33fa3    ; "any nodes left after this one?"
033f5e..033f61                                        ; (skip inner-loop entry if <=1)
  ... [copy 17 bytes from record+0x28 into staging, per §11.3 -- unchanged] ...
033fa3  dec word ptr [bp - 0x284]
033fa7  mov ax, word ptr [bp - 0x284]
033fab  or ax, ax
033fad  jbe 0x33fb2          ; done -- 115 hits observed, i.e. loop RAN 114-115 times, not once
033faf  jmp 0x33f0d          ; loop back for another node -- 114 hits observed
```

`--trace-flow-range` confirms, LIVE, exactly **114-115 iterations** of this specific loop for this
one routine activation (grouped tally: `033fad jbe 0x33fb2` × 115, `033faf jmp 0x33f0d` × 114) —
not the small, bounded handful `[bp-0x286]`'s sibling loop produced (that one's own `ja 0x33e4e`
back-edge never even appears in the flow trace at all, meaning it fell through on its very first
check, i.e. a chain length of 0 or 1 — completely ordinary). Tracing `[bp-0x284]`'s own origin
(§11.3's own decode, re-read with this new context) pins the exact source:

```
033dd5  mov word ptr [bp - 0x282], 0x19e         ; cursor := 0x19E (414, the record's own fixed
                                                  ;   header size -- matches DS:0xB7B2/0xB2A4's
                                                  ;   own 0x19E record size, i.e. this cursor walks
                                                  ;   the record's OWN trailing variable data)
033de0..033def  [bp-0x286] := staging[cursor]     ; byte at offset 0x19E -> first chain's length
033df3  inc [bp-0x282]
033df7..033e06  [bp-0x284] := staging[cursor+1]    ; byte at offset 0x19F -> SECOND chain's length
```

`staging` (`[bp-0x276]`, the routine's own 0x288-byte local buffer) is populated a few instructions
earlier by a real signed-byte-RLE decompress (`lcall 0x10d7, 0xa1c` — the same codec family
`CLAUDE.md` documents for DAX/DAA/HLIB block data, already identified as such in §10.4), fed by a
resource-load pair (`lcall 0x2fc4, 0x88` then `lcall 0x2fc4, 0x130`, keyed on the routine's own
`[bp+6]` id/pointer argument) that **no `INT21 AH=3D` file open accompanies** (already established
in §10.3/§10.5 — no new file opens occur anywhere in the combat-init window), meaning this resource
is read from an already-resident in-memory copy. The same `0x2fc4:0x88`/`0x2fc4:0x130` pair also
appears, structurally identically, in a sibling helper at `035b58` (immediately preceding the
`035b95` wrapper in the same wide-disasm window, itself keyed on a `[bp+6]` id and a DS-relative
pointer `0x773e`) — strongly suggestive of a shared, generic "load one resource record for id X"
routine used by more than one caller in this code region, though this pass did not fully identify
which physical `.TLB`/`.GLB` bank backs it (see §12.6).

**Conclusion: byte offset `0x19F` of this per-record resource blob is being read as "count of
17-byte chained sub-records," and for whatever resource this specific ported-CoK combat setup
resolved to, that byte is ~114-115 (`0x72`/`0x73`) instead of a small, sane value.** Each iteration
of the `033f0d`-`033faf` loop calls the very same `DS:0xC3A9` allocator §10-§11 already
instrumented (via `2093:0162`/`1df9:2fc`) — this is exactly why §11.2 observed the c3a9 bitmap
climbing steadily to 151/440 without ever failing: most of those ~151 allocations are this ONE
runaway loop, not 151 separate legitimate combatants.

### 12.6 The overflow's downstream consequence: this IS a real stack smash, and it explains the harness's own long-unexplained "614d" crash address

The routine's local staging buffer is `0x288` (648) bytes, addressed as `[bp-0x276]` + a cursor that
advances by 17 bytes per iteration of the runaway loop. 114 iterations × 17 bytes ≈ 1938 bytes —
**roughly three times the buffer's own declared size**, with **no bounds check anywhere in the
loop** against the buffer's actual extent. This necessarily walks past the buffer, past the
frame's other locals, past the saved `BP`, and into the **saved return address** itself (a `retf`
expects 4 bytes: return IP then return CS) — silently overwriting it with literal resource-blob
bytes copied by the loop's own `memcpy` calls.

This is directly, live-confirmed: at instr 21,986,648, the routine's own `033ff5 retf` (`mov sp,bp |
pop bp | retf`) — the SAME exit point mapped in §12.2/§12.5 — pops a corrupted return address:
**`614d:206d`**. `614d` is precisely the bogus code segment `docs/engine/research/cok-m4-fidelity-
plan.md` §10.5 flagged as "a segment that never appears anywhere else in the entire log," and which
the trace's own harness-level `UC_ERR_INSN_INVALID` crash lands in shortly afterward (at a different
offset within the same segment, `614d:72e8`, instr 21,996,828 — identical across every independent
run of this route, confirming determinism). §10.5 assessed that crash as "a harness-fidelity limit,
not real DQK behavior," reasoning that a real DOS session would simply stay stuck forever rather
than walk into unmapped memory. **That assessment is now superseded with a mechanistic
explanation:** `614d` is not synthetic harness noise or an uninitialized pointer — it is literal
resource-blob content (part of the same RLE-decompressed record data being copied 17 bytes at a
time) that happened to land exactly on the return-address stack slot once the copy loop overran far
enough, and which decodes as a plausible-looking (but bogus) segment:offset pair once popped. In
other words: **this bug would corrupt DQK's own call stack in a real DOSBox session too**, not just
in this synthetic harness — a real stack-smash-driven crash or hang is now the best-supported
explanation for the live-observed frozen "MONSTERS ATTACK! / DISK READ ERROR" state (§9.2), stronger
than §9.2's own "generic disk-error string on a resource-load failure" guess (which remains
plausible as the proximate *display* text, but the underlying mechanism is now a corrupted return
address, not merely a failed-but-recoverable resource lookup).

### 12.7 Correction to §11.2: candidate 1 is NOT ruled out — it examined the wrong code location

§11.2 dismissed §10.6's candidate 1 ("a CoK-native monster icon/body id has no match in DQK's
98-slot native `CBODY.TLB`") on the grounds that "the allocator function itself takes no id/key
parameter at all... `CBODY.TLB` is never referenced by any of the traced code." That conclusion was
correct **about the allocator** (`0df9:02fc` genuinely has no id comparison, confirmed again this
pass) but the "CBODY.TLB is never referenced" claim was an artifact of §11.3's narrower capture
window, which started AFTER the id-keyed resource-load step (`0x2fc4:0x88`/`0x2fc4:0x130`, §12.5)
had already completed — that code path simply wasn't in view yet. **This pass found a genuine,
previously-unexamined id-keyed resource lookup** immediately upstream of the allocator loop, whose
result (specifically, byte offset `0x19F` of the decompressed record) directly drives the runaway
iteration count. This does not fully *confirm* candidate 1 (this pass did not conclusively identify
which `.TLB`/`.GLB` bank the `0x2fc4:0x88`/`:0x130` pair reads from, nor whether the `0x81DE`
id/pointer value is actually a raw CoK-native icon index or an already-resolved intermediate
pointer — see §12.8 item 1) — but it does mean **§11.2's blanket dismissal of candidate 1 was
premature**, and the honest state is: candidate 1's general *shape* (an id/resource-lookup
mismatch feeding bad per-record data) is now the best-supported explanation, re-opened with new,
concrete structural evidence rather than left closed on incomplete grounds.

### 12.8 Verdict

**Root cause: LOCATED to the mechanism and the exact local variables/addresses, still one hop short
of the specific upstream port-side field.** This is a materially stronger result than any prior
round on this bug:

- **Settled (new this pass):** the near/far calling-convention question — genuinely a red herring;
  the live call is a clean, ABI-consistent far call (§12.3). No engine-caller bug there.
- **Settled (new this pass):** the previously-unexplained "614d" harness-crash segment is not a
  harness artifact — it is literal overrun resource-blob content landing on the routine's own saved
  return address, i.e. a real, reproducible **local stack-buffer overflow** inside DQK's own
  combat-setup routine (canonical `2177:257C`-`27EC`-ish), triggered when a per-record "chained
  sub-record count" byte (offset `0x19F` of an RLE-decompressed, id-keyed resource record) is
  ~114-115 instead of a small, sane value (§12.5/§12.6). This would corrupt the stack in a real
  DOSBox session too, not just this harness.
- **Corrected (new this pass):** §11.2's dismissal of §10.6's candidate 1 (id/resource-lookup
  mismatch) was based on an incomplete disassembly window and is not sound as stated; the general
  shape of that candidate is now the best-supported lead, with concrete addresses attached (§12.7).
- **Still open:** the ultimate origin of the `[bp+6]` id/pointer argument (value `0x81DE` at the
  `257c` call site) — this pass traced it through exactly one wrapper hop (`035b95`, §12.4) but not
  to its own caller, so it is not yet known whether this is a raw CoK-native monster/icon index, an
  already-resolved MONCHA-record pointer, or something else, nor which specific `.TLB`/`.GLB` file
  backs the `0x2fc4:0x88`/`:0x130` resource-load pair.

---

## 13. Round 5 — §12.4's "wrapper at `035b95`" LIVE-DISPROVEN (backward-disasm methodology flaw
found); the resource family is now PINNED (`"moncha1"`); the id itself is proven to be a stray
shop-dialogue string pointer, not a monster id (STATIC ONLY, Unicorn tracer, no DOSBox-X, 2026-07-18)

**Task:** continue tracing backward from `DS:0xB7B2` / the `0x81DE` id argument (§12.8's own
"still open" item) to find where the bad `0x19F` count byte's *resource* ultimately originates, and
implement a fix if the evidence supports one. **Result: the specific static claim §12.4 made about
the immediate caller does not survive live verification, a materially stronger and more precise
resource-identity finding replaces it, and the fix location remains genuinely unproven — a 5th
honest narrowing round, not a forced fix.**

### 13.1 §12.4's "`035b95` wrapper" does not actually execute on this route — live-disproven, not just re-examined

Placing a fresh `--watch-exec` directly on the canonical address §12.4 identified as the wrapper's
own entry (`25a4:0155`, live `35a4:0155`, physical `0x035b95`) produces **zero hits** across three
independent re-runs of the exact same deterministic §10–§12 boot route (same fake-keys, same
instruction-for-instruction crash at `CS:IP=614d:72e8`, instr `21996828`, confirming the runs are
genuinely identical). This is not a flaky result — a second, independent line of evidence agrees:
`bp` at the confirmed live entry to `2177:257c` (physical `0x033cec`, the routine §11–§12 already
instrument) is `0xffba`, while `sp` at that same instant is `0xff96` — a 36-byte gap. §12.4's own
disassembly of `035b95` (`push bp | mov bp, sp`, **no** `sub sp,N`, then exactly 4 pushed words
before the far call) predicts a 12-byte gap (4 argument words + the CPU's own 4-byte far-call
return push). The 24-byte discrepancy is unexplained by that routine as disassembled — a second,
independent contradiction of the same claim.

**Root cause of the false lead: backward linear disassembly has no self-correcting alignment
guarantee.** §12.2 explicitly verified *forward* alignment (scanning `2177:257c` onward, byte
content agreed with an independently-captured window elsewhere) — x86's variable-length encoding
does recover forward scans within a few bytes. §12.4's own capture, by contrast, was a **backward**
scan (700 bytes back from the confirmed call site at `25a4:018a`) with no equivalent anchor: nothing
in the harness or the write-up ever confirmed that scanning backward from a known-good byte
boundary reproduces the *true* instruction stream rather than a coincidentally plausible-looking
one. This round's evidence says it didn't: the bytes at physical `0x35b95` are real (this was
confirmed by reading live memory, not the static file), but they most likely belong to a different,
unrelated function that happens to sit at that address and is simply never entered on this route —
not the actual immediate caller of `257c`. **This is a genuine correction to round 4's work,
recorded plainly rather than smoothed over**, and a reusable methodological lesson: backward
`--wide-disasm-at` windows need the same kind of live cross-check (`--watch-exec` on the claimed
entry address, or a bp/sp delta sanity check) that §12.3 already applied to the near/far
calling-convention question — one more instance of the exact hazard §12.3 itself warned about
("a static 'found a call to X' scan is not sufficient by itself").

### 13.2 A reliable replacement: live bp-chain walk, no static guessing

`tools/unicorn_dqk_trace.py` gained a small additive extension to the existing
`_dqk_combat_setup_entry_text` watch case (hooked at canonical `2177:257C`, unchanged trigger
condition): it now also reads `ss:[bp+0]` (the immediate caller's own saved/grandparent `bp`) and
`ss:[bp+2]`/`ss:[bp+4]` (candidate return-address words), re-using the same self-validating
"does a real call/lcall instruction end exactly at this reconstructed physical address, checked
against LIVE memory" technique §12.3 already proved out — plus a companion near-call check using
the *already-confirmed* wrapper `cs` (`0x35a4`, proven correct by §12.3's own far-assume match one
level down) rather than a second guessed segment. This is authoritative regardless of any static
disassembly question: `bp` is a real register value, set by whatever function actually called
`257c`, independent of where anyone's linear byte-scan thinks that function starts.

Result (same deterministic hit, instr `21912838`):

```
bp-chain: bp=0xffba ss:[bp+0]=0xffca(caller's-saved-bp)
ss:[bp+2,+4]=0x1311,0x3033(candidate-ret-ip,cs)
caller-near-decode(cs=wrapper's-own=0x35a4): no-call-ending-here
caller-far-decode(cs=[bp+4]-guess): MATCH 03163e call 0x31276
ss:[bp+6,8,a,c,e,10]=0x81de,0xff04,0x030a,0x2fe9,0x0100,0xffd2
grandparent: saved_bp=0xffca ss:[saved_bp+2,+4]=0x0312,0x2fe9
```

Read honestly, this is **inconclusive on the caller's own identity**, not a second clean win: the
near-interpretation (using the wrapper's own confirmed `cs=0x35a4`) finds no call ending there at
all, ruling out a same-segment near call; the far-interpretation "match" uses `[bp+4]=0x3033` as a
*guessed* segment and, while it does find a real `call` instruction ending at the reconstructed
address, that instruction is itself encoded as a near call (`E8`, 2-byte return) — the exact same
spurious-match shape §12.3 already flagged as a hazard, just recurring one frame further out. **This
round does not claim to have found the immediate caller's address** — only that `[bp+6]=0x81DE` is
present unchanged in the caller's own frame too (strong evidence the id is a simple pass-through
parameter, not something `257c` itself computes), and that finding the caller's true address needs
either a forward-scanned anchor (not available yet) or a DOSBox-X breakpoint, not another backward
guess.

### 13.3 The resource family is now identified with certainty: `"moncha1"`

Combat-setup-entry's *own* resource-load call — inside its already forward-alignment-confirmed body
(§12.2), not the disputed caller — is `lcall 0x2fc4, 0x130` with `DS:0x5FFD` as one of its arguments
(§12.5's own decode: `033d0f push ds | mov ax, 0x5ffd | push ax`). Canonical `1fc4:0130` (this
route's live segment is `2fc4` = canonical `+0x1000`) is **not a new or unknown routine** — it is
the exact same generic, id-keyed resource loader `docs/engine/research/dqk-qsv-save-transfer-
consumers.md` and `combat-system-source-recovery-goal.md` already document being called with
`DS:0x773E`, a literal ASCII string `"ECL1"`, to load ECL script members. That prior work already
established the convention: the DS-relative pointer names *which resource family* to search, and a
separate id argument selects *which member*.

Reading `DS:0x5FFD` live (confirmed `ds=0x422e`, DGROUP, matches `DQK_DGROUP_SEG` +
`load_seg`) at the exact moment of the call:

```
resource-name-probe: ds:0x5ffd='moncha1' (ds:0x773e-sanity-check='ECL1', expect 'ECL1')
```

The sanity check (reading the *already-known-good* `0x773E` pointer in the same run) confirms the
technique: it reads back exactly `'ECL1'`, matching the independently-documented prior finding
byte-for-byte. **This settles, with certainty, that combat-setup-entry's id-keyed resource load
targets the `"moncha1"` family** — i.e. the DQK Gen2 monster-record archive, exactly the resource
class `docs/engine/research/cok-m4-fidelity-plan.md`'s own §4.0 and `packages/engine/src/loaders/
monchaEncode.ts`/`moncha.ts` already work with for the content port. This is a real, materially
stronger result than §12.7's "leading candidate, not proven to file/byte level" — the family is no
longer a candidate, it is confirmed.

### 13.4 But the id itself (`0x81DE`) is proven NOT to be a valid moncha id — it is a live shop-dialogue string pointer

If `0x81DE` were a legitimate "moncha1" member id in the sense `monchaEncode.ts`'s own id-table uses
(small integers like the encounter's own `13`/`35`/`38`, §4.3), it would have no meaningful
interpretation as a DS-relative address. Reading `DS:0x81DE` directly anyway (as a diagnostic, not
because the code itself necessarily treats it as a pointer) produced a striking result — not
garbage, not binary monster-record bytes, but coherent, readable game text:

```
id-arg-wide-window(ds:81de-40..+120)=
"hem..Overloaded..Money will be put in pool..Fool! You must remove them from the bundle
first!.For 20 steel pieces I'll identify your %s.Is It a Deal? .Not Enoug"
```

This is DQK's own **shop / inventory-management dialogue string pool** ("Overloaded", "Money will
be put in pool", "identify your %s", "Is It a Deal?") — completely unrelated to combat or monster
data. A control read 0x1000 bytes further into the same segment also shows partial text (DGROUP is
densely packed with string literals throughout this region, so *some* readability there isn't
surprising) — but landing exactly mid-sentence in a coherent, multi-clause piece of shop dialogue,
at precisely the address treated as "the monster id," is a far stronger and more specific signal
than generic background text density. **`0x81DE` is best explained as a stray/stale DS-relative
string pointer — left over from an unrelated, earlier computation (most plausibly a prior
shop/dialogue text lookup) — being read as if it were a small "moncha1" member id, not as a
deliberately-computed (even if wrong) monster identifier.**

### 13.5 Revised understanding of the bug, and why no fix is implemented this round

This reframes the leading hypothesis from round 4's §12.7 ("a CoK-native monster/icon id has no
match in a DQK-native table") to something more specific and, on current evidence, **less likely to
be a simple content-port packing bug and more likely to be an uninitialized/stale-variable read in
the encounter-dispatch path itself**:

- The value is not merely "too large" for a monster id — it demonstrably **is** a valid, in-range
  pointer into a real, unrelated DGROUP resource (shop dialogue text), which is much more consistent
  with "this variable/register was never (re-)written by whatever set up this specific encounter"
  than with "a build script packed the wrong numeric field."
- `docs/engine/research/combat-system-source-recovery-goal.md`'s own open items already list
  *"Determine how wilderness/random encounters select `WILDCOM`/`RANDCOM`"* as an unresolved
  research question — independent, pre-existing confirmation that this project does not yet know how
  DQK's native wandering-encounter dispatch is supposed to populate its own monster-id argument. This
  round's finding is a concrete, live data point toward answering that question: for this specific
  ported-CoK route, whatever should populate it did not.
- This is consistent with, and sharpens, §9.3's still-open "wandering encounter, not the planned
  selector-28 script" theory and §10.3's confirmation that the ECL `0x24` COMBAT opcode never fires
  on this route — the encounter is dispatched by some other, still-unlocated mechanism that appears
  not to initialize its own monster-selection state correctly for CoK's ported area 34.

**No code fix is implemented this round.** Per the task's own explicit standard ("a 5th narrowing
round with a documented residual is a perfectly good outcome; do not force an unproven fix") and
this doc's long-standing "UNLOCATED beats invention" practice: the true upstream field/routine that
should set this id is still not located (§13.2 above shows the immediate-caller identity itself is
still genuinely ambiguous, not just "one more hop needed"), and patching either the content-port
monster-record packer or the wandering-encounter dispatch code without knowing *which one* actually
owns this bug would be exactly the kind of guess the standard exists to prevent — especially now
that the evidence points more toward an engine-side (or engine/port-interaction) uninitialized-state
issue than a straightforward "wrong field packed" content bug.

### 13.6 Verdict and next steps

- **Corrected (this round):** §12.4's specific claim about the wrapper's address (`035b95`) and its
  one-hop caller chain does not hold under live verification — recorded as a real correction, not
  quietly dropped. The general finding that stands from round 4 (the routine at `2177:257C` has a
  genuine, unbounded, id-keyed stack-buffer overflow reading offset `0x19F` of an RLE-decompressed
  record) is untouched by this correction — only the *upstream caller identification* is revised.
- **New and solid (this round):** the resource family is `"moncha1"` (DQK Gen2 monster records),
  confirmed via the same generic loader convention already proven elsewhere in this project, with a
  passing sanity check against the independently-documented `"ECL1"` reference case.
- **New and solid (this round):** the id value (`0x81DE`) fed to that loader is demonstrably a
  live, in-range DS-relative pointer into DQK's own shop-dialogue text pool, not a plausible monster
  id under any reading — reframing the likely defect class from "content mis-packed" toward
  "encounter-dispatch state not (re-)initialized for ported content."
- **Still UNLOCATED:** which specific routine sets (or fails to set) this id before calling into the
  wrapper/`257c`, and therefore whether the eventual fix belongs in the content port
  (`packages/engine/src/loaders/monchaEncode.ts`/`buildDqkGame.ts`) or is a DQK-engine-side gap in
  the wandering-encounter dispatcher that native DQK content simply never exercises the same way.
- **Concrete next steps, ranked:**
  1. A DOSBox-X breakpoint (not a backward static guess) on the physical call site `0x35bca`
     (`lcall 3177,257c`) — trivial to set given the address is now proven correct and stable — would
     read the *true* live `CS:IP` of the caller directly from the debugger, settling §13.2 without
     any alignment ambiguity. Flagged for the next slot-holder per this doc's own DOSBox-X
     discipline; not attempted here (STATIC ONLY per this round's assignment).
  2. A differential Unicorn trace against a **native, unported DQK combat/wandering-encounter route**
     (§11.5's item 2, still not attempted in any round so far) — if a native encounter reaches the
     same `2177:257c` routine with a small, sane `moncha1` id, and this ported route reaches it with
     stale/uninitialized data, that difference would directly implicate the encounter-dispatch
     initialization path over the content port. `combat-system-source-recovery-goal.md`'s own
     `WILDCOM`/`RANDCOM` open item is the natural place to anchor this.
  3. If a native reference route confirms the engine-side theory: the actual fix is almost certainly
     NOT in `monchaEncode.ts` (the monster records themselves decode correctly per §4.0's own
     byte-identity checks) but in whatever per-area state CoK's ported GEO/ECL data doesn't supply
     that DQK's native wandering-encounter dispatcher expects (analogous in spirit to §8's GEO
     resource-set-id fix, but for a different subsystem) — do not assume this without step 2's proof.

Harness changes: `tools/unicorn_dqk_trace.py` — `_dqk_combat_setup_entry_text` extended with a live
bp-chain dump (near/far disambiguation one frame up, reusing the existing self-validating
`_preceding_call_text` helper) and a resource-name/id-argument diagnostic (reads the `DS`-relative
string the generic loader's own convention names, plus a diagnostic dump of what the id argument
itself points to). Both additive; existing watch cases, CLI flags, and `--smoke-test` are unchanged
(`python tools/unicorn_dqk_trace.py --smoke-test` still reports `RESULT: PASS`). No engine/build
code (`packages/engine/**`) or game data was modified this round — trace-only, per the task's STATIC
ONLY constraint. Trace logs (git-ignored scratch output, not committed): scratchpad
`cok-m4-round5-trace{1..9}.log`.

**No code fix is implemented this pass.** Per the assignment's own "do not force a fit" standard:
while the *mechanism* is now precisely pinned (a missing bounds check combined with a bad count
byte), the *content-port fix location* is not — it could be (a) a missing id-mapping table in the
port pipeline analogous to commit `c801066`'s wall-art set-id fix (if `0x81DE` resolves to a
CoK-native icon/body index with no native counterpart), (b) a genuinely oversized/miscounted
CoK monster resource field that the port copies through unmodified from source DAX data without
re-validating it against DQK's own record-size assumptions, or (c) something upstream of both that
this pass's one-hop trace didn't reach — implementing a "fix" against any of these without knowing
which would be inventing a fix on an unconfirmed diagnosis, exactly what earlier rounds already
correctly declined to do. `DQK.EXE` itself is very unlikely to be the fix target (this is retail,
extensively-shipped code; the missing bounds check is a pre-existing engine characteristic, not
something the port should patch around by modifying the EXE) — the real fix, once located, almost
certainly belongs in the CoK→DQK content-port pipeline (`tools/build-dqk-dir.mts` /
`packages/engine/src/loaders/buildDqkGame.ts` / a MONCHA-adjacent encoder), consistent with every
other bug this whole investigation chain (§8's GEO header, `c801066`'s wall art) has turned out to
be.

### 12.9 Concrete next steps (in priority order)

1. **Trace one hop further out from `035b95`** (§12.4) using the same `_dqk_combat_setup_entry_text`
   -style live-stack technique (confirm near/far first, don't assume) to find `035b95`'s own caller
   and the true origin of the `[bp+6]` id/pointer value (`0x81DE`). This is the single most valuable
   next step — it would very likely settle §12.7's open question directly.
2. **Identify the `0x2fc4:0x88`/`0x2fc4:0x130` resource pair's backing file.** Given no new file
   opens occur during combat-init, cross-reference against §10.3's already-logged dungeon-load-time
   file opens (`CBODY.TLB` opened 5× right after the QSV load) — if the resident buffer these calls
   read from is the same one `CBODY.TLB`'s reads populated, that would directly confirm (not just
   plausibly suggest) candidate 1's *specific* file target. A `--watch-file-writes`/memory-diff probe
   comparing the buffer's contents against a fresh `CBODY.TLB` extraction would settle it.
3. **§11.5's originally-requested comparison trace against a native, unported DQK combat encounter**
   is still valuable but now more precisely scoped: given the mechanism is understood, the useful
   comparison is narrower than "does combat work at all" — specifically, what byte value appears at
   offset `0x19F` of the equivalent resource record for a native DQK monster, and does the native
   content ever drive this exact loop (`033f0d`-`033faf`) more than a handful of iterations. If native
   DQK monsters always have a small `0x19F` byte, that's strong confirmatory evidence pointing at
   content, not engine.
4. Only once (1)-(3) pin the exact upstream field and its owning file/table, implement the actual
   content-port fix (most likely an id-mapping or bounds-clamping addition analogous to
   `c801066`'s wall-art work) — do not guess ahead of that evidence.

Harness changes this pass: `tools/unicorn_dqk_trace.py` — `parse_wide_disasm`, `--wide-disasm-at`
CLI flag, `wide_disasm_specs`/`wide_disasm_phys` constructor plumbing, `_maybe_dump_wide_disasm`
(generic, reusable one-shot wide-disassembly probe), and `_dqk_combat_setup_entry_text` (the
canonical `2177:257C` near/far-call disambiguation case) — all additive; no existing CLI flag,
watch case, or default behavior changed. `python -c "import ast; ast.parse(...)"` and
`--smoke-test` both still pass. No `packages/engine` or build-tooling code was modified this pass
(trace/harness-only). Trace logs (git-ignored scratch output, not committed): scratchpad
`cok-m4-caller-trace.log`, `cok-m4-flowtrace.log`, `cok-m4-widedisasm.log`, `cok-m4-entry-abi.log`,
`cok-m4-caller-wide2.log`.

## 14. Round 6 — live DOSBox-X breakpoint attempt on §13.6's own top recommendation: the exact
documented crash reproduces 4/4 live, but the target breakpoint never fires at EITHER of two
independently-derived addresses; a genuinely new, reusable live-calibration technique found; a
clean, load-bearing negative result (zero disk I/O in the whole post-menu window) narrows the bug
further even though the live/static address-translation gap itself stays open (DOSBox-X ×4 boots +
2 aborted/recovered launches, 2026-07-18)

**Task:** hold the project's singleton DOSBox-X/GameLink slot, set up a live breakpoint at §13.6's
own confirmed addresses (not a fresh guess), trigger the CoK M4 combat-initiation crash live, and —
if reached — diff its register/memory state against a native DQK wandering encounter. Implement a
fix only if the evidence pins one; otherwise document precisely. **Result: the crash reproduces
live, byte-for-byte, on 4 independent boots — the first-ever live re-confirmation of §9's original
finding via a fully scripted, deterministic route. A genuinely new, reusable technique (live
load-segment calibration from a `BPINT 21 42` stop) is proven and solves a previously-open project
question. But the target breakpoint itself never fires, at BOTH the callee's own entry (`2177:257C`)
and the plan's own explicitly-recommended call site (`25A4:018A`) — a real, load-bearing negative
result, not a smoothed-over gap. A clean side-finding (zero `INT 21 AH=0x42`/`0x3F` calls anywhere
between the party menu and the crash) further narrows the bug: whatever corrupts memory here does
so with NO disk I/O involved, ruling out "a real DOS read failure" as an explanation for the
on-screen "DISK READ ERROR" text and reinforcing §12's stack-buffer-overflow mechanism as pure
in-memory corruption. The native-DQK comparison run was not attempted this round — see §14.6.**

### 14.1 The live load-segment calibration technique (new, reusable, solves a standing project question)

`decompile-methodology-krynn.md` has long listed "what is the DGROUP base for each Krynn binary in
real DOSBox-X?" as UNKNOWN, with "break at `main()`, read DS" as the intended but never-executed
method. This round did exactly that, and refined it into something more precise and directly
reusable:

1. Arm `BPINT 21 42` (DOS `lseek`) **before** the guest even starts running (the DEBUGBOX contract
   pauses the guest pre-boot, so this is the earliest possible arm point) and `RUN`.
2. `DQK.EXE`'s own FBOV self-referential overlay loader issues its first `lseek` extremely early —
   long before the title screen renders, so this technique cannot race the launch-menu attract-timer
   the way any later hook would.
3. At that first stop, read `CS` (not `DS` — see the correction below).
4. `load_seg = CS_at_ah42_stop - e_cs`, where `e_cs` is read directly from the live `DQK.EXE`'s own
   MZ header (offset `0x16`) — `0x1D99` for both the CoK M4 build and native DQK (only 26 bytes
   differ between the two `DQK.EXE`s, all outside the header; confirmed by direct header read and
   `cmp -l`, see the round-6 pre-compaction work).
5. Any other canonical (file-relative, `--load-seg 0x1000`-convention) segment `S` translates to a
   live segment via `(S - e_cs + CS_at_ah42_stop) & 0xFFFF`.

**Correction recorded, not smoothed over:** the first attempt assumed `DS == DGROUP` at this stop.
Live evidence showed `CS == DS == ES == 0x25BD` at the very first `AH=42` hit — this is DQK.EXE's
raw bootstrap/root segment (canonical `e_cs = 0x1D99`), not yet DGROUP (canonical `0x322E`), because
DGROUP hasn't been initialized yet this early. Switching the anchor to `CS`/`e_cs` fixed the formula.

**Reproducibility:** `CS = 0x25BD` (⇒ `load_seg = 0x0824`) at every one of 4 independent live boots
this round, byte-identical every time, and independently cross-checked against an unrelated earlier
artifact from a prior round (`build/cok-m4-run-03/debugger_console_0.txt`: `CS=0x25BD` one
instruction past `DQK.EXE`'s own entry). This technique is genuinely solved and reusable for any
future live DOSBox-X pass against this binary (or, with the same method, any other Krynn `.EXE`).

### 14.2 The exact documented §9.1/§9.2 crash reproduces live, 4/4, via a fully scripted route

`tools/cok-m4-combat-breakpoint-route.ps1` (new) chains the proven §7-§9 boot route (fast PLAY
click, ESC intro-skip, `L,T,A,Enter,B` load, journal-word protection solve, with a defensive
regex-extraction fix for an intermittent vision-model JSON-leak observed live this round) with the
calibration step above and a scripted 2-key movement (`right`, `up`). All 4 completed runs
(`build/cok-m4-bp-run-cok2`, `-cok3`, `-cok4` partial/journal-retry, `-cok5`) show the *identical*
outcome: party moves 14,10 → 15,10 facing E after exactly those two keys, then freezes on
`MONSTERS ATTACK! DISK READ ERROR` — matching §9.1/§9.2's original manual finding exactly. This is
the first time this exact crash has been reproduced via a scripted, repeatable, unattended route
(all prior confirmations were either the original one-off manual run in §9, or purely static
Unicorn traces in §10-§13) — a solid regression fixture for any future round on this bug.

### 14.3 The target breakpoint never fires — at either of two independently-derived addresses

Two addresses were tried, both computed with the calibration technique above and both taken
directly from this plan's own prior analysis, not fresh guesses:

- `2177:257C` (live `299B:257C`) — the combat-setup-entry routine's own confirmed entry point
  (§12.2's forward-alignment-verified address). **Zero hits** across the full post-menu window.
- `25A4:018A` (live `2DC8:018A`) — the confirmed-live **call site** `lcall 0x3177,0x257c` inside
  the wrapper (§12.3/§13.2's live bp-chain-verified address — deliberately NOT the wrapper's own
  claimed *entry* point at `035b95`, which §13.1 already live-disproved this round's predecessor;
  the call-site address itself was never disproved, only the entry point was). This was §13.6's own
  explicit, top-ranked "concrete next step." **Also zero hits.**

Both targets were tested with the breakpoint armed continuously from just after the party-menu
screen (safely past the timing-critical PLAY-click race) through the entire dungeon-load,
journal-solve, and movement/crash sequence (`build/cok-m4-bp-run-cok2` through `-cok5`,
`report.json`'s `breakpoint_hit`/`breakpoint_hit_early` fields all `false`). The DOSBox-X debugger
console itself confirmed each `BP` command was accepted (`DEBUG: Set breakpoint at <seg>:<off>`
echoed every time) and the process never crashed the debugger session — the breakpoint is real,
armed, and simply never reached by the live CPU.

### 14.4 A clean side-finding: zero disk I/O anywhere in the crashing window

`tools/cok-m4-combat-breakpoint-route.ps1` was extended to keep `BPINT 21 42` (lseek) and, in the
final two runs, `BPINT 21 3F` (read) armed continuously from just past the party-menu screen through
the crash, logging and auto-resuming every hit (`$distinctCs`/`$hitLog` in the script, surfaced in
`report.json` as `distinct_cs_segments_seen`/`lseek_and_bp_hit_log`). Across `-cok2` (lseek only)
and `-cok3`/`-cok5` (lseek + read), the result is consistently **empty**: not one `INT 21 AH=0x42` or
`AH=0x3F` call occurs between reaching the party menu and the crash. This was a deliberate test of
whether the on-screen "DISK READ ERROR" reflects a genuine DOS `INT 24h` critical-error handler
response to a real failed file read (which would require at least one `AH=0x3F` call in this
window) — it does not. Combined with §12's already-pinned stack-buffer-overflow mechanism, this is
positive evidence *for* that mechanism (pure in-memory corruption of an already-resident record,
overwriting the routine's own return address) and *against* an alternative "the port is missing a
real file the loader tries to open/read" explanation for this specific crash. It also means whatever
memory holds the combat-setup code and the `moncha1` resource blob was already resident by the time
the party menu appeared — no *new* overlay-swap read/seek happens in this window, for whatever code
executes here.

### 14.5 What 14.3 + 14.4 together imply, and what they don't settle

Read together, these two results narrow but do not close the live-vs-canonical addressing puzzle:

- Because zero file I/O occurs in this window, the routine that crashes (if it is truly the
  Unicorn-traced `2177:257c` routine at all) cannot be reaching a not-yet-loaded overlay bank via a
  *fresh* disk read — anything it touches must already be resident. This weakens (does not fully
  retire) the round-6-pre-compaction hypothesis that "the harness's whole-blob-load model doesn't
  match a real dynamic FBOV overlay swap happening in this window" — there is no live evidence of
  ANY overlay swap (of the disk-read-driven kind) happening here at all.
- Two live, independently-derived addresses in the SAME code neighborhood both failing to fire is a
  materially stronger negative than one guess failing — it argues against "the second address was
  just as wrong as the first, independently" and toward a **systematic** translation problem instead:
  either (a) this specific code region is placed at a live address that does not follow the simple
  `canonical - e_cs + CS_at_calibration` relocation model the calibration technique (§14.1) otherwise
  validates for the root segment, or (b) the Unicorn-traced control flow, while a faithful
  disassembly of real file bytes, is not actually the path real DOSBox-X takes to reach this crash at
  all (i.e. a different routine altogether produces the same visible "MONSTERS ATTACK! DISK READ
  ERROR" freeze). Neither is confirmed; both remain open.
- One concrete, testable prediction for whichever hypothesis a future round pursues: if (a), a
  breakpoint on a KNOWN-resident, frequently-hit shared library routine at a *large* canonical
  offset from the root segment (e.g. the RLE-decompressor called from within `2177:257c` itself,
  canonical `10d7:0a1c` per §12.5) should still fire normally, since it's plainly reachable from
  code that DOES execute (the routine is called from within the very combat-setup routine whose
  entry didn't fire — so if the decompressor itself is resident and correctly addressed, that
  isolates the problem to something specific about the `2177`/`25a4`-region addresses rather than
  the calibration formula in general). This was identified as the next cheap test in this round's
  pre-compaction planning but not executed this round (time budget) — flagged as the single most
  useful first step for whoever holds the slot next.

### 14.6 The native-DQK comparison run (task item 2) was not attempted this round

Building a second full route (calibration + boot + a *working* native DQK save load + a scripted
walk to a genuine wandering encounter) requires its own reconnaissance (a suitable native save file,
a known encounter-trigger position, and — per §13.6 item 2 — ideally landing on the SAME `2177:257c`
routine to diff against). Given the breakpoint doesn't fire on the CROSSING (crashing) side either,
capturing the native run at the same guessed address would not, by itself, produce a meaningful diff
without first resolving §14.5's addressing puzzle — so this round's remaining time went to
maximizing the value of the CoK-side runs (the calibration technique, the 4x reproduction, and the
disk-I/O side-finding) rather than a native run whose central premise (a working breakpoint to
compare at) isn't available yet. This is an honest scope cut, not a forgotten step — §13.6 item 2
remains open and ranked for the next round, ideally *after* §14.5's addressing puzzle is resolved so
the comparison can actually capture something at the right address.

### 14.7 Verdict

- **Root cause: still UNLOCATED at the live level**, exactly as §12/§13 left it — the static
  mechanism (bad chained-sub-record-count byte, unbounded loop, genuine 0x288-byte local
  stack-buffer overflow) stands unchallenged and is now indirectly reinforced (§14.4's disk-I/O
  absence rules out a competing "real file read failure" explanation). **New this round:** the
  live/canonical address-translation scheme this entire investigation (§10-§13) implicitly relied on
  for describing WHERE this bug lives does not hold for at least this code region — confirmed
  empirically (not just hypothesized) against two independently-derived addresses, one of which was
  this plan's own explicit top-ranked next step.
- **No code fix implemented** — correctly so; there is still no confirmed live address for the bug,
  let alone a confirmed fix location. Forcing a fix now would be inventing one, which the task
  explicitly ruled out.
- **This is a legitimate "UNLOCATED beats invention" outcome**, per the task's own standard — six
  rounds deep (four static, two now live), the mechanism is understood at the byte level, the crash
  is proven reproducible on demand, and a real methodological limitation (live address translation
  for this code region) is now precisely identified rather than silently worked around.

### 14.8 Concrete next steps (ranked)

1. **Test the resident-library hypothesis directly** (§14.5's prediction): breakpoint the RLE
   decompressor at canonical `10d7:0a1c` (live, via this round's calibration formula:
   `(0x10d7 - 0x1d99 + CS_at_calib) & 0xFFFF` = `~18FB:0A1C` using this round's own `CS=0x25BD`)
   using the now-proven `tools/cok-m4-combat-breakpoint-route.ps1 -TargetCanonicalSeg -TargetOffset`
   parameters (added this round for exactly this purpose). If it fires, the addressing scheme is
   fine for genuinely-resident code and the problem is specific to the `2177`/`25a4` region
   (supporting hypothesis (a) in §14.5). If it also never fires, the addressing scheme itself is
   broken more broadly, and a different technique entirely is needed (e.g. a byte-signature memory
   scan for the routine's own known opcode bytes across the live guest's full address space, rather
   than any arithmetic translation).
2. **If (1) confirms a broken translation for this specific region:** investigate whether `DQK.EXE`
   genuinely has multiple, separately-relocated overlay/segment groups (a real Borland
   overlay-manager characteristic per `CLAUDE.md`'s own "self-referential overlay reads" note) rather
   than the single uniform `load_seg` shift the calibration formula (and the Unicorn harness) both
   assume — this would need reading `DQK.EXE`'s own overlay/segment table structure (if any) directly
   from the file, not guessing arithmetically.
3. **Once a live address is confirmed reachable**, re-run the §13.6 item 2 native-DQK comparison
   (§14.6) — now with a real target to diff against.
4. Only after (1)-(3) pin a concrete live root cause, implement the actual content-port fix — do not
   guess ahead of that evidence, consistent with every prior round's own standard.

Harness/tooling changes this round: `tools/cok-m4-combat-breakpoint-route.ps1` (new) — the live
calibration + breakpoint-capture route described above, plus `-TargetCanonicalSeg`/`-TargetOffset`
parameters (added mid-round to retarget from the callee entry to the confirmed call site without a
rewrite) and a `Wait-WhileLoggingHits` helper for the disk-I/O side-finding. No `packages/engine` or
other build-tooling code was touched. All live-run artifacts (screenshots, `report.json`, debugger
console snapshots) are git-ignored under `build/cok-m4-bp-run-cok{2,3,4,5}/` — not committed, per
this repo's existing convention for `*_extracted/`-style local scratch output.

---

## 15. Round 7 — the round-6 addressing puzzle SOLVED: `2177:257C`/`25A4:018A` were never real
DQK.EXE addresses; the TRUE static address is `1F4E:47AC` (file `0x356DC`), confirmed independently
by a unique raw-byte search AND a from-scratch Ghidra headless import + full auto-analysis +
decompile + xref pass; the true (and ONLY) caller is now identified and decompiled; its own caller
is proven to be a genuine indirect/computed call (STATIC ONLY, Ghidra 12.1.2 + `disasm_dqk.py`,
no DOSBox-X, 2026-07-18)

**Task:** use Ghidra's decompiler and cross-reference/call-graph analysis — not another ad hoc
linear-disassembly scan — to resolve what 3 straight rounds (4, 5, 6) of Unicorn-trace-derived
addressing could not: a definitive caller chain into the stack-overflowing per-combatant setup
routine, with addresses precise enough that a future DOSBox-X breakpoint round cannot fail the way
round 6 did. **Result: solved, with an unambiguous, mechanistic root cause for round 6's own
failure — the entire `2177`/`25A4` canonical-address family used throughout §12-§14 for
combat-setup-entry was never DQK.EXE's real address for that routine.**

### 15.1 Ghidra setup used (reused existing infrastructure, no new pipeline built)

This project already has a working, previously-verified static-analysis pipeline for `DQK.EXE`,
independent of `tools/unicorn_dqk_trace.py`, that this round's own assignment brief did not
mention and earlier rounds never used for this bug:

- `tools/export_decompiler_inputs.py` already produces `build/decompiler-inputs/dark-queen-of-krynn/
  manifest.json` — a from-the-file (not from-a-live-trace) address model. It flattens `DQK.EXE`'s
  resident MZ image plus all 13 RTLink FBOV overlay bodies into a **synthetic, non-overlapping
  linear address space** (`"address_model": "synthetic-linear-32"`, one 64 KB-aligned region per
  block: `resident`, `ovr000`..`ovr012`), each block's `runtime_segment` read directly from
  `DQK.EXE`'s own on-disk RTLink overlay descriptor table (file `0x209AF`) — **not** guessed, not
  derived from any live/Unicorn trace.
- `tools/decompiler/ghidra_import.py` (`# @runtime Jython`, already fixed for Ghidra 12.x per
  `CLAUDE.md`) imports that manifest into a real Ghidra program using processor
  `x86:LE:16:Protected Mode` over a 1-byte `bootstrap.bin` placeholder, then populates every block's
  real bytes, all 116 signature seeds, and all 182 pre-resolved resident→overlay dispatch-stub calls
  (177 resolved) as Ghidra memory/functions/references.
- This pipeline already existed for FID-signature generation (`build/ghidra-fid-batch/
  dark-queen-of-krynn/`) but had never been used for a full auto-analysis + decompile + xref pass on
  a specific bug. This round did that for the first time: a fresh project
  (`build/ghidra-cok-m4/`, git-ignored, not committed — large Ghidra `.rep`/`.gpr` project files
  stay local per this doc's own standing convention), two new chained `-postScript`s
  (`tools/decompiler/ghidra_cok_m4_query.py`, `tools/decompiler/ghidra_cok_m4_walkup.py`, both
  additive, no existing script touched), each calling Ghidra's own `analyzeAll(currentProgram)`
  before querying — i.e. **Ghidra's real auto-analyzer** (function-boundary detection, disassembly
  propagation, reference/call-graph construction), not a hand-rolled scan.

### 15.2 The TRUE static address of combat-setup-entry: `1F4E:47AC` (file `0x356DC`) — proven twice, independently

Two independent methods, neither touching the Unicorn harness's own addressing at all, converge on
the exact same byte:

1. **Unique raw-byte search.** The routine's own signature instructions, already precisely
   documented by §12.5's manual decode (`push ds | mov ax,0x5ffd | push ax` — loading the `"moncha1"`
   DS-pointer — immediately followed by `lcall <resource-loader>`, inside a function whose prologue
   is `push bp | mov bp,sp | sub sp,0x288`), are each a **unique 3-4 byte pattern searched across the
   entire 449,664-byte `DQK.EXE`**: `B8 FD 5F` (`mov ax,0x5FFD`) occurs **exactly once**, at file
   `0x35700`; `81 EC 88 02` (`sub sp,0x288`) occurs **exactly once**, at file `0x356DF`, giving entry
   `0x356DC`. Disassembling forward from `0x356DC` (`tools/disasm_dqk.py --disasm 0x356DC`)
   reproduces §12.5's whole decoded routine byte-for-byte, including the exact
   `lcall 0x1fc4,0x130` resource-loader call.
2. **Ghidra, independently.** `0x356DC` maps (via `tools/export_decompiler_inputs.py`'s own
   manifest, which was built from the file, not from any trace) to block `ovr003`, synthetic address
   `0x2347a7`. Importing and running full `analyzeAll()` in Ghidra, then decompiling the function
   Ghidra itself resolves at that address, produces a clean, complete, single function
   (`[0023:47a7, 0023:4ab0]`) whose decompiled C **is the same routine**: `func_0x1fc40130(0x1fc4,
   0x5ffd)` (the moncha1-pointer load), `func_0x00d70a1c` (RLE decompress), the two count-driven
   copy loops writing into a large local buffer at `local_278`, the `+0x28`/`+0x39`/`+0x3b` field
   writes matching `disasm-combat-dqk.md`'s independently-documented monster-record layout. Full
   decompiled listing: `build/ghidra-cok-m4/report.txt` (git-ignored).

File offset `0x356DC` sits inside `DQK.EXE`'s **overlay descriptor index 3** (`tools/disasm_dqk.py`'s
`OVERLAY_DESCS[3] = (3, 0x1F4E, 0x304B, 1622, 5)` — overlay_id 5, file range `0x304B0`-`0x37430`,
**verified, on-disk, RTLink runtime segment `0x1F4E`**). Converting via
`overlay_segment_base_file_offset(3) = 0x30F30` (the same formula `disasm_dqk.py`'s own
`--stubs`/`resolve_ljmp` already use and that this round independently re-derives and matches):
**the routine's true segment:offset is `1F4E:47AC`** — not `2177:257C`.

### 15.3 Root cause of round 6's failure, now mechanistic and precise

**`2177:257C` and `25A4:018A` were never DQK.EXE's real address for combat-setup-entry.** Both
breakpoints failing live in round 6 (§14.3) is now fully explained, not just empirically observed:

- `tools/unicorn_dqk_trace.py`'s FBOV overlay emulation loads each overlay body at a segment its own
  harness *computes* at trace time (a "first free paragraph" allocator, per its own code comment at
  line ~1729) — **not** the fixed, file-verified `runtime_segment` this same overlay's own RTLink
  descriptor entry specifies (`0x1F4E`). For most of this project's earlier, successful trace work
  (§7-§9's journal/dungeon-load route) the harness's computed placement for this exact overlay
  happened to land on `0x1F4E` too — this is why `docs/engine/research/cok-m4-fidelity-plan.md`'s
  own **earlier**, successful sections already used plain `1F4E`-based canonical labels for the same
  overlay (e.g. `DQK_ROUTE_WATCHPOINTS`'s `(0x1F4E, 0x28F8, "qsv-state-reader-entry-file-035a58")`,
  `file 0x035a58` — inside this exact overlay, ~1.3 KB from combat-setup-entry). **By the time the
  trace reaches deep into a scripted combat sequence (rounds 8+), the harness's own internal
  "next free paragraph" bookkeeping has drifted** (after many more overlay swaps than the simpler
  journal/dungeon-load traces performed) and it happened to compute `0x2177` for this same overlay's
  placement in that specific run instead.
- This is a uniquely confusing failure mode because **`0x2177` is also a real, valid, verified
  sub-segment identifier used elsewhere within the very same overlay body** (Borland/RTLink overlay
  modules routinely define several logical code segments per overlay — this one alone uses at least
  `1F4E`, `1FC4`, `1FE9`, `24DA`, `251A`, `255D`, **and `2177`**, all confirmed real via direct
  disassembly this round, e.g. `2177:3491`, live at file `0x36651`, is a genuine, coherently-aligned
  routine calling the same shared `memset` at `00D7:27A6`). This is why §12.2's and §12.3's own
  "forward-alignment" self-consistency checks kept passing: the bytes really were valid, real,
  in-context DQK.EXE instructions — just not at the offset (`257C`) or, in round 6's live-fire sense,
  the address family those rounds attributed to combat-setup-entry's own entry point. Translating
  round 4's claimed entry `2177:257C` via the SAME overlay-idx3 sub-segment arithmetic
  (`file = 0x30F30 + (0x2177-0x1F4E)*16 + 0x257C = 0x3573C`) lands **inside combat-setup-entry's own
  real body** (entry `0x356DC`, end `0x359E5`) — round 4-6 were consistently looking at real bytes
  belonging to the right function, under a wrong belief about which absolute address they lived at.
- **Resident-code addresses in this same project's tracing did NOT have this problem.** Segment
  `0x00D7` (the shared RLE-decompressor/memcpy library the routine itself calls) resolves via a
  simple, already-independently-verified formula for the *resident* MZ image
  (`file = 0x2400 (header) + seg*16 + off` — cross-checked this round against the pre-existing,
  previously-used label `(0x00D7, 0x006E) → file 0x0031DE` in `unicorn_dqk_trace.py`'s own
  `DQK_ROUTE_WATCHPOINTS`, which the formula reproduces exactly). The harness's `canonical = live -
  load_seg` convention is sound for the resident image; it is specifically FBOV **overlay** code
  where the harness's own dynamic placement heuristic can silently diverge from DQK.EXE's real, fixed
  descriptor-table segment — and did, for this one routine, on this one route.

### 15.4 The TRUE (and, per exhaustive static search, ONLY) caller — found via Ghidra's own reference manager, decompiled cleanly

`tools/decompiler/ghidra_cok_m4_walkup.py` queries `ReferenceManager.getReferencesTo()` on
combat-setup-entry's Ghidra-resolved entry (post `analyzeAll()`) and finds **exactly one call site**,
`from 0x0023:4ae5 in-function=FUN_0023_4ab1` — i.e. combat-setup-entry is called from exactly one
place in the whole analyzed binary. Decompiling that caller (file `0x359E6`, true `1F4E:4AB6`, right
after combat-setup-entry's own body ends at file `0x359E5` — contiguous, same overlay, same segment)
gives a short, clean, fully self-consistent routine (raw disasm cross-checked byte-for-byte against
the Ghidra decompile):

```c
void __cdecl16far FUN_0023_4ab1(undefined2 param_1)  // param_1 = the id argument
{
  if (*(byte *)((int)*(undefined4 *)0xb20f + 0x20) < 8) {   // *DS:0xB20F (far ptr) -> +0x20 "count" < 8
    <alloc 0x19E(414)-byte record from DS:0xB2A4, cap 8>    // lcall 0xdf9,0x2fc — the SAME allocator
                                                             //   this whole investigation (§10-§12)
                                                             //   already instrumented; DS:0xB2A4/cap-8
                                                             //   is the SAME table §11.2 already found
                                                             //   ("plateaus, does not fail") — its
                                                             //   OWNER routine is now known.
    call 0x356dc(param_1, /*flag byte*/ 1, <the new record>);  // NEAR call (same segment, no ABI
                                                                //   mismatch at all) into combat-
                                                                //   setup-entry — settles §12.3's
                                                                //   whole near/far question as moot:
                                                                //   it was never a real question for
                                                                //   the true call site.
    lcall 0x2177,0x3491;         // finalize/link the new record (memset + far-pointer chain walk;
                                  //   this is the SAME "2177" segment §15.3 explains — real code,
                                  //   just a sibling routine, not combat-setup-entry itself)
    *(byte*)(record+0x9b) |= 0x80;
    *(byte*)(record+0xbd) = (byte)param_1;
    func_0x104c00df(0x2177,0x6005);
  }
}
```

This is, in effect, `AddCombatantToActiveRoster(id)`, gated on a **hard cap of 8 active slots**
(`DS:0xB2A4`, capacity 8, record size 0x19E). Two concrete, load-bearing corrections to round-5/6's
own record fall out directly from this clean decompile:

- **The `param_2`/`[bp+8]` "flag byte" is not ambiguous or unwritten** — round 4/6's disassembly
  (examining the *wrong* address, per §15.3) found it read but never written and treated that as
  suspicious. At the TRUE, single, real call site it is a **hardcoded literal `1`** (`mov al,1` at
  file `0x35a13`, immediately before the call at `0x35a1a`) — meaning combat-setup-entry's own
  `if (param_2 == '\0')` branch (§12.8's decode) **always** takes the `func_0x10930162`/`0x1093:0162`
  path for its second loop, for every real invocation. This is now a settled fact, not an inferred
  "probably a mode flag."
- **Round 5's `0x81DE` finding (§13.4 — "the id resolves to a stray shop-dialogue string pointer")
  was derived from live/Unicorn analysis anchored to the wrong address family (§15.3) and should be
  treated as unreliable, not built upon further.** It may have been reading genuinely unrelated stack
  content from a different code path entirely. The STRUCTURAL finding it was based on (a
  stack-buffer overflow driven by a bad chained-sub-record-count byte) is untouched and independently
  reconfirmed by this round's clean Ghidra decompile of the real function — only the *specific id
  value* claim from round 5 is now unsupported.

### 15.5 One hop further: `param_1`'s own origin is a genuine indirect/computed call — an honest, evidence-backed stopping point

Per task item 2/3, the next question is where `FUN_0023_4ab1`'s own `param_1` (the id ultimately fed
into combat-setup-entry) comes from. This round searched exhaustively, by three independent static
methods, for ANY caller of `FUN_0023_4ab1` (true address `1F4E:4AB6`, file `0x359E6`):

1. **Ghidra's own `ReferenceManager`, post `analyzeAll()`:** zero references found to this function's
   entry anywhere in the imported program.
2. **The manifest's own pre-resolved resident→overlay dispatch-stub call list** (182 calls, 177
   resolved, built directly from `DQK.EXE`'s FBOV stub table): no entry targets this address.
   `tools/disasm_dqk.py --stubs 3` (all 15 resident-stub dispatch targets for this overlay) also does
   not list it — this function is not reached via the resident FBOV dispatch mechanism at all.
3. **Exhaustive raw-byte scans of the entire 449,664-byte file:** zero hits for a hardcoded far call
   (`9A B6 4A 4E 1F`), zero for the same bytes as raw pointer data (a literal dispatch-table entry),
   zero for the bare offset word (`B6 4A`) anywhere, and a full linear scan of every `E8` (near-call)
   opcode within the entire overlay body (`0x304B0`-`0x37430`) for one whose relative target resolves
   to `0x359E6` — also zero.

**This function's caller is not a statically-encoded direct or literal-data-indirect call anywhere in
`DQK.EXE`.** The most consistent explanation, given the `DS:0xB20F`/`DS:0xB2A4` "roster of 8" gate
this function itself implements, is a genuinely **computed/register-indirect far call** — e.g. an
address assembled at runtime from a per-monster-type dispatch mechanism, or a value copied into a
runtime table during combat/encounter initialization rather than present as a compile-time constant
anywhere in the file. This matches (and sharpens, rather than contradicts) round 5's own reframing
toward "the wandering-encounter dispatch path," and `combat-system-source-recovery-goal.md`'s
pre-existing open item on `WILDCOM`/`RANDCOM` selection. **Per the task's own "UNLOCATED beats
invention" standard, this is reported as a genuine, well-searched static limit, not forced past with
a guess.** Resolving it requires either a live DOSBox-X trace (now, for the first time, with a
byte-verified correct target address — see §15.6) or deeper Ghidra data-flow analysis (e.g. locating
whatever runtime table gets *written* with this address during initialization, which needs
value-tracking across `analyzeAll()`'s function boundaries that this round's simple xref query does
not attempt).

### 15.6 Precise, Ghidra-verified addresses for the next DOSBox-X round

| Symbol | File offset (verified 2 ways) | True static seg:off (`1F4E`-based, per `disasm_dqk.py`'s own formula) | Predicted live DOSBox-X address (round 6's own calibration: `CS_at_ah42_stop=0x25BD`, `e_cs=0x1D99`, `load_seg=0x0824`, applied to the overlay segment) |
|---|---|---|---|
| combat-setup-entry (the stack-overflowing routine) | `0x356DC` | `1F4E:47AC` | **`2772:47AC`** (primary candidate — assumes the overlay area shifts by `load_seg` the same way the resident image does, which is how DOS `INT21 AH=48h`-allocated overlay areas normally behave); fallback candidate `1F4E:47AC` unshifted, in case this overlay area happens to be allocated at a fixed, load-independent segment in this specific DOSBox-X/DQK.EXE combination |
| `AddCombatantToActiveRoster` (its one and only caller) | `0x359E6` | `1F4E:4AB6` | **`2772:4AB6`** primary; `1F4E:4AB6` fallback |

**Both candidates are new** relative to every prior round (`2177:257C`, `25A4:018A` are now known-wrong
for this purpose and should not be retried). The one remaining unverified assumption is explicitly
flagged in the table (shifted vs. unshifted) — round 6 already proved the resident image needs the
`load_seg` shift; whether the FBOV overlay area shifts identically is the one thing this static-only
round could not settle (needs a live `BP`/read at either candidate). A future live round should try
the shifted candidate first (breakpoint `2772:47AC` for the routine, or `2772:4AB6` for its caller,
which is very likely to fire *more* often since it's the outer, unconditionally-reached-per-combatant
gate) and fall back to the unshifted candidate if neither fires.

### 15.7 What was NOT done this round, and why

- **No code fix implemented.** Per the task's own explicit standard and this doc's long-standing
  practice: §15.5 shows the true upstream caller/field is still genuinely unlocated by static means,
  and patching either the content port or engine dispatch without knowing which owns the bug (or even
  having a confirmed live reproduction at the CORRECT address) would be inventing a fix ahead of the
  evidence.
- **The native-DQK comparison run** (repeatedly ranked as a top next step since §11.5) was not
  attempted — it is far more valuable once a live breakpoint at the now-corrected address actually
  fires and there is a real capture to diff against.
- **`DQK.EXE` itself is not a patch target.** As every prior round has already concluded, the missing
  bounds check in combat-setup-entry is a pre-existing retail engine characteristic; if a fix is ever
  warranted here it belongs in the CoK→DQK content-port pipeline or (per `ROADMAP.md`'s own
  already-flagged fallback) a targeted `DQK.EXE` patch decision — not attempted or newly recommended
  this round.

### 15.8 Artifacts

- `build/ghidra-cok-m4/` (git-ignored) — Ghidra project (`project/cok_m4_dqk*.gpr` +
  `.rep`), `targets.json`, `report.txt` (target-function decompiles + xrefs), `walkup_report.txt`
  (caller-chain walk), `run.bat`/`run_walkup.bat` (reproducible headless invocations), logs.
- New, additive scripts (both `# @runtime Jython`, following `ghidra_import.py`'s existing
  convention): `tools/decompiler/ghidra_cok_m4_query.py` (decompile + xref-dump for a list of target
  synthetic addresses, always running `analyzeAll()` first), `tools/decompiler/ghidra_cok_m4_walkup.py`
  (walks the caller chain upward one resolved-call hop at a time, decompiling each, stopping at a
  branch point or a zero-callers root). Both reusable for any future Ghidra pass on `DQK.EXE` or any
  other title with an existing `build/decompiler-inputs/<profile>/manifest.json`.
- No `packages/engine/**` or game-data files were modified this round.

---

## 16. Round 8 — round 7's Ghidra-verified live candidates (both shift hypotheses) STILL never fire;
crash reproduces 3/3 more times; a NEW zero-translation sanity check proves the `BP` execution-
breakpoint mechanism itself works, isolating the fault to the cross-segment address-translation
formula rather than the tooling (DOSBox-X ×6 boots, 2026-07-18)

**Task:** reuse `tools/cok-m4-combat-breakpoint-route.ps1` to reproduce the crash, arm breakpoints at
round 7's PRIMARY (`2772:47AC`/`2772:4AB6`) and FALLBACK (`1F4E:47AC`/`1F4E:4AB6`) candidates, and if
a hit lands, capture live state and trace the still-unresolved indirect caller (§15.5); attempt a
native-DQK differential comparison if feasible; implement a fix only if the evidence supports one.
**Result: neither candidate fires, at either shift hypothesis — a genuine, load-bearing negative
result on this doc's own highest-confidence addresses to date. A new diagnostic technique (a
zero-translation sanity check) proves the breakpoint mechanism itself is sound, which meaningfully
changes the shape of the remaining mystery: it is not "the tool doesn't work," it is "the uniform
load-segment-shift model this whole investigation chain has relied on since round 6 does not
generalize past the one segment it was calibrated against."**

### 16.1 Tooling changes (additive, `tools/cok-m4-combat-breakpoint-route.ps1`)

- `-TargetOffset2` — arms a second offset in the **same** computed `bp_seg`, so a single boot can
  catch either combat-setup-entry's own confirmed entry (`47AC`) or its one true caller
  `AddCombatantToActiveRoster` (`4AB6`) — both live in the same overlay segment per §15.2/§15.4, so
  no second calibration pass is needed.
- `-NoLoadSegShift` — skips round 6's `bp_seg = CS_at_calib + (targetSeg - e_cs)` calibration
  arithmetic entirely and arms the breakpoint at `$TargetCanonicalSeg` literally, testing §15.6's
  FALLBACK "the FBOV overlay area might not relocate the same way the resident image does" hypothesis.
- `Get-DetailedCapture` rewritten to be generic and self-validating: dumps the raw top-of-stack bytes
  and interprets them under both a far-call-entry hypothesis (`[sp+0]`/`[sp+2]` = return ip/cs,
  `[sp+4..]` = first parameter word(s)) and a near-call-entry hypothesis (`[sp+0]` = return ip only,
  `[sp+2..]` = first parameter word(s)), each cross-checked against LIVE memory via a new
  `Test-CallEndsAt` helper that reads the 5 bytes ending at the candidate return address and checks
  for a real `0x9A` (far call) or `0xE8` (near call) opcode ending exactly there — porting the same
  self-validating technique `tools/unicorn_dqk_trace.py`'s `_dqk_combat_setup_entry_text` already
  proved out statically (§12.3/§13.2) to the live DOSBox-X debugger. Also added: a live read of
  `DS:0xB20F` → `+0x20` (the 8-slot roster-cap-gate byte Ghidra's round-7 decompile of
  `AddCombatantToActiveRoster` showed, §15.4), as an independent cross-check that any future hit at
  `4AB6` really is that routine. None of this fired this round (no breakpoint hit), but it is proven
  syntactically correct (`ParseFile` clean) and ready for the next round that gets a hit.

### 16.2 The crash reproduces 3/3 more times; zero disk I/O reconfirmed

All 3 boots that ran the full route (`build/cok-m4-bp-run-round8a`, `-round8b`, `-round8c`; a 4th
attempt on `-round8c` hit an unrelated vision-OCR misread on the journal-confirm screen — a known,
pre-existing flakiness this script's own comments already document — and was simply retried, not a
route failure) show the byte-identical outcome every prior round has found: `right` then `up` takes
the party `14,10`→`15,10` facing E, and the very next frame shows `MONSTERS ATTACK!` / `DISK READ
ERROR`, frozen. `report.json`'s `distinct_cs_segments_seen` is `[]` and `lseek_and_bp_hit_log` is
empty in all 3 runs — zero `INT 21 AH=0x42`/`0x3F` calls occur anywhere from the party menu through
the crash, reconfirming round 6's §14.4 finding (this is pure in-memory corruption, not a real DOS
disk-read failure) with 3 more independent samples.

### 16.3 PRIMARY candidate (`2772:4AB6`/`2772:47AC`, load-segment-shifted): zero hits

`build/cok-m4-bp-run-round8a`: `-TargetCanonicalSeg 0x1F4E -TargetOffset 0x4AB6 -TargetOffset2
0x47AC` (default shifted mode). Calibration: `CS=25BD` at the first `AH=42` stop (byte-identical to
every prior round) → `bp_seg=2772`. Both offsets armed simultaneously (`BP 2772:4AB6` and `BP
2772:47AC`, both echoed accepted by the debugger). `report.json`: `breakpoint_hit: false`,
`breakpoint_hit_early: false`, `breakpoint_captures: []`. Neither address — the routine's own entry
nor its one true (Ghidra-proven, dual-method-verified) caller — is ever reached live.

### 16.4 FALLBACK candidate (`1F4E:4AB6`/`1F4E:47AC`, unshifted): zero hits

`build/cok-m4-bp-run-round8b`: identical target offsets, `-NoLoadSegShift`. Calibration still runs
(logged for reference: `CS=25BD`) but `bp_seg` is set to the literal canonical segment `1F4E`
instead. Same result: `breakpoint_hit: false`, `breakpoint_captures: []`. §15.6's own explicitly
flagged "one remaining unverified assumption" (shifted vs. unshifted) is now resolved in the negative
for **both** options — this is a stronger result than either individual miss, because it rules out
the single most obvious remaining hypothesis (the overlay area either follows the resident-image
shift or doesn't; it turns out to do neither, at least not in the simple way either option predicts).

### 16.5 New diagnostic: the previously-"proven fine" resident-code cross-check ALSO never fires

§14.8's own top-ranked next step (never executed live before this round) was to breakpoint the
*resident*-image RLE decompressor at canonical `10D7:0A1C` (predicted live, via the same shifted
calibration, `18FB:0A1C`) as a control: if it fires, resident-code addressing is fine and the problem
is specific to the `1F4E`/overlay-3 region; if it also never fires, the addressing scheme itself is
broken more broadly. `build/cok-m4-bp-run-round8c`: `-TargetCanonicalSeg 0x10D7 -TargetOffset 0x0A1C`
(shifted, single target). Crash reproduced identically; `breakpoint_hit: false`.

**This does not, by itself, cleanly discriminate the two hypotheses §14.8 posed.** Per §12.5's own
decode, this exact decompressor call is reached *from inside* combat-setup-entry's own body, as part
of its `moncha1`-id-keyed resource load — there is no independent evidence in this project that the
same canonical `10D7:0A1C` is reached from anywhere else along this specific boot→dungeon→combat
route (title-screen and dungeon-wall rendering may well use a different decompression call site for
their own resources). So a clean, parsimonious reading is: if combat-setup-entry itself is never
reached (consistent with §16.3/§16.4), then nothing *it* calls would be reached either, and this
result is not new information about resident-code addressing in general — merely a corollary of the
main finding. **What it does responsibly retire is this doc's own prior informal reliance on
`10D7:0A1C` as a "known-good" reference point** (§15.3's claim that "resident-code addresses...did
NOT have this problem" was itself only ever cross-checked against the Unicorn tracer's own internal
file-offset convention, never against a real DOSBox-X boot, until this round — and when finally
tested live, it did not confirm).

### 16.6 A new, decisive technique: the zero-translation sanity check

Given three independent translated addresses (two shift hypotheses across two functions, plus the
resident-code control) all failed to fire, the natural next question is whether the `BP seg:off`
mechanism works AT ALL for code reached after the initial boot moment — a possibility none of rounds
6-7 had directly tested (round 6 only confirmed the debugger *echoed* the `BP` command as accepted,
not that it would actually stop there). This round built and ran a small, throwaway diagnostic
(`build/cok-m4-bp-sanity/sanity-check.ps1`, not a repo tool — lives under the git-ignored `build/`
tree, kept only as a local artifact) that:

1. Arms `BPINT 21 42` and captures 6 successive stops with **zero arithmetic** — just reading `CS:IP`
   directly off each live stop and resuming. Result: a clean, perfectly repeating pattern —
   `25BD:0332` and `25BD:03FE` alternating, 3 hits each (DQK.EXE's own FBOV overlay-loader call site,
   invoked once per overlay swap during boot).
2. Deletes the interrupt breakpoint and arms a plain execution breakpoint, `BP 25BD:0332`, at that
   **exact, live-observed, zero-translation address** (no canonical-address formula, no shift, no
   file-offset arithmetic — literally the bytes already seen executing), then resumes.
3. **Result: it fires immediately, at exactly `25BD:0332` as expected** (`MATCH=True`).

(One real bug was hit and fixed while building this: the first attempt's `Group-Object` key
interpolated the `[Convert]::ToUInt32(...,16)` register values as **decimal** digit strings — e.g.
`0x25BD` printed as `9661` — which the DOSBox-X debugger's own `BP` command then re-parsed as hex,
producing a wildly wrong address and a false "mechanism doesn't work" result on the first pass. Fixed
by explicit `{0:X4}` formatting before both the grouping key and the `BP` command string. Recorded
here as a real, self-corrected mistake, not smoothed over — and a concrete reminder for future rounds
using this same technique: PowerShell's implicit decimal-to-string conversion is a live hazard
whenever a register value crosses back into a hex-expecting debugger command.)

**This is a materially useful, positive, reusable result:** the `BP` execution-breakpoint mechanism
itself is proven fully functional in this exact DOSBox-X build/config, for at least one class of live
address. This decisively retires "the tool is broken" as an explanation for 7 total non-firing
attempts across rounds 6 and 8 (`2177:257C`, `25A4:018A`, `2772:47AC`, `2772:4AB6`, `1F4E:47AC`,
`1F4E:4AB6`, `18FB:0A1C`).

**Honest caveat, not glossed over:** this test validates the mechanism only at a **live-observed**
address in the **same** segment (`25BD`) already directly confirmed by the calibration stop itself —
it does **not** exercise any cross-segment translation (there was no canonical→live formula involved
at all, since the address was read directly off a live stop, not computed). It therefore proves the
`BP` command syntax and DOSBox-X's breakpoint machinery work correctly, but it does **not** by itself
prove or disprove the uniform-shift formula for any *other* segment — that remains exactly as
unresolved as §16.3-16.5 leave it. The two findings are complementary, not redundant: one rules out a
whole class of "the harness is fake" explanation, the other narrows what's left to a translation-
formula question specifically.

### 16.7 Verdict

- **Root cause: still UNLOCATED at the live-address level** — the static mechanism (bad
  chained-sub-record-count byte at resource offset `0x19F`, unbounded loop, genuine `0x288`-byte local
  stack-buffer overflow, Ghidra-verified caller chain) stands completely unchallenged; only the
  question of *where this code actually executes in a live DOSBox-X session* remains open.
- **New and solid this round:** two more of this doc's highest-confidence addresses to date — Ghidra
  dual-verified, not a single-method guess — fail to fire live, at both the shifted and unshifted
  interpretation. Combined with round 6's two earlier misses, that is **six** independently-derived
  live addresses in the `1F4E`/`2177`/`25A4`/`18FB` code-region family that have now been tried and
  never fired.
- **New and solid this round:** the `BP` execution-breakpoint mechanism itself is proven functional
  via a zero-translation, live-observed control address — a genuinely new, reusable technique for any
  future round that needs to distinguish "wrong address" from "broken tooling" before spending a live
  slot on a guess.
- **Reframed, not resolved:** the leading working hypothesis moving forward is no longer narrowly
  "the FBOV overlay placement heuristic drifts for this one overlay" (§15.3's framing) — it is now
  "the uniform `load_seg` shift computed from the resident entry-segment calibration has only ever
  been validated at the trivial identity case (the calibration segment itself); every attempt to
  apply it to a *different* canonical segment, resident or overlay, shifted or unshifted, has failed."
  This is a real, load-bearing generalization of the problem's scope, not a repeat of round 6/7's
  framing.
- **No code fix implemented** — correctly so, per this doc's standing "UNLOCATED beats invention"
  practice: there is still no confirmed live address for the bug, and inventing a content-port fix
  without one would be guessing. `DQK.EXE` remains not a patch target (unchanged reasoning from every
  prior round).
- **Native-DQK comparison (task item 3):** not attempted this round. Per round 6's own §14.6
  reasoning, still valid: building a working native-DQK route to a genuine wandering encounter is real
  reconnaissance work in its own right, and comparing it against a breakpoint that isn't confirmed to
  fire at all would not, by itself, produce a meaningful diff. This remains ranked as valuable but
  lower priority than resolving the addressing puzzle first.

### 16.8 Concrete next steps for round 9 (not this round's call to make)

1. **Abandon the uniform-shift arithmetic model and do a live memory signature search instead.**
   Ghidra's round-7 static proof used a whole-file raw-byte search for unique instruction sequences
   (`B8 FD 5F` = `mov ax,0x5FFD`; `81 EC 88 02` = `sub sp,0x288`) that each occur exactly once in
   `DQK.EXE`. The same technique, applied to the **live guest's actual memory** instead of the static
   file (via DOSBox-X's debugger `S`/search command, if supported — needs checking against the
   DOSBox-X 2026.07.02 debugger command reference), would locate the routine's true live address with
   zero arithmetic and zero shift-hypothesis guessing, sidestepping this entire class of problem.
2. **If no live memory-search command is available:** single-instruction trace-stepping (`T`/`P` if
   supported) forward from a confirmed-reachable point — e.g. the party-menu redraw, or immediately
   after the `up` keypress that triggers the encounter — through to the crash, logging `CS:IP` at
   every step. Slower and more tedious than a targeted breakpoint, but directly observes the real live
   execution path with no translation involved at all, and would settle the addressing question
   permanently for this bug (and likely reveal reusable facts about how DQK.EXE's overlay manager
   actually places code at runtime, of value well beyond this one bug).
3. **Once a live address is confirmed reachable:** re-run the still-pending native-DQK comparison
   (§13.6 item 2 / §14.6 / this round's §16.7) with a real target to diff against.
4. Only after (1)-(3) pin a concrete live root cause, implement the actual content-port fix — do not
   guess ahead of that evidence, consistent with every prior round's own standard.

### 16.9 Artifacts

- `tools/cok-m4-combat-breakpoint-route.ps1` — additive changes described in §16.1 (`-TargetOffset2`,
  `-NoLoadSegShift`, rewritten `Get-DetailedCapture`, `Test-CallEndsAt`, `Get-Word16`). No existing
  parameter, default behavior, or prior successful code path changed; `Parser.ParseFile` confirms the
  script still parses cleanly.
- `build/cok-m4-bp-sanity/sanity-check.ps1` (git-ignored, throwaway, not a repo tool) — the
  zero-translation sanity-check diagnostic described in §16.6.
- Live-run artifacts (screenshots, `report.json`, debugger console snapshots), all git-ignored, not
  committed: `build/cok-m4-bp-run-round8a/`, `build/cok-m4-bp-run-round8b/`, `build/cok-m4-bp-run-round8c/`,
  `build/cok-m4-bp-sanity/`.
- No `packages/engine/**` or game-data files were modified this round.

---

## 17. Round 9 — the live memory-signature search (§16.8 item 1) is BUILT and PROVEN end-to-end;
one of two targets gets a confirmed live address; the actual "MONSTERS ATTACK!"/"DISK READ ERROR"
crash is captured live on-screen for the first time via this route; three real, load-bearing
DOSBox-X/PowerShell automation bugs found and fixed along the way (DOSBox-X ×5 boots that reached
report.json, several more aborted mid-route, 2026-07-18)

**Task:** execute §16.8's own top-ranked next step — abandon the load-segment-shift arithmetic model
(seven straight non-firing live addresses across rounds 6 and 8) and instead dump the running guest's
real conventional memory and search it for the exact machine-code bytes Ghidra already proved unique
in the static file, at combat-setup-entry's own entry (file `0x356DC`) and its one true caller
`AddCombatantToActiveRoster` (file `0x359E6`).

### 17.1 Technique

New script `tools/cok-m4-memory-signature-route.ps1`. Core idea, unchanged from §16.8's proposal and
now proven correct: DOSBox-X's `MEMDUMPBIN <seg>:<off> <len>` debugger command writes the guest's raw
memory to a host file; a small Python helper (`tools/*_search_signatures.py`, written by the
PowerShell script itself) then does a byte-for-byte scan of that dump for each signature's unique
prefix, and any hit's **linear offset directly IS the live physical address** — no seg:off arithmetic,
no shift hypothesis, no calibration formula. Signatures reused byte-identical from round 7's Ghidra
proof: `combat_setup_entry` = `558BEC81EC8802B032509A8800C41F59` (file `0x356DC`),
`add_combatant_to_active_roster` = `558BEC83EC04C41E0FB226807F200777` (file `0x359E6`). Once a hit is
found, the script arms a real `BP` at the derived seg:off and continues driving the boot route,
watching for that breakpoint to fire.

### 17.2 The hard part: making the dump-and-search actually reachable at a meaningful point in the
boot route (five real bugs, each found and fixed with evidence, not glossed over)

Getting from "the technique is sound" to "it actually runs" took repeated live rounds inside this one
task, each hitting a genuine, previously-undocumented obstacle:

1. **Debugger commands are silently no-ops while the guest is running.** `MEMDUMPBIN`, `BPINT`, and
   plain `BP` are only actually processed while the guest is genuinely halted in DOSBox-X's own
   `DEBUG_Loop` — issuing any of them against an already-`RUN`-ning guest produces no error and no
   effect. This corrects an implicit assumption rounds 6-8 never had to confront (their `BPINT` arms
   were always issued pre-boot, before the first `RUN`).
2. **DQK.EXE's general idle/input-wait primitive is `INT 16h`, spun in a tight loop**, essentially any
   time the game is waiting on the player (confirmed live at the loading-screen keyboard-idle-poll and
   again at the main-menu/dungeon idle-poll, both stable addresses in segment `08FB`). This is a new,
   general architectural fact about the engine, not specific to combat, and it makes naive
   "arm-and-wait" breakpoint strategies stall badly (each debugger round-trip costs real wall-clock
   time, and a breakpoint that fires inside a tight poll loop can stall progress by an order of
   magnitude). The working fix, arrived at over several failed sub-attempts: leave the noisy
   `BPINT 21 42` calibration breakpoint armed only long enough to synchronize on the PLAY click, delete
   it immediately after, and only THEN arm `BPINT 16 0` (the `AH=00`-filtered, blocking-read-only
   form) — deferred until the first natural post-click stop, so it's never live during the
   timing-critical mouse-click sequence itself (a halted guest silently drops queued input, a
   previously-documented project gotcha that bit this route too before the fix).
3. **`MEMDUMPBIN`'s size argument silently parses as zero when given a `0x`-prefixed hex literal.**
   Root-caused by reading `debug.cpp`'s `GetHexValue` directly (not guessed): its tokenizer accepts
   `isalpha`/`isdigit`/`_` characters into a token (so the `x` in `0xA0000` stays part of the token),
   but separately requires **every** character in that token to satisfy `isxdigit` before treating it
   as a hex literal — `x` fails that test, permanently latching `hexnumber = false`, so the whole token
   falls through to `return 0`. `SaveMemoryBin`'s write loop then runs zero iterations, yet still
   unconditionally prints `"DEBUG: Memory dump binary success."` (the message is not gated on `num`),
   so this failure mode produces a plausible-looking, genuinely 0-byte `MEMDUMP.BIN` with **no error
   anywhere** — 100% reproducible across every try, not a transient/timing issue as first suspected.
   Fix: pass the size as bare hex digits (`A0000`, no `0x` prefix) — this debugger's hex fields are
   implicitly hex, a leading `0x` is never valid syntax for them.
4. **`[math]::Floor` returns a `System.Double`; PowerShell's `{0:X4}` (hex) format specifier throws
   `"Format specifier was invalid"` against a double**, only integer types support it. The
   linear-offset → seg:off conversion used `[math]::Floor($x / 16)` / `$x % 16`, which threw the
   instant a live signature match was found and the script tried to log/arm it — a real crash on what
   should have been the successful path. Fixed with integer bit-shift ops (`-shr 4` / `-band 0xF`)
   instead.
5. **A PowerShell implicit-output-leak silently corrupted a boolean control variable across the ENTIRE
   rest of the route, with no exception anywhere to chase.** `Invoke-MemDumpAndSignatureSearch` called
   `& python $searchPy ...` **unsuppressed** — any stdout the Python script printed became part of that
   PowerShell function's own implicit return value (a function returns every unsuppressed pipeline
   output, not just its `return` statement's value). That function is itself called as a bare statement
   (no `| Out-Null`) inside `Wait-WhileLoggingHits`, so the leaked lines got silently concatenated onto
   ITS `return $false` too — turning `$earlyHit = Wait-WhileLoggingHits ...` into a multi-element ARRAY
   (leaked strings plus `$false`) instead of a clean boolean. A non-empty array is **truthy** in
   PowerShell regardless of its last element's value, so every downstream `-not $earlyHit` phase guard
   (Load Saved Game → journal-word protection → party menu → dungeon movement) silently short-circuited
   from that point on — the route would jump straight from the first genuine debugger stop to writing
   `report.json`, with nothing in between and no error to notice. Found by exact-timestamp file
   forensics (every artifact file's write time, sorted, to spot the multi-second gap with zero files
   written in it) since there was nothing else to go on. Fixed by suppressing the Python call's output
   at its source and, defensively, at both of `Invoke-MemDumpAndSignatureSearch`'s own call sites, so
   the same class of bug can't silently recur if a future edit adds another unsuppressed command inside
   that function.

Two more minor issues were found and fixed in the same round: the journal-word on-screen-echo
confirmation check was a false-negative trap (vision-OCR often doesn't catch the typed characters'
echo before the screenshot, even though `Enter` submits the answer unconditionally right after) —
softened from a hard `throw` to a non-fatal warning; and a self-inflicted launch-invocation bug (an
outer `Start-Process -ArgumentList` call passing `-MovementKeys right,up` as one comma-joined token
instead of two array elements, twice, in two different ways) was resolved by simply relying on the
script's own already-correct default (`@('right','up')`) rather than fighting `-File`-style
positional-array binding from the command line.

### 17.3 Result: the technique works, end-to-end, for the first time this investigation chain

The final run (`build/cok-m4-memsig-run1`, git-ignored) completed the full route cleanly:
title screen → boot main menu → Load Saved Game → `T`/`A`/slot-A → journal-word protection (solved
live, from the decoded journal text) → party menu (`SIR DRYDEN` et al., matching every prior round's
roster) → dungeon exploration screen (`AREA CAST VIEW ENCAMP SEARCH LOOK INV`, position `14,10`) →
`right` (turn) → `up` (move to `15,10`) → **the exact same crash every round since §9 has
reported, this time captured live on-screen by this route for the first time**:
`09-walk-02-up.-view.png` shows the party roster panel, `MONSTERS ATTACK!`, and `DISK READ ERROR`
stacked exactly as described in every prior round's text-only observations. `report.json`:
`reached_boot_menu: true`, `solved_protection: true`, `disk_read_error: false` (the flag tracks a
different, unrelated failure text and did not fire — the crash text itself is only visible in the
screenshot/vision-OCR `timeline`, not yet wired into that specific boolean; noted for round 10, not a
contradiction).

**Signature search (640 KiB conventional-memory dump, taken at the first genuine stop after pressing
`L` for Load Saved Game):**

| signature | file offset | live matches | live address |
|---|---|---|---|
| `combat_setup_entry` | `0x356DC` | **0** | — not resident in memory at this point |
| `add_combatant_to_active_roster` | `0x359E6` | **1** | `2C23:0006` (linear `0x2C236`) |

`add_combatant_to_active_roster` is **confirmed live and resident** during ordinary save-game loading
— consistent with it being a general roster-population utility exercised whenever the party list is
(re)built, not a combat-only routine. `combat_setup_entry` is confirmed **absent** from memory at this
same point, consistent with DQK's overlay manager loading it on demand only once actual combat begins,
not as part of the base resident image or the save-load path.

A real `BP 2C23:0006` was armed at the confirmed address and stayed armed through the rest of the
route (journal, party menu, dungeon walk, the `right`/`up` moves, and the crash itself). **It never
fired.** This is a genuine negative result, not a tooling failure (the same `Get-Stopped`/`BP`
machinery reliably caught DQK's own `INT 16h` idle-poll dozens of times over the same run) — whatever
code path leads to `MONSTERS ATTACK!`/`DISK READ ERROR` for this encounter does not pass back through
`AddCombatantToActiveRoster`'s own load-time-resident copy at `2C23:0006` specifically. Given this
whole investigation chain's established finding that DQK's FBOV overlay manager places overlay code at
addresses that can and do change between different points in execution (rounds 6-8's whole
load-segment-shift saga), the most likely explanation is that this specific overlay segment gets
swapped out and reloaded — quite possibly at a *different* live address — somewhere between Load Saved
Game and the actual combat trigger, rather than the routine going genuinely unreached. This was not
tested this round (the dump-and-search only ran once, at Load Saved Game time, guarded by an
idempotence flag) and is the single most concrete next step for round 10 (§17.4).

### 17.4 Verdict and next steps

- **§16.8 item 1 is DONE: the live memory-signature-search technique is built, debugged, and proven to
  work end-to-end**, fully retiring the load-segment-shift arithmetic model this doc relied on through
  rounds 6-8 for future rounds that need a live address — no calibration formula, no shift hypothesis,
  just a raw byte search against the guest's real memory.
- **One of two targets got a confirmed live address** (`add_combatant_to_active_roster` @ `2C23:0006`,
  during Load Saved Game) for the first time in this entire investigation chain across 9 rounds.
  `combat_setup_entry` was confirmed NOT resident at that same point — a genuine, useful negative
  result about the engine's overlay-loading behavior, not a failure of the search.
- **Root cause of the "MONSTERS ATTACK!"/"DISK READ ERROR" crash: still UNLOCATED at the byte/field
  level** — the armed breakpoint at the one confirmed live address never fired during the actual crash
  sequence, meaning that specific address is not the answer (or not resident by then). Consistent with
  every prior round's own standard, **no code fix was implemented** — there is still no confirmed live
  address that fires at the actual moment of failure, and guessing one would violate this doc's
  standing "UNLOCATED beats invention" practice. `DQK.EXE` remains not a patch target.
- **Concrete next step for round 10:** re-run the dump-and-search a SECOND time, right before or at the
  `up` keypress that triggers the encounter (not just once at Load Saved Game) — the idempotence guard
  in `Invoke-MemDumpAndSignatureSearch` (`$script:memDumpDone`) needs a way to force a fresh dump at a
  caller-chosen later point specifically for this. If `combat_setup_entry` is resident by then (it
  should be, if DQK's overlay manager loads it on demand for actual combat), arm and watch it directly;
  if `add_combatant_to_active_roster` has moved to a different live address by then, that is itself
  strong, direct evidence for the overlay-relocation theory above, worth confirming either way. A
  secondary, lower-cost option requiring no new dump: re-arm a broad `BPINT 21` (not just the `AH=0x42`
  lseek sub-filter used for calibration) immediately before the `up` move, to see whether the on-screen
  "DISK READ ERROR" text corresponds to any real DOS-level file operation at all at this specific
  moment (every prior round's Unicorn-trace evidence says no, but this would be the first live
  DOSBox-X-side confirmation of that specific claim, not just the Unicorn harness's).

### 17.5 Artifacts

- `tools/cok-m4-memory-signature-route.ps1` — new script (round 9's sole tool), implementing §17.1's
  technique. Contains an extensive, dated header comment tracing the full bug-fix history summarized in
  §17.2, kept in the script itself as the primary source for future readers debugging this exact class
  of automation issue again.
- Live-run artifacts (screenshots including `09-walk-02-up.-view.png`, `report.json`, `MEMDUMP.BIN`,
  `signature-search.json`, debugger console snapshots), all git-ignored, not committed:
  `build/cok-m4-memsig-run1/`.
- No `packages/engine/**` or game-data files were modified this round — tooling-only, per this round's
  own findings not yet supporting a targeted fix.

---

## 18. Round 10 — the second-dump-near-crash technique confirms `combat_setup_entry` is GENUINELY never
resident anywhere between Load Saved Game and the crash-triggering move; the freeze itself is
LIVE-confirmed to produce zero debugger stops; a decision-ready verdict that "combat_setup_entry" is
very likely the wrong routine for this specific (wandering-encounter) crash (DOSBox-X ×1 boot, 2026-07-18)

**Task:** execute round 9's own explicit next step (§17.4) — re-run the dump-and-search a SECOND time,
as close as possible to the "MONSTERS ATTACK!"/"DISK READ ERROR" crash trigger, instead of only once at
Load Saved Game — and either pin the crash's true live routine and arm a firing breakpoint, or, if the
signature genuinely still doesn't show up live, conclude decisively that live-address-hunting for this
specific target has hit diminishing returns and hand off a clear decision between the two sanctioned
fallback paths (a targeted `DQK.EXE` patch, or a content-port-side mitigation).

**Result: the second (and third) dump attempt(s) also come back with ZERO matches for
`combat_setup_entry` — a clean, three-times-repeated negative that, combined with the plan's own §9.3
finding, now points to a materially different, more useful conclusion than "still not resident yet":
`combat_setup_entry` (the routine Ghidra's static analysis named at file `0x356DC`) is very likely
simply not the routine this specific crash calls at all.**

### 18.1 Technique: extend, don't replace, round 9's script

`tools/cok-m4-memory-signature-route.ps1` gained three additive changes (no existing parameter,
default behavior, or round-9-proven code path changed — `Parser.ParseFile` confirmed clean before the
live run):

1. **A second (and, if still unresolved, third) forced dump-and-search.** Round 9's idempotence guard
   (`$script:memDumpDone`) is deliberately reset right after the journal is solved and the dungeon is
   reached (before any movement key is sent), so the very next genuine debugger stop — expected to be
   DQK's own `INT 16h` idle-wait for the next movement key, per this doc's own established "DQK.EXE's
   idle primitive is a tight `INT 16h` loop, essentially any time it's waiting on the player" finding —
   triggers a fresh dump. If `combat_setup_entry` still isn't found there, the guard is reset again
   right before the second movement key (`up`, the one that actually triggers the encounter), for a
   third attempt at the absolute latest point a real halt can reach before the freeze.
2. **A full dump-attempt history** (`$script:dumpAttempts` / report.json `dump_attempts`, one entry per
   attempt with its own labeled `signature-search-<label>.json`) replacing round 9's single
   overwritten result, plus de-duplicated `BP` arming (an already-known `(name, phys)` pair is logged
   but not re-armed) so a repeat find doesn't spam redundant breakpoints.
3. **Bounded post-freeze stop-polling** (`-PostFreezeExtraPollTries`, default 20, ~6s at the existing
   300ms poll interval): after the scripted movement completes with no breakpoint hit, the script polls
   the debugger up to 20 more times for a genuine stop **during the freeze itself** — direct live
   DOSBox-X-side evidence for or against the Unicorn tracer's claim (§10.3/§10.5) that the freeze is a
   pure CPU-bound retry loop with zero interrupt activity. (Halting the debugger literally *inside* the
   freeze was never attempted as a distinct step, because it isn't possible with a `BPINT`-gated
   technique if that claim is correct — there is nothing to interrupt on. This poll is the live test of
   that premise, not a workaround for it.)

### 18.2 Live run: one boot, clean end-to-end, three dump attempts, zero new signature hits

`build/cok-m4-run-r10/` (git-ignored). Single boot, no retries needed — the route completed cleanly on
the first attempt (`report.json`: `reached_boot_menu: true`, `solved_protection: true`,
`dump_attempt_count: 3`, `mem_dump_captured: true`). `dosbox-x.exe` confirmed empty both before
launch and after the script's `finally` block stopped it (PID 22976).

| # | Label | When | `combat_setup_entry` matches | `add_combatant_to_active_roster` matches |
|---|---|---|---|---|
| 1 | `after-L` | First stop after "Load Saved Game" (round 9's own checkpoint, reproduced for a baseline) | **0** | 1, at `2C23:0006` |
| 2 | `move-1` | First stop after the `right` key (idle-waiting for the next key, standing at 14,10 already facing E) | **0** | 1, at `2C23:0006` (same address — not re-armed) |
| 3 | `move-2` | First stop after re-arming again, immediately before the `up` key is sent — the LATEST possible real halt point before the crash trigger | **0** | 1, at `2C23:0006` (same address — not re-armed) |

The crash reproduced exactly as every prior round: `right` then `up` took the party `14,10`→`15,10`
facing E, and the immediate next frame (`09-walk-02-up.-view.png`, directly viewed) shows the party
roster, `MONSTERS ATTACK!`, and `DISK READ ERROR` — byte-for-byte the same on-screen state §9/§17
already documented. The post-freeze poll then ran its full budget: **20/20 tries, 0 genuine stops** —
the debugger console stayed reporting `(Running)` for the entire ~6-second window, never once entering
a state where `MEMDUMPBIN`/`BP`/any other debugger command could have been processed (per this doc's
own round-9 finding #1). `breakpoint_hit: false`, `breakpoint_hit_early: false`.

### 18.3 Two decisive, load-bearing findings, neither previously established this concretely

1. **`add_combatant_to_active_roster` never moves.** It is found at the exact same live address
   (`2C23:0006`) in all three independent dumps, spanning from Load Saved Game all the way to the
   instant before the crash-triggering move — roughly the full session. This is new information:
   round 9 only ever had one data point and speculated the overlay manager might relocate segments
   between Load-Saved-Game time and combat (§17.3's leading theory for why the round-9 breakpoint never
   fired). That specific relocation theory is now **directly falsified for this routine** — its live
   address is stable for the routine's entire observable lifetime this route reaches.
2. **`combat_setup_entry` is never resident, at any of three checkpoints spanning virtually the entire
   route.** Its 16-byte signature prefix is `558BEC81EC8802...` — `push bp / mov bp,sp / sub sp,0x288`,
   an address-independent instruction sequence (no embedded segment words, so it is not vulnerable to
   the "prefix breaks under relocation" caveat this doc's own §17.1 flagged as a real risk) that
   Ghidra's static analysis (round 7, §15) proved occurs **exactly once** in the entire 449,664-byte
   `DQK.EXE`. A 640 KiB conventional-memory dump covers the entirety of real-mode-addressable memory —
   there is nowhere else in this DOS session for this exact byte sequence to be resident. Given it is
   absent at Load Saved Game, absent immediately after the `right` turn, and *still* absent in the
   split-second before the very `up` keypress that triggers the crash — and given the plan's own §10.3
   Unicorn-trace finding that **no further file loads occur anywhere between here and the freeze** — the
   only self-consistent conclusion is that `combat_setup_entry`'s own overlay chunk is **never loaded at
   all** on this specific route, not "not yet loaded."

### 18.4 Reframing: `combat_setup_entry` is very likely the wrong routine for THIS crash

Combining finding 2 above with this plan's own already-recorded, independently-derived §9.3 finding —
that the observed "MONSTERS ATTACK!" encounter at `(15,10)`, 35 steps before the planned scripted
selector-28 trigger at `(3,15)`, is most consistent with a **wandering/random-encounter check**, not the
planned scripted ECL `COMBAT` opcode dispatch — produces a materially better-supported theory than
anything rounds 6-9 worked from:

- `combat_setup_entry` (file `0x356DC`) was identified by Ghidra purely via unique-byte-sequence
  matching and call-graph analysis (round 7, §15) — its *semantic* role (which encounter-trigger
  pathway actually calls it) was never independently confirmed, only assumed to be "the" combat setup
  routine because it was the only strong Ghidra lead available at the time.
- If DQK's wandering-encounter dispatch and its scripted-ECL-`COMBAT`-opcode dispatch are, in fact,
  two different code paths converging on different (or only partially shared) setup routines — a
  perfectly ordinary way for a Gold Box engine to be structured, and consistent with `combat-system-
  source-recovery-goal.md`'s own pre-existing open item about how wilderness/random encounters select
  `WILDCOM`/`RANDCOM` separately from scripted encounters — then this route (which round 9/10 both now
  agree is very likely the wandering path) would **never** call `combat_setup_entry` at all, regardless
  of how correctly its address is computed or how aggressively it's searched for live. That fully and
  parsimoniously explains **five consecutive rounds (6, 8, 9, 10) of the exact same negative result**
  across every addressing model tried (load-segment-shift, unshifted, live memory-signature search) —
  not as five failures of technique, but as five confirmations that the target itself is not on the
  executed path.
- This does **not** retroactively invalidate rounds 11/12's own findings (the stack-buffer-overflow
  mechanism, the `+0x28` type-field write, the `0x19F`-byte chained-sub-record-count bug) — those were
  traced via the Unicorn harness from the *actual* live crash instructions (confirmed by the harness's
  own deterministic reproduction of the identical `614d` crash address), not from `combat_setup_entry`'s
  address. **The real bug rounds 11/12 characterized is still real and still unlocated at the exact
  field level** — what round 10 retires is only the working assumption that `combat_setup_entry`
  specifically is the entry point into that bug.

### 18.5 Root cause: still UNLOCATED. No code fix implemented (correctly, per this doc's standing rule)

Per the task's own item 4 charter and this doc's "UNLOCATED beats invention" standard through all 9
prior rounds: a signature genuinely, repeatedly absent from live memory at the closest achievable
pre-crash halt point is a legitimate stopping point for live-address-hunting on *this* target, not a
reason to guess an address or write a speculative fix. `DQK.EXE` remains not a patch target this round.

### 18.6 Decision-ready summary for the user / next round

**Path (c) — not sanctioned to implement this round, but the best-evidenced next step:** locate the
*actual* wandering-encounter setup routine instead of continuing to chase `combat_setup_entry`. Two
concrete leads already exist in this doc for finding it without spending the DOSBox-X slot again
immediately: (i) round 5's own finding (§13) that the crash path's id-keyed resource load calls "the
SAME generic loader this project already documented elsewhere" with a live-confirmed `'moncha1'`
resource-family read at `DS:0x5FFD` — that generic loader's OWN callers (a static Ghidra xref query, the
same technique round 7 already proved out) would surface every dispatch path that reaches it, scripted
or wandering, without needing a live boot; (ii) `combat-system-source-recovery-goal.md`'s pre-existing
open item on `WILDCOM`/`RANDCOM` selection is directly relevant now and should be read together with
this finding before the next live round.

**Path (a) — targeted `DQK.EXE` binary patch.** Per this project's standing rules, this is a genuine
last resort requiring **explicit user sign-off before ever being attempted** — not attempted or further
specced this round. Even setting that aside, it remains premature: the exact field/instruction that
needs patching is still not pinned to the byte level (rounds 11/12 narrowed the mechanism, not the
final missing value), and patching `DQK.EXE` was never this project's goal for the primary deliverable
(CLAUDE.md: DQK.EXE is the *target* engine, not something to be modified) — this path should stay
lowest-priority regardless of how round 10 resolved.

**Path (b) — route the content-port around the trigger (mitigation, not a true fix).** Also not
implemented this round, per the task's explicit "do not implement without very strong evidence"
instruction — the evidence gathered so far (rounds 11/12's stack-overflow mechanism) narrows *where*
the bug lives but not *which upstream field* the content port would need to change, so any mitigation
attempted today (e.g. capping ported monster-group sizes) would be guessing at the fix shape, not
applying a diagnosed one. If path (c) also stalls in a future round, revisit this path with whatever
new evidence it produces — capping/validating ported CoK monster-group sizes at build time
(`tools/build-dqk-dir.mts` / `packages/engine/src/loaders/buildDqkGame.ts`) remains the most plausible
shape for such a mitigation given rounds 11/12's own record-count/chain-terminator framing, but this is
explicitly flagged as unconfirmed speculation, not a recommendation to implement blind.

### 18.7 Artifacts

- `tools/cok-m4-memory-signature-route.ps1` — additive changes described in §18.1
  (`-RedumpNearCombat`, `-PostFreezeExtraPollTries`, `$script:dumpAttempts` history, de-duplicated BP
  arming). No existing parameter, default behavior, or round-9-proven code path changed;
  `[System.Management.Automation.Language.Parser]::ParseFile` confirmed the script still parses cleanly
  before the live run.
- Live-run artifacts (screenshots including `09-walk-02-up.-view.png` / `10-final-no-hit.-view.png`,
  `report.json` schema v2 with the new `dump_attempts`/`post_freeze_*` fields, three
  `signature-search-*.json` files, `MEMDUMP.BIN`, debugger console snapshots), all git-ignored, not
  committed: `build/cok-m4-run-r10/`.
- No `packages/engine/**` or game-data files were modified this round — tooling + doc changes only, per
  this round's own findings not supporting a targeted fix.

---

## 19. Round 11 — the "actual wandering-encounter routine" hunt exhausts TWO independent Ghidra
static angles with the same "genuinely indirect, no static caller" result; a THIRD, ECL-bytecode-level
angle (new investigative axis, not x86 disassembly at all) independently confirms the trigger is
DQK-native and NOT area-34's own ported script content; root cause narrowed but still UNLOCATED, no
fix implemented (STATIC ONLY, Ghidra 12.1.2 + existing ECL-scan tooling, no DOSBox-X, 2026-07-18)

**Task:** locate DQK.EXE's actual wandering-encounter/random-combat trigger-and-setup routine (distinct
from `combat_setup_entry`, which round 10 proved is never resident on this route), using Ghidra's
xref/decompile tooling rather than manual disassembly, then trace what it reads for the monster
group and how that differs between a native DQK wandering encounter and this CoK-ported one — entirely
statically if possible.

### 19.1 Angle 1: one more hop down from `AddCombatantToActiveRoster` — its own resident FBOV dispatch
stub also has zero static callers

Round 15.5 already proved (Ghidra xref + three independent raw-byte scans) that
`AddCombatantToActiveRoster` (file `0x359E6`, true `1F4E:4AB6`) has no statically-discoverable caller
anywhere in the 449,664-byte file. This round asked a related but different question: does DQK.EXE's
*generic resource loader itself* — the shared `1FC4:0130` routine `combat_setup_entry` calls to fetch
`"moncha1"` records, which round 7 already isolated as `resource_loader_stub_0130_file317C0`
(synthetic `0x23088b`) — have a wider fan-in from OTHER callers than just `combat_setup_entry`? If the
wandering-encounter path shares this same generic loader but reaches it through a *different* call
site, finding that second call site would identify the real routine without needing
`AddCombatantToActiveRoster`'s own address at all.

New tooling: `tools/decompiler/ghidra_cok_m4_stub_callers.py` (chained after `ghidra_import.py`, same
pattern as round 7/9's scripts) queries `ReferenceManager.getReferencesTo()` on the RESIDENT-image FBOV
dispatch-stub addresses that round 7's own report already named as the loader's callers (`0x0011:eaab`
for `resource_loader_stub_0130`, `0x0011:eabf`/`0x0011:eab5` for its sibling loaders). **Result: zero
references found to any of the three stubs.** This is a genuine, new negative result, not a repeat of
round 15.5's finding (which was about a DIFFERENT address, `AddCombatantToActiveRoster` itself) — it
extends the same "no static caller" pattern one architectural layer further down, to the shared
resource-loading machinery itself.

Investigating *why* surfaced a real, previously-undocumented architectural fact about `DQK.EXE`, found
via `tools/decompiler/ghidra_cok_m4_symbol_query.py` (new, non-destructive: looks up an
already-`analyzeAll()`-discovered function **by name**, never calls `disassemble()`/`createFunction()`
at an arbitrary address — an earlier draft of this round's own tooling that DID force disassembly at a
raw computed address corrupted an unrelated function's disassembly into `halt_baddata()` garbage;
fixed by switching to symbol lookup). The resident image contains a **large table of ~100+ individual
10-byte call-thunks** (`0x0011:eaab`, `eab5`, `eabf`, `eac9`, … stepping mostly 10 bytes apart), one
per externally-callable overlay function, each of which does `call FUN_0011_df1d` (a single shared
dispatcher) before jumping into the correct overlay. `FUN_0011_df1d` itself has **~100 real, resolved
callers** — but *every one of those calls arrives at the 10-byte thunk itself*, never at
`FUN_0011_df1d` from anywhere outside this thunk table. The thunks are, in turn, invoked exclusively
via **direct far-call instructions with an absolute canonical segment:offset operand embedded in the
instruction bytes** (the exact `9A xx xx SEG_LO SEG_HI` shape already documented for
`combat_setup_entry`'s own `func_0x1fc40088()`/`func_0x1fc40130()` calls in round 7's decompile) —
**not** via a literal, Ghidra-traceable jump table. Round 15.3 already proved these absolute overlay
segment operands are relocated/patched at overlay-load time (that is precisely why `0x2177` was a real,
valid, in-context segment for round 6's crash bytes AND a completely wrong address for
`combat_setup_entry`, simultaneously). **This means every overlay-to-overlay or overlay-to-resident
call in this binary uses a load-time-relocated absolute operand, which is architecturally invisible to
Ghidra's static reference manager** unless the specific pre-resolved translation is already in the
manifest (as it is for the ~182 resident→overlay stub calls, but not for arbitrary overlay-internal
calls like whatever calls into the wandering-encounter's own entry). This is not a tooling gap this
round could close — it is the same class of limitation round 15.5 already hit, now shown to be general
to this binary's call convention rather than specific to one routine.

### 19.2 Angle 2: a genuinely different axis — does area 34's OWN ported ECL script even have a
wandering-encounter construct? (No.)

Both `combat_setup_entry_file356DC` and `AddCombatantToActiveRoster` are x86-code-level targets. This
round tried a structurally different angle: read the **ECL bytecode DATA** DQK actually executes for
area 34, using tooling that already exists in this repo and needed no changes —
`tools/gen1_ecl_encounter_scan.py`'s output, `build/gen1-ecl-encounters.json`. This scanner statically
decodes CoK's own Gen1 ECL and enumerates every `LOAD_MONSTER`→`COMBAT` path reachable from each of
the five header entry points (`vm_run_1`, `search_location`, `pre_camp_check`, `camp_interrupted`,
`initial_entry`), carrying operand state through local control flow. Per `eclEncode.ts`'s own,
already-verified claim ("the bytecode body needs no rewriting... kept verbatim"), whatever this scan
finds for CoK's original `ECL1.DAX` block 34 is byte-identical to what ships in the M4 build's ported
`ECL.GLB` area-34 member.

**Area 34's block has 12 statically-decoded `LOAD_MONSTER` candidate paths — all reached from
`search_location` (11 of them) or `camp_interrupted` (1) — and ZERO from `vm_run_1`.** The rosters are
small, sane immediates (monster ids like 1, 8, 12, 13, 26, 30, 35, 38, 41 with counts 1-8), consistent
with round 13.4's own expectation of what a *valid* moncha1 id should look like and with the plan's own
§4.3 planned selector-28 encounter (also a `search_location` path). This is genuinely new, decisive
information: **CoK's area 34 has no `vm_run_1`-driven wandering-encounter construct at all** — nothing
resembling native DQK area 5's own documented `ON_GOTO [0x0023]` → 8-stub-slot → `LOAD_MONSTER`/`COMBAT`
pattern (`docs/engine/research/combat-trigger-c4.2b-2b-2b.md` §4). Combined with round 10's own,
independently-derived Unicorn-trace finding that ECL opcode `0x24` (`COMBAT`) never fires anywhere on
this route (§10.3) — two *different* investigative methods (x86 opcode-execution watch vs. static ECL
bytecode enumeration) now agree, from two unrelated angles, that **this specific "MONSTERS ATTACK!"
trigger is not driven by area 34's ECL script at all, scripted or wandering** — ruling out "the
content port's ECL translation broke a wandering-encounter script construct" as the root cause, since
there is no such construct in this script to break.

A companion check closes off the other natural ECL-side hypothesis. `docs/engine/research/dqk-overlay12-
combat-setup-cluster.md` §92-94 already documents that CoK's OWN engine (not DQK's) has a native
`RandCom` wandering-encounter mechanism, referenced by literal strings inside CoK's own `GAME.OVR` at
file offsets `0xf1ac`/`0xf1b4`/`0xf1bc`. `GAME.OVR` is CoK's Gen1 executable overlay — it is not part of
this build at all (the M4 build runs unmodified `DQK.EXE`, never `GAME.OVR`), so CoK's own `RandCom`
mechanism is simply never invoked here; porting `RANDCOM.DAX`'s data would have nothing on the DQK side
to consume it. This closes off "port `RANDCOM.DAX`" as a viable fix direction.

A third, adjacent check: `packages/engine/src/loaders/geoEncode.ts`'s own documentation (lines 22-33,
already correct and already the fix landed in §8) establishes that the Gen2 GEO header's 6 reserved
bytes are **fully and specifically accounted for** — bytes 2-4 are wall/tile-set ids, bytes 5-7 are
backdrop-set ids, nothing else. There is no unused/undocumented header field that could plausibly carry
a "wandering-encounter table id" the content port might be leaving zeroed. This rules out "a missing
GEO header field" as the cause too.

### 19.3 Synthesis: root cause narrowed, not located

Combining round 10's own §18.4 theory with this round's two independent new findings:

- **The wandering-encounter trigger is a purely DQK-native, non-ECL-driven mechanism** — not dispatched
  through the scripted `LOAD_MONSTER`/`COMBAT` opcode path at all (now proven by two unrelated methods:
  round 10's x86 opcode-execution watch, and this round's static ECL bytecode enumeration showing area
  34 has no `vm_run_1` roster-filling path to even attempt). It is very likely something closer to a
  periodic, per-step, area/terrain-keyed dice-roll baked directly into `DQK.EXE`'s movement-processing
  code, entirely independent of what's in the current area's ECL script, GEO header, or any CoK-specific
  resource this project's content port controls.
- **That routine's call site (and `AddCombatantToActiveRoster`'s own call site, if they are in fact the
  same eventual target) is architecturally invisible to Ghidra's static reference manager** — not
  because the search was insufficiently thorough (this round exhausted two more independent angles: the
  shared loader's own resident dispatch stub, and the general FBOV thunk-table mechanism that underlies
  literally every overlay-crossing call in this binary) but because `DQK.EXE`'s overlay call convention
  uses load-time-relocated absolute far-call operands for exactly this class of call, which Ghidra
  cannot trace without emulating the relocation itself.
- **The resource family it reads (`"moncha1"`, round 13.3) is confirmed correct** and CoK's own ported
  content for that family is itself well-formed (area 34's `search_location` monster ids are small and
  sane — see §19.2). The most parsimonious remaining theory, still unconfirmed: DQK's native
  wandering-encounter mechanism keys its monster-group selection off something **area-id- or
  terrain-type-keyed and hardcoded inside `DQK.EXE`** (built for DQK's own ~40-area roster), and that
  keying is not sane once area 34 is repurposed to host CoK's differently-sized/numbered `moncha1`
  content — producing exactly the kind of garbage id round 13.4 found (a value that happens to be a
  valid pointer into unrelated DGROUP text, i.e. state that was never (re-)written for this specific
  combination, not a value anyone computed).

### 19.4 No code fix implemented, and no new live breakpoint address to hand off

Per this doc's standing "UNLOCATED beats invention" practice and the task's own item 5 off-ramp ("if you
find yourself repeating rounds 5/6/8's same struggle to resolve an indirect/computed call, stop and
report that plainly rather than looping"): this round's two Ghidra angles reproduced that exact struggle
from two new but structurally similar starting points, and a third, genuinely different angle (ECL
bytecode) narrowed the theory without pinning an address. Per the task's item 3 charter, a fix is only
implemented when it has a "concrete, evidence-backed root cause with a safe, well-scoped fix location" —
that bar is not met: the specific `DQK.EXE`-internal table/computation is still not located, so any
content-port change would be guessing at both the mechanism and the fix shape simultaneously. No
`packages/engine/**` or game-data files were modified this round.

Per the task's item 4, a live DOSBox-X confirmation is not specced this round with a NEW breakpoint
address, because this round did not find one — re-arming `combat_setup_entry`/`AddCombatantToActiveRoster`
addresses again would just repeat rounds 9/10's already-conclusive negative result. The single most
promising round-12 live-session idea this round's findings actually support: **a native-DQK comparison
walk** (repeatedly ranked as valuable since §11.5 but never attempted) — boot the SAME automation route
against a genuinely native, unported DQK save/area instead of the CoK-ported one, take 2-3 steps, and
see whether the SAME class of "MONSTERS ATTACK!" trigger fires naturally there too (confirming the
mechanism is a normal, always-on DQK behavior that merely crashes on CoK's content) or never fires at
all on native content in the same number of steps (which would instead suggest something about area
34's specific *identity* — not its script content, already ruled out in §19.2 — makes DQK's engine treat
it as eligible for a wandering check when a native area wouldn't be). This is a differential experiment,
not an address-hunting one, so it sidesteps this round's and rounds 9/10/15's shared dead end entirely.

### 19.5 Artifacts

- `tools/decompiler/ghidra_cok_m4_stub_callers.py` — new script, §19.1's stub-caller query
  (decompile + `getReferencesTo()`, one hop up from each caller found).
- `tools/decompiler/ghidra_cok_m4_symbol_query.py` — new script, non-destructive by-name function
  lookup (no `disassemble()`/`createFunction()` at a computed address — see §19.1's note on the bug this
  fixed) used to inspect `FUN_0011_df1d` and its ~100 callers.
- `build/ghidra-cok-m4/targets_round11_stubs.json`, `run_round11_stubs.bat`,
  `report_round11_stubs.txt`, `names_round11.json`, `run_round11_symbol.bat`,
  `report_round11_symbol.txt` — this round's Ghidra headless run configs/outputs (git-ignored, not
  committed; `build/` holds copyrighted/generated data per this repo's convention).
- No `packages/engine/**` or game-data files were modified this round — tooling + doc changes only, per
  this round's own findings not supporting a targeted fix.

---

## 20. Round 12 — DECISION CHECKPOINT. A concrete, static, cheaply-reproduced NEW lead (CoK's ported
area 34 collides byte-for-byte with a REAL native DQK area 34, not an out-of-range id); the native-DQK
differential control walk itself stays genuinely inconclusive within a bounded live-session budget
(DQK's own fresh-start save routes through a heavily scripted, mandatory town-hub opening chapter that
this automation could not fully navigate); two real infra bugs found and fixed with tests along the way
(DOSBox-X ×7 boots this round + static analysis, 2026-07-19)

**Task:** round 11's own explicit next step (§19.4) plus this round's own decision-checkpoint charter —
test the "is this a pre-existing DQK.EXE fragility 30 years of native play never triggered" hypothesis
via a genuine native-DQK differential control walk; cross-reference CoK's ported area 34 against DQK's
own native area-id/terrain-type usage statically; implement a fix ONLY if a concrete, evidence-backed,
safely-fixable root cause turns up; otherwise stop chasing this bug in the same vein and write a
clear-eyed decision memo instead of a round 13.

### 20.1 Static cross-reference: area 34 is NOT out-of-range — it is a byte-identical ID COLLISION
with a real, native DQK dungeon

This was the cheap, no-DOSBox-X check the task asked to run "before or instead of a live boot," via
`decodeHlib`/`decodeGen2GeoArchive`/`decodeEclGlb` (all pre-existing, already-tested loader code —
`packages/engine/src/loaders/{hlib,geo,eclGlb}.ts`) against both the untouched retail
`The Dark Queen of Krynn/DISK3/{GEO,ECL}.GLB` and the ported `build/cok-on-dqk-m4fidelity/DISK3/
{GEO,ECL}.GLB`:

| archive | native DQK area ids | ported (`cok-on-dqk-m4fidelity`) area ids |
|---|---|---|
| `GEO.GLB` (20 native maps) | 2, 4, 10, 14, 18, 22, 24, 26, 30, **34**, 38, 42, 46, 47, 50, 54, 58, 62, 63, 66 | 32, **34**, 48, 49, **50**, 64, **66**, 67, 68, 80, 81, 82, 96, 97, 99 |
| `ECL.GLB` (47 native areas) | 1, 2, 3, 4, 5, 7, 10, 14, 15, 16, **18**, 22, 23, 26, 27, 28, 30, 31, **32**, **34**, 35, **36**, 38, 39, 40, 41, 42, 43, 46, 47, **48**, **49**, **50**, 51, 52, 54, 55, 58, 59, 60, 61, 62, **63**, **64**, 65, **66**, **67** | **1**, **16**, 17, **18**, **32**, 33, **34**, **36**, **48**, **49**, **50**, 57, **64**, **66**, **67**, 68, 80, 81, 82, 96, 97, 98, 99 |

**Area 34 is a real, native DQK dungeon, not an unused/out-of-range id.** Native `GEO.GLB` member 10
(id 34) is a genuine 28×28 map with its own header bytes `06 02 0b 09 02 04` — DQK's own designers built
and shipped a real place at exactly this id. This falsifies the task's own leading hypothesis (an
off-by-one / out-of-native-range id) but replaces it with a sharper, still-live one: CoK's port doesn't
miss DQK's native id space, it **collides directly inside it**. Three of the ported build's 15 GEO areas
(34, 50, 66 — bold above) and twelve of its 23 ECL areas (1, 16, 18, 32, 34, 36, 48, 49, 50, 64, 66, 67)
land on ids DQK's own native game already uses for something else. This is a direct, mechanical
consequence of `buildDqkGame.ts`'s documented per-disk id-band choice (CoK/DoK use bands 16–36/48–68/
80–99, chosen to keep CoK's OWN block ids disjoint across CoK's three disks — never cross-checked
against DQK's native occupied id space, because the ported `GEO.GLB`/`ECL.GLB`/`MONCHA.GLB` files
**wholesale replace** DQK's native ones on disk, so on-disk collision was reasonably assumed harmless).

A second, independent data point sharpens this further: `geoEncode.ts`'s own `DQK_GEO_PLACEHOLDER_SET_
IDS` (`01 02 08 01 08 ff`, used for every ported GEO area including 34, documented as "a native DQK
dungeon combo proven to load") turns out to be **native area 30's own header verbatim**, not area 34's
own (`06 02 0b 09 02 04`). The port already borrows one native area's identity-adjacent data for another
— confirming the project's art/wall-set placeholder strategy is already knowingly reusing native
resource-set ids across mismatched area ids, exactly the class of collision this round's new finding
flags as suspect for whatever hardcoded, non-ECL, area-id-keyed mechanism round 19 already proved exists.

**This is new, decisive-shaped evidence, but it is not yet a proven root cause.** Two gaps remain open:
(1) whether ids 50/66 (also collisions, never yet visited by any tested route) would crash too if
reached — untested; (2) the causal mechanism linking "area id 34 is native-occupied" to "byte offset
0x19F of an id-keyed resource record decodes to ~114-115 instead of a small sane chain length" (§12.5/
§12.6's own stack-overflow mechanism) is a coherent, falsifiable *theory* (DQK.EXE very plausibly has a
compiled-in, area-id-keyed table — built for its own 20/47-area roster — that the collision causes it to
consult for area 34, resolving against the PORTED, differently-shaped `MONCHA.GLB` instead of DQK's own
native one, landing exactly the kind of "valid pointer into unrelated DGROUP text" round 13.4 found) —
but it was not traced to a specific table address this round, and per this doc's own standing rule
(§18.5/§18.6, restated in this round's own charter) that bar — "concrete, evidence-backed root cause
with a safe, well-scoped fix location" — is not yet met. See §20.4 for why this stops short of a blind
fix.

### 20.2 Live native-DQK differential control walk — attempted across 7 boots, genuinely inconclusive
within budget (not a fabricated "it works fine" result)

New tool: `tools/dqk-native-control-route.ps1`, adapted from round 9/10's proven
`cok-m4-memory-signature-route.ps1` (same boot/journal-protection machinery verbatim — it's the same
`DQK.EXE`, same copy-protection mechanism, not CoK content), pointed at a **scratch copy** of the
untouched, unmodified `The Dark Queen of Krynn` GOG dir (`build/dqk-native-control/`, copied via `cp -r`
— the shared working-tree source dir was never booted against directly, so it stayed byte-for-byte
untouched throughout; confirmed via `git status`/`git diff` showing zero changes to it before and after
every run).

**What actually happened, boot by boot (7 live DOSBox-X sessions this round, `dosbox-x.exe` confirmed
empty before and after every single one):**

1. **Run 1:** reached the boot menu and the journal-word protection cleanly, but the wander loop (fixed
   `up`/`left`/`right`/`down` cycle, no narrative handling) burned its entire step budget stuck on a
   static "YOU ARRIVE IN PALANTHAS..." opening-narrative page that arrow keys do not advance — only
   `Enter` does. Genuine tooling gap, not a game-side finding.
2. **Run 2:** added narrative-page clearing; failed instead on the journal-word protection itself — the
   typed answer never echoed on screen at all (root-caused as a real, reusable gotcha: `BPINT 16 0` stays
   armed for the whole post-title-screen session, so DQK's own blocking keyboard-read call can halt the
   debugger mid-keystroke and silently drop the rest of a typed word — the documented "halted guest drops
   queued input" project gotcha, previously only seen around movement/menu keys, now also confirmed around
   in-game text entry). Fixed with a `Resume-IfStopped` guard wrapping every character press.
3. **Run 3:** journal protection failed again, but for a *different*, genuine reason: the correctly-typed
   answer was rejected because **this project's own extracted `build/dqk_journal.txt` had a real PDF
   text-extraction artifact** — "THE DAR UEEN of KRYNN" instead of "THE DARK QUEEN of KRYNN" (a dropped
   K/Q, most likely from a decorative drop-cap the PDF extractor mishandled) — so word #7 after the
   "MAGIC" heading solved to "UEEN" instead of "QUEEN". Fixed by correcting the one line in the extracted
   text (`build/` is git-ignored scratch data, not shipped game content).
4. **Run 4:** journal protection succeeded this time; reached a SECOND narrative beat mid-wander-loop (a
   "the General requests your presence" summons) that the loop's one-shot pre-loop narrative clear didn't
   handle, burning the rest of the budget there. Fixed with an inline per-step narrative-page detector.
5. **Run 5:** a THIRD, different journal-word failure — `DQK.EXE`'s own live prompt read "DIETIES" (word
   #3 after that heading), confirmed against the raw screenshot pixel-for-pixel (not a vision/OCR
   misread) — while the journal's own heading is correctly spelled "Deities". **This is a genuine
   developer/publisher typo baked into the retail `DQK.EXE`'s own hardcoded protection-prompt text**,
   distinct from run 3's own extraction bug on this project's side. Fixed generally (not a one-off
   string patch) by adding a bounded, single-adjacent-transposition-tolerant fallback to
   `journalParagraphFor` in `packages/engine/src/loaders/dqkProtection.ts` — only used when no exact
   match exists at all, capped at edit-distance 1, so it can't accidentally match an unrelated heading.
   Two new unit tests added (`packages/engine/test/dqkProtection.test.ts`): the DIETIES/Deities case
   itself, and a same-shape "does NOT fuzzy-match an unrelated heading" guard. `pnpm -r exec tsc --noEmit`
   clean; full engine vitest suite (149 files / 1761 tests) green, including all 21
   `dqkProtection.test.ts` cases.
6. **Run 6:** with both protection bugs fixed, the route finally reached real gameplay — and found DQK's
   own fresh-start save opens on a **text/letter-driven Palanthas town hub** ("THE CITY OF PALANTHAS.
   WHERE DO YOU WISH TO GO? PALACE TEMPLE HALL SHOP INN BAR LEAVE"), not a walkable dungeon/overland grid
   at all. Arrow keys don't drive this menu; the 70-step wander budget was spent cycling in place.
7. **Run 7:** added town-hub detection (press `l` for LEAVE, matching the same first-letter-shortcut
   convention already proven at the boot main menu). This revealed the actual blocker: DQK's own opening
   chapter has a **hard, mandatory story gate** — attempting to leave town triggers "THE GUARD STOPS YOU.
   'EXCUSE ME. THE GENERAL REQUESTS YOUR PRESENCE AT THE PALACE. IT IS MOST URGENT.'" every time, looping
   back to the same town menu. The party cannot reach a walkable wilderness/overland map at all until it
   completes a **PALACE visit** (and whatever quest step that entails) first — a materially larger,
   multi-screen scripting task than this round's remaining budget supports.
8. **Run 8 (2026-07-28):** independently repeated the untouched-retail GameLink route through the
   journal answer (`SURVIVE`), arrival narrative, and Palanthas menu. Three `LEAVE` attempts again
   reached the same Palace-guard rejection, with the trace preserving every screenshot/debugger
   checkpoint in `build/dqk-native-control-run8/`. The run was stopped at that proven gate rather than
   spend its 120-step budget cycling through non-explorer input. The reusable control tool now detects
   three consecutive Palace rejections, records `quest_gate_at_step` in its report, and ends the run
   explicitly. A future authentic explorer trace therefore needs a real post-Palace save or an
   evidence-backed automated Palace quest route; patching the fresh save is not an authentic substitute.

**Verdict on the control walk: genuinely INCONCLUSIVE, not a smoothed-over "it works fine natively"
claim.** Two real, useful, general-purpose infra fixes landed either way (the `Resume-IfStopped`
keystroke-drop guard and the typo-tolerant journal-protection fallback, both reusable by any future
DOSBox-X round in this project, not just this one), and `tools/dqk-native-control-route.ps1` itself is a
real, reusable asset for a future attempt — but the differential question the task asked ("does a native
wandering encounter resolve cleanly") was not actually answered this round. DQK's own fresh-start save
routes through a heavily linear, scripted Chapter-1 sequence (arrival narrative → town hub → mandatory
Palace-visit gate) before the game ever permits reaching free-roam wilderness, and fully scripting past
that (plus then waiting on an RNG-gated wandering-encounter check to fire) is a multi-round undertaking
in its own right, not a "walk a few steps" cheap check as originally hoped. Per this doc's own standing
practice, this is reported plainly as a real limitation rather than either faked or endlessly re-attempted
in the same vein this round.

### 20.3 What is now known for certain, after 12 rounds

- **The crash mechanism** (rounds 11/12, §12): a genuine local stack-buffer overflow inside a DQK.EXE
  combat-setup routine (canonical `2177:257C`), triggered when byte offset `0x19F` of an RLE-decompressed,
  id-keyed resource record is read as a "chained sub-record count" and is ~114-115 instead of small/sane —
  overrunning a 648-byte local buffer by roughly 3x and corrupting the routine's own saved return address.
  This would corrupt DQK's real call stack in an unmodified DOSBox session too, not just this project's
  trace harness.
- **What that mechanism is NOT** (rounds 10/11, §18/§19, now two independently-agreeing methods): NOT
  driven by area 34's own ECL script content (zero `vm_run_1`/`LOAD_MONSTER` wandering paths exist in
  that script at all — confirmed both by live x86 opcode-execution watching and by static ECL bytecode
  enumeration), NOT a missing/miscoded GEO header field (the 6 reserved bytes are fully accounted for as
  wall/backdrop set ids only), and NOT fixable by porting CoK's own native `RandCom` mechanism (it lives
  in `GAME.OVR`, which isn't part of this build and is never invoked under unmodified `DQK.EXE`).
  `combat_setup_entry` (the routine this whole investigation was originally anchored to) is proven, via
  three independent live memory-signature dumps spanning the entire route, to be **never resident at all**
  on this specific crash — it is very likely simply the wrong routine, not evidence of anything else.
- **NEW this round:** area 34 — the one area this whole 12-round investigation has ever actually tested —
  is not an out-of-range or unused id; it is a **real, native DQK dungeon**, and CoK's port collides with
  it (and, untested, potentially also with native ids 50/66) directly. A coherent, falsifiable mechanism
  connecting this collision to the stack-overflow's own bogus `0x19F` byte is described (§20.1) but not
  traced to a specific `DQK.EXE` table/address.
- **Still genuinely open:** (a) whether the id-collision theory is the actual cause, or coincidental; (b)
  whether ids 50/66 (or any other native-occupied ported id) also crash; (c) whether a genuinely
  unmodified DQK.EXE ever hits this same stack-overflow class of bug on 100%-native content — the
  differential control experiment that would settle this cleanly was attempted (§20.2) but did not
  complete within a bounded live-session budget, owing to DQK's own scripted opening chapter, not to any
  new finding about the bug itself.

### 20.4 Decision memo (per this round's own charter — a judgment call for the user/planner, not decided
unilaterally here)

**(a) What's certain vs. still open:** summarized in full in §20.3 above. In short: the mechanism (a
real local stack-buffer overflow in a DQK.EXE combat-setup routine, triggered by a bogus per-record
chain-count byte) is pinned at the instruction/variable level and has been for several rounds; it is
proven NOT to be driven by CoK's own ECL script content; and this round adds a concrete, reproducible,
NOT-yet-proven id-collision lead (area 34 is a real native DQK area, and CoK's port silently reuses its
id, along with at least two others). No round has produced a live, firing breakpoint at the actual fault
site, and the native-content differential control this round set out to get still doesn't exist.

**(b) Two realistic paths forward — neither attempted this round:**

1. **A targeted `DQK.EXE` binary patch.** Per this project's standing rule, this requires **explicit user
   sign-off before ever being attempted** and was not attempted or further specced this round. It also
   remains premature on the merits: even with this round's new id-collision lead, the exact instruction/
   table that would need patching is still not pinned to a byte-level address, and patching the *target*
   engine (`DQK.EXE` is the primary goal's destination, per `CLAUDE.md`, not something meant to be
   modified) should stay the lowest-priority option regardless.
2. **A content-port-side defensive mitigation.** This round's new evidence changes the *shape* of this
   option from prior rounds' guess ("cap ported monster-group sizes," §18.6, never implemented, never
   evidence-backed): the more evidence-consistent mitigation shape now is **remapping ported CoK/DoK area
   ids to avoid DQK's native-occupied id space entirely** (i.e. the OPPOSITE of naively preferring native
   ids — this round found reusing a native id is the suspicious case, not avoiding one). Concretely: choose
   per-disk id bands for future ports that have zero overlap with the native `GEO.GLB`/`ECL.GLB` id sets
   enumerated in §20.1's table (e.g. shifting into a range like 100+ that no native archive ever uses,
   instead of the current 16–36/48–68/80–99 bands that collide with 3-12 native ids depending on archive).
   **Not implemented this round** — per the task's own explicit instruction and this doc's "UNLOCATED
   beats invention" standard, the causal link between "id collision" and "this specific crash" is
   evidence-consistent but not proven (§20.1's two open gaps), so a remap now would still be mitigating a
   *plausible* cause, not a *confirmed* one. It is, however, now the single most concrete, cheaply-testable
   lead this investigation has produced in several rounds — cheaper to test than another live differential
   walk: statically remap just area 34 (and ideally 50/66) to unused ids in `buildDqkGame.ts`/
   `tools/build-dqk-dir.mts`, rebuild, and re-run the ALREADY-PROVEN `cok-m4-memory-signature-route.ps1`
   crash-reproduction route once — if the crash stops reproducing at the new id, that is a strong,
   direct confirmation with a minimal-risk, easily-revertible change; if it still crashes, the id-collision
   theory is cleanly falsified and this lead retires without having touched anything load-bearing.

**(c) Recommendation on Goal 1's CoK M4 gate status — a call for the user/planner, not decided here:**
This round does not recommend treating the gate as cleanly "passed." What it does support, more strongly
than any prior round: the CoK content port ITSELF is very likely not at fault in the sense of "we packed
the wrong bytes" — the ECL/GEO/MONCHA content is proven well-formed and the crash is proven to be a
DQK.EXE-internal mechanism, not a translation error. Combined with this round's new, still-unconfirmed
id-collision lead, there is a real, growing case for **"passed with a known, isolated, non-content
issue, with a concrete and cheap next experiment identified"** — but calling it that outright would
overstate what 12 rounds have actually nailed down, given the causal link is not yet proven and the
clean native-vs-ported differential comparison still doesn't exist. The honest options to hand up are:
continue treating it as **"still blocked, pending the §20.4(b)-2 remap experiment"** (cheap, low-risk,
one more DOSBox-X boot to run when the slot is next available and worth prioritizing given how
concrete this lead now is), or **accept "passed with a known, isolated, non-content issue"** for
packaging purposes now on the strength of the ECL/GEO/MONCHA-content-is-fine finding alone, revisiting
if the remap experiment ever contradicts it. Per this round's own charter, this call is left to the
user/planner rather than decided unilaterally here. **No round 13 in the same vein (more live
memory-signature/breakpoint hunting for the same unlocated address) is recommended** — if a round 13
happens, it should be the §20.4(b)-2 remap-and-reboot experiment specifically, not a repeat of rounds
6-11's address-hunting pattern.

### 20.5 Artifacts

- `tools/dqk-native-control-route.ps1` — new script, this round's native-DQK differential-control route
  (adapted from `cok-m4-memory-signature-route.ps1`; see the script's own header comment for the
  boot/journal-protection machinery it reuses verbatim).
- `packages/engine/src/loaders/dqkProtection.ts` — `journalParagraphFor` gained a bounded (edit-distance
  ≤ 1, adjacent-transposition-tolerant) fallback heading match, fixing a genuine `DQK.EXE`-own typo
  ("DIETIES" vs. journal "Deities") that would otherwise hard-fail any boot route landing on that specific
  protection question. `packages/engine/test/dqkProtection.test.ts` — 2 new tests for this fallback (the
  positive case and a "does not over-match" guard). Both files are this round's only `packages/engine/**`
  changes; `pnpm -r exec tsc --noEmit` clean, full engine vitest suite (149 files / 1761 tests) green.
- `build/dqk-native-control/` — scratch copy of the untouched retail DQK dir this round's live runs
  actually booted against (git-ignored; the real shared-tree `The Dark Queen of Krynn/` source dir was
  never booted against directly and is confirmed unchanged by `git status`/`git diff`).
- `build/dqk-native-control-run{1..7}/` — this round's 7 live-run artifact directories (screenshots,
  `report.json`, debugger console snapshots; all git-ignored, not committed).
- `build/dqk_journal.txt` — one line corrected (a PDF-extraction artifact, "DAR UEEN" → "DARK QUEEN"; this
  file is git-ignored scratch data, not shipped content).
- No `build/cok-on-dqk-m4fidelity/**` or other shipped build-output changes this round — the §20.4(b)-2
  remap experiment is deliberately left unimplemented, per §20.1's own "not yet proven" gap.

## 21. Round 13 — the §20.4(b)-2 remap experiment IMPLEMENTED and statically verified; the one permitted
live confirmation boot was WEDGED by a harness argument-passing bug before it ever reached the test,
per this round's own "at most one boot" rule the result stays genuinely UNTESTED, not confirmed or
refuted (static implementation + 1 inconclusive DOSBox-X boot, 2026-07-19)

**Task:** run the falsification experiment §20.4(b)-2 specced but round 12 explicitly declined to
implement — remap CoK's ported GEO/ECL area ids off DQK's native-occupied id space (preserving internal
NEWECL/GOTO cross-references), rebuild, verify statically via Unicorn first, then use the project's
single DOSBox-X slot for exactly one confirmation boot to see whether the round-11/12 combat-init crash
stops firing at the remapped id. At most one boot; report honestly, do not re-litigate §20.4's decision
memo.

### 21.1 Implementation — a general, corpus-verified static remap, not a one-off id swap

New module `packages/engine/src/loaders/eclAreaIdRemap.ts` (`findReachableNewEclImmediateSites`,
`remapEclBlockAreaIds`): walks a Gen1 ECL block's own control flow from all 5 header entry points
(`vmRun1`/`searchLocation`/`preCampCheck`/`campInterrupted`/`eclInitialEntry`), following `GOTO`/`GOSUB`
jump targets and `ON_GOTO`/`ON_GOSUB` target lists, and collects every **immediate-form** `NEWECL`
operand (opcode `0x20`, code `0x00`) it can statically reach. Two things this walk deliberately does
**not** do, both confirmed against the real corpus, not assumed: (1) it does not terminate on `GOTO`
itself — this VM dialect's `COMPARE; IF_xx; GOTO` idiom means a `GOTO` is often conditionally skipped, so
its own linear fallthrough is live too (an early draft that broke on `GOTO` like `EXIT` undercounted 28
real sites down to 4); (2) it does not follow **word-kind** operands generically as jump targets — one
early draft did, and it produced a bogus "NEWECL 19493" finding in CoK `ECL1.DAX` block 16 that turned
out to be a legitimate **dynamic** `NEWECL 0x4c25` (code `0x01`, referencing a runtime VM variable, not a
literal area id at all) — only `GOTO`/`GOSUB`/`ON_GOTO`/`ON_GOSUB`'s own genuine jump-target operands are
followed. Scanning every real `ECL1-3.DAX` block confirms **exactly 28 static, immediate `NEWECL`
cross-references** across CoK's 22 ported ECL source areas, all targeting real ported ids, zero garbage
— locked in as a regression test (`packages/engine/test/eclAreaIdRemap.test.ts`, 8 tests). Block 16's one
known dynamic `NEWECL 0x4c25` is left deliberately untouched (a disclosed limitation, not a silent drop).

`buildDqkGame.ts` gained a new `DqkGameBuildOptions.idOffset` option, wired through both
`buildDqkGameData` and `buildDqkGameDataMulti`. The multi-disk path required a real fix mid-development:
the first draft computed "already-ported ids" **per disk**, which silently missed **cross-disk** `NEWECL`
references (e.g. disk 1's `ECL1.DAX` block 18 references disk 2's area 80 — a per-disk-scoped remap
leaves that reference unshifted while shifting the id it points at, breaking the area transition). Fixed
by decoding all disks first (unshifted), computing **one global ported-id set across every disk**, and
applying a single shared remap function uniformly — caught by a failing test before it ever reached a
build (`buildDqkGameMulti.test.ts`'s new `idOffset` describe block, 2 tests, checks raw byte offsets via
`findReachableNewEclImmediateSites` on the pre-shift source blocks rather than comparing disassembly
instruction order, which doesn't correspond 1:1 across a multi-root BFS). `tools/build-dqk-dir.mts`
gained a `--dqk-id-offset N` CLI flag (default 0, a strict no-op — verified byte-identical to omitting
it).

**Offset chosen: +100.** Native DQK GEO/ECL ids max out at 67 (§20.1's own table); every ported CoK id
shifts into 116-199, clear of native occupancy and well under the 0-255 ceiling both the `NEWECL`
immediate-byte form and `patchDqkSaveResumeArea`'s save-resume area-id byte enforce.

**Gates:** `pnpm -r exec tsc --noEmit` clean across the whole repo. Full engine vitest suite green (1772
of 1773; the 1 failure is a pre-existing, confirmed-unrelated flaky timeout on a Gateway `TITLE.DAX` test
that passes cleanly in isolation — not touched by this round's changes). New/changed test files:
`eclAreaIdRemap.test.ts` (new, 8/8), `buildDqkGameMulti.test.ts` (+2 tests, 7/7), `buildDqkGame.test.ts`
(regression-free, 2/2) — re-verified together as a final check before writing this section, 17/17 pass.

### 21.2 Rebuild + static verification — both PASSED cleanly

Rebuilt with:
```
npx tsx tools/build-dqk-dir.mts \
  --dqk "The Dark Queen of Krynn" --src "Champions of Krynn" --target cok \
  --out build/cok-on-dqk-m4fidelity-remap \
  --save "The Dark Queen of Krynn" --save-area 134 --save-ecl-member 134 --save-dungeon \
  --bypass-protection --dqk-id-offset 100
```
Output manifest: 15 maps, 22 scripts, 57 monsters, 15 playable areas — identical counts to the
unshifted `cok-on-dqk-m4fidelity` build, confirming pure renumbering with no content loss. (Area 34, the
crash trigger, is now area 134.)

Static verification via `tools/unicorn_dqk_trace.py` through the same proven boot→load→journal-answer
route used to confirm the §8 GEO-header fix: the remapped build's resource-load chain (`DISK3\ECL.glb`,
`DISK3\GEO.glb`, 3×`DISK2\8x8db.tlb`, 1×`DISK2\back.tlb`, 5×`DISK3\CBODY.tlb`, 33 total INT21/3D opens
across 25M traced instructions, all 22 fake keys consumed) is **byte-for-byte the same clean,
non-looping open pattern** already proven correct — no runaway reopen-loop "DISK READ ERROR" signature
appears. This is exactly the "didn't break what already worked" gate the task asked for before spending
the DOSBox-X slot, and it passed.

### 21.3 The one permitted live confirmation boot — WEDGED before the test point by a harness bug, not
by DQK behavior

`Get-Process dosbox-x` confirmed empty before launch. Ran the already-proven
`cok-m4-memory-signature-route.ps1` against the remapped build, with the movement override matching the
exact known 2-key crash trigger (`14,10`→`15,10` facing E):

```powershell
pwsh -NoProfile -File tools/cok-m4-memory-signature-route.ps1 -MountDir "build/cok-on-dqk-m4fidelity-remap" `
  -OutDir "build/cok-m4-remap-confirm-run1" -MovementKeys @('right','up') *> build/cok-m4-remap-confirm-run1-console.log
```

The route reached and correctly re-proved phases 1-6 (launch-menu click, ESC intro-skip, Load Saved
Game, roster matching the known-good roster, main menu) but then **threw before the journal-word
protection step ever resolved**: `journal prompt unsolved/low-confidence: JOURNAL, PAGE (12); WHAT IS
WORD # 3 AFTER THE HEADING; MAGIC; ENTER`. This is well upstream of the area-34/134 dungeon-resume and
combat-trigger steps this boot was meant to test — the confirmation walk never happened.

**Root cause (found, not guessed):** `Solve-Protection`'s deterministic answer lookup
(`tools/cok-m4-memory-signature-route.ps1:318`) gates on `Test-Path $JournalTxt`, and the console log's
own message — `no journal text at up` — shows `$JournalTxt` resolved to the literal string `"up"` instead
of its default path (`build/dqk_journal.txt`, which exists and is correct — confirmed present throughout).
This is a PowerShell argument-passing bug in this round's own invocation, not a script defect and not a
DQK behavior: `-MovementKeys @('right','up')`, written on an *outer* PowerShell command line and handed
to a *child* `pwsh -File ...` process, gets expanded by PowerShell's own array-to-argv conversion into two
separate bare tokens (`right`, `up`) rather than staying one array value. The `-File` parameter binder
consumed `right` for `-MovementKeys` but left `up` as a stray token, which bound **positionally** into the
next unbound parameter in declaration order — `$JournalTxt` (3rd declared parameter) — silently
overwriting its default path with the string `"up"`. The script's own doc-comment example
(`-MovementKeys right,up`, comma-form, no array-literal syntax) avoids this entirely; this round's
invocation didn't match it. `add_combatant_to_active_roster`'s signature was found and armed
mid-boot (per the console log) exactly as in prior successful rounds, confirming the harness and binary
signatures themselves are fine — this was purely a CLI-argument mistake in how this round's boot was
launched.

**Per the task's explicit "do at most this ONE DOSBox-X boot for this specific test" instruction, no
second boot was attempted**, even though the failure mode is well-understood and trivially fixable (use
`-MovementKeys right,up`, matching the script's own documented form). `Get-Process dosbox-x` confirmed
empty again immediately after (the route's own error handling tore down the DOSBox-X process cleanly;
no orphaned `dosbox-x.exe`).

### 21.4 Result: UNTESTED this round — theory neither confirmed nor refuted

The id-collision remap is **fully implemented, statically verified, and ready to test** — but the actual
falsification boot (does the round-11/12 stack-buffer-overflow crash still fire at remapped area 134)
**did not run**, owing to a mechanical CLI mistake in this round's own invocation, not any DQK.EXE
behavior or content-port defect. This is a genuinely different outcome than either "confirmed" or
"refuted": round 12's own decision memo (§20.4, paths a/b/c) stands exactly where round 12 left it,
un-relitigated, and this round adds no new evidence either way on the causal question. **Do not check off
the ROADMAP Wave-2 CoK M4 item** — nothing about this round demonstrates the crash is fixed.

What IS new and durable from this round: a working, tested, general id-remap mechanism (not scoped to
area 34 specifically — any future id-collision, including the still-untested 50/66, ports through the
same `--dqk-id-offset` flag), and a precise, corrected repro command for whoever runs the next boot:

```powershell
pwsh -NoProfile -File tools/cok-m4-memory-signature-route.ps1 -MountDir "build/cok-on-dqk-m4fidelity-remap" `
  -OutDir "build/cok-m4-remap-confirm-run2" -MovementKeys right,up
```

**Recommendation for the next round (not decided here):** re-run exactly the above corrected command as
the very next DOSBox-X slot use for this item — it is the same cheap, low-risk, already-vetted experiment
§20.4(b)-2 specced, now blocked on nothing except actually running it correctly.

### 21.5 Artifacts

- `packages/engine/src/loaders/eclAreaIdRemap.ts` — new module, `findReachableNewEclImmediateSites` +
  `remapEclBlockAreaIds`.
- `packages/engine/src/loaders/buildDqkGame.ts` — new `DqkGameBuildOptions.idOffset`, global (not
  per-disk) ported-id-set computation in `buildDqkGameDataMulti`.
- `packages/engine/src/index.ts` — new exports.
- `packages/engine/test/eclAreaIdRemap.test.ts` — new, 8 tests.
- `packages/engine/test/buildDqkGameMulti.test.ts` — +2 tests (idOffset describe block).
- `tools/build-dqk-dir.mts` — new `--dqk-id-offset` CLI flag.
- `build/cok-on-dqk-m4fidelity-remap/` — the remapped build (git-ignored, not committed).
- `build/cok-m4-remap-confirm-run1/` — this round's single, wedged live-boot artifact directory
  (screenshots, debugger console snapshots, memory dump; git-ignored, not committed). No `report.json`
  was produced — the route threw before reaching that step.
- `dosbox-x.exe` confirmed empty both before and after this round's one boot.

## 22. Round 14 — the round-13 CLI bug is fixed (confirmed) but BOTH of this round's 2 permitted
DOSBox-X boots are wedged by a second, different, unrelated harness bug (a vision-capture parsing
regression on the journal-word retry path); the id-collision-remap causal question is STILL UNTESTED
after 14 rounds — neither confirmed nor refuted (static verification only carried over from round 13;
2 live DOSBox-X boots, both inconclusive for infra reasons, 2026-07-19)

**Task:** this is a completion round, not a new investigation — re-run round 13's own corrected repro
command (`-MovementKeys right,up`, comma form, avoiding round 13's outer/child `pwsh -File`
argv-splitting bug) as the very next use of the project's single DOSBox-X slot, see whether the
round-11/12 combat-init "DISK READ ERROR" crash still fires at the remapped area id (134), and report
plainly. Budget: at most 2 live boots (1 to confirm the CLI fix, 1 buffer for a genuine transient
issue); if both fail for infra reasons unrelated to the actual test, say so and stop rather than keep
retrying.

### 22.1 Pre-flight — confirmed script parameters and build directory before running anything

Read `tools/cok-m4-memory-signature-route.ps1`'s actual `param()` block rather than trusting the task
text verbatim: `-MountDir` and `-OutDir` are both `[Parameter(Mandatory)][string]`, `-MovementKeys` is
`[string[]]` defaulting to `@('right','up')`, `-JournalTxt`/`-CodesTxt` default to
`build/dqk_journal.txt`/`build/dqk_codes.txt`. The task's command matches this exactly. Confirmed
`build/cok-on-dqk-m4fidelity-remap/` exists (round 13's remapped build, `DISK1-3`, `DQK.EXE`, `SAVE/`,
`SAVGAMA.QSV`, `dosbox.conf` all present) — no rebuild needed. `Get-Process dosbox-x` confirmed empty
(try/catch form; the plain `-ErrorAction SilentlyContinue` form spuriously returned a non-zero tool
exit code with no output in this shell, a harness quirk of the invocation, not a process-list finding —
worth remembering for future rounds: use the try/catch form for a trustworthy read). `git status
--short` was clean before starting.

### 22.2 Boot 1 of 2 (`build/cok-m4-remap-confirm-run2`) — round 13's CLI bug is CONFIRMED FIXED, but a
DIFFERENT bug wedges the run at the same journal-word step

```
pwsh -NoProfile -File tools/cok-m4-memory-signature-route.ps1 -MountDir "build/cok-on-dqk-m4fidelity-remap" `
  -OutDir "build/cok-m4-remap-confirm-run2" -MovementKeys right,up
```

Evidence the CLI fix worked: the console log shows no `"no journal text at ..."` message this time (the
exact symptom of round 13's bug); `$JournalTxt` resolved correctly to its real default path throughout.
The route re-proved phases 1-6 cleanly (launch click, ESC intro-skip, `LOAD FROM WHERE? TDQK`, `LOAD
WHICH GAME: A`, roster matching the known-good roster — `SIR DRYDEN`/`JORIS THE WISE`/`LENDUINA`/
`NEACHIL`/`ALARIC THE BOLD`/`MAIGUREIGNE`), reached the journal-word protection prompt (`JOURNAL, PAGE
(10); WHAT IS WORD # 7 AFTER THE HEADING; DAMAGE`), and this time `Solve-Protection` genuinely
succeeded on the first read: `journal solved -> 'point'`.

It then wedged one step later, for a **new, different reason**: `Type-WordAndConfirm` typed `point` and
re-shot the screen; the on-screen echo didn't visibly confirm it (a pre-existing, already-documented
round-9 soft-warning path — non-fatal by design, `Enter` is pressed regardless). But after `Enter`, the
re-shot screen (`08-after-journal-01`) showed the **same, unchanged** journal prompt text
(`JOURNAL[,;] PAGE (10); WHAT IS WORD # 7 AFTER THE HEADING; DAMAGE`) rather than advancing into the
dungeon — the route's own loop (line ~804) correctly re-entered the protection-prompt branch a second
time. On this second pass, both the primary read and the one allowed retry read came back not as plain
OCR text but as a **raw, still-JSON-wrapped string** —
`{"screen":"dos_prompt","game_title":null,"visible_text":"JOURNAL...DAMAGE"; "looks_crashed": false,
"note": "..."}` — literally the whole vision-model response object, not just its `visible_text` field.
`Solve-Protection`'s `(?i)JOURNAL.*?ENTER` extraction regex requires the text to end in `ENTER` (part of
the original on-screen prompt's own trailing word); the malformed JSON blob doesn't contain that
substring, so the extraction silently no-ops, `dqk-protection-solve.mts` is handed the whole garbled
blob as its `--prompt` argument, fails to parse a single answer word from it, and `Solve-Protection`
correctly returns `$null` both times. The script's own line-819 guard fired exactly as designed
(`throw "journal prompt unsolved/low-confidence: $promptText"`) — this is the intended fail-closed
behavior for genuinely unsolvable input, not a new defect in the throw path itself. `Get-Process
dosbox-x` confirmed empty again immediately after (clean teardown on the exception).

This is a **different bug from round 13's**, in a different function (`Invoke-Vision`, imported from
`tools/dosbot/lib.ps1`, feeding `Shoot`) rather than PowerShell's own argv handling, and it fired on the
protection-prompt *retry* path specifically (the same `Shoot` calls earlier in the identical run —
`02-skip01`, `05-after-slotA`, `06-after-B` — all returned clean plain text, not JSON). Root cause not
pinned further this round (out of this task's narrow scope, which is to run the test and report, not
fix new harness defects) — flagged as a new, reproducible gotcha for whoever next touches this script.

### 22.3 Boot 2 of 2 (`build/cok-m4-remap-confirm-run3`, the buffer attempt) — byte-for-byte IDENTICAL
failure, same page/word/heading, same answer, same JSON-wrapped retry bug

Re-ran the exact same command (`-OutDir build/cok-m4-remap-confirm-run3`) as the permitted buffer
attempt for what looked, going in, like it could be a one-off transient vision-capture hiccup.
`Get-Process dosbox-x` confirmed empty before launch. The result was **byte-for-byte identical** to
attempt 1 in every particular that matters: same journal prompt (`PAGE (10); WORD # 7; ... DAMAGE`),
same deterministic answer (`point`), same non-advancing post-Enter screen, same malformed
JSON-wrapped vision text on both the primary and retry reads of the second pass, same line-819 throw.
This rules out "one-off random hiccup" as the explanation — within this exact run configuration the
failure is deterministic/reproducible (2/2), though still a harness/vision-pipeline defect unrelated to
`DQK.EXE` or the content port, and definitely unrelated to the id-remap question this round exists to
test. `Get-Process dosbox-x` confirmed empty again immediately after.

Per the task's explicit 2-boot cap and its explicit instruction to stop and report honestly rather than
keep retrying when both boots fail for infra reasons unrelated to the actual test, **no third attempt
was made.**

### 22.4 Result: STILL genuinely UNTESTED — neither confirmed nor refuted, now after 14 rounds

Two different, unrelated harness bugs have now independently prevented this specific falsification test
from ever reaching its test point (the area-134 dungeon walk and the `14,10`→`15,10` movement that
triggers the crash under the OLD id): round 13's CLI argv-splitting bug (confirmed fixed this round),
and this round's `Invoke-Vision` JSON-wrapping bug on the journal-word retry path (new, not yet fixed).
**Neither boot reached the actual test** — no evidence was gathered this round on whether the
id-collision remap stops the round-11/12 crash. Round 12's decision memo (§20.4, paths a/b/c) stands
exactly where round 12 left it, un-relitigated. **Do not check off the ROADMAP Wave-2 CoK M4 item** —
this round adds no new evidence either way on the causal question.

What IS new and durable from this round: (1) firm confirmation the round-13 CLI fix works as documented
— reproduced 2/2, no recurrence of the `"no journal text at ..."`/`$JournalTxt`-clobbered symptom; (2) a
newly discovered, independently reproducible (2/2) `Invoke-Vision` parsing defect specific to the
protection-prompt retry path, worth fixing before the next attempt at this specific test since it now
blocks the test twice in a row at the identical step; (3) an open, unresolved observation that after
typing `point` and pressing Enter, the journal prompt did not visibly advance — ambiguous between "the
game rejected the answer and re-prompted" and "the keystroke/Enter pipeline dropped the submission",
not settled by available evidence and not pursued further given the 2-boot budget.

**Recommendation for the next round (not decided here):** before spending the DOSBox-X slot again on
this specific test, fix the `Invoke-Vision`/`Shoot` JSON-wrapping regression on the retry path in
`tools/dosbot/lib.ps1` (or add a defensive JSON-vs-plain-text unwrap in `Shoot` itself), since it now has
a 2/2 reproduction rate at exactly the step this test needs to pass through. The remap build, the static
verification, and the corrected `-MovementKeys right,up` invocation form all remain valid and untouched
by this round's findings — only the vision-capture retry path needs a fix before the falsification boot
can actually happen.

### 22.5 Artifacts

- `build/cok-m4-remap-confirm-run2/` — boot 1 of 2 this round (screenshots, `MEMDUMP.BIN`, debugger
  console snapshots; git-ignored, not committed). No `report.json` — threw before that step.
- `build/cok-m4-remap-confirm-run2-console.log` — full console transcript of boot 1 (git-ignored).
- `build/cok-m4-remap-confirm-run3/` — boot 2 of 2, the buffer attempt (same shape as run2;
  git-ignored, not committed).
- `build/cok-m4-remap-confirm-run3-console.log` — full console transcript of boot 2 (git-ignored).
- No source files changed this round (a run/report round, not an implementation round).
- `dosbox-x.exe` confirmed empty before and after both boots this round.

## 23. Round 15 (FINAL) — `Invoke-Vision`'s JSON-wrapping regression FIXED (root-caused and repaired
generally, not special-cased); the falsification boot FINALLY completed; DEFINITIVE RESULT: the crash
STILL FIRES at the remapped area id — the id-collision theory is REFUTED, closing this 15-round chain
(1 harness fix + 2 live DOSBox-X boots, 2026-07-19)

**Task:** this round's charter had two parts — (1) fix round 14's `Invoke-Vision` JSON-wrapping
regression in `tools/dosbot/lib.ps1` properly (it is a shared helper used by 5+ scripts project-wide,
not just this route), then (2) spend up to 3 live boots actually completing the round-13/14 falsification
test: does the round-11/12 "MONSTERS ATTACK!"/"DISK READ ERROR" combat-init crash still fire once CoK's
ported area 34 is remapped to 134 (clear of DQK's native 0-67 id space)? Report the definitive result and
close the chain — no round 16 in this vein.

### 23.1 Root cause of `Invoke-Vision`'s JSON-wrapping bug — found and fixed generally

`Invoke-Vision` (`tools/dosbot/lib.ps1:507`, pre-fix) asked the vision model for a single JSON object,
then extracted it with a **greedy regex spanning the FIRST `{` to the LAST `}` in the whole response**:
`[regex]::Match($txt, '(?s)\{.*\}')`. This is fine for a clean single-object reply, but breaks the moment
the model emits **more than one JSON object back-to-back** — a known LLM degenerate-repetition failure
mode, and one this project's own live evidence (round 14, §22.2/§22.3, 2/2 reproduction rate specifically
on the protection-prompt *retry* path, where the model is fed a second screenshot of a visually
near-identical, unchanged screen) matches closely. When that happens, the greedy match spans both
objects, the combined text has two JSON root values and is not valid JSON, `ConvertFrom-Json` throws
(caught), and the **old fallback branch then dumped the ENTIRE raw response — which still looks like
JSON — into `visible_text`**, handing every caller a JSON-shaped blob masquerading as plain OCR text.
That is exactly round 14's observed symptom ("literally the whole vision-model response object, not just
its `visible_text` field") and exactly why it broke `Solve-Protection`'s `(?i)JOURNAL.*?ENTER` regex (a
malformed/duplicated JSON blob has no reason to end in the literal word `ENTER`).

**Fix, in `tools/dosbot/lib.ps1`:**
1. New `Get-FirstJsonObject` helper — a string-aware, brace-depth-counting scan (tracks `"..."` string
   state and backslash escapes so braces inside string values don't confuse the depth count) that returns
   just the **first syntactically-complete top-level `{...}` object**, parsed via `ConvertFrom-Json`, and
   ignores anything the model appends afterward — including a second, third, etc. repeated copy of the
   same object. This directly fixes the degenerate-repetition case: normal (single-object) replies parse
   identically to before; repeated/concatenated replies now parse cleanly from the first copy instead of
   failing outright.
2. If even the first candidate object fails to parse (genuinely malformed JSON, not just "more than one
   object"), `Invoke-Vision` now tries to **salvage just the `visible_text` field's own string value**
   via a targeted regex (`"visible_text"\s*:\s*"((?:[^"\\]|\\.)*)"`) before falling all the way back to
   dumping the raw response — so even a badly-malformed reply still yields plain text to the caller
   instead of a JSON-shaped blob wherever it can be recovered.
3. The final fallback (raw-text dump, `note="unparsed"`) is kept as a last resort for genuinely
   non-JSON-shaped responses (e.g. a plain error string with no braces at all) — unchanged behavior for
   that case, verified via a synthetic no-braces test.

**This is a general fix, not scoped to the journal-word route.** `Invoke-Vision` is called from
`tools/dosbot/boot-test.ps1`, `capture-ingame.ps1`, `drive-test.ps1`, `e62b-explore.ps1`,
`run-boot-tests.ps1`, and every `cok-m4-*-route.ps1`/`dqk-native-control-route.ps1` script — all of them
consume only `.screen`, `.game_title`, `.visible_text`, `.looks_crashed`, `.note` off the returned object,
none of which changed shape or name. Grepped for every caller and confirmed none depends on the old
greedy-regex extraction's specific failure behavior.

**Verification (no live DOSBox-X needed for this part):**
- `[System.Management.Automation.Language.Parser]::ParseFile` confirms `tools/dosbot/lib.ps1` and all 9
  scripts that call `Invoke-Vision`/use `-MovementKeys`-style array params still parse with zero syntax
  errors after the edit.
- Synthetic unit-style checks run directly against `Get-FirstJsonObject` (no test framework exists for
  this pure-PowerShell helper, so verified by direct invocation, matching this doc's own standing
  practice of "manually confirm the output shape by code inspection" when no test harness exists):
  - A clean single JSON object parses identically to the old code (`visible_text` extracted correctly).
  - **The exact round-14 failure shape** — the same object repeated twice back-to-back, invalid as a
    whole — is confirmed to make the **old** greedy-regex approach fail to parse (`ConvertFrom-Json`
    throws), reproducing the bug's precondition directly; the **new** `Get-FirstJsonObject` correctly
    extracts the first copy's `visible_text` cleanly.
  - A clean object followed by trailing prose containing a stray unrelated `{brace}` (a second way the
    old greedy regex could break) also now parses correctly.
  - A response with no `{` at all still correctly falls through with no exception (final-fallback path
    intact).
- Confirmed all 5 `tools/dosbot/*.ps1` callers only ever read `.screen`/`.game_title`/`.visible_text`/
  `.looks_crashed`/`.note` off the returned object — zero blast radius from the internal fix.
- No `packages/engine/**` files touched this round, so the `pnpm -r exec tsc --noEmit`/vitest gates in
  the task's own instructions don't apply; the PowerShell-parse check above is this round's equivalent
  sanity gate for `tools/dosbot/lib.ps1`.

### 23.2 Boot 1 of 3 — reached the dungeon and the journal solve cleanly (fix confirmed working live),
but a SECOND, unrelated CLI-argument bug (not `Invoke-Vision`) wedged Phase 7

`Get-Process dosbox-x` confirmed empty. First attempt used the exact corrected form both round 13 and
round 14 recommended, invoked directly:
```
pwsh -NoProfile -File tools/cok-m4-memory-signature-route.ps1 -MountDir "build/cok-on-dqk-m4fidelity-remap" -OutDir "build/cok-m4-remap-confirm-run4" -MovementKeys right,up
```
(A zeroth attempt before this, using an *absolute* `-MountDir`, errored at `Resolve-Path` before
`dosbox-x.exe` was ever launched — a plain invocation mistake on this round's part, not a live boot, not
counted against the 3-boot budget; the script joins `-MountDir` onto the repo root itself, so it must be
repo-relative, matching every prior round's own working invocations.)

This boot **proved the `Invoke-Vision` fix works live**: the journal-word prompt (`PAGE 14, WORD #7,
RANGERS`) solved cleanly to `'They'` on both the first pass and a second pass through the protection loop
(the route's own designed re-entry when the on-screen echo doesn't visibly confirm — see round 9's
softened warning, §9 of this doc), with **no JSON-wrapped blob at any point in either pass** — the
regression is gone. The route reached real gameplay (`AREA CAST VIEW ENCAMP SEARCH LOOK INV`, position
`7,13`) cleanly.

It then threw one phase later, in Phase 7 (movement), for a **new, different, and unrelated** reason:
`dosbox_gamelink.py` rejected the key `"right,up"` as a single unsupported key name. Root cause: this
round's own outer invocation was itself issued from a *nested* PowerShell layer (this session's own tool
shell invoking `pwsh -File ...`), and in that specific two-level configuration, PowerShell's native-command
argument tokenizer passed the unquoted `right,up` through as **one single argv string** (comma preserved,
not split into two elements) rather than the two-element array the script's own `[string[]]$MovementKeys`
parameter expects — a related but **distinct** flavor of the same general "array arguments don't survive
an outer/child `pwsh -File` boundary reliably" hazard rounds 13 and 14 already both hit in their own ways
(round 13: stray positional token clobbering `$JournalTxt`; round 14 never reached this phase at all).
Confirmed via a battery of synthetic tests against a throwaway `param([string[]]$X)` script covering five
different invocation forms (bare comma, individually-quoted comma list, array variable, space-separated,
explicit `@('a','b')` literal) — **all five** produced the same single/truncated-element failure in this
specific nested-invocation configuration, ruling out "just use a different comma syntax" as a fix this
time. `Get-Process dosbox-x` confirmed empty immediately after (clean teardown on the exception).

**Fix used (not a script change — an invocation-technique change):** wrote a one-line wrapper `.ps1`
(`build/cok-m4-remap-confirm-run5-wrapper.ps1`, git-ignored scratch, not committed) that calls the route
script via the `&` call operator with a literal `@('right', 'up')` array **inside PowerShell source code**,
never crossing an OS-level argv boundary for the array value at all. Verified against the same synthetic
throwaway script first (`count=2`, `[0]='right'`, `[1]='up'` — correct) before spending a live boot on it.
This is the general, reusable fix for this class of problem for any future round: **when driving one of
these route scripts' array parameters from a nested PowerShell invocation, use a call-operator wrapper
script with a literal array, not a CLI string form** — no CLI string form (comma, quoted-comma, array
variable, or array literal typed at the command line) survives this specific nested-shell configuration
reliably. This is a distinct, narrower gotcha than `Invoke-Vision`'s bug and was not touched inside
`tools/dosbot/lib.ps1` or `tools/cok-m4-memory-signature-route.ps1` themselves — both scripts are correct
as written; it is purely an invocation-layer issue.

### 23.3 Boot 2 of 3 — the actual falsification test COMPLETED. DEFINITIVE RESULT: the crash STILL FIRES.

`Get-Process dosbox-x` confirmed empty. Ran via the wrapper:
```
& tools/cok-m4-memory-signature-route.ps1 -MountDir "build/cok-on-dqk-m4fidelity-remap" -OutDir "build/cok-m4-remap-confirm-run5" -MovementKeys @('right', 'up')
```
**Exit code 0 — the full route ran to completion for the first time in this entire 15-round chain.**
Phases 1-6 reproduced cleanly (launch click, ESC-skip, `LOAD FROM WHERE? TDQK`, `LOAD WHICH GAME: A`,
roster matching the known-good roster). The journal-word prompt this run (`PAGE 3, WORD #5, ABILITY
SCORES`) solved to `'randomly'` and needed three passes through the protection-confirmation loop before
the screen visibly advanced to the dungeon (all three passes returned clean plain OCR text — the
`Invoke-Vision` fix held under repeated real-world retries, not just the synthetic tests). The route then
executed the exact two-key movement sequence (`right`, `up`) that is this whole investigation's own
established crash trigger (the remapped-build equivalent of the original `14,10→15,10 facing E` at area 34,
now area 134) and captured the result on-screen:

**`MONSTERS ATTACK!` followed immediately by `DISK READ ERROR`** — visually confirmed pixel-for-pixel from
the raw screenshot (`build/cok-m4-remap-confirm-run5/10-final-no-hit.png`), not just OCR text, at party
position `7,13`. This is the **identical crash signature** documented since round 9 (§9.2) and mechanistically
pinned since round 12 (§12, a local stack-buffer overflow in a DQK.EXE combat-setup routine driven by a
bogus per-record chain-count byte at offset `0x19F`) — now reproduced **at the remapped id**, where round
12's id-collision theory predicted it should NOT reproduce if that theory were the actual cause.

The memory-signature search (identical technique to rounds 9-14) again found `add_combatant_to_active_
roster` resident at a stable live address (`2C23:0006`, phys `0x2C236`) across all three dump attempts,
and again found zero live matches for `combat_setup_entry`'s own file signature — consistent with every
prior round's finding that `combat_setup_entry` is very likely the wrong routine to breakpoint on for this
specific crash (round 10's conclusion, unchanged and not re-litigated further here). No new breakpoint hit
this round either — that finding is orthogonal to and does not affect this round's own definitive result,
which comes from the on-screen crash signature itself, not from a breakpoint hit.

`Get-Process dosbox-x` confirmed empty immediately after (clean teardown; the route's own final-state
capture ran without incident since exit code was 0, not an exception path).

### 23.4 DEFINITIVE RESULT — the id-collision theory is REFUTED

**The crash is NOT resolved by remapping CoK's ported area ids off DQK's native-occupied id space.**
Round 12's leading candidate mechanism (§20.1: ported area 34 collides byte-for-byte with a real, native
DQK dungeon at the same id, and DQK.EXE's combat-init code plausibly consults a compiled-in, area-id-keyed
table sized for its own native 20/47-area roster that a collision could resolve against the wrong,
differently-shaped ported resource) is **cleanly falsified** by this round's live evidence: with area 34
renumbered to 134 — a value that is not merely out of DQK's native range but not close to any native id at
all (native ids top out at 67; 134 is nearly double that) — the exact same crash signature fires at the
exact same trigger under the exact same conditions. If a native-id collision were the actual cause, moving
the id 100 units away from every native occupant should have prevented it; it did not.

This closes the open question round 12 explicitly left unresolved ("(a) whether the id-collision theory is
the actual cause, or coincidental" — §20.3): **it was coincidental, not causal.** The crash mechanism
itself (§12's stack-buffer overflow, driven by a bogus `0x19F` chain-count byte read from an id-keyed,
RLE-decompressed resource record) remains exactly as pinned in round 12 — this round changes nothing about
*how* the crash happens, only rules out *why the specific id 34 triggers it*. The true root cause of why
that resource record decodes to a bogus chain-count for CoK's ported content (regardless of which numeric
id it's filed under) remains genuinely UNLOCATED after 15 rounds.

### 23.5 What is now known for certain, after 15 rounds (closing summary of the entire chain)

- **The crash mechanism** is precisely pinned (round 12, reconfirmed unchanged this round): a genuine
  local stack-buffer overflow inside a DQK.EXE combat-setup routine, triggered when byte offset `0x19F` of
  an RLE-decompressed, id-keyed resource record is read as a "chained sub-record count" and is ~114-115
  instead of small/sane, overrunning a 648-byte local buffer by roughly 3x and corrupting the routine's own
  saved return address. This would corrupt DQK's real call stack in an unmodified DOSBox session too, not
  just this project's trace harness.
- **Ruled out as the cause, cumulatively across all 15 rounds:** CoK's own ECL script content for area
  34/134 (rounds 10/11 — zero wandering-encounter opcodes exist in it, confirmed both by live x86
  opcode-execution watching and static ECL bytecode enumeration); a missing/miscoded GEO header field
  (round 11 — the 6 reserved bytes are fully accounted for as wall/backdrop set ids only); porting CoK's
  own native `RandCom` mechanism (it lives in `GAME.OVR`, never invoked under unmodified `DQK.EXE`); a
  near/far calling-convention mismatch (round 12); and — **new, this round** — the ported area id
  colliding with a native DQK area id (round 12's leading candidate, now cleanly refuted by direct live
  test).
- **`combat_setup_entry` (the routine this whole investigation was originally anchored to, round 6) is
  proven, via four independently-agreeing live memory-signature dumps across rounds 9/10 and this round,
  to be never resident at all during this crash.** It is very likely simply the wrong routine to have
  anchored the investigation to from the start — a genuine, disclosed limitation of the original approach,
  not fixed this round (out of scope — the task's own charter was to run the falsification test, not
  restart the address hunt).
- **Still genuinely UNLOCATED after 15 rounds:** the actual DQK.EXE-internal code path/table that produces
  a bogus `0x19F` chain-count byte for CoK's ported combat/monster resource record, for reasons that are
  now proven NOT to be id-collision-related. No round has produced a live, firing breakpoint at the actual
  fault site.

### 23.6 Final recommendation — this specific live-confirmation approach is CLOSED; hand off to round
12's decision memo paths (a)/(c)

Per this round's own explicit charter (task item 5), **this specific investigation chain (live DOSBox-X
confirmation boots chasing this one crash) is now CLOSED and should not be reopened in the same vein.**
15 rounds have exhausted the productive live-testing angles available to this harness: the crash mechanism
is fully pinned at the instruction/variable level, the leading id-collision hypothesis has been directly,
cleanly tested and refuted, and the remaining gap (the exact table/code path feeding the bogus `0x19F`
byte) has no further static or live lead queued anywhere in this doc's 15 rounds of history to chase next
— continuing would mean guessing a 4th unranked candidate with no evidence pointing at it, which this
project's own standing practice (§18.5/§18.6, restated every round since) explicitly rules out.

Per round 12's own decision memo (§20.4, still the operative framework — its causal-link gap is now
resolved by this round in the "not the id" direction, which does not change which of its two paths remain
live), the only two paths forward for CoK M4 / Goal 1 are now:

**(a) A targeted `DQK.EXE` binary patch.** Requires **explicit user sign-off before ever being attempted**
per this project's standing rule (unchanged from round 12) — not attempted, not further specced this
round, and the exact instruction/table to patch is still not pinned to a byte-level address (the next
concrete step, if this path is chosen, would be resuming the address-hunt this doc's rounds 6-11 already
invested heavily in, now knowing definitively that the search should NOT be scoped around area-id lookup
tables).

**(c) Accept as a known, isolated, non-content gap for packaging purposes.** This round's result
strengthens the case already building since round 12: the CoK content port itself (ECL/GEO/MONCHA bytes)
is proven well-formed, well-tested, and NOT the fault (rounds 10-12, reconfirmed both statically and live
this round); the crash is proven to be a `DQK.EXE`-internal mechanism that this specific ported content
happens to trigger, for reasons now narrowed but not fully pinned. "Passed with a known, isolated,
non-content issue" is a defensible, honest characterization for packaging/status purposes — CoK M4's
actual deliverable-relevant question ("did the content port put the wrong bytes in the file") has a clean,
well-evidenced NO across 15 rounds of investigation.

**A third path, explicitly out of this round's scope per the task's own instruction (not attempted, only
noted for whoever picks this up next):** if the Unicorn static tracer could be extended to simulate further
into the remapped build's own combat-init sequence than any prior round's traces reached, that could in
principle locate the actual `0x19F`-feeding code path without spending another DOSBox-X boot at all. This
is a legitimate, different confirmation *method* (static, not live) that a future round could pursue — but
it is a new investigation, not a continuation of this one, and is explicitly not attempted here.

**Recommendation for the user/planner (a call, not a decision made here, consistent with every prior
round's own practice on this question):** close out CoK M4's ROADMAP item as **"BLOCKED — root cause
pinned to a DQK.EXE-internal mechanism, content port itself proven correct; id-collision theory tested and
refuted; open on a genuine DQK.EXE code-path gap, not a content-port defect"**, and route any further work
on it through path (a) (requires explicit sign-off) or path (c) (accept and move on) rather than another
live-testing round in this same vein.

### 23.7 Artifacts

- `tools/dosbot/lib.ps1` — `Invoke-Vision` rewritten to use a new `Get-FirstJsonObject` (string-aware,
  brace-depth-counting first-object extractor) instead of a greedy whole-response regex, plus a
  `visible_text`-salvage regex fallback before the final raw-text-dump fallback. General fix, all 5
  existing callers unaffected in output shape.
- `build/cok-m4-remap-confirm-run4/` — boot 1 of 3 this round (reached the dungeon/journal solve cleanly,
  proving the `Invoke-Vision` fix live; wedged in Phase 7 on the separate CLI-array-splitting issue;
  git-ignored, not committed).
- `build/cok-m4-remap-confirm-run4-console.log` — full console transcript of boot 1 (git-ignored).
- `build/cok-m4-remap-confirm-run5-wrapper.ps1` — one-line call-operator wrapper used to drive boot 2
  around the CLI-array-splitting issue (git-ignored scratch, not committed).
- `build/cok-m4-remap-confirm-run5/` — boot 2 of 3, the completed falsification test (screenshots
  including `10-final-no-hit.png` showing `MONSTERS ATTACK!`/`DISK READ ERROR`, `MEMDUMP.BIN` ×3,
  `report.json`, debugger console snapshots; git-ignored, not committed).
- `build/cok-m4-remap-confirm-run5-console.log` — full console transcript of boot 2 (git-ignored).
- No `packages/engine/**` changes this round (the fix is entirely in `tools/dosbot/lib.ps1`, a PowerShell
  automation helper outside the engine package).

---

## 24. Round 16 — the no-patch WORKAROUND round: arithmetic pinned to the exact read, §13.4 CORRECTED (the "0x81de stale pointer" is really a composite of two ECL-interpreter bytes), and the MONCHA data-side fix EMPIRICALLY REFUTED (static Unicorn only, no DOSBox-X, 2026-07-22)

**Premise (the user's explicit decision, 2026-07-22, overrides every prior "path (a) binary patch"
option in §18/§20/§23):** the user does **NOT** want a permanent on-disk `DQK.EXE` patch — "that goes
against the goal of this engine ... replace it with the engine and just use the game's assets." They
asked for "a way around it." So this round's charter was: (1) pin the count arithmetic exactly; (2)
find a **data-side** reshape of the ported CoK content that keeps DQK's buggy combatant-setup routine
within bounds while staying faithful; only if data-side *provably* cannot work, (3) fall back to a
clearly-labelled, removable, runtime-only in-memory mitigation (never touching `DQK.EXE` on disk) and
flag it for user review. Static-only this round — the DOSBox-X slot was never taken (it was not needed:
the decisive test is a cheap Unicorn re-trace, see §24.3).

### 24.1 The count arithmetic, pinned to the exact instruction (task item 1 — DONE)

New harness probe `_dqk_chain_count_read_text` (watch case `2177:2665`, canonical, = live phys
`0x033dd5`, the exact `mov word ptr [bp-0x282], 0x19e` that §12.5 identified as the cursor-init right
before the two chain-count bytes are read). It dumps the routine's 0x288-byte staging buffer
(`ss:[bp-0x276]`) at that instant. Live result on the crash route (`build/cok-on-dqk-m4fidelity`,
`right`,`up` from the shipped save):

```
CHAIN1[staging+0x19E]=0   CHAIN2[staging+0x19F]=115 (0x73)
```

This confirms §12.5/§12.6 to the byte: the runaway loop count is `staging[0x19F] = 115`. The buffer is
`0x288` (648) bytes, the record header is `0x19E` (414) bytes, each chained sub-record copied is 17
bytes. The **safe bound** the buffer implies: the 17-byte copies start at the `0x1A0` region, so to stay
inside 648 bytes the count must be `≤ (0x288 − 0x1A0)/17 ≈ 13`. 115 overruns by ~3×, exactly as §12.6
computed. (Empirical cross-check of the safe envelope from DQK's OWN shipped `MONCHA.GLB`: of its 98
members, only 4 even reach offset 0x19E/0x19F with a non-trivial value — m90/m96/m97/m98 — which strongly
implies those members are simply **not the ones this routine consumes**, since a native 76/100/184 there
would overflow identically; i.e. the routine's small-count assumption is real, and native content
satisfies it by construction.)

### 24.2 §13.4 CORRECTED: the id `0x81de` is not a stale DGROUP pointer — it is `(byte[ae6b]<<8)|byte[b186]`, two bytes written by an ECL-stream interpreter

Widening the caller chain past §13's ambiguous backward scan (the caller-identity dump in the same new
probe reads the routine's OWN live frame — `ss:[bp+2]/[bp+4]` — which is unambiguous once inside the
routine, unlike §13.2's pre-`push bp` guess) plus a forward `--wide-disasm-at` of the encounter driver
pins the full chain, all live-confirmed:

- Combat-setup routine `2177:257C` is called by the wrapper at canonical `25a4:0095` (`035bca lcall
  0x3177,0x257c`), which forwards its own `[bp+6]` = **`0x81de`** as the id.
- That wrapper is reached from the encounter driver in segment `2033`, which pushes **`[0xb2e8]`** as the
  id argument (`031639 push word [0xb2e8]` before the `call` chain).
- `[0xb2e8]` is set at area-load time to `(byte[0xae6b] << 8) | byte[0xb186]` (the resource-setup wrapper
  at `035aa6`–`035b2e` writes this same composite into five globals: `b1c8/b2e8/b298/af41/af43`).
- Reading the two bytes live at the crash: **`byte[0xae6b] = 0x81`, `byte[0xb186] = 0xde` → `0x81de`.**
- Those two bytes are written by a **bytecode interpreter at `2033:0343`** that walks the loaded ECL
  script stream at `[0xae5c:0xae5e] + [0xb7f9]` (the same `ae5c`/`b7f9` ECL stream base + cursor pair
  `dqk-qsv-save-transfer-consumers.md` documents), reading an opcode + operand bytes each iteration and
  storing them into per-combatant record fields — `b186` at `030373 mov [si-0x4e7b],al`, `ae6b` at
  `0303bb mov [si-0x5196],al`.

So §13.4's "`0x81de` is a stray/stale shop-dialogue string pointer" reading was a **coincidence of the
value happening to also index readable DGROUP text** — the value is genuinely *computed*, from the ECL
stream, not left over. This is a real correction to the 15-round record, recorded as such.

### 24.3 The MONCHA data-side fix — EMPIRICALLY REFUTED (decisive, cheap, no DOSBox-X)

The natural data-side hypothesis (the one §18.6/§20.4 sketched as "cap ported monster records"): the
bad `staging[0x19F]=115` byte comes from a ported `MONCHA.GLB` monster record, so reshaping that record
(or making the requested id resolve to a bounded one) would fix it. **This was tested directly and
refuted.**

Test (`scratchpad/make_test_moncha.mts`, using the shipped `decodeHlib`/`encodeHlibDataLibrary`): take
`cok-on-dqk-m4fidelity/DISK2/MONCHA.GLB`, **append a new member** that decompresses to a `0x1C0`-byte
all-zero record (so its bytes at 0x19E/0x19F are `0`), and **add an id-table entry `{areaId:0x81de →
that member}`**, so if DQK's loader honours the composite id it would resolve to a safe, bounded record.
Dropped into a scratch build (`build/cok-m4-workaround-test`, a copy of the m4fidelity build with only
`MONCHA.GLB` swapped), re-traced with the same `2177:2665` chain-count probe.

**Result: `CHAIN2[0x19F]` is STILL 115, byte-for-byte identical staging buffer.** The harness confirms
it loaded the modified file (`INT21/3D open DISK2\moncha.glb -> 7155 bytes`, up from the original 6695),
so this is not a stale-file artifact. Reshaping `MONCHA.GLB` changed the count by exactly nothing.

**What that proves:** the overflow count is **not sourced from any ported monster record**. The staging
buffer at the crash is not a decompressed `MONCHA` member at all — its content is leftover/garbage
(stack-spill words `0x35a4`/`0x422e`/`0x81de` in the header region, ASCII fragments like `"strts to
cough"` past 0x190), consistent with the composite id `0x81de` failing to resolve to a real member so the
buffer is never freshly written with bounded data. **No reshaping of the ported monster/encounter DATA
can bound this count** — the theory that a content clamp/split would fix it is refuted.

### 24.4 Root cause, restated after this round; why NO fix was implemented

Synthesising §24.2 + §24.3 with §19.3's standing hypothesis: the crash is the downstream symptom of an
**ECL-interpretation defect** — DQK's VM, walking CoK's ported ECL stream, computes a **bogus monster id
(`0x81de`)**; that id resolves to no `MONCHA` member; the combatant-setup routine's staging buffer is
left with garbage whose byte `0x19F` (115) drives the unbounded 17-byte copy loop into the return
address. This is precisely the project's known **hardest-phase "ECL opcode/operand drift" problem**
(roadmap step 6), not a bounded content-reshape. Two consequences the user needs for the decision:

1. **The preferred data-side fix (reshape ported monster/encounter records) is refuted** — it cannot
   work, because the count does not come from that data (§24.3).
2. **A count-clamp runtime shim would not be faithful.** Even if a removable in-memory poke bounded the
   count (converting the crash into a non-crash), the encounter is still built from a **bogus, garbage id**
   — it would spawn an empty/garbage fight, not CoK's intended encounter. So the shim is not a "way around
   it" that preserves gameplay; it only downgrades a crash to a wrong encounter. The genuine fix is
   ECL-side (make the VM compute the correct id), which is out of this bounded round's scope and is a
   multi-round investigation in its own right.

Per this doc's standing "UNLOCATED beats invention / zero forced fixes" rule, **no code or data fix was
implemented this round.** Implementing the refuted MONCHA clamp, or a shim that produces a garbage
encounter, would both be forced non-fixes. The honest deliverable is the refutation + the §24.2
correction + a precise decision memo.

### 24.5 Decision memo for the user (a call, not decided here)

- **(preferred, but blocked) Data-side reshape of monster/encounter records:** REFUTED this round — the
  overflow count is not in that data.
- **(the real data-side fix) Correct the ECL so DQK's VM computes a sane monster id here:** this is the
  faithful, no-patch, assets-only fix the user's philosophy wants — but it is the roadmap's hardest phase
  (ECL operand/opcode drift), unpinned to the exact operand this round, and a genuine multi-round task.
  Recommended next step if pursued: trace the `2033:0343` ECL interpreter's cursor (`[0xb7f9]`) against
  CoK's ported area-34 ECL bytes to find where the walk desyncs and lands on the two bytes `0x81`/`0xde`.
- **(fallback, flagged for review — NOT implemented) A removable, runtime-only in-memory bounds clamp:**
  technically possible without touching `DQK.EXE` on disk (a DEBUG-style poke from the launcher/DOSBox
  autoexec that caps the `staging[0x19F]`-derived loop counter read at ~`033df7`), leaving the on-disk
  EXE byte-identical. **But it is not faithful** (§24.4 item 2: it yields a garbage encounter, not CoK's),
  so it is offered only as a crash-avoidance stopgap, explicitly flagged for the user to decide on — it is
  **not** presented as the settled solution.
- **(status quo) Accept as a known, isolated gap** (the standing §23.6 recommendation, unchanged): the
  content port's bytes are proven well-formed; the crash is a `DQK.EXE`-internal ECL-interpretation
  symptom this ported content triggers.

No live DOSBox-X verification was run this round: there is no working fix to verify, and the crash itself
is already reproduced live 4+ times in prior rounds (§9/§14/§23) — a redundant reproduction would add
nothing. The static Unicorn refutation (§24.3) is decisive on its own and cost no slot.

### 24.6 Artifacts

- `tools/unicorn_dqk_trace.py` — new watch cases `2177:2665` (`_dqk_chain_count_read_text`, the staging /
  chain-count / caller-identity probe) added to `_exec_watch_extra_text`. Additive; `--smoke-test` still
  `RESULT: PASS`; no existing watch case or CLI flag changed.
- `scratchpad/make_test_moncha.mts` — the one-shot MONCHA-modification test harness (scratch, not
  committed).
- `build/cok-m4-workaround-test/` — scratch build with the modified `MONCHA.GLB` (git-ignored, not
  committed); its `INT21/3D open ... 7155 bytes` line proves the modified file was actually loaded.
- Trace logs `scratchpad/workaround-r{1..7}-trace.log`, `workaround-test1-trace.log` (git-ignored scratch).
- No `packages/engine/**`, no `build/cok-dqk-release/**`, and no game-data files were modified this round.
  `tools/cok_m4_static_verify.mts --build build/cok-dqk-release --src "Champions of Krynn" --area 34`
  re-run at the end: **ALL CHECKS PASSED** (baseline undisturbed).
- `dosbox-x.exe` confirmed empty before and after both live boots this round (a third, zeroth attempt
  errored at path resolution before ever launching `dosbox-x.exe` and is not counted).

## 25. Round 17 — the ECL dialect DESYNC found and FIXED in the port pipeline (Gen2 SETUP_MONSTER is 4-operand; GOTO-trampoline transcode, 98 sites), and the byte-identical crash re-fires under a fully frame-correct stream — the strongest confirmation yet that the smash is engine-internal (2026-07-23)

Bounded objective this round (parent dispatch): find the exact desync between DQK's ECL interpreter
and CoK's ported area-34 ECL "that produces bogus monster id 0x81de"; if it is a port-pipeline
translation bug, fix it **in the pipeline generally** — the user's standing constraint applies in
full: **no binary patches to `DQK.EXE`, ever**; the faithful fix is correcting ported data.

Verdict up front, in three parts:

1. **The desync is REAL, located, and classified (b) — genuine dialect drift.** DQK Gen2 parses
   `0x0C SETUP_MONSTER` with **four** operand frames; CoK Gen1-long emits **three**. This is now
   fixed generally in the port pipeline (98 sites across the CoK corpus), statically verified, and
   proven executing in the post-fix trace.
2. **The "bogus id 0x81de" premise is refuted as bogus**: `0x81de` is area 34's header ptr2 (the
   SearchLocation chain vaddr) and appears **unchanged** at the combat-setup call in the post-fix
   trace — it is legitimate interpreter state passed natively too (§24.4's two-composite-bytes
   correction stands), not a product of the frame drift.
3. **The crash is NOT fixed by the drift fix — and that is itself the decisive result.** With a
   fully frame-correct stream, the run crashes at the **byte-identical** signature
   (`UC_ERR_INSN_INVALID` at `614d:72e8`), at instr 21,996,861 vs the pre-fix 21,996,828 — a +33
   delta exactly accounted for by the two trampoline `GOTO` dispatches on the executed path, with
   everything else instruction-identical. Third independent line of evidence (after §23.6's
   remap refutation and §24.3's MONCHA refutation) that the overflow is `DQK.EXE`-internal.

### 25.1 The desync itself: DQK Gen2 `0x0C SETUP_MONSTER` takes FOUR operand frames

- **Handler proof (static disasm, live-canonicalized):** the SETUP_MONSTER body (live canonical
  `25a4:2db1`, overlay body file base `0x402C0`; dispatch-table stub `lcall 1d99:132d`) begins
  `mov al,4; push ax; lcall 2033:0013` — an explicit **count=4** call into the shared Gen2 operand
  parser at `2033:0013`. Operand sinks: op1→`[0xbee8]`, op2→`es:[b20f+0x38]`, op3→`[0xb1ca]`,
  op4→`[0xc2e7]` (op4's downstream consumer remains honestly unlocated).
- **Family corroboration:** this matches the whole 1991+ short-form family — `ECL_GEN1_SHORT`
  carries `0x0c: 4` from DoK's own `GAME.OVR` handler proof. Gen2 inherited the 4-frame shape;
  CoK's 1990 Gen1-long dialect predates it.
- **Native-corpus corroboration (the "fake EXIT" artifact):** under the old 3-frame reading,
  native DQK area 65 showed `SETUP_MONSTER #66,#0,#255` followed by an "EXIT" — that byte is
  actually the first byte of the 4th operand frame; the corrected 4-frame decode lets the stream
  continue coherently into real retail content (and exposed two more zero-operand proofs, §25.2).
- **What it did at the crash site:** area 34's `0x0C` at vaddr `0x834f` is followed by the pair
  `3a 0d` (`DELAY`, `APPROACH`). Ported verbatim as 3 frames, DQK's parser swallowed `3a 0d 00` as
  a bogus 4th frame (type `0x3a`), desyncing the stream — §24.4's "composite of two
  ECL-interpreter bytes" observation is now fully explained at the instruction level.

### 25.2 Bonus Gen2 dialect proofs found en route (all handler-level)

- **`0x22 PARTY_SURPRISE` = zero operands.** Handler `2033:13c4`: `inc [0xb7f9]`, clears the four
  condition-flag bytes at `[0xb2f5]`, prompt helper `lcall 0bdb:0424`, result into
  `[0xb2f5]`/`[0xb2f6]` — no operand-parser call anywhere. Mirrors DoK's Gen1-short handler.
- **`0x23 SURPRISE` = zero operands and script-TERMINAL.** Handler `2033:1402` pushes compiled-in
  constants (`0x16,0x26,0x11,1`) and tail-calls the op-`0x00` EXIT handler at `2033:01ae`.
- **Invalid opcodes HANG the Gen2 VM — they are NOT silent no-op skips.** Dispatcher `2033:0d1e`
  range-checks `cmp ax,0x41; jbe`; above `0x41` it jumps to `0xf45` (`retf`) **without advancing
  `[0xb7f9]`** — infinite refetch of the same byte. (Corrects the earlier "silent no-op" phrasing
  in the dispatch-table research; the "scripts run natively" conclusion is unaffected, but any
  fix design that pads with invalid bytes is dead on arrival — this constraint shaped §25.4.)

### 25.3 Full drifted-surface census of the ported CoK corpus (reachable-instruction walk)

A reachability walker (roots = the 5 header pointers; follows `GOTO`/`GOSUB` word targets and
`ON_GOTO`/`ON_GOSUB` target lists plus linear fallthrough; stops at EXIT/STOP/bad/truncated) over
all ported CoK areas found exactly three drifted opcodes with reachable sites:

| opcode | Gen1-long frames | Gen2 frames | reachable sites | translation |
| --- | --- | --- | --- | --- |
| `0x0C SETUP_MONSTER` | 3 | 4 | **88** | keep 3, append imm-`0` 4th (DoK-family analog) |
| `0x21 LOAD_FILES` | 3 | 2 | **10** | keep 2, drop the 3rd (Gen1 3rd is a constant `#255`/`#127` with **no Gen2 consumer**; verbatim it decodes as `00 xx` = EXIT, silently truncating every init script) |
| `0x2C PARLAY` | 6 | 4 | **2** (area 33 `@0x85c7`, area 48 `@0x902e`) | **honestly untranslated** — no proven Gen1→Gen2 semantic operand mapping yet |

`0x1d`/`0x22`/`0x23` drift on paper but have **zero** reachable sites in the CoK corpus.

### 25.4 The fix: byte-position-preserving GOTO-trampoline transcode, in the pipeline generally

Because every existing vaddr (header pointers, GOTO/ON_GOTO targets) must survive unchanged and
invalid-byte padding hangs the VM (§25.2), each drifted reachable site is rewritten in place as
`01 01 lo hi` (a 4-byte GOTO — the smallest drifted site is 7 bytes) + zero-fill (unreachable),
jumping to a stub **appended after the block's original end**: original opcode + kept operand
frames verbatim + appended frames + `GOTO` back to the vaddr after the original site. Appending
shifts nothing; the block only grows at the end.

Implementation (all general, source-dialect-aware — DoK's short dialect is already 4-op `0x0c`
and computes **no** drift there):

- `packages/engine/src/loaders/eclEncode.ts` — `transcodeGen1EclBlockToGen2()` (+
  `PROVEN_FRAME_TRANSLATIONS`, the reachability walker, guards, and a per-block
  `Gen2TranscodeReport`); `portGen1EclArchiveToGen2()` now transcodes every entry and accepts
  `sourceDialect`/`onTranscode`.
- `packages/engine/src/ecl/disassemble.ts` — `ECL_GEN2.wordSetOverrides` now
  `{ 0x0c: 4, 0x1d: 0, 0x21: 2, 0x22: 0, 0x23: 0, 0x2c: 4 }` with the §25.1/§25.2 proofs inline.
- `packages/engine/src/loaders/buildDqkGame.ts` + `tools/build-dqk-dir.mts` — `eclSourceDialect`
  plumbed end-to-end (DoK passes `ECL_GEN1_SHORT`); manifest gains an `eclTranscode` census.
- `tools/cok_m4_static_verify.mts` — check #1 is now *"ported ECL.GLB member === transcoded source
  DAX block"* (supersedes the bare `slice(2)` identity), with `--ecl-dialect`.
- `packages/engine/src/ecl/program.ts` — `runEclChain` gains a `maxAutoResumes` cap (default
  2000): the corrected `0x22` decode exposed DQK's debug-bootstrap block 2 as a genuinely
  interactive prompt loop that re-prompts forever under a constant auto-input (previously masked
  by a garbage decode halting early), which OOM'd the suite.
- Tests: synthetic trampoline byte-exactness + corpus pins (88/10/2 exactly, untranslated exactly
  `33:0x2c@0x85c7` + `48:0x2c@0x902e`) in `eclEncode.test.ts`; per-game dialect + transcode
  identity in `buildDqkGameMulti.test.ts`.

Gates: full engine suite green (1875/1876; the 1 = a foreign concurrent-edit transient that passes
standalone), repo typecheck clean, **both** builds rebuilt with their exact documented commands —
build output: `ECL Gen2 frame transcode: 98 trampoline(s) (op 0xc: 88, op 0x21: 10); 2 reachable
drifted site(s) left untranslated` — and `tools/cok_m4_static_verify.mts` reports **ALL CHECKS
PASSED** on both `build/cok-dqk-release` and `build/cok-on-dqk-m4fidelity` (area 34: 12
trampolines, 0 untranslated).

### 25.5 The decisive post-fix re-trace: trampoline PROVEN executing; crash signature IDENTICAL

The §10.2 crash-route command was re-run verbatim against the rebuilt
`build/cok-on-dqk-m4fidelity/DQK.EXE`, augmented with the Gen2 parser probe
(`--watch-exec 0x2033:0x0013`), the combat-setup call-site probe (`--watch-exec 0x25a4:0x018a`),
and opcode-fetch watches for `0x0c`/`0x3a`/`0x0d` (log:
session-scratchpad `desync-r3-postfix-trace.log`; 26/26 fake keys consumed, same route):

- **The trampoline executes.** The first (and only) `0x0c` fetch is at stub vaddr **`0x996c`** —
  inside the appended region, not at the original site `0x834f`. The fetched stream is
  `0c | 01 79 7f | 00 01 | 01 79 7f | 00 00 | 01 01 58 83`: opcode + the 3 kept original frames +
  the appended imm-`0` 4th frame + `GOTO 0x8358` (= the vaddr immediately after the original
  site, i.e. straight onto the formerly-swallowed `DELAY`).
- **The parser consumes exactly 4 sane frames.** At the combat-setup call, `[0xb7f9] = 0x9977` =
  `0x996c` + 1 + 11 — positioned precisely on the GOTO-back; op4 arrives as type `0x00` value
  `0x00` instead of the swallowed `3a 0d` garbage.
- **The id at the combat-setup call is still `0x81de`** (`[0xb2e8]`), unchanged by the fix —
  confirming §24.4: it is interpreter state (header ptr2), not drift fallout.
- **The crash re-fires byte-identically:** `UC_ERR_INSN_INVALID` at `614d:72e8` (the §12.6
  literal-`ff ff` fill popped as the smashed return address), instr **21,996,861** vs pre-fix
  **21,996,828**. The +33 delta matches the exactly two trampolines on the executed path (opcode
  histogram: `0x0c`×1, `0x21`×1 — each ≈16 extra dispatch instructions); the deterministic run is
  otherwise instruction-identical, including the 115 iterations of the §12 staging copy loop at
  `2177:27cf`.
- `DELAY`/`APPROACH` never execute on this route — the crash fires *inside* the SETUP_MONSTER
  handler before the next fetch. Their return path is byte-proven (the `GOTO 0x8358` is in the
  fetched stream) and covered by the synthetic tests; the identical route reaching combat at
  +33 instr also proves the earlier trampolines were behavior-preserving.

### 25.6 Standing recommendation (unchanged decision space, stronger evidence)

The drift fix is a genuine correctness fix and stays regardless: without it, **every** ported
Gen1-long SETUP_MONSTER desyncs the Gen2 stream and every LOAD_FILES silently truncates its init
script — area 34's crash was merely where the desync happened to be observable. But the smash
itself now has three independent refutations of a data-side cause (§23.6 remap, §24.3 MONCHA,
§25.5 frame-correct stream), and the §24.5 options are unchanged and remain a **user decision**:
(a) a `DQK.EXE` binary patch — **forbidden by standing constraint**; (fallback) the runtime-only
clamp — flagged not-faithful; (c) accept as a known, isolated gap. The most useful *bounded*
research step left, still no-patch: trace a **native** DQK encounter through the same
`2177:257c` staging path to characterize what count value the engine expects at
`staging[0x19F]` and where a retail encounter keeps it in range — i.e. pin the engine's own
invariant, which would settle whether *any* data shape can satisfy it for the ported encounter.

### 25.7 Artifacts

- Code: the §25.4 file list (engine + tools + tests), committed this round.
- Trace log: session-scratchpad `desync-r3-postfix-trace.log` (git-ignored scratch).
- Scratch scanners (repo `scratchpad/`, untracked, not committed): `scan_cok_drift.mts`,
  `scan_native_2c21.mts`, `check_area34.mts`, `scan_setupmon.mts`, `dump_native_headers.mts`.
- No live DOSBox-X run this round: two background lanes were active and the crash is already
  live-reproduced 4+ times (§9/§14/§23); the deterministic Unicorn comparison (pre/post-fix
  instruction-identical) is decisive on its own. A live boot of the transcoded build remains
  queued for the emulator lane as routine confirmation.

## 26. Round 18 — §25.6 attempted: the LIVE half is blocked by an unchanged story gate, but the STATIC half answers the question in the negative — `MONCHA.GLB` is not where the engine's `staging[0x19F]` invariant lives, and the ported archive cannot reach that offset at all (static only, no DOSBox-X, no patch, 2026-08-19)

Charter: §25.6's standing recommendation — *"trace a **native** DQK encounter through the same
`2177:257c` staging path to characterize what count value the engine expects at `staging[0x19F]`
and where a retail encounter keeps it in range — i.e. pin the engine's own invariant, which would
settle whether *any* data shape can satisfy it for the ported encounter."* Standing constraints in
full: no `DQK.EXE` patch, game folders read-only.

### 26.1 The live half is still blocked, and the block is a property of the shipped saves — stated plainly, not worked around

§20.2 (runs 6–8) established that DQK's own fresh-start save opens on the Palanthas town hub behind a
mandatory Chapter-1 Palace-visit gate, so a native wandering encounter is not reachable by "walk a few
steps". This round re-checked whether the GOG release ships any *later* save that would skip the gate —
the cheap way to unblock the trace. It does not:

| Candidate | Bytes | `decodeDqkSaveResume` |
| --- | --- | --- |
| `The Dark Queen of Krynn/SAVGAMA.QSV` | 7965 | `resumeArea 0`, party 6, dungeon 1 |
| `The Dark Queen of Krynn/SAVE/SAVGAMA.QSV` | 7965 | same file, same decode |
| `The Dark Queen of Krynn/SAVE_KN/` | — | one 47-byte `read.txt`, no save |
| `The Dark Queen of Krynn/cloud_saves/SAVE/` | — | empty |

Both saves resume to **area 0** — the pre-Palace start. So the live trace still needs either a scripted
Palace quest route or a hand-made post-Palace save, and §20.2's own verdict stands: *"patching the fresh
save is not an authentic substitute."* No live boot was attempted this round; `dosbox-x.exe` was never
launched. This is reported as an unchanged blocker rather than re-attempted in the same vein.

> **WITHDRAWN 2026-08-20 — see §29.** Everything below §26.2 and §26.3 was measured on records
> decompressed from the member's byte 0. Each `MONCHA.GLB` member actually begins with a 2-byte
> big-endian uncompressed length (DQK's own loader reads it at file `0x3570C`), so those decodes were
> out of phase and the numbers they produced do not describe the format. Concretely: the "`H = 0x19E`
> fits **0 of 98**" headline is wrong — `0x19E` is exactly where a correctly-decoded record keeps its
> own two tail-array counts — and the native length range "88..533, median 321" is really 416..598,
> median 436. The *method* (positive control first, then a null, then the negative) is why this is a
> short correction rather than a silent one; it was applied faithfully to the wrong input. §29 has the
> corrected model.

### 26.2 The static substitute, which answers §25.6's question anyway — in the negative

The question does not actually require a live encounter to make progress on, because the routine's own
record model is falsifiable against the shipped archive. §12.5's decode says the record it walks is
`<header of 0x19E bytes> <u8 count1> <u8 count2> <(count1+count2) × 17-byte sub-records>`. If that model
describes a real `MONCHA.GLB` member, then for the true header size `H` a member's own decompressed
length must satisfy `len == H + 2 + 17*(rec[H] + rec[H+1])`. Sweeping **every** candidate `H` over all 98
members of native `DISK2/MONCHA.GLB`:

```
members = 98        (member[0] is the id table, excluded)
H = 0x19E fits      0 / 98 members
NULL: 67 (member, offset) fits corpus-wide  =>  0.7 fitting offsets per member by chance,
      and the fits that do occur are overwhelmingly the trivial H = len-2 with both counts 0
```

**`H = 0x19E` fits nothing.** The sweep is not a predicate that cannot fire: it counts a synthetic
control record built to the model, and on the real corpus it fits three members at `H = 0x15B`.

Weak form of the same test (drop the "record ends exactly after the chain" requirement; ask only whether
a member could *hold* its own chain, `len ≥ 0x1A0 + 17*(c1+c2)`): only **12 of 98** members are even long
enough (≥ 416 bytes) to contain the two bytes, **six** of those carry a non-zero value there, and **four
of the six demand 24, 100, 105 and 195 nodes** — past the `(0x288 − 0x1A0)/17 ≈ 13` bound §24.1 computed,
i.e. native content at this offset would overrun the 648-byte staging buffer exactly as the ported run
does. (Two would fit, counts 1 and 11; that is why the strong form above, not this one, is what rules the
offset out.)

And a type check that points the same way: **none of the 12 members long enough to carry those bytes is a
monster.** They are type `0x0` (×7), `0x1`, `0x2` (×2) and `0xc` — the character-shaped records the "MON +
CHA" archive also holds. Every type-`0x8` monster record is 88–406 bytes, i.e. short of offset 414.

> **Population correction, §27.4 (same day):** this sweep pools all 98 members. The `'moncha1'` name
> resolves to **bank 1**, i.e. the eight ids 112..119, so that is the population the routine actually
> selects. The measured result is unchanged (still 0 exact fits at `H = 0x19E`, and unchanged under the
> `256−c` RLE variant as well), but read §27.4 for what the reaching members turn out to be.

**Conclusion, and it sharpens §13.3 rather than contradicting it.** §13.3's live probe is good evidence
about the *name string* passed at the resource-load call (`ds:0x5ffd = 'moncha1'`). But no member of the
archive that name addresses has the shape the routine then interprets. So the answer to §25.6's question,
as far as `MONCHA.GLB` can answer it, is: **the engine's small-count invariant is not maintained by this
file.** Either the routine reads a different resource family, or — consistent with §24.3's refutation,
which found the staging buffer holding stack residue (`0x35a4`/`0x422e`/`"strts to cough"`) rather than
record data — the buffer is simply never populated on this path and 115 is residue in the native case too.
That removes the last data-side hypothesis §25.6 was holding open: **no reshaping of ported content can
satisfy an invariant that the shipped native content does not satisfy either.**

### 26.3 A NEW port gap found en route, and this one is on our side of the line

Measuring the ported archive with the same census turned up something not previously recorded anywhere:

```
build/cok-on-dqk-m4fidelity/DISK2/MONCHA.GLB   57 members, decompressed length 108 for EVERY member
The Dark Queen of Krynn/DISK2/MONCHA.GLB       98 members, 88..533 bytes, median 321
                                               (type-0x8 monsters alone: 88..406, median 218)
```

`encodeDqkMonsterRecord` emits a fixed `DQK_RECORD_LEN = 108`, so the ported archive is uniform where the
native one is not — and **306 bytes short of the chain-count offset**, which means that even a *correct*
id resolving to a ported member would leave `staging[0x19E/0x19F]` holding whatever the stack already had.
That is a third, independent reason the ported path cannot reach a bounded count, and unlike §23.6's remap
and §24.3's MONCHA reshape it is a defect in **our encoder**, not in `DQK.EXE`.

Whether the truncation loses real content is a separate question with a real answer: **27 of the 37 native
type-`0x8` monster members carry non-zero bytes past offset 108.** No fix is implemented here, because what
those bytes mean is not established and emitting zero padding to a native-looking length would be invention,
not fidelity (this doc's standing "UNLOCATED beats invention" rule). It is recorded as a bounded, concrete
follow-up with a starting point:

**Lead (n = 5, no null yet — a lead, not a finding).** Only **5 of 98** native members satisfy
`sniffDqkMonster` on the canonical fixed-offset path; the other 93 reach the decoder through
`reconstructDqkRecord`'s ability-block search, so raw offsets past 108 are only comparable across those 5.
Within them, offset **112** is non-zero in all five and tracks average hit points against the hit-dice byte:

| member | HD | byte 112 | 4.5 × HD |
| --- | --- | --- | --- |
| BLACK PUDDING | 10 | 45 | 45 |
| BORING BEETLE | 5 | 23 | 22.5 |
| SHAMBLING MOUND | 10 | 49 | 45 |
| ETTIN | 10 | 45 | 45 |
| DISIR | 5 | 23 | 22.5 |

That is the same shape as the DoK rolled-HP byte located the same day (`monster.ts`, byte 108 — the value
`calc_battle_exp` multiplies its per-HP term against), which is why it is worth following; five members
with no null is not worth publishing as anything more than a direction.

### 26.4 Standing recommendation after this round

§25.6's decision space **narrows by one**. Its own framing — "would settle whether *any* data shape can
satisfy it for the ported encounter" — now has an answer for the `MONCHA` hypothesis: **no**, because the
shipped native archive does not satisfy it either. The remaining options are unchanged and remain a user
decision: (a) a `DQK.EXE` binary patch — **forbidden by standing constraint**; (b) the runtime-only clamp —
flagged not-faithful (§24.4); (c) accept as a known, isolated gap (the standing §23.6 recommendation).

The most useful bounded step left is no longer the native-encounter trace of §25.6 — that is gated behind
the Palace quest route (§26.1) and, per §26.2, would now be confirming a negative that the data already
gives. The better next targets, in order of cost:

1. **Identify what the `2177:257C` staging buffer is actually filled from**, given it is provably not a
   MONCHA member — i.e. follow the `lcall 0x2fc4,0x88` / `lcall 0x2fc4,0x130` resource-load pair to the
   physical bank it reads, statically, rather than trusting the `'moncha1'` name string alone.
2. **The §26.3 record-length gap**, which is actionable under the no-patch constraint because it is our
   own encoder — starting from the byte-112 lead and the 93/98 members that need `reconstructDqkRecord`.

### 26.5 Artifacts

- `packages/engine/test/monchaEncode.test.ts` — new describe "DQK MONCHA staging-buffer chain counts
  (§26)": the 108-byte ported-record assertion, the 0-of-98 sweep with both a synthetic and a real-corpus
  positive control, and the 12 / 6 / 2 weak-form counts. Proven able to fail by mutating the **module**
  constant `DQK_RECORD_LEN` 108 → 416 (2 tests red, restored immediately).
- Scratch censuses (repo `scratchpad/`, untracked, not committed): `moncha_stage_census.mts`,
  `moncha_tail_census.mts`, `moncha_tail_offsets.mts`, `moncha_tail_aligned.mts`,
  `chain_selfconsistency.mts`, `qsv_peek.mts`.
- No `DQK.EXE`, no game-data file, and no `build/**` artifact was modified. No DOSBox-X session was
  launched this round.

## 27. Round 19 — the `'moncha1'` resource name DECODED statically: it is `bank + "%s.glb"` with a two-tier id key `bank*100 + id`, and bank 1 is exactly the eight character-shaped records — which also corrects §26.2's population and finds a second port gap (static only, no DOSBox-X, no patch, 2026-08-19)

§26.4 named this round's target: *"follow the `lcall 0x2fc4,0x88` / `lcall 0x2fc4,0x130` resource-load
pair to the physical bank it reads, statically, rather than trusting the `'moncha1'` name string alone."*
Done, entirely from `DQK.EXE` bytes.

### 27.1 Address arithmetic, pinned rather than assumed

The plan's §12/§24 disassembly listings quote **live** segments (load-seg 0x1000), so `lcall 0x2fc4,0x88`
is canonical `1fc4:0088` — the same convention that makes `lcall 0x3177,0x257c` the canonical `2177:257c`
routine. Live phys → file offset for this overlay body is a constant `+0x19F0`, derived from the harness's
own `DQK_SAVE_TRANSFER_FILE_OFFSETS` anchor `(0x2177,0x2B46) → 0x035CA6` and then **verified against the
bytes**: `mov word ptr [bp-0x282], 0x19e` (`C7 86 7E FD 9E 01`, §24.1's cursor-init) occurs **exactly once**
in the whole 449,664-byte image, at file `0x357C5` — which is precisely where this mapping predicts
canonical `2177:2665` lands. So:

| canonical | live | file | what |
| --- | --- | --- | --- |
| `2177:2665` | `3177:2665` | `0x357C5` | §24.1 cursor-init, unique in the image |
| `1fc4:0088` | `2fc4:0088` | `0x316B8` | resource-load pair, first call |
| `1fc4:00c3` | `2fc4:00c3` | `0x316C3` | the id lookup this round decodes |
| `1fc4:0130` | `2fc4:0130` | `0x031760` | resource-load pair, second call |

DGROUP is likewise pinned rather than guessed: §13.3's live read `ds:0x5ffd = 'moncha1'` and the single
occurrence of that string at file `0x69A1D` give **DGROUP file base `0x63A20`** — which is exactly overlay
12's `code_start`, i.e. overlay 12 *is* the data segment. Every DGROUP offset below is `0x63A20 + X`.

### 27.2 What the two calls actually do

**`1fc4:0088` is not a loader at all** — it is a two-instruction setter:

```
0316b8  push bp | mov bp,sp | mov al,[bp+6] | mov byte [0x5eab],al | pop bp | retf
```

`ds:0x5eab` holds the ASCII byte `'1'` (0x31) in the shipped image. **`1fc4:0130` is the name resolver**,
and it reads the two DGROUP strings that sit either side of it:

```
ds:0x5eab = "1"          <- the disk/bank digit the setter above writes
ds:0x5eae = "%s.glb"     <- the filename format
ds:0x5ffd = "moncha1"    <- §13.3's live-probed family name
```

Its body (file `0x031760`): `strlen` the family name (`lcall 0xd7,0x257d`), require the **last character to
be a digit** `'0'..'9'` (`cmp es:[bx+si],0x30 / 0x39`), take `di = digit`, copy the name minus that digit
into a local, then `sprintf(local2, "%s.glb", local)` (`lcall 0x1d1b,0x3a`) and open it through
`lcall 0x117e,0x3f2`, passing `[0x5eab]` as the disk. So:

> **`"moncha1"` → base `"moncha"` + bank `1` → opens `MONCHA.GLB`, bank 1.**

§13.3's identification of the family is therefore **confirmed from the bytes**, not merely from a live
string read: the file really is `MONCHA.GLB`. What was not previously known is the *bank*, and the bank is
what makes the rest of this round work.

### 27.3 The id key is two-tier: raw id first, then `bank*100 + id`

The sibling routine at `1fc4:00c3` (file `0x316C3`) does the lookup, and its arithmetic is explicit:

```
0316cb  di = [bp+6]                      ; library handle
0316ce  push [0xacbc]                    ; the id byte, stashed by 1fc4:0130 from its [bp+0xE]
0316d3  lcall 0x193f,0x419               ; try the RAW id
0316e5  or si,si | jne ...               ; found -> done
0316e9  ax = [0xacba]                    ; the bank digit, stashed by 1fc4:0130 from the name's last char
0316ec  dx = 0x64                        ; 100
0316ef  mul dx
0316f1  add ax, [0xacbc]                 ; ax = bank*100 + id
0316f7  lcall 0x193f,0x419               ; try the BANKED id
```

**`key = bank * 100 + id`**, attempted only after the raw id misses. That is a falsifiable statement about
the shipped id table, and the shipped table agrees: native `MONCHA.GLB`'s 98 ids run **1..119** — 90 in
bank 0 (1..99) and **8 in bank 1 (112..119)**. A 100-wide bank with a two-tier fallback is exactly the id
space this table is laid out for.

### 27.4 Bank 1 is the character-shaped records — which corrects §26.2's population

Joining the id table to the member census (both shipped bytes, no emulation):

| id | member | decompressed len | type | `[0x19E]` | `[0x19F]` |
| --- | --- | --- | --- | --- | --- |
| 112 | 91 | 493 | 0x0 | 9 | 2 |
| 113 | 92 | 469 | 0x0 | 0 | 0 |
| 114 | 93 | 180 | 0x2 | — | — |
| 115 | 94 | 160 | 0x2 | — | — |
| 116 | 95 | 471 | 0x0 | 0 | 0 |
| 117 | 96 | 479 | 0x0 | 100 | 0 |
| 118 | 97 | 533 | 0x0 | 0 | 24 |
| 119 | 98 | 511 | 0x0 | 76 | 29 |

**Six of the eight bank-1 records reach the offset**, against **6 of the 90** bank-0 records — and the
bank-1 six are all type `0x0`, the character-shaped type, not type `0x08` monsters. So the records the
`'moncha1'` name actually addresses are precisely the long ones the `2177:257C` routine's `0x19E` header
size is sized for. That is a real correction to how §26.2 framed its own result: **§26.2 pooled all 98
members, and the population the name selects is the 8 in bank 1.** The measured facts do not change — the
exact-fit sweep is still `0` at `H = 0x19E`, on bank 1 as on the full corpus, under **both** RLE variants
(monchaRLE `257−c`: lengths 88..533, 12 reach, 0 fit; signedByteRLE `256−c`: 88..508, 9 reach, 0 fit, so
the negative does not rest on our choice of codec) — but "none of the members that reach the offset is a
monster" now reads as a *positive* identification of what they are instead of an oddity, and §26.2's
"either a different resource family, or never populated" collapses to the second branch: the family and
the file are right, and the layout question is about which record, not which file.

### 27.5 The second port gap: the ported archive has no bank-1 ids at all

| archive | members | id range | bank 0 | bank 1 |
| --- | --- | --- | --- | --- |
| `The Dark Queen of Krynn/DISK2/MONCHA.GLB` | 98 | 1..119 | 90 | **8** |
| `build/cok-on-dqk-m4fidelity/DISK2/MONCHA.GLB` | 57 | 0..62 | 57 | **0** |

The port emits one id per CoK monster, numbered from 0, so **every ported id is in bank 0 and a `'moncha1'`
request can never resolve against ported content** — the bank-1 half of the id space is simply absent. This
is a second structural gap alongside §26.3's 108-byte record length, and like that one it is on our side of
the line (`encodeMonchaArchive`'s id assignment, not `DQK.EXE`).

**What this is NOT.** It is not a claim that this causes the §12 crash. The id observed at the failing call
is `0x81de` = 33246, which is outside *every* bank and outside anything a `bank*100 + id` key can name, so
that request was already doomed before bank 1 mattered — §24.2's "the id is computed wrong by the ECL
interpreter" stands unchanged. What the two gaps establish is narrower and still useful: **even after the
id computation is fixed, ported content has neither a bank-1 id to resolve to nor a record long enough to
carry the bytes the routine reads.** Both would have to be addressed before a corrected id could produce a
bounded count, and neither was visible before this round.

No fix is implemented, for the same reason as §26.3: what a bank-1 record's 414-byte body means is not
established, and minting ids into a bank whose record shape we cannot fill would be invention.

### 27.7 The decompressor itself, disassembled — and a real (latent) codec bug it exposes on our side

The same `+0x19F0` mapping makes the RLE call in §12.5 (`lcall 0x10d7,0xa1c`, i.e. canonical
`00d7:0a1c`) reachable statically at file `0x3B8C`, and it is short enough to transcribe whole:

```
003b92  lds si,[bp+6]      ; source far ptr
003b95  les di,[bp+0xa]    ; destination far ptr
003b98  mov dx,[bp+0xe]    ; EXPECTED OUTPUT LENGTH  -- the decode is BOUNDED
003b9e  lodsb              ; c = *src++
003b9f  or al,al | jl 3bb1 ; c >= 0x80 -> repeat branch
003ba3  cl = al | inc cx   ; literal: cx = c + 1   (1..128)
003ba6  sub dx,cx | rep movsb | or dx,dx | jg 3b9e
003bb1  cmp al,0x80 | je 3b9e     ; <-- 0x80 is a NO-OP: consumes nothing, emits nothing
003bb5  neg al | cl = al | inc cx ; repeat: cx = (256 - c) + 1 = 257 - c   (2..128)
003bba  lodsb | sub dx,cx | rep stosb | or dx,dx | jg 3b9e
```

Two things fall out, one confirming and one correcting.

**Confirming:** the repeat count is `257 − c`, exactly what `monchaRLE` implements and what `moncha.ts`
argued for from the decoded layout. The `256 − c` DAX/DAA reading is ruled out at the instruction level
(`neg al` then `inc cx`), so §12.5's description of this call as "signed-byte RLE, the same codec family
as DAX" is right about the family and one off about the count.

**Correcting:** control byte **`0x80` is a no-op**, not a 129-byte literal copy. `monchaRLE` used the
boundary `c < 0x81`, so it read 0x80 as "copy 129 literals" — and `packages/engine/test/moncha.test.ts`
carried a test asserting exactly that, sourced from the hackdocs prose rather than from code. Both are
now corrected against the disassembly. The literal branch tops out at control `0x7F` = 128 bytes.

**The null, and why this mattered anyway.** No shipped data distinguishes the two readings: **0 of 6038
control bytes** reach 0x80 across DQK's 98 `MONCHA.GLB` members (2079 controls, longest literal run 126)
and FRUA's 127 `MONST.GLB` members (3959 controls, longest run 36). SSI's own compressor evidently caps
literal runs at 128, so no decode of any retail file changes. What *does* change is our **writers**:

- `encodeMonchaMember` chunked at `Math.min(remaining, 129)` and documented "control byte 0x80" as the
  maximum copy run. At today's `DQK_RECORD_LEN` of 108 that is unreachable — but it sits directly on the
  path of §26.3's longer-record direction, and a 129-byte chunk would have round-tripped perfectly
  through our own decoder while the real engine dropped 129 bytes on the floor. Now capped at 128
  (`MAX_LITERAL_RUN`).
- `packages/engine/test/frua-monsters.test.ts`'s synthetic member builder chunked at 129 for FRUA's
  450-byte records, so **every** synthetic member it produced carried three 0x80 controls. It was
  building streams the shipping engine would not have accepted. Fixed to 128; the real `MONST.GLB` path
  is unaffected, as the corpus scan above predicts.

This is the same failure shape as the §25.1 SETUP_MONSTER operand drift: a writer validated only against
our own reader agrees with itself indefinitely. The check that catches it is decoding the *engine's* code,
not more of our own data — and here the data could not have caught it at all, because the retail corpus
never exercises the opcode.

### 27.6 Artifacts

- `packages/engine/test/monchaEncode.test.ts` — the §26 describe extended with the §27 facts: the native
  id table's bank split (90/8) and the ported archive's (57/0), and the bank-1 population re-run of the
  exact-fit sweep. Same positive controls as §26.
- `packages/engine/src/util/rle.ts` — `monchaRLE` now treats control 0x80 as the no-op DQK's own
  decompressor treats it as (§27.7); docstring corrected to `<0x80` literal / `0x80` no-op / `>0x80`
  repeat. `packages/engine/src/loaders/monchaEncode.ts` — literal runs capped at `MAX_LITERAL_RUN = 128`.
  `packages/engine/test/moncha.test.ts` — the "0x80 is a literal copy" test corrected to engine
  semantics. `packages/engine/test/frua-monsters.test.ts` — synthetic member builder chunked at 128.
- Scratch (repo `scratchpad/`, untracked): `chain_both_codecs.mts`, `moncha_idtable.mts`,
  `moncha_id_vs_len.mts`, `rle_engine_exact.mts`, `rle_diff.mts`, `ctl80_scan.mts`.
- Read-only static work throughout: `tools/disasm_dqk.py --disasm`/`--overlays` against the retail
  `DQK.EXE`. No file in any game folder, no `build/**` artifact and no `DQK.EXE` byte was modified, and no
  DOSBox-X session was launched.

## 28. Round 20 — what bank 1 actually contains: DQK's **named NPC roster**, read straight out of the records (static only, no DOSBox-X, no patch, 2026-08-19)

§27.4 established that `'moncha1'` selects the eight bank-1 ids (112..119) and that six of the eight are
long, type-`0x0`, character-shaped records rather than type-`0x08` monsters. This round reads them.

### 28.1 The records name themselves

Decompressing each bank-1 member and scanning for printable runs — no fixed-offset assumption, just
"where is there ASCII" — gives an unambiguous answer:

| id | member | len | type | name | at |
| --- | --- | --- | --- | --- | --- |
| 112 | 91 | 493 | 0x0 | `CAPTAIN DAENOR` | 0x27 |
| 113 | 92 | 469 | 0x0 | `GRUNSCHKA` | 0x27 |
| 114 | 93 | 180 | 0x2 | `SELIA` | 0x22 |

| 115 | 94 | 160 | 0x2 | `TASLEHOFF` | 0x1F |
| 116 | 95 | 471 | 0x0 | `BALDRIC` | 0x27 |
| 117 | 96 | 479 | 0x0 | `SIR DISCORE` | 0x27 |
| 118 | 97 | 533 | 0x0 | `ELGYNORA` | 0x27 |
| 119 | 98 | 511 | 0x0 | `DAWNSHINE` | 0x27 |

`TASLEHOFF` is Tasslehoff Burrfoot; the rest are DQK's own named companions and quest characters. So
**`MONCHA.GLB` is literally MONster + CHAracter, and the bank digit is which half you are asking for**:
bank 0 = the 90-entry bestiary, bank 1 = the 8-entry named-NPC roster. The six type-`0x0` records carry
their name at a consistent offset `0x27` and NUL-terminate it there; the two type-`0x2` records (`SELIA`, `TASLEHOFF`) are shorter, put the
name at a different offset, and do **not** NUL-terminate it (`SELIA` is followed by `0xF7`) — so type is a
real discriminator inside the bank, not just noise.

That retires the last of §26.2's uncertainty. The routine at `2177:257C` is not "the monster-record
loader with a strange header size" — it is the path that **builds a combatant from an NPC record**, and
`0x19E` being 414 bytes is simply that record's own character-sized body.

> **RESOLVED 2026-08-20 — see §29.** The alignment this section declined to pin down was not an
> alignment problem: the decode was two bytes out of phase, because the member's leading big-endian
> length word was being consumed as RLE control bytes. With it stripped, `0x19E`/`0x19F` are the record's
> own counts, the node width of 17 read off CAPTAIN DAENOR's body here is confirmed, and a second
> 5-byte-wide array turns out to sit between the header and the 17-byte nodes. §28's identification of
> bank 1 as the named NPC roster survives unchanged; only the offsets quoted here (0x27 / 0x22 / 0x1F)
> do not — every name is at a fixed 0x68, and two were being truncated (`SELIA` is `SELIAS`,
> `TASLEHOFF` is `TASSLEHOFF`).

### 28.2 The 17-byte chain nodes are visible in the records

Dumping `CAPTAIN DAENOR`'s decoded body shows the chain structure the routine walks, plainly periodic:

```
0186  29 00 70 29 64 00 d0 07 02 00 01 06 00 00 00 00 00
0197  25 00 70 25 64 00 c4 09 02 00 01 06 00 00 00 00 00
01a8  3b 6f 31 2e 01 00 88 13 01 01 01 06 00 00 00 00 00
01b9  4b 6f 31 2c 19 00 88 13 01 01 01 06 00 00 00 00 00
01ca  1b 00 70 1b 32 00 a6 0e 02 00 00 06 00 00 00 00 00
```

Stride **exactly 17 bytes**, five trailing zero bytes per node, a constant `0x06` at node offset 11 —
i.e. real fixed-width sub-records, the same width as `DOK_ITEM_RECORD_SIZE` (`item.ts`). This is the
first direct sight of the thing §12.5 inferred from the copy loop alone.

**What is deliberately NOT claimed.** The exact chain base varies per record under a naive periodicity
scan (0x15F..0x39E across the eight), and it does not line up with `0x1A0` for any of them, so this round
does **not** claim to have located the two count bytes inside the record or to have matched them against
an item tally. The counts read at `0x19E`/`0x19F` under a member-start-aligned decode land *inside* a
node rather than before one, which says the engine's staging fill does not begin where this simulation
begins — an alignment this round did not pin down. Node width and node shape are what the bytes support;
the count location is not, and inventing one would be the failure mode this document keeps warning about.

### 28.3 The port gap this makes concrete

§27.5's "the ported archive has **no bank-1 ids**" now has a meaning rather than just an id-range
statistic: **the CoK→DQK port ships no NPC roster at all.** And the source games do carry the material —
`decodeMonsterArchive` already classifies it:

```
CoK MON1CHA.DAX  26 records: monster=19, npc=1, humanoid=6
   -> KILDIRF, STRANGBOURN, WARRIOR, BLACK ROBE MAGE, CLERIC, EVIL CURATE, SOLDIER
DoK MON1CHA.DAX  64 records: monster=45, humanoid=15, unknown=4
   -> SIR DRYDEN, FLAVIUS, DURFEY, UNDEAD DURFEY, LORD SOTH, SKOMP, CRAZED DWARF, ROGUE, ...
```

`encodeMonchaArchive`'s caller flattens all of these into bank-0 monster ids numbered from 0, so a
`'moncha1'` request against ported content cannot resolve, and DQK's NPC-combatant path has nothing to
build from. Fixing that is a real, bounded content-port task — assign the source games' `npc`/`humanoid`
records into bank 1 (ids 100+) and emit them in the character record shape — but it is **not done here**,
because §28.2's caveat applies: the 414-byte body's layout is only partly read, and emitting a record
whose fields we cannot fill would be invention, not a port.

### 28.4 Artifacts

- `packages/engine/test/monchaEncode.test.ts` — the §27 describe gains the bank-1 roster assertion: the
  six type-`0x0` names at offset 0x27, pinned by name, so a decoder or id-table regression that stops
  resolving the NPC bank goes red.
- Scratch (repo `scratchpad/`, untracked): `staging_sim.mts`, `dump_bank1.mts`, `dump_chain.mts`,
  `bank_names.mts`, `cok_npc_scan.mts`.
- Read-only throughout; no game file, `build/**` artifact or `DQK.EXE` byte modified, no DOSBox-X run.

## 29. Round 21 — `MONCHA.GLB` members carry a 2-byte length word, and we were never reading it: the DQK record is **fixed-offset**, 416+ bytes, and 86 of 98 now decode (static only, no DOSBox-X, no patch, 2026-08-20)

§28.2 deferred one thing: *"the counts read at `0x19E`/`0x19F` under a member-start-aligned decode land
inside a node rather than before one, which says the engine's staging fill does not begin where this
simulation begins — an alignment this round did not pin down."* Pinning it turned out to invalidate a
large part of how this project has read DQK monster data since the format was first opened.

### 29.1 The staging fill, disassembled

The routine at canonical `2177:257C` is file `0x356DC` under §27.1's `+0x19F0` mapping. Its first
0x30 bytes answer the question outright:

```
0356e3  mov al,0x32 | push ax | lcall 0x1fc4,0x88   ; disk := '2'  (MONCHA.GLB lives in DISK2)
0356ec  push ss | lea ax,[bp-0x276] | push ax       ; dest: the 0x288-byte staging buffer
0356f2  push ss | lea ax,[bp-0x288] | push ax       ; out-param: bytes loaded
0356ff  push ds | mov ax,0x5ffd | push ax           ; "moncha1"
035704  lcall 0x1fc4,0x130                          ; load the RAW member
03570c  al = [bp-0x276] | shl ax,8
035716  dl = [bp-0x275] | or ax,dx
03571e  mov [bp-0x282],ax                           ; <-- BIG-ENDIAN u16 from the member's FIRST TWO BYTES
035730  lea ax,[bp-0x274]                           ; src = member + 2
035735  lcall 0xd7,0x2776                           ; memcpy the payload to the top of the frame
03574c  push [bp-0x282]                             ; expected output length
035756  push ...src... | lcall 0xd7,0xa1c           ; DECOMPRESS(src, [bp-0x276], expectedLen)
```

So a `MONCHA.GLB` member is **`u16be uncompressed_length` followed by the RLE stream**, and the length
is not decorative — it is handed to the decompressor at `00d7:0a1c` as the `dx` bound that §27.7
transcribed (`mov dx,[bp+0xe]`, `sub dx,cx`, `jg`). The record then lands at `ss:[bp-0x276]` starting
at its own byte 0, and the cursor init at `0x357C5` reads `staging[0x19E]` — so `0x19E` is an offset
**into the record**, exactly as assumed. The assumption was never the problem.

`decodeMonchaGlb` decompressed each member from byte 0. It therefore consumed the length word as two
RLE control bytes, and every record came out shifted by a record-dependent amount.

### 29.2 The correction, and how it was checked

`want = (raw[0] << 8) | raw[1]` versus `monchaRLE(raw.subarray(2)).length`, over all 98 members:
**98 exact, 0 near, 0 mismatched.** Not a fit — an identity, on a value we never previously read.

The consequences are immediate and all in one direction:

| | before (decode from byte 0) | after (skip the length word) |
| --- | --- | --- |
| record lengths | 88..533, median 321 | **416..598**, median 436 |
| name offset | "member-dependent, 21…300+" | **0x68 in all 98** |
| ability block | found by search (`findAbilityBlock`) | **0x78 in all 98** |
| members with full validated stats | ~20 | **86 of 98** |
| records needing `reconstructDqkRecord` | most | **none** |
| `acSource: 'canon'` injections | 1 (UMBER HULK's AC) | **0** |

The `ABILITY_DELTA` table was right the whole time. Only its anchor was wrong.

**Names are the plainest evidence.** Under the shifted decode the roster read `SAUAGIN`, `IRON OLEM`,
`THENOL FNATIC`, `SKEL WARROR`, `TASLEHOFF`, `SELIA`, `UVWW.`, `RGON.`, `LACK HEAD`. Under the
corrected one, at a single fixed offset, all 98 read as words: `SAHUAGIN`, `IRON GOLEM`,
`THENOL FANATIC`, `SKEL WARRIOR`, `TASSLEHOFF`, `SELIAS`, `LICH`, `UMBER HULK`, `AURAK DRACONIAN`,
`GNOME THIEFLORD`. A phase error mangles text; it does not un-mangle it.

**Stats corroborate independently.** BLACK PUDDING reads XP 3000, 10 HD, 3d8, AC 6 — the AD&D
Monster Manual line — and its five saving-throw bytes are `8 / 9 / 10 / 9 / 11`, the exact 1e fighter
row for 10 hit dice. Five separate bytes agreeing with a published table is not something a
mis-phased stream produces.

### 29.3 The record model, solved

With the phase fixed, §28.2's deferred question answers itself. The fixed part of a record is
**0x1A0 = 416 bytes**, ending with the two counts the routine reads, and the tail is two arrays:

> `len = 0x1A0 + 5·rec[0x19E] + 17·rec[0x19F]`, rounded up to an even length.

97 of 98 members reproduce exactly (member 27 is 18 bytes long). The shortest member in the archive is
416 bytes with both counts zero — i.e. the fixed part *is* the empty-tail record, which is why the
routine can read `0x19E`/`0x19F` unconditionally.

**The null.** Two free widths will fit something, so the widths were solved by exhaustive search rather
than proposed: over all 1600 pairs in 1..40 × 1..40, `(5, 17)` explains 97; **no other pair explains
≥ 97**, and the median pair explains 9. The `+ (n & 1)` term is not a fudge either — δ is 0 or 1 across
the corpus and equals `(c1 + c2) % 2` for 97 of 98, i.e. the record is simply padded to an even length.
The 17-byte width is the one §28.2 read directly out of CAPTAIN DAENOR's body, and matches
`DOK_ITEM_RECORD_SIZE`; the 5-byte width is new. For a character record, "N spell entries then M item
entries" is the natural reading, and the counts behave that way (the wizards carry the largest
`0x19E`: DARK WIZARD 10, ELGYNORA 9, TASSLEHOFF 1) — but **what the 5-byte entries contain is not
decoded here**, and this section claims only the widths, which are what the lengths measure.

> **RESOLVED 2026-08-21 — they are special-ability (affect) records, not spells.** The widths above
> stand unchanged; only the name was wrong, and the code carried it as `spellCount`/`SPELL_ENTRY`
> until now. Two lines of evidence:
>
> **Who carries them.** The largest counts are **undead, not casters**: VAMPIRE CLERIC 10, VAMPIRE
> MAGE 10, MUMMY 9, VAMPIRE 7, VAMPIRE THIEF 7, SKEL WARRIOR 6, SPECTRAL MINION 5, LICH 5. A MUMMY
> casts nothing and has nine special abilities; a VAMPIRE casts nothing and has energy drain, charm
> gaze, gaseous form and regeneration. The 18 members with **zero** are precisely the plain
> physical monsters and plain human fighters — BORING BEETLE, HUGE BAT, HYDRA, ETTIN, MINOTAUR,
> MINOTAUR CHAMP, GIANT TROLL, HUGE CROCODILE, SHARKMAN, SIVAK DRACONIAN, the three non-caster
> THENOL ranks, BLACK ROGUE. The wizard observation above is not contradicted but *explained*:
> casters do carry large counts, they are simply not the top of the list, and spellcasting is
> itself registered as abilities in this model. Under a spell reading, MUMMY with 9 has no
> explanation; 82% of a bestiary casting spells has none either.
>
> **The field layout.** hackdocs `CCHFORM.TXT` documents the Gold Box "special ability record" as
> `{u8 code, u8 zero-for-constant-effect, u16 duration in rounds (0 = permanent), u8 level of
> effect (255 = N/A), …}`. Read that way all 285 shipped entries fit, both sentinels included: the
> duration word is 0 in **227 of 285**, the level byte is 255 in **227 of 285**, and those are the
> same 226 entries — the constant effects. The 58 timed entries carry round-numbered durations
> (4, 5, 7, 8, 10, 11, 12, 14, 15, 16, 20, 30, 40, 50, 80, 100 rounds) and mostly plausible caster
> levels (7..31). The fifth byte is 0 in all 285, as "set to zero for constant effect" requires.
>
> **Not claimed:** the code byte itself (1..213, 103 distinct values) is not decoded — only
> counted, which is all `dqkRecordLength` needs — and four of the 58 timed entries carry level
> bytes of 108/116/118/155 that no caster-level reading covers.
>
> Separately, the 17-byte entries are ordinary per-instance `item.dat` records — the same 17-byte
> record DQK's `DISK1/ITEM.DAT` stores (see the 2026-08-21 `DQK_ITEM_SIZE` correction) — and as of
> 2026-08-21 they are **decoded**, by `decodeMonchaCarriedItems`, so every monster now carries its
> equipment. The discriminator was the record's own redundancy: `MONCHA.DAT`'s 28 item-bearing
> members hold 106 entries, and in **89 of 106** the primary name code names the same weapon or
> armour the `baseTypeId` selects out of `ITEMS.DAT` (LONG SWORD → base 18, and so on). The null:
> the same agreement re-measured at record shifts of 1..4 bytes scores **0, 0, 0 and 1** — matches
> on a zero byte excluded, since an unfiltered comparison scores 44 at shift 2 on `0 == 0` alone.
> Corroborating: all 106 `baseTypeId`s land inside the real 128-record `ITEMS.DAT`; `cursed` is 0
> in 106/106 and `charges` 0 in 105/106, as a shipped roster (not a save) should be; `specialCode`
> is 0 in 97 and 128 in 7, the same two-valued grouping `ITEM.DAT` shows.
>
> **The 98th member.** SAHUAGIN LORD (member 27) is the one record `dqkRecordLength` cannot
> reproduce, and it is a defect in the shipped archive rather than a hole in the model: it declares
> 0 affects and 0 items but runs 434 bytes, 18 past the 0x1A0 fixed part. Those bytes are a
> well-formed item record — base type 37 (shield hand), primary name code 37, encumbrance 100,
> value 6, `ready` set — sitting at **0x1A1**, one byte past where the count arithmetic would put
> it. Read at 0x1A0 instead it gives base type 0 and encumbrance 25637, against a population range
> of 1..450, and its name-identity is the `0 == 0` artefact. The offset is what makes it a defect
> rather than a parity rule: all 18 odd-tail members pad at the END (66 name-identities at the
> count-driven base, **0** at base+1). We deliberately do not recover it — `itemCount` is what the
> record publishes, so DQK's own loader reads zero items here too and the SAHUAGIN LORD never gets
> the shield in the retail game.

### 29.4 Two more bytes, and what they retire

Searching for a discriminator between the banks rather than assuming one:

- **`0x66` is an is-monster flag** — 1 for all 90 bank-0 bestiary records, 0 for all 8 bank-1 NPCs
  (and for three bank-0 records: the two GNOMEs and a second BALDRIC).
- **`0x58` is race** — 7 for a plain monster; **6 selects exactly the eight humanoids** (BLACK ROGUE,
  the five THENOL ranks, DARK WIZARD, SHARKMAN); 5 for TASSLEHOFF, a kender; 1 and 4 for two others.

`classifyCategory` now reads those two bytes. It previously leaned on a "type 0x08" byte at offset 2
that does not exist — offset 2 was inside the length word — plus a hardcoded name list
(`TYPE8_NPC_NAMES`) and a dragon-head name-suffix rule. The name rules are gone from the category
decision; `sub` (the five dragon HEAD breath sub-records) is the one classification still keyed on the
name, because those records genuinely carry no stat block.

§28's finding **survives** the correction — bank 1 is DQK's named NPC roster, MONCHA is MONster +
CHAracter — and gets cleaner: all eight names now read at the same fixed 0x68 rather than at the
per-record 0x27/0x22/0x1F the shift reported, and two of them were being truncated (`SELIA` →
`SELIAS`, `TASLEHOFF` → `TASSLEHOFF`). Their stats decode too, at the NPC deltas, and land on the
**same numbers the pre-§29 test asserted** (SELIAS THAC0 10 / 89 hp / level 27 / class 6; TASSLEHOFF
10 / 64 / 22 / 6) — the NPC delta table was correct, only its anchor and the name were wrong.

§26's headline result is **withdrawn**: "`H = 0x19E` fits 0 of 98 members" was measured on shifted
records. On correct ones the offset is where the record's own counts live. §26's *method* — positive
controls first, a null before a negative — is what makes the withdrawal short rather than embarrassing;
the number it produced was faithfully measured on the wrong input.

### 29.5 The port bug this exposes

`encodeMonchaMember` emitted the RLE stream **with no length word**. DQK would have read our first two
control bytes as the expected output size and decompressed to that bound — so every member the CoK→DQK
port has ever written would decode to the wrong length on real hardware, while round-tripping perfectly
through our own reader. That is the §27.7 failure shape again, and again only the engine's own code
could catch it: our writer and our reader agreed with each other.

Both halves are fixed: the encoder emits `u16be` length, and `DQK_RECORD_LEN` goes from 108 to
**0x1A0**, so a ported record now reaches `0x19E`/`0x19F` instead of stopping 306 bytes short of them.
§26.3's "108-byte port gap" is therefore **closed**, though its measurement of the native side
("88..533 bytes, median 321") was itself a product of the shift and is superseded by 416..598.

The port writes both counts as **0**. CoK/DoK monsters carry neither a DQK spell list nor a DQK item
chain, and emitting entries we cannot fill would be invention. §27.5's bank-1 gap likewise stands: the
port still numbers ids from 0, so it ships no NPC roster.

**FRUA generalises.** `MONST.GLB`'s per-member `01 C2` — which `frua/monsters.ts` documented as a
"record marker" — is `0x01C2` = 450 = `FRUA_MONSTER_RECORD_SIZE`, the same length word. It looked
constant only because every FRUA monster record is the same size. The check is now a length comparison,
which rejects strictly more than the literal one did.

### 29.6 Artifacts

- `packages/engine/src/loaders/moncha.ts` — `DQK_MEMBER_HEADER`, `decodeMonchaMember` (decodes via the
  length word and **throws** on disagreement), re-anchored `DQK_LAYOUT`, `dqkRecordLength`, byte-grounded
  `classifyCategory`. `reconstructDqkRecord` / `findAbilityBlock` / `scanMonsterName` stay exported and
  tested but are off the shipped-data path.
- `packages/engine/src/loaders/monchaEncode.ts` — emits the length word; `DQK_RECORD_LEN` 108 → 0x1A0.
- `packages/engine/src/module/frua/monsters.ts` — the `01 C2` marker re-read as a length.
- `packages/engine/test/moncha.test.ts` — the five C4.2b-2b-* staged-recovery tests replaced by four
  that pin the fixed-offset model, the garbled names as *artefacts* (asserted absent), the retirement
  of the canon-AC injection, and the byte-grounded categories.
- `packages/engine/test/monchaEncode.test.ts` — the §26/§27.4/§28 describe replaced by the §29 model,
  including the exhaustive `(a,b)` null and a live demonstration that decoding from byte 0 desyncs.
- Scratch (repo `scratchpad/`, untracked): `hdr2.mts`, `fit2.mts`, `tailsolve.mts`, `tail3..6.mts`,
  `layout.mts`, `sniff2.mts`, `typebyte.mts`, `cls.mts`, `npc2.mts`, `after.mts`, `names.mts`, `uh.mts`.
- Read-only throughout: `tools/disasm_dqk.py --disasm` against the retail `DQK.EXE`. No game file,
  `build/**` artifact or `DQK.EXE` byte modified, and no DOSBox-X session launched.

### 29.7 What this says about the method

Three rounds in a row (§25.1 SETUP_MONSTER operands, §27.7 the 0x80 no-op, and now the length word)
found the same class of bug: **a reader and a writer that agree with each other, validated against no
third party.** In each case the data could not settle it — here the shifted decode produced 98
plausible-looking records, a coherent-seeming "variable-length self-describing" story, and a
reconstruction pass that appeared to *work* because a second RLE pass over a shifted stream happens to
re-synchronise it. What settled it was reading the engine's own loader.

The standing lesson for the remaining formats is narrow and concrete: **before trusting any container
member, find the code that loads it and check whether it reads a header we are skipping.** Two of the
five container generations in this project turned out to have one.

## 30. Round 22 — the §29 correction reaches the native DOS track, where it had been faithfully copied bug and all (static only, no game file touched, 2026-08-21)

§29 fixed `MONCHA.GLB` in the TypeScript engine. It did not fix the **native DOS track**, which had
ported the same decoder into NASM — and, because it was ported faithfully, it had inherited the phase
error along with everything the phase error had made necessary.

### 30.1 A wrong oracle propagates

`native/src/ccmon.asm`'s header says so in as many words: *"Oracle (authoritative, do not re-derive):
`packages/engine/src/loaders/moncha.ts` … Every offset/algorithm below is copied from there."* That is
normally exactly the right discipline. Here it meant the native decoder had:

- the same decompression from byte 0, so the same record-dependent shift;
- the same record layout — a "record type tag at offset 2 (8 = monster)", name at 24, abilities at 40;
- **all six** staged-recovery strategies, ported by hand into assembly: `build_recon`'s second RLE
  pass, `find_ability_block_g`'s scan, the raw "dec-path" retry, `sniff_compact_monster_g`'s
  short-tail layout for HYDRA, `name_is_umberhulk` + a hardcoded `mov word [gm_ac_val], 2`, and the
  `TYPE8_NPC_NAMES` list of `THENOL FNATIC` / `PRINCE ALHOOK`;
- and, in `cccombat.asm`, a five-step version of the same chain feeding real combat encounters.

The header's own honest scope note — *"CCMON implements the DIRECT fixed-offset decode above … **5 of
98 real records** — PLUS the following moncha.ts reconstruction strategies"* — is the tell. Five out
of ninety-eight is not a format with a few awkward records in it. It is a decoder that is wrong.

### 30.2 What the native decoder does now

Both files now skip the 2-byte big-endian length word and read at the §29 offsets, expressed as
assembler constants (`MEMBER_HDR`, `L_XP`, `L_RACE`, `L_ISMON`, `L_NAME`, `L_ABIL`, `L_FIXED`) rather
than the bare integers that made the old anchors so easy to copy without noticing.

Measured on the retail `MONCHA.GLB`, running CCMON's own `sniff_dqk_mon_direct` predicate byte for
byte:

| direct fixed-offset decode | members accepted |
| --- | --- |
| old: decompress from byte 0, gate `[2] == 8`, ability at 40 | **5** of 98 |
| new: skip the length word, gate `[0x66] == 1`, ability at 0x78 | **75** of 98 |
| **null: correct phase, old offsets** | **0** of 98 |

The null matters. Without it, "5 → 75" is compatible with the offsets having simply been mistyped. It
was not one or the other: on correctly-phased records the old offsets accept *nothing at all*, and on
mis-phased records the new offsets accept nothing either. Both halves are load-bearing.

75 monster-framed records plus the 11 that the is-monster byte sends down the NPC path is **86** —
the same 86 of 98 the TypeScript decoder reaches. Two independently written decoders, one in TS and
one in 16-bit assembly, now agree on the count. That is the cross-check §29.7 said was missing.

### 30.3 The strategies are gone, not merely bypassed

`decode_extended` was a 175-line chain of six fallbacks. It is now two branches — bestiary half or
character half, chosen by `[L_ISMON]` — and `cccombat.asm`'s `.dqk` chain went from five steps to
two. `gm_ac_override`, `gm_ac_canon` and `gm_dmg_override` are never set any more, so **every number
CCMON prints is a byte that is actually on the disk**. The canon-AC injection is not disabled behind
a flag; there is no longer a code path that reaches it.

Two heuristics were removed rather than re-anchored, because with a real discriminator byte they are
not merely redundant but wrong: `is_dqk_rolled_ability` and `is_dqk_monster_default_ability` gated the
NPC path on an ability *spread*, and would reject a named NPC whose scores happen to be flat 10s.

The retired routines (`build_recon`, `find_ability_block_g`, `sniff_compact_monster_g`,
`sniff_at_ability_except_ac_g`, `name_is_umberhulk`) are left assembled but unreferenced, and the
headers that documented the wrong layout are marked WITHDRAWN in place rather than deleted. `ccmon.com`
shrank 7135 → 6831 bytes; `cccombat.com` is unchanged in size at 64360.

### 30.4 Four goldens are now failing on purpose

`native/cccombat-test.ps1` pins exact combat traces for four DQK scenarios (`DQKDEC`, `DQKREC`,
`DQKST`, `DQKNPC`) whose very names — "dec-path", "reconstruction", "short-tail/canon-AC" — are the
retired strategies. Every THAC0/AC/damage number woven into those traces came from the wrong offsets.

They are **left in place, unmodified, and expected to fail.** Re-recording them from the new binary
would be re-pinning a golden to whatever the code now prints, which is precisely the move this
project has a standing rule against. They are annotated with why they are invalid and what would be
required to adjudicate them from bytes.

### 30.5 A separate, pre-existing failure found on the way

The harness cannot currently reach those assertions at all. **`CCECL <file>.BIN /E <file>.EFX`
produces no `.EFX` and no stdout for every `.BIN` input in `RUN.BAT`** — `DQKDEC`, `DQKREC`, `DQKST`,
`DQKNPC`, `DQKBLK`, `DQKHATT`, `COABHATT`, `COABATT2`, `COABDUAL` — so CCCOMBAT reports `bad or
unsupported GBEF combat effect file` and the run dies earlier, at the first `Assert-CombatViewRaw`.

This is **not** a consequence of this round's work, and it was checked rather than assumed: an
otherwise identical run with both `native/src/*.asm` reverted to `HEAD` fails at the same point with
the same message. The `CCECL <file>.DAX <n> /E` form still works (`COAB50.EFX` is produced), so the
fault is specific to the `.BIN` entry path. It is HEAD-red, it is unrelated to §29, and it is
recorded here rather than fixed, because a decoder correction and an ECL entry-path defect are two
different investigations and merging them would obscure both.

### 30.6 What this adds to the method

§29.7 said the lesson was "before trusting any container member, find the code that loads it." Round
22 adds the corollary: **a correction is not finished when the code that found it is fixed.** The bug
had been copied — deliberately, with a comment saying so — into a second implementation in a
different language, where it had grown its own hand-written assembly versions of six workarounds. The
port was faithful; that was the problem.

Where a project keeps a second implementation as a cross-check, the two agreeing proves nothing if
one was written from the other. It only becomes evidence once they are derived independently — which
is exactly what the 86-of-98 agreement in §30.2 now is, since the native side re-derives it from the
raw bytes through its own predicate rather than from the TypeScript's output.
