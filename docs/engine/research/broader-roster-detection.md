# Broader-roster detection & ruleset grounding (M5.S6)

Research pass backing the broader non-Krynn `GameProfile` entries in
`packages/engine/src/detect/profiles.ts` and the two new ruleset overlays (`addnd2e`,
`buckrogers`). Written before/alongside implementation so the code only encodes facts with a
citation, not invented filenames or rules-table numbers —
consistent with this project's "not faked" convention (see `docs/dqk-copy-protection.md`,
BUILD-QUEUE's per-slice honesty notes).

No asset data for any of the broader-roster games below is bundled or committed to this repo (G5).
The only locally-present bytes are an uncommitted, git-ignored `coab_extracted/Data/` dump (a third
party's CoAB reimplementation-project asset extraction) used to cross-check the CoAB signature
against real files.

## Pool of Radiance (1988)

- Confirmed unique marker: **`POOL.CFG`** (high confidence). SteamDB's current Collection Two
  depot lists `POOL.CFG`, `START.EXE`, `GAME.OVR`, `ECL1-8.DAX`, `GEO1-8.DAX`, `8X8D1-8.DAX`,
  `BIGPIC`/`PIC`/`WALLDEF` family files, and the common DAX support files:
  `https://steamdb.info/depot/1882370/`.
- The profile keeps `POOL.CFG` as the sole `required` gate and uses the generic Gen1 basenames as
  positive markers. The native ASM booter additionally requires `START.EXE`, because it is booting
  the original executable rather than just identifying a data folder.
- Ruleset: `addnd1e` (plain 1e, no Dragonlance overlay — PoR is a Forgotten Realms title).

## Curse of the Azure Bonds (1989)

- Confirmed unique marker: **`CURSE.CFG`** (high confidence, cross-referenced).
- Real DAX family basenames verified two ways: (a) a contemporaneous DOSBox-compatibility file
  trace, and (b) direct `ls` of the local `coab_extracted/Data/` dump, which lists ~86 real files
  including `8X8D1-6.DAX`, `BIGPIC1/2/6.DAX`, `ECL1-6.DAX`, `GEO2-6.DAX` (no `GEO1.DAX` —
  area 1 apparently has no dungeon geo, mirroring the DQK decompile's own area-1-stub finding),
  `COMSPR.DAX`, `SKY.DAX`, `TITLE.DAX`, `TILES.DAX`, `MON1CHA/ITM/SPC.DAX`, `CHEAD.DAX`,
  `CBODY.DAX`, `SPRIT1.DAX`, `PIC1.DAX`, `WALLDEF2.DAX`, `RANDCOM.DAX`, `DUNGCOM.DAX`,
  `WILDCOM.DAX`. This dump has **no `.CFG`/`.EXE`** (data-only extraction), so `CURSE.CFG` itself
  isn't locally re-verified, only externally cited.
- `packages/engine/test/detect.test.ts` adds an `it.skipIf(!existsSync(...))`-gated test that
  fingerprints the real `coab_extracted/Data/` folder, mirroring the existing opt-in pattern used
  for real CoK/DoK installs.
- Ruleset: `addnd1e`.

## Secret of the Silver Blades (1990)

- Confirmed unique marker: **`BLADES.CFG`**. SteamDB's current depot lists `BLADES.CFG`,
  `START.EXE`, `GAME.OVR`, `ECL1-3.DAX`, `GEO1-3.DAX`, `8X8D1/2/3/5.DAX`, and the common Gen1 DAX
  support files: `https://steamdb.info/depot/1904521/manifests/`.
- Confirmed boot executable: **`START.EXE`**. The Gold Box forum cheat-code thread also references
  the GOG launch form as `start.exe Hoop Gem`, matching the `START.EXE` executable family used by
  Pool/Curse/Krynn: `https://forums.goldbox.games/index.php?topic=1082.15`.
- Ruleset: `addnd1e`.

## Gateway to the Savage Frontier (1991, corrected from an earlier "1988" assumption)

- Confirmed marker pair: **`GAME.CFG` + `ZOUNDS.DAX`**. SteamDB's current depot lists
  `GAME.CFG`, `GAME.EXE`, `GAME.OVR`, `GO.BAT`, `START.BAT`, `ZOUNDS.DAX`, and the Gateway DAX
  family (`ECL2-6.DAX`, `GEO2-6.DAX`, `8X8D*.DAX`, etc.):
  `https://steamdb.info/depot/1904523/`.
- `ZOUNDS.DAX` is **not globally unique**: Pools of Darkness and Treasures of the Savage Frontier
  also ship it in the current release. `GAME.CFG` therefore became the required disambiguator for
  Gateway in both the TypeScript detector and GBBOOT.
- Confirmed boot command: **`GAME.EXE UseStart`**. This was added in the native GBBOOT pass after
  cross-checking the manifest above and a Gold Box forum note that Gateway's `GO.BAT` launches
  `game UseStart` (`https://forums.goldbox.games/index.php?topic=1082.15`). `GAME.EXE` remains a
  detector marker, while GBBOOT passes the same `UseStart` command tail as the batch file.
- `MUSIC.DAX` is shared with DoK's real DOS folder (not `MIDI.DAX` as an earlier, wrong,
  assumption in this pass initially had it) — kept as a very low-weight marker for that reason.
- Ruleset: `addnd2e` — Gateway/Treasures are the Savage Frontier branch covered by the current 2e
  overlay.

## Neverwinter Nights (DOS/AOL)

- Local evidence source: a user-provided `D:\Games\Neverwinter-Nights_DOS_EN.zip` archive extracted
  outside the repo. No game bytes are committed.
- Confirmed marker set in that archive: **`GAME.CFG` + `GAME.OVR` + `ECL0.DAX` + `GEO0.DAX`**.
  `GAME.EXE` is present for the chainload profile, while executable-less copies with the same data
  markers remain native `/E` only. `ZOUNDS.DAX` is absent in the inspected archive, so the TypeScript
  detector and GBBOOT exclude `ZOUNDS.DAX` from this profile to keep it separate from Gateway.
- Asset/archive shape: the inspected dump contains `ECL0.DAX` blocks 1..9 and matching `GEO0.DAX`
  blocks 1..9; `ECL1/GEO1` cover entries 10, 11, 12, and 14..19; `ECL2/GEO2` cover 20..29; and
  `ECL3/GEO3` covers 30. `ECL5` and `ECL7` exist without matching local GEO archives in the inspected
  set, so they are not default native map starts.
- Native GBBOOT default: `GBBOOT /E` starts `CCECL ECL0.DAX entry 1 -> CCGEO /B GEO0.DAX`. `/A 1`,
  `/A 2`, and `/A 3` map to `ECL1/GEO1 entry 10`, `ECL2/GEO2 entry 20`, and `ECL3/GEO3 entry 30`
  respectively. This is a verified preview boot boundary, not yet a claim that NWN's full online-era
  gameplay loop or network/session behaviour is reproduced.
- Seeded ECL7 combat evidence: static ECL disassembly found `LOAD_MONSTER` + `COMBAT` branches in
  `ECL7.DAX` block 79. A local headless probe confirmed three branches by seeding AOL-host state
  `0x4bf2=29` and selector source `0xc04f`: selector `125` emits encounter groups
  `(46 x2, 98 x4, 67 x2)`, selector `108` emits `(85 x2, 46 x5, 76 x2)`, and selector `121` emits
  `(91 x4)`. CCCOMBAT consumes the real `MONCHA.DAX` records to produce trace/output/result files.
  GBBOOT exposes that proof as `GBBOOT /E /A 7`, preserving explicit `/0 49231 <selector>` overrides
  for focused probes and keeping `GEO0.DAX` as the fallback view archive because no `GEO7.DAX` was
  present in the inspected dump.
- Real-data regression: `native\gbnwn-flow-test.ps1` now repeats the proof without committing game
  bytes. It skips when the local NWN extraction is absent, otherwise it builds the native engine,
  copies the required NWN files into a scratch mount, verifies bounded title playback plus `/R`
  party creation and the ECL0/GEO0 preview, then reuses that party for `GBBOOT /E /X /A 7` and
  selector override probes, asserting the `GBPS` sparse memory seeds, real `MONCHA.DAX` encounter
  groups, combat RAW/trace, and `GBCR` sidecar. It also verifies two ordinary walk-loop legs:
  default `GBBOOT /E /T 1` reaches an ECL0/GEO0 sign text event with no tactical artifacts, and
  `GBBOOT /E /A 1 /T 1` from pose `(14,4)` east uses the selected `GEO1.DAX` block-10 fallback,
  steps into descriptor 229, queues real `MONCHA.DAX` groups `69 x2` and `30 x3`, runs
  `CCCOMBAT`, writes `GBCR`, resumes the ECL continuation, then relaunches `GBBOOT /E /A 1 /T 1`
  from the persisted area-1 `GBSN` pose `(15,4)` facing east as a bounded continuation. That
  boundary takes no new step, rebuilds the area-1 wall bridge, writes no tactical sidecars, and
  leaves `GBSN` and `GBPR` unchanged.
- Title front door: the local archive's `TITLE.DAX` runs through the same bounded Gen1 `GBBOOT /E /J`
  title helper used by the other DAX profiles, then continues into the native ECL0/GEO0 preview.
- Native party/combat bridge: NWN is wired into the shared Gen1 GBPR/GBPS path, including `/R`
  native member creation and `CCCOMBAT /P` party import. Synthetic smoke coverage keeps the generic
  handoff regression-tested, while the local ECL7 probes above prove multiple real NWN combat
  script routes.
- Ruleset: `addnd2e` for detection/rules overlay purposes, matching the late Forgotten Realms Gold Box
  branch until deeper NWN-specific rules differences are decoded.

## Pools of Darkness (1991)

- Confirmed unique marker: **`POOL4.CFG`**. SteamDB's current depot lists `POOL4.CFG`, `GAME.EXE`,
  `GAME.OVR`, `CONTROL.EXE`, `STARTUP.EXE`, `START.BAT`, `VACE.EXE`, `ECL1.DAX`, `GEO1.DAX`, and
  `ZOUNDS.DAX`: `https://steamdb.info/depot/1904522/`.
- The `ZOUNDS.DAX` overlap is why Gateway no longer treats `ZOUNDS.DAX` as unique. Pools uses
  `POOL4.CFG` as the required detector gate; `GAME.EXE`/`GAME.OVR`/`CONTROL.EXE`/`STARTUP.EXE`/
  `VACE.EXE` are markers.
- Boot path: a DOSBox-X EXEC bug report documents the Pools/Treasures launch chain as
  `START.BAT` -> `STARTUP.EXE`/sound setup/optional `VACE.EXE` -> `GAME.EXE`, and explicitly notes
  that running `GAME.EXE` directly enters the games:
  `https://github.com/joncampbell123/dosbox-x/issues/6055`. A Gold Box forum note independently
  references Pools as `game.exe 2 2 Helm`: `https://forums.goldbox.games/index.php?topic=1082.15`.
  GBBOOT therefore chainloads `GAME.EXE` directly for now.
- Ruleset: `addnd1e`.

## Treasures of the Savage Frontier (1992)

- Confirmed unique marker: **`TREASURE.CFG`**. SteamDB's current depot lists `TREASURE.CFG`,
  `GAME.EXE`, `GAME.OVR`, `CONTROL.EXE`, `STARTUP.EXE`, `START.BAT`, `ECL1.DAX`, `GEO1.DAX`,
  and `ZOUNDS.DAX`: `https://steamdb.info/depot/1904524/`.
- `TREASURE.CFG` is the required disambiguator from Gateway/Pools. `ZOUNDS.DAX` is retained as a
  secondary required marker because the current installed game includes it and it matches the
  Savage Frontier executable family, but it is not treated as unique by itself.
- Boot path: the same DOSBox-X report covers Treasures' `START.BAT`/`STARTUP.EXE`/`CONTROL.EXE`/
  `GAME.EXE` chain, and the Gold Box forum cheat-code thread says the first line of `Start.bat`
  starts as `startup` and was altered to `game.exe 2 2 Helm`.
- Ruleset: `addnd2e`.

## Buck Rogers: Countdown to Doomsday (1990)

- The only verified real facts come from the floppy distribution's own filenames: a genuine
  **3-part split executable, `BUCK1.EXE` / `BUCK2.EXE` / `BUCK3.EXE`**, plus an `INSTALL.COM`
  installer. This is a meaningfully different situation from the 3 games above: the *installed*
  data-file naming scheme is genuinely unknown (the floppies are self-extracting installer blobs
  this project has not decompressed), so the profile keys on the executables rather than any DAX
  basename — an honest, structurally different signature from the other 3 broader-roster entries.
- Confirmed: the game has **5 careers — Rocket Jock, Warrior, Engineer, Rogue, Medic** (no
  Psionicist; an earlier `ARCHITECTURE.md` planning assumption of "6 careers incl. Psionicist" was
  wrong and is not repeated in the shipped code). Combat runs on "THAC0/AC, same math as AD&D" —
  SSI reskinned the Gold Box engine rather than building new mechanics.
- No verified per-career XP/THAC0 numbers exist publicly. `ruleset/buckrogers/index.ts` therefore
  `extends: addnd1e.id` and maps each of the 5 careers onto the closest analogous 1e class
  (`BUCK_ROGERS_CAREERS`) rather than inventing Buck-Rogers-specific numbers — see that file's
  header for the full mapping rationale.
- Ruleset: `buckrogers`.

## Buck Rogers: Matrix Cubed (1992)

- Confirmed boot executable: **`START.EXE`**. DOSBoxWiki's Matrix Cubed compatibility page lists
  `START.EXE` as the executable and says to run it for sound setup:
  `https://www.dosbox.com/wiki/GAMES%3ABuck_Rogers%3A_Matrix_Cubed`.
- Confirmed game-specific marker: **`MATRIX.CFG`**. The same DOSBoxWiki page and the linked
  VOGONS troubleshooting thread both discuss deleting `MATRIX.CFG` to force the game's sound
  configuration flow; VOGONS also names the shipped `BUCKA.XMI` / `BUCKB.XMI` / `BUCKC.XMI`
  music files: `https://www.vogons.org/viewtopic.php?t=4855`.
- Detector/GBBOOT signature: require `START.EXE` + `MATRIX.CFG`; treat the Buck XMI files as
  secondary evidence only. `START.EXE` is shared across many SSI games, so `MATRIX.CFG` is the
  disambiguator.
- Ruleset: `buckrogers`.

## Native GBBOOT `/E` boundary

CoK/DoK are the Krynn verified exception to the raw-map override rule: their real local
ECL TOCs confirm the native area starts used by `GBBOOT /E /A n`
(`ECL1.DAX` block 34, `ECL2.DAX` block 48, `ECL3.DAX` block 80), so those
overrides stay on the ECL-backed path.
Executable-less CoK/DoK folders with `KRYNN.CFG` or `DKK.CFG` plus
`ECL1.DAX` and `GEO1.DAX` now preserve their Krynn profile names instead of
falling through to the generic Gen1 data profile. They run the verified
area-1 native path, `CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX`, refuse
plain chainload, and are also recognized through direct `GAME\` wrapper roots.

The local `coab_extracted\Data` dump gives Curse/CoAB a second verified
ECL-backed exception for native preview: area 2 starts `ECL2.DAX` block 1, area
3 starts `ECL3.DAX` block 16, area 4 starts `ECL4.DAX` block 32, area 5 starts
`ECL5.DAX` block 49, and area 6 starts `ECL6.DAX` block 64. Each corresponding
`GEOn.DAX`/`WALLDEFn.DAX`/`8X8Dn.DAX` path is covered by the `GBBOOT /E`
engine smoke when that local dump is present. Synthetic nested-wrapper smokes
also prove `GAME\CURSE\ECL2.DAX` and `/A 3` `GAME\CURSE\ECL3.DAX` take the same
ECL-backed native paths after GBBOOT auto-enters the real DOS cwd.

The same local dump also verifies additional opt-in `GBBOOT /E /X /A n /B block`
map starts through the full native chain: area 2 blocks 2/3/4, area 3 blocks
17/21, area 4 blocks 34/37, area 5 blocks 50/51/53, and area 6 blocks 66/67/69.
Each emits a real CoAB `LOAD_FILES` handoff, bakes the matching `GEOn.DAX` map,
selects Gen1 wall art via `LOAD_PIECES`, and writes `_GBVIEW.RAW`. Area 5 block
50 additionally covers the combat-yield path: it emits two real encounter
groups from `MON5CHA.DAX`, runs `CCCOMBAT`, writes `_GBCOMB.RAW`/`_GBCOMB.TRC`
with the deterministic `enemy` outcome, and still falls through to the
first-person map snapshot for GEO block 50.

For the broader DAX profiles with a `GEO1.DAX`..`GEO8.DAX` archive present, `GBBOOT /E` may launch
the raw map walker as `CCGEO.COM /B <geo> 0 ...` without first interpreting ECL. For Gen1 DAX GEO
archives, `CCGEO` treats map id `0` as "first valid 1026-byte GEO block in TOC order"; this avoids
guessing a raw block id for profiles whose startup ECL is still unverified. That is intentional: it
verifies the native DAX GEO bridge and first-person walker on the broader layouts, but it does
**not** claim the unverified startup ECL entry points for Pool/Secret/Gateway/Treasures/Pools are
decoded yet. The wider probe matters for Gateway/Curse-like layouts whose documented map family
starts at `GEO2.DAX`; the DOS smoke suite now covers profile-specific `/A 2` raw-map overrides for
Pool, Secret, Gateway, Treasures, Pools of Darkness, Buck Rogers Countdown, and Matrix Cubed when
`GEO2.DAX` is present, including the Steam/GOG-style `GAME\<shortname>` wrapper roots for the
Forgotten Realms DOS games, `GAME\BUCK`/`GAME\MATRIX` Buck Rogers wrappers, and direct `GAME`
folders where the wrapper puts the DOS files or native-only marker data immediately under `GAME`.
When the local
CoAB extraction is available, it also mounts a Gateway-marker fixture over real area-2
GEO/WALLDEF/8X8D bytes and asserts the textured
`CCFP /T /A 2` handoff.
Neverwinter Nights is the explicit exception to the "starts at ECL1/GEO1" shorthand in this section:
its local archive starts at `ECL0/GEO0`, and the smoke suite pins both the default `ECL0/GEO0` path
and the observed `/A 1..3` ECL/GEO mappings. It also pins `/A 7` as a seeded ECL7 combat path with
`GEO0.DAX` fallback because the local archive has no `GEO7.DAX`; `/A 1` now has a real natural
movement-to-combat/resume plus post-natural-combat continuation proof rather than only a preview
boundary.
Matrix Cubed and Countdown still rely on synthetic `GEO*.DAX` smoke fixtures to keep the Buck Rogers
profiles covered through the same raw-map fallback, because this repo still has no verified Buck
Rogers map-archive listing. FRUA-style HLIB fallback installs and generic
executable-less HLIB/GLB dumps use the same raw-map boundary when `GEO.GLB` is present: `CCGEO`
map `0` means the first sniffed GEO member, while nonzero Gen2 ids are resolved through the
HLIB id table, again without claiming a verified `SCRIPT.GLB` startup path. If matching
`8X8DB.TLB`/`8X8DC.TLB` art is available on that raw path, the default preview still uses set 0;
an explicit `/A n` remains the map-id override and also acts as a best-effort 1-based wall-set hint
for the raw HLIB renderer, so `/A 10` can select `8X8DC.TLB` set 0 without claiming script-derived
wall selection.
FRUA-style `SCRIPT.GLB` also has an explicit `/B <entry>` escape hatch: when `GEO.GLB` is present,
GBBOOT can run `CCECL SCRIPT.GLB entry <entry>` and use the emitted `LOAD_FILES` bridge. The smoke
coverage uses a synthetic HLIB ECL container for this path; it does not assert that stock FRUA
`SCRIPT.GLB` uses the same opcode semantics as DQK `ECL.GLB`.

`GBBOOT /E /B <block>` is the native escape hatch for externally verified ECL
starts that are not hardcoded here yet. With Gen1 DAX profiles, `/A n` requires
both `ECLn.DAX` and `GEOn.DAX`; without `/A` it uses area 1. It then runs the
normal `CCECL ECLn.DAX entry <block>` effect chain before `CCGEO`/`CCFP`. This
lets a broader install move from raw-map fallback to ECL-backed boot when its
start block is known, while preserving the default "do not guess" boundary
above. If the required `ECLn.DAX`/`GEOn.DAX` pair is absent, GBBOOT reports the
requested native ECL entry/archive as unavailable instead of falling back to raw
maps; non-dry-run `/E` stops before launching the helper chain for that
unavailable plan. For DQK/HLIB ECL-backed profiles, `/B` selects the HLIB ECL
area/member id directly; for FRUA-style HLIB installs, the same `/B` form is
opt-in only and promotes `SCRIPT.GLB` to CCECL's HLIB container path when
`GEO.GLB` is present. Missing `SCRIPT.GLB`/`GEO.GLB` for that FRUA escape hatch
uses the same explicit ECL-entry/archive unavailable diagnostic. The native
smoke suite covers this mechanism with
synthetic Pool, Secret, Gateway, Treasures, Pools of Darkness, Buck Rogers
Countdown, Matrix Cubed `/B 34`, Neverwinter Nights ECL0/GEO0 plus `/A 1..3`,
real DQK `ECL.GLB /B 18` as an explicit native ECL-block escape-hatch smoke only, and FRUA-style
`SCRIPT.GLB /B 1` fixtures; those fixtures prove the escape hatch, not real
default startup entries or a normal DQK monster-combat route. The loaded-GEO natural DQK area-18
combat gate currently known in web is a temple/service empty-roster `COMBAT`, not a wandering monster
encounter. Matching synthetic combat-yield fixtures now drive the same
broader-profile set through `CCCOMBAT` with Gen1-compatible `MON1CHA.DAX`
archives, proving the combat handoff mechanics without asserting the games'
real startup blocks or real monster archive layouts. The Pool `/B 34` fixture is
also byte-checked against `packages/engine/test/nativeGbbootEclTrace.test.ts`,
which runs the same synthetic `LOAD_FILES 34,2,255` block through the TypeScript
`EclVm` and compares the native `GBEF` bridge fields.

The TypeScript folder detector now mirrors the concrete FRUA install profile behind that native
fallback: `CKIT.EXE` + `SCRIPT.GLB` identifies `forgotten-realms-unlimited-adventures`, while
`GEO.GLB`/`STRG.GLB`/`SOUNDS.GLB` are only score boosters and `SCRIPT.GLB` can be magic-confirmed
with the shared HLIB signature. This is a detection/asset-routing profile, not a claim that FRUA's
`SCRIPT.GLB` event schema uses the CoK/DoK/DQK ECL opcode VM. Native GBBOOT also auto-enters a
generic `GAME` child directory when it contains FRUA's `CKIT.EXE` + `SCRIPT.GLB`, or when it
contains only a native-only `GEO.GLB` HLIB dump; the smoke suite verifies both wrapper shapes
through EXEC where applicable and the `GEO.GLB` raw-map native preview.

Generic executable-less DAX dumps use the same boundary now: if any
`GEO1.DAX`..`GEO8.DAX` file is present, `GBBOOT /E` can boot the native raw-map
preview and refuses plain chainload. No ECL or 8X8D archive is required for that
outline walker path. When matching `WALLDEF<area>.DAX` and `8X8D<area>.DAX`
art is available, plus the shared boot-cap `8X8D1.DAX`, `GBBOOT /E` can upgrade
the raw DAX walker to `CCFP /T /A <area>` without passing an `/E` sidecar; it
therefore does not claim ECL-derived `LOAD_PIECES` selection for unverified
startup entries. The DOS smoke suite covers this both with a CoK area-1 raw data
fixture and, when the local `coab_extracted\Data` dump is present, a CoAB area-2
raw data fixture.
If the executable-less folder still has a named profile marker (`KRYNN.CFG`,
`DKK.CFG`, `POOL.CFG`, `CURSE.CFG`, `BLADES.CFG`, `GAME.CFG` + `ZOUNDS.DAX`,
`TREASURE.CFG` + `ZOUNDS.DAX`, `POOL4.CFG`, or `MATRIX.CFG`), native GBBOOT
now preserves that specific game name instead of falling through to the generic
data-only profile, provided the matching Krynn `ECL1/GEO1` pair or a
`GEO*.DAX` archive is present for the native preview path. The smoke suite pins
this with no-executable CoK, DoK, Pool, Curse, Secret, Gateway, Treasures,
Pools of Darkness, and Matrix Cubed fixtures, including the matching
`GAME\<shortname>` wrapper roots and direct `GAME` data-only roots for those
profiles. When executable-less Pool, Secret, Gateway, Treasures, Pools of
Darkness, or Matrix Cubed fixtures include both `ECL1.DAX` and `GEO1.DAX`,
GBBOOT promotes them from the raw-map preview to the same synthetic area-1
`CCECL ECL1.DAX entry 34 -> CCGEO /B GEO1.DAX` path covered by the executable
profile fixtures; direct `GAME\` data-only roots and nested
`GAME\<shortname>` data-only roots are covered the same way. Without that pair,
these profiles keep the conservative `CCGEO /B GEO*.DAX map 0` boundary. It
also proves executable direct-`GAME` wrappers for CoK, DoK, Pool, Curse,
Secret, Gateway, Treasures, Pools of Darkness, Countdown to Doomsday, and Matrix
Cubed, with synthetic `ECL1/GEO1` native starts for the broader direct
`GAME\` executable wrappers and the matching nested `GAME\<shortname>`
executable wrapper shapes.
Countdown to
Doomsday remains excluded from this data-only marker list because this repo has
no verified non-executable Countdown marker or map-archive listing.

Executable-less HLIB/DQK-class dumps are also native-only now: flat `ECL.GLB` +
`GEO.GLB`, or original disk-layout `DISK3\ECL.GLB` + `DISK3\GEO.GLB`, is enough
for `GBBOOT /E` to run `CCECL` and `CCGEO`. Matching `8X8DB.TLB` or
`DISK2\8X8DB.TLB` upgrades the preview to the GBWS wall-set path; `8X8DC.TLB`
or `DISK2\8X8DC.TLB` is used when present for the second DQK/FRUA wall bank.
Plain chainload is refused because there is no original executable. The common
`GAME\DISK3` wrapper shape is auto-entered for this native-only DQK path. If only
`GEO.GLB` is present, including the common `GAME\GEO.GLB` wrapper shape, `GBBOOT
/E` still boots the conservative raw-map walker through `CCGEO /B GEO.GLB map
0`, but it does not guess an ECL entry. Matching `8X8DB.TLB` can upgrade that
raw HLIB walker to a set-0 `GBWS` wall-art bundle without claiming ECL-derived
wall-set selection. For raw HLIB/FRUA previews, an explicit `/A n` also supplies
the wall-set hint used by `CCHLIB W`; the smoke suite now covers `/A 10`
selecting the `8X8DC.TLB` bank on both FRUA-style and generic HLIB fixtures.

## `addnd2e` ruleset scope

2e's headline combat simplification replaced 1e's irregular per-class THAC0 lookup tables with a
clean per-level formula grouped into four progression families. Rates (warriors 1/level, priests
1/3 levels, rogues 1/2 levels, wizards 1/5 levels), transcribed from the PHB Table 52
progression-rate summary at https://adnd2e.fandom.com/wiki/Calculating_THAC0_(PHB) — a secondary
source; no Gateway binary or manual exists in this repo to cross-check against (unlike the Krynn
tables, which were verified against a decompiled binary). `ruleset/addnd2e/index.ts` implements
this as a formula, not a literal per-level PHB table transcription.

Assassin and monk are not core 2e PHB classes (dropped until later splatbooks); both fall back to
the rogue-family rate, the same "closest core group" convention `addnd1e/progression.ts` already
uses for its own out-of-table classes.

Everything else (ability modifiers, XP/level progression, hit dice, saving throws, spell slots)
honestly inherits `addnd1e` unchanged via `extends` — not independently re-sourced for 2e. This
matches the scope `docs/engine/ARCHITECTURE.md` itself anticipated: "`addnd2e` overrides
THAC0/proficiency" (proficiency has no `RulesetPlugin` hook yet, so it isn't modelled).
