# Gateway save acquisition

## Acquired and native-load proven (2026-07-29)

The acquisition gate is closed. A GameLink-only scripted campaign bootstrap produced a genuine
Gateway party/save bundle, loaded it in the original DOS executable, entered Sundabar
`ECL5/GEO5#19`, and completed the canonical two-encounter capture documented in
`gateway-ecl5-19-runtime-route.md`. After descriptor 122, slot A saved a 13,149-byte
`SAVGAMA.DAT` with SHA-256
`513f5ddd51d9792c60a5532450a93d6290d8d730804db4a1f31344abb9d7c8f5`; a cold process loaded it at
`(6,14,S)` without replaying the consumed Griffon event. File offset `0x02D9`, corresponding to ECL
word `[0x4C6C]`, is `1`.

All original sidecars were preserved in ignored backup directories before any deterministic combat
patch. `tools/patch_gateway_test_party.py` changes exactly seven isolated 422-byte CHRDAT sidecars,
writes before/after hashes, and refuses incomplete slots or an existing backup target. It does not
modify SAVGAM, ECL, GEO, MON, GAME.EXE, or GAME.OVR. An unmodified-party control independently
reached the authentic tavern fight and lost; the patch exists only to make victory/resume capture
bounded. The committed hash/offset manifest is `gateway-sundabar-native-evidence.json`; retail save
bytes remain ignored and are not redistributed.

The sections below preserve the earlier acquisition procedure and negative pregen-save history.

## Host path

The GOG launcher mounts the game directory as DOS `C:` and then overlays `cloud_saves`:

```text
mount c ".."
mount C "..\cloud_saves" -t overlay
```

Gateway's `GAME.CFG` selects `C:\SAVE\`. A save created through the normal GOG launcher should
therefore appear under:

```text
C:\Program Files (x86)\GOG Galaxy\Games\Gateway to the Savage Frontier\cloud_saves\SAVE
```

The non-overlay fallback is the sibling `SAVE` directory in the game root. Inventory both; never
move or edit either source bundle in place.

## Acquisition gate

1. Start Gateway through its normal GOG launcher.
2. Create or load a party, enter the playable world, and save to slot A.
3. Exit normally so DOSBox and GOG flush the overlay.
4. Run `python tools/inventory_gateway_save.py --output docs/engine/research/gateway-save-inventory.json`.
5. Stage the reported bundle with `python tools/stage_gateway_runtime.py --strict --save-source
   "<reported root>" --output "<new isolated stage>"`.

`save_bundle_present=true` proves only that a container was found and copied with hashes. Keep
`route_ready=false` until original DOS loads the bundle and title-local runtime evidence proves
archive/member selection, map state, ECL cursor, and the selected ECL5#19 route.

## 2026-07-17: pregen-save avenue closed (definitive); scripted-new-game avenue partially
## proven; a genuine environment blocker found in the automation channel itself

This round's brief was to find an *automatable* path to a real save, the same way DoK's shipped
`SAVGAMA.PTY` pregen party unblocked that title (`dok-natural-route.md`). Three sub-questions,
answered in order below: (1) does Gateway ship a pregen save the way DoK/Treasures do — **no**,
confirmed definitively; (2) is a fresh scripted playthrough mechanically plausible — **yes**,
new evidence strongly supports it; (3) was a real save actually produced this round — **no**, a
newly-discovered DOSBox-X GameLink infrastructure hazard made live automation unsafe to continue
mid-session, documented precisely below rather than pushed through.

### 1. No pregen save ships with Gateway (new, definitive; different from DoK's precedent)

Direct filesystem inspection of the real retail GOG install
(`C:\Program Files (x86)\GOG Galaxy\Games\Gateway to the Savage Frontier`), not just the two
`SAVE`/`cloud_saves\SAVE` roots `inventory_gateway_save.py` already checks:

- `SAVE\` and `cloud_saves\SAVE\` are both empty (matches the existing inventory finding).
- A recursive search of the **entire install tree** for `*SAVGAM*`, `*CHRDAT*`, `*.PTY`, `*.SAV`,
  or any `*save*`-named file found **zero** matches anywhere outside the two known-empty `SAVE`
  directories.
- For comparison, the sibling titles on the same machine both DO ship a pregen party exactly the
  way `dok-natural-route.md` describes for DoK: `Death Knights of Krynn\SAVE\` has
  `SAVGAMA.PTY` + `CHRDATA1..6.{GAM,JNK,WIZ,EFF}`; `Treasures of the Savage Frontier\SAVE\` has
  `SAVGAMA.PTY` + `CHRDATA1..8.{SAV,THG,EFX}`. Gateway has neither.

**Conclusion: this is not "not yet found," it is "does not exist in this release."** The
DoK-style pregen-save shortcut this task was modeled on is unavailable for Gateway specifically;
Treasures (the sibling title sharing this engine generation) does have one, which is relevant if
Treasures' own save-acquisition work ever needs it, but does not transfer to Gateway (different
save-container size/format per `BUILD-QUEUE.md` item 5's own prior finding: Gateway 72×422-byte
records vs Treasures 102×510-byte records).

### 2. Copy protection is real, located, and provably automatable (new)

Byte-scanning Gateway's own `GAME.OVR` (347,622 bytes) for the same class of string CoK's and
DQK's already-solved protection routines use (`cok-copy-protection.md`) found exactly one
`"journal"`/`"heading"` occurrence, at file offset `0x55C1`:

```
0x55C1: "\x11 of the journal  \x15 including headings  \x04 ?  \x06Enter:"
```

(`\x11`/`\x15`/`\x04`/`\x06` are control-byte parameter slots, the same pattern CoK's own format
string at `GAME.OVR+0x1A962` uses for its page/heading/word numbers.) This is Gateway's own
copy-protection prompt, confirming the title has the SSI "journal word-lookup" check like its
siblings. The bypass branch itself (the CoK/DQK-style `JNZ`-guarding-a-save-loaded-flag, or an
equivalent) was **not** located this round (would need a live trace or deeper static disassembly
around this string's reference site) — but it did not need to be, because:

The retail install's own `passwords.pdf` (24.5 KB, in the game's root directory alongside the
`Journal.pdf`/`Rulebook.pdf`/`Cluebook.pdf`) is **not the source journal, it is a complete
answer key**: 30 rows of `Journal Page# / Line# / Word# -> Answer` (e.g. `10 2 2 ARE`,
`3 5 5 AREA`, `2 2 3 SAVAGE`, ...). This is the same category of asset CoK's own doc flags as
`Codes.pdf` (there described as "image-based, not text-extractable" and therefore
unverified) — Gateway's `passwords.pdf` is a clean, machine-readable text table, immediately
usable to answer any protection prompt the game displays without needing OCR, a physical manual,
or any guessing. **This removes what would otherwise be a hard blocker to unattended play**: a
scripted session can read the on-screen `Page#/Line#/Word#` triple (via screenshot OCR/vision)
and look up the exact expected answer, or a session can equally use the CoK/DQK-style one-time
`GAME.OVR` branch patch on an isolated stage copy (never the source install) to skip the prompt
entirely, matching this project's already-established, low-risk precedent for both older Krynn
titles.

### 3. Scripted front-end/character-creation navigation: real progress, then a genuine
### automation-infrastructure blocker (not a Gateway-specific blocker)

A same-day sibling recon (`tools/recon_gateway_frontend_nav.ps1`, output already on disk at
`build/gateway-frontend-recon-20260717b/step-00..07.png`, produced by a separate concurrent round
using the older host-input `SendKeys` method, before this session's GameLink mandate) proved the
front end is navigable by simply accepting each screen's white-highlighted default via `ENTER`:
title -> "Gateway to the Savage Frontier" logo -> credits -> `GATEWAY V1.2` `PLAY`/`DEMO` menu
(`PLAY` default) -> `CHOOSE A FUNCTION` (`CREATE NEW CHARACTER` default) -> `PICK RACE` (`DWARF`
default) -> `PICK GENDER` (`MALE` default) -> `PICK CLASS` (`FIGHTER` default) -- seven real,
screenshot-verified steps, no guessing (every choice is the pre-highlighted default; no blind key
was ever pressed against unseen state). This is the first screenshot-mapped look at Gateway's own
front end in this project and strongly suggests the remaining character-creation steps (alignment,
ability scores, name entry x1..6, party assembly) follow the same standard Gold Box UI shape as
every other title this project has already automated (DoK, Secret, Pool).

This round attempted to continue that same walk, but under the **just-mandated GameLink-only
input channel** (`docs/engine/research/dosbox-x-gamelink-automation.md`), required because a
DOSBox-X window using the older host-input method steals OS focus from other agents' concurrent
traces. Doing so surfaced a **new, separate, and more serious hazard in the GameLink channel
itself**: DOSBox-X 2026.07.02's GameLink transport uses two fixed, hardcoded, globally-named
Windows kernel objects — `DWD_GAMELINK_MMAP_R4` (shared memory) and `DWD_GAMELINK_MUTEX_R4`
(mutex) — confirmed by `strings`-scanning the actual binary (no configurable name/suffix option
exists; the binary even contains a startup warning, `"GAMELINK: WARNING: MUTEX \"%s\" already
exists, assuming it is left over from a crash."`, that fires exactly on this collision and
proceeds anyway). These names are **not scoped per-process**, so when a second, unrelated
concurrent agent's DOSBox-X GameLink session was alive on the same machine at the same time as
this task's own session, `tools/dosbox_gamelink.py`'s client silently attached to **the other
agent's process** instead of this task's Gateway process, with no error of any kind. Captured
proof: a `screenshot`/`status` call expected to show Gateway (`program: "GAME"`, 640x400 frame)
instead returned `program: "DOSBOX-X"`, a 720x400 frame, and a boot banner reading `"Drive C is
mounted as local directory C:\...\.claude\worktrees\agent-a7126b79b68f8dc80\build\runtime-secret-
ecl3-97-host-probe-f-sidecars-in-save-20260715\"` — unmistakably a different, concurrent Secret
of the Silver Blades trace running in an isolated worktree, not this task. `Get-Process dosbox-x`
independently confirmed the churn: this task's own launched PID (25148) had already exited and
been silently replaced as the sole visible `dosbox-x.exe` by two different PIDs (58240, then
57608) within about 90 seconds, evidencing other agents actively starting/stopping their own
GameLink-master DOSBox-X processes throughout this window.

**This is a real, reproducible, project-wide hazard, not specific to Gateway**: any two
concurrently-running DOSBox-X GameLink sessions on this machine will silently cross-wire their
input/output, with the `dosbox_gamelink.py` client having no way to verify it is even talking to
its own launched process. Continuing this task's live automation under those conditions would
have produced unverifiable (and possibly actively misleading) evidence, so the session was
stopped rather than pushed through — per this project's "UNLOCATED beats invention" ethic, a
result that cannot be trusted is not reported as a result. See the flagged addition to
`docs/engine/research/dosbox-x-gamelink-automation.md` for the reusable hazard writeup;
resolving it (a mutex-holder PID check before every `dosbox_gamelink.py` call, and/or a
project-wide convention that only one agent runs a GameLink-input DOSBox-X session at a time) is
a prerequisite for reliably finishing this task's remaining steps, not a Gateway-specific gap.

### What remains open

### 2026-07-28 GameLink-only continuation: name entry reached, portrait editor is the next bounded input blocker

The previously historical, host-input reconnaissance was repeated with the current required
GameLink-only route while no other `dosbox-x` process existed. `tools/recon_gateway_frontend_nav.ps1`
now rejects a foreign process before launch and before every input/capture, so this run is not
subject to the old global-GameLink cross-wiring hazard. The hash-locked stage completed the known
default sequence through `PICK ALIGNMENT` and `REROLL STATS?`, then entered a three-letter name
through GameLink (`a`, `b`, `c`) and accepted it. The resulting character-customization screen is
captured at `build/gateway-frontend-gamelink-name-20260728/step-14-enter.png`: it displays OLD/NEW
READY/ACTION sprites and the visible command line `PARTS 1ST-COLOR 2ND-COLOR SIZE EXIT`.

A second bounded continuation (`build/gateway-frontend-gamelink-postname-20260728`) verified that
repeated `ENTER` presses do not advance that screen. A third (`...-colour-n-20260728`) verifies the
same for the visible `N`/NEXT attempt: its GameLink request succeeds but the screenshot sequence
does not advance. This is a precise frontend-input blocker, not a GameLink transport failure:
letters already work in the preceding name field, and every capture is from the owned process.
The next native experiment must map this portrait editor's actual selection command (likely its
menu/cursor convention) from a source or a single visibly targeted GameLink mouse/arrow probe,
then continue party assembly and save creation. No save or ECL encounter is claimed by this result.

### Portrait-editor selector probe (2026-07-28)

A fresh, exclusive GameLink run at
`build/gateway-frontend-gamelink-portrait-right-20260728/` repeated the source-safe default route
through name entry and then supplied exactly one additional `Right` edge. The visible active marker
moved from `1ST-COLOR` to `PARTS` (the screenshots' SHA-256 values differ:
`19AB5212…9873` before and `C5C6286A…365A9` after). Thus the portrait editor is a directional
selector and GameLink delivers the arrow input correctly. The exact remaining callback blocker is
the selected command's activation semantics: Enter and N/NEXT have separately left the screen
unchanged, so a future run must identify the editor's select/action key or mouse convention before
claiming party assembly or a save checkpoint.

- **A real Gateway save still does not exist.** Both avenues from the task brief were advanced
  (pregen: definitively closed; scripted-fresh-playthrough: mechanically de-risked, protection
  answerable, front end partially screenshot-mapped) but neither produced an actual save file
  this round.
- **Character creation beyond `PICK CLASS`** (alignment, ability scores, name entry, party
  assembly, reaching a saveable overland/town state, issuing an in-game `SAVE`) is unattempted.
- **The ECL5#19 encounter/FIGHT/tactical/resume chain** from `gateway-ecl5-19-runtime-route.md`
  was not attempted this round; it strictly requires the save (or an in-progress live session)
  this round did not produce.
- **Next concrete step, in order:** (1) resolve or work around the GameLink singleton hazard
  (wait for a quiet window and re-verify via `Get-Process dosbox-x` immediately before *and*
  during the session, or add a PID/ownership check to `dosbox_gamelink.py` itself); (2) resume
  the character-creation walk from `PICK CLASS` (already reached twice, independently, by two
  different methods) through name entry and party assembly; (3) locate and answer (or patch
  around, isolated-stage-only) the copy-protection prompt using the `passwords.pdf` answer table
  now that its exact on-screen text is known; (4) reach a saveable state, issue `SAVE`, and
  inventory the result with the existing `tools/inventory_gateway_save.py`.

### Portrait-editor activation callback resolved (2026-07-28)

A fresh, exclusive GameLink session at
`build/gateway-frontend-gamelink-portrait-p-20260728/` repeated the known default route, entered
name `ABC`, pressed the already-calibrated `Right` once to make `PARTS` green, then sent exactly
one new activation key: literal `P`. This is source-backed rather than a blind key sweep: the
shared retail menu routine in `coab_extracted/engine/ovr027.cs` maps a selected menu word to its
first letter, while Gateway's immediately preceding screenshot establishes that selected word as
`PARTS`.

`step-16-right.png` has SHA-256
`C5C6286A9CFE9FF1CB17535EDA0DEBA6F12CF50391D8F07C678A60B37FF365A9`; the owned GameLink request
for `P` produced distinct `step-17-p.png`, SHA-256
`D8A6EF26D8C3EF3EA7D42002257494497304A72C31CA08DE3213B1800C5B3DA4`. The resulting retail screen
is the next character-parts menu: `HEAD  WEAPON  EXIT`, with `WEAPON` selected. This proves the
portrait editor's selected-command activation convention and advances the native route beyond the
former blocker. It does not yet prove party assembly or save creation; the next bounded step is to
finish the parts submenus, return through `EXIT`, and record the first accepted party/save screen.

### Parts submenu continuation (2026-07-28)

One further fresh GameLink run (`gateway-frontend-gamelink-parts-weapon-20260728`) confirms the
editor remains a literal-letter menu after entering `PARTS`: `W` from the visibly selected
`WEAPON` post changes the screen to `NEXT  PREV  KEEP  EXIT` (the fresh framebuffer hash is
`E646D4AC284CA8B6481CAF313C4C3F0655DAC9E7027F3C81D69E830C8A64A36A`). This is a real weapon
selection sub-menu, not a stalled duplicate frame. The next safe continuation is `K`/`KEEP` to
retain the default and then `E`/`EXIT` back to the parts/character flow; no save is claimed yet.

### Native character persistence checkpoint (2026-07-28)

The remaining bounded portrait route has now been replayed from a fresh, exclusive GameLink-only
session against the hash-locked isolated stage. `K` (`KEEP`) returns from the weapon picker to
`HEAD WEAPON EXIT`; `E` returns to the portrait menu; a second `E` presents `IS THIS ICON OK?
YES NO`. Accepting the visible default reaches `SAVE ABC? YES NO`; the initial active option is
`NO`, one Left edge moves the marker to `YES`, and Enter returns to `CHOOSE A FUNCTION`.

The checked stage's `SAVE/` directory contains Gateway's native compact character pair `A.GUY`
(422 bytes) and `A.FX` (27 bytes). `tools/inventory_gateway_save.py` now classifies those letter
slot files as `character_sidecar` and reports `native_character_bundle_present`; it deliberately
does **not** promote them to `save_bundle_present`, because this is character persistence rather
than a loaded, playable party/world save. The inventory is recorded in
`build/gateway-save-abc-inventory-20260728.json`.

Evidence captures are in the ignored directory
`build/gateway-frontend-gamelink-save-abc-20260728/`: `step-23-left.png` shows `YES` selected,
and `step-24-enter.png` shows the post-save function menu. This retires the portrait-editor and
native-character-save blocker. The next Gateway requirement remains party assembly, an authentic
world-state save, and a native load proving the ECL5#19 route; none of those are claimed here.

### Authentic party-save checkpoint (2026-07-28)

The character persistence checkpoint has now advanced to a real native party save. In a fresh,
exclusive GameLink-only run, the title menu accepted the existing A character through `ADD
CHARACTER TO PARTY`; the next screen visibly displayed `* A`, proving the character was present
in the in-memory party list. Exiting to the expanded function menu displayed A's AC/HP and the
retail `SAVE GAME` action. Six Down edges from its initial selection reached that action, which
opened `SAVE WHICH GAME? A B C D E F G H I J`; accepting visible slot A returned to the function
menu. The final screenshot is
`build/gateway-frontend-gamelink-party-save-a-20260728/step-16-enter.png`.

The original program wrote this complete, title-native bundle to the isolated stage:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `SAVGAMA.DAT` | 13,149 | `194250bdc4cff1660b5a3b58483244e630c8e6a71a227d291f4eeb6d7ebdb448` |
| `CHRDATA1.SAV` | 422 | `09ac16de76d630a3e41e68ab414b85422ecb5f1d443c88afc0eadcb97f53440d` |
| `CHRDATA1.FX` | 27 | `18f14f6f1dda08c3b2bc17c4eb938ec7551724d542fab7a3d742f4a1f9bc7d4c` |

`inventory_gateway_save.py` reports `save_bundle_present=true`, and a strict copy-only restage
to `build/runtime-gateway-party-save-a-20260728/` preserved all three hashes. This meets the
saved-party acquisition checkpoint. It does **not** establish `route_ready`: a fresh original-DOS
load must still prove cursor/area state and reach the ECL5#19 route before that unrelated
runtime-route claim can be made.

### Bootstrap callback revalidated: literal `Y` commits the sidecar write (2026-07-29)

The historical character-sidecar checkpoint above has now been reproduced from a clean,
hash-locked stage, with one important input-semantic correction. Two fresh, exclusive,
GameLink-only replays reached the same native screens: the character-stat name prompt, `ABC`,
the portrait editor, `IS THIS ICON OK?`, and finally `SAVE ABC?` with `YES` visibly selected.

The apparent no-write result with a final Enter was a menu-activation distinction, not a mount or
save-path failure: Enter returns to `CHOOSE A FUNCTION` without a DOS save-file operation, whereas
literal `Y` (the visible, selected `YES` command) invokes the retail write callback. A repeat with
that one input substitution created `SAVE/ABC.GUY` (422 bytes,
`cbbeb4977d1eda71c431e33138d24762e6bd4f1feaf79136a2d2a77d0188f5c0`) and `SAVE/ABC.FX` (27 bytes,
`c4f1a9b74f9cb0ba2bf134edfb790077a4a0b1c8d4504e9eaac01bec8a94d283`). A subsequent cold retail
route opened both sidecars, then opened `ECL2.DAX` and `GEO2.DAX` after `BEGIN ADVENTURING`; the
first native story panel is captured at `(7,13 N 00:00)`.

Artifacts are ignored build evidence, not source data:

- `build/runtime-gateway-bootstrap-clean-20260729/` — clean stage sourced from the read-only GOG
  install; it now contains only the native `ABC.GUY`/`ABC.FX` sidecar pair produced above.
- `build/gateway-native-bootstrap-clean-20260729-a/step-11-enter.png` — native `CHARACTER NAME:`
  prompt; `step-22-enter.png`/`step-23-left.png`/`step-24-enter.png` record save prompt, YES, and
  return to menu.
- `build/gateway-native-bootstrap-files-20260729-a/dos-files.log` and `log-progress.jsonl` —
  bounded Enter diagnostic with the FILES channel, ending at 494 lines with no save-file event.
- `build/gateway-native-bootstrap-save-y-20260729-a/` — identical route ending in `Y`; its FILES
  log and clean-stage hashes prove the sidecar write.
- `build/gateway-native-abc-begin-20260729-a/` — cold sidecar-load/party/Begin route; its FILES
  log proves the `ABC.*`, `ECL2.DAX`, and `GEO2.DAX` opens.

**Current rule:** do not synthesize or rename `CHRDATA1.SAV` as a character sidecar. The
reproducible bootstrap sequence must end with literal `Y`, not Enter, at `SAVE <name>?`; this
creates native `<name>.GUY/.FX` files. Party/world save acquisition and the ECL5 campaign route
remain separate, unproven requirements.

### Native party-save write reproduced (2026-07-29)

Starting with the native `ABC.GUY/.FX` bootstrap pair, the retail party menu's visible `SAVE GAME`
action was selected and its `A` slot command was activated through GameLink. DOSBox-X's FILES log
records `C:\\SAVE\\savgamA.dat` as a DOS **create** followed by close; it is therefore a native
write, not a copied or synthesized bundle. The resulting isolated-stage files are:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `SAVGAMA.DAT` | 13,149 | `f283746b5c56d51159b8c6319f849943aafe7417184081f7d60415e0a4aeb1ea` |
| `CHRDATA1.SAV` | 422 | `b81467e633a436aa6b53abbde72bd54ecd767e661c89fea5a3acd917fee32b5f` |
| `CHRDATA1.FX` | 27 | `18f14f6f1dda08c3b2bc17c4eb938ec7551724d542fab7a3d742f4a1f9bc7d4c` |

`build/gateway-native-abc-party-save-20260729-a/dos-files.log` lines 460--462 provide the
file-search/create/close sequence. `inventory_gateway_save.py` classifies this stage as
`save_bundle_present=true` and `native_character_bundle_present=true`.

This proves a genuine native party save with a matching source-created character; it does not yet
prove a cold retail load, campaign cursor, encounter, combat outcome, resume, or consumed-state
persistence. A direct `L` key at the otherwise-empty cold front menu produced neither a frame
transition nor a save-file open, so the load-dispatch route remains a separate experiment rather
than an assumed shortcut.

### Title selection correction: the `Left` trace is DEMO, not a cold save load (2026-07-29)

An earlier interpretation of title colors was backwards and is retracted. On Gateway's menu,
**white text is the active command**: the initial title frame has `PLAY` white and `DEMO` green.
Consequently the `Enter, Enter, Enter, Left, Enter` trace selected **DEMO**, explaining the
Wittman/Provus/Halvish roster and illustrated city intro in
`build/gateway-native-play-load-menu-20260729-a/`. It is valid demo evidence only; it does not
load the native `SAVGAMA` bundle and must not support a campaign-state claim.

The native party-save write above remains independently proven by its DOS create log. The correct
cold-load experiment must retain the white default `PLAY`, then observe the title-local save
dispatch and the `SAVGAMA`/`CHRDATA1` file opens directly. Until that trace exists, campaign-entry,
ECL2 location, player choice/trigger, ECL5 combat, and post-combat resume/consumed-save proof all
remain outstanding.

### Cold-load dispatch correction and bounded recheck (2026-07-29)

The final sentence above was too speculative: there is **no evidence of a title-local save
dispatcher**, and it is retracted. The byte-level route is instead in `GAME.OVR` descriptor 21.
With the descriptor base at file offset `0x2650E`, the function-menu controller starts at
`ovr021+0x03B9`. It tests the far global at `DS:[77C0]:[77C2]` and installs its enable flags:

| Condition | `DS:[0EBB]` (`L`) | `DS:[0EE5]` (`S`) | `DS:[0F0F]` (`B`) |
| --- | ---: | ---: | ---: |
| Pointer nonzero (`+0x03EE..045A`) | 0 | 1 | 1 |
| Pointer zero (`+0x0461..0493`) | 1 | 0 | 0 |

At `ovr021+0x0799`, the literal `L` branch checks only `DS:[0EBB]`; when nonzero it calls
`00B0:004D` at `+0x07A4`. VROOMM relocation data resolves that public stub to
`ovr020+0x35F6` (file `GAME.OVR+0x2534D`), the distinct routine beside the retail Pascal strings
`savgam`, `.dat`, and `Load Which Game:`. This proves that it is Gateway's SAVGAM loader. The
separate `S` and exit-save calls (`ovr021+0x07C6` and `+0x0892`) resolve to
`ovr020+0x3E11`, beside `Save Which Game:`. Thus a character sidecar is not a static prerequisite
for loading: the `L` gate is explicitly enabled on the pointer-zero branch. It still does not
prove that any particular `.DAT` is valid; the loader must be observed opening it.

The earlier visual transcription of that screen was wrong and is retracted: its third visible
option is **`LOAD GAME`**, followed by `INITIALIZE JOYSTICK/MOUSE` and `EXIT TO DOS`. Literal `L`
alone still produces no observable transition in the GameLink trace, but the original menu's
selection convention is now directly proven: `Down`, `Down`, `KP Enter` selects the visible third
row and opens the retail prompt `LOAD WHICH GAME: A`.

This was repeated from the native-save stage at
`build/gateway-native-load-menu-20260729-b/`. Literal `A` selected slot A, and the DOS `FILES` log
then proves the original program opened, in order, `C:\\SAVE\\savgamA.dat`,
`C:\\SAVE\\CHRDATA1.sav`, `C:\\SAVE\\CHRDATA1.fx`, `CHEAD.DAX`, `CBODY.DAX`, and `ECL2.DAX`.
This is the first source-faithful cold SAVGAM/roster load proof for Gateway. It reaches the native
floppy-layout prompt `Insert disk 3 in drive C:` immediately after the ECL2 load; the prompt does
not advance from the flat stage with the attempted `C`/Enter confirmations. That is a distinct
retail disk-layout/configuration gate, not a failed save parse.

`GAME.EXE` itself contains the corresponding installation strings: `Execute START, not GAME.`,
`Keep game disk 1/2 in current drive.`, `Place game disk 3 in other drive.`, and `Select the drive
containing game disk 3:`. `START1.EXE` is the original configuration helper and its reconfigure
flow asks for the sound/device configuration and disk paths. The GOG `GAME.CFG` currently contains
the legacy `F` layout flag and two `C:\\` path rows, while its launcher bypasses `START1.EXE` with
`GAME.EXE UseStart`. Therefore the next experiment must produce an **isolated, native
START1-authored** disk-layout configuration (or faithfully reproduce the launcher mount semantics)
before claiming campaign cursor, encounter, combat, resume, or consumed-state persistence. No
browser change is justified by the loader proof alone.

### Original-DOS demo reference capture (2026-07-29)

The title-menu demo is independently usable as a **rendering and combat-reference capture**, even
though it cannot prove a campaign save/resume cycle. A fresh hash-locked stage was launched through
one exclusive DOSBox-X GameLink session at `build/gateway-native-demo-capture-c-20260729/`. The
title's timing is now directly recorded: the third accepted `Enter` reaches the `PLAY`/`DEMO`
screen; accepting `PLAY` with a fourth `Enter` instead reaches character functions. The successful
demo continuation contains native credits, a first-person explorer segment, and then combat.

`06-after-45s.png` shows the native first-person view and demo roster: `HITMAN`, `PROLOUS THE 3RD`,
`MAL`, and `KREWISH`. `07-after-80s.png` shows the corresponding combat screen (the red squid-like
enemy, party sprites, `PROLOUS THE 3RD`, `HITPOINTS 17`, `AC 8`, `LONG SWORD`, and the native
`MOVE/ATTACK, MOVE LEFT = 10` prompt). The same DOS `FILES` trace records `MON2CHA.DAX`,
`MON2SPC.DAX`, `MON2ITM.DAX`, `CPIC2.DAX`, `PIC.DAX`, `PIC2.DAX`, `WALLDEF.DAX`, and
`WALLDEF2.DAX` around that transition. This is source-faithful evidence for which assets and UI the
demo uses. It is explicitly **not** evidence of the required reachable campaign trigger, player
choice, combat outcome, ECL resume, or consumed save state; no browser behavior is promoted from
the demo alone.

### Disk-layout configuration boundary (2026-07-29)

The post-load disk prompt is now statically bounded, without inventing a configuration-field
mapping. The retail `GAME.CFG` is 22 CRLF records (76 bytes): `V`, an empty record,
`C:\\SAVE\\`, `F`, two `C:\\` records, two `N` records, and fourteen `0` records.
`START1.EXE` reads 21 indexed configuration settings, but the recovered local bytes do **not**
prove that `F` means a particular hard/floppy mode or that either individual `C:\\` row is the
disk-3 path. Do not replace it with a guessed `H` value.

The executable evidence is nevertheless exact: `GAME.EXE` contains `Path of AD&D game disk 1:`,
`Path of AD&D game disk 2:`, `Keep game disk 1/2 in current drive.`, `Place game disk 3 in other
drive.`, and `Select the drive containing game disk 3:`. Its prompt table contains separate
`Insert disk 1..7 in drive` strings. The SAVGAM load's `Insert disk 3 in drive C:` is consequently
the original floppy-layout branch after `ECL2.DAX` succeeds, not a save parse failure.

The two path-looking records have now both been tested only as **negative candidates**, not
relabelled by guesswork. One isolated stage changed only the second `C:\\` row to `D:\\` and
mounted the same byte-identical data at DOS `D:` through the extended probe harness. A second,
fresh stage changed only the first `C:\\` row to `D:\\` under the same `C:`/`D:` mount contract.
Neither resolves the post-`ECL2` disk-3 gate: the former entered repeated `Path of AD&D game disk
2:` configuration, and the latter did the same with the original program searching `N:\\game.ovr`.
The latter trace is retained at `build/gateway-native-cfg-r5-d-20260729/` (`00-boot.png` through
`03-after-a.png` and `dos-files.log`). This disproves treating either one-record substitution as a
proven disk-3 field.

The common retrospective guess that the `F` record can simply be changed to `H` is now also
falsified by a separate, fresh GameLink run at `build/gateway-native-cfg-flag-h-20260729/`.
Only that one-byte record was changed; the hash-locked executables and validated save sidecars
were unchanged. The original program still reached the title/menu, but the original `A` load then
searched `N:\\GAME.OVR` and entered configuration rather than reaching the saved campaign.
`F → H` is consequently not a usable disk-layout repair, and this test establishes neither
letter's semantic label.

A direct media-change probe likewise rules out treating the prompt as an ordinary confirmation.
At the verified `Insert disk 3 in drive C:` screen in
`build/gateway-native-save-enter-disk3-20260729/`, a GameLink `Enter` caused the original program
to reopen `ECL2.DAX` and redraw the prompt. The isolated host stage then hid only that already
hash-recorded `ECL2.DAX` file before another GameLink `Enter`; the retail program searched it again
and still redrew the prompt. The real floppy protocol therefore involves more than a keypress or
one filename's absence. This is a bounded diagnostic experiment, not a valid replacement for a
retail disk-3 image.

`START1.EXE` was then replayed in a fresh, exclusive GameLink session
(`build/gateway-native-start1-authoritative-20260729/`). It visibly presents `ENTER: use previous
configuration, SPACE: reconfigure, ESC: quit`; `SPACE` reaches the native sound prompt and literal
`6` selects `None`. The retail helper then creates `GO.BAT` containing `nosound` and `game UseStart`,
deletes `GAME.CFG`, and exits to DOS -- it does **not** emit an alternative `GAME.CFG` in this direct
GOG-layout run. This is stronger negative evidence than the earlier abbreviated attempt, but it
does not establish what an original multi-disk installation would have written. `START1.EXE`
therefore remains evidence of the original configuration path, not an automated writer we can
safely rely on yet.

The next evidence requirement is a dynamic trace of the retail configuration reader (or an
independent original configuration created by the authentic installation flow) that maps the
persisted disk roots. Until then, preserve the cold-load evidence but do not claim an in-world
cursor, combat, or resume cycle.

A first attempt to obtain that state through the existing `DEBUGBOX` route is also bounded and
negative: `DEBUGBOX GAME.EXE UseStart` reaches the packed executable's own `Packed file is corrupt`
diagnostic before the Gateway menu, while the same hash-locked executable launches normally through
the direct GameLink harness. The debugger process was stopped by its owned PID after the capture.
This is a debugger-loader limitation, not evidence about Gateway's save validity or its menu flags;
the live-state experiment requires either an unpacked/loader-aware debugger entry or a safe
attach-to-the-normal-GameLink-session facility.
