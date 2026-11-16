# Native Gen1 demo sequence patterns

> **Status (2026-07-24):** static cross-title scanner implemented; native framebuffer verification
> completed for CoK, DoK, Secret, Gateway, Treasures, and Pools; the browser now reproduces the full 320x200
> picture/walk/HUD presentation and visibly advances scripted tactical battles. Raw screenshots,
> DOS file logs, and RAM snapshots stay under git-ignored `build/`.

## Result

The first-person walking portions are stored in the games' already-located ECL demo blocks. They
are not a second hidden movie file, and they do not share one fixed EXE address. The portable
signature is behavioral:

1. `LOAD_FILES` and `LOAD_PIECES` load real GEO and wall data.
2. The script seeds or changes the live X/Y/facing cells.
3. It repeatedly invokes a title-specific dungeon redraw routine and/or the native
   move-position-forward host call.
4. The same script later stages monsters and reaches `COMBAT`.

`tools/analyze_gen1_demo_sequences.py` applies that signature to every located Gen1 demo entry.
It relies on `tools/map_gen1_demo_entry.py`, whose control-flow renderer now selects the proven
operand dialect for each title.

## The decoder bug that hid DoK's walk and combat

The generalized mapper located DoK's correct block (`ECL1.DAX` block 2) but passed it through
CoK's long-form operand table. DoK's first short-form `PARLAY` has one operand; the long decoder
consumed five following instructions as fake operands and abandoned the real continuation. That
produced two false conclusions in prior documentation: that DoK had no walking sequence and that
`SETUP_MONSTER` fell into `EXIT` without combat.

The mapper now threads `word_sets_for_profile(profile_id)` through `follow_chain()` and
`linearize_entry()`. A regression test pins the critical boundary:

```text
short PARLAY #5 -> COMBAT -> EXIT
```

Under the corrected dialect, DoK block 2 reaches all of the following coherently:

```text
LOAD_FILES #32,#127,#255
LOAD_PIECES #2,#127,#127
SAVE position/time/facing
repeated walking helper calls
SETUP_MONSTER #255,#0,#24,#0
LOAD_MONSTER Dread Wolf / Evil Warlord groups
COMBAT at vaddr 0x8363
post-combat narration
```

## How the walking scripts vary by engine build

The ECL operand words below are script-visible host-call identifiers. The compiled redraw entry
moves between titles, which is why matching one literal EXE offset would be brittle.

| Title | Walking mechanism in its demo ECL |
| --- | --- |
| CoK | Direct `ADD`/`SUBTRACT` updates to `[0xC04B..0xC04D]`, followed by local redraw helpers using `CALL [0x2E10]`. |
| DoK | Repeated `GOSUB 0x8451`; the helper compares desired facing `[0x7F7A]` with `[0xC04D]`, redraws via `CALL [0x2DCB]`, and advances via `CALL [0xC01E]`. |
| Secret | Direct X/Y arithmetic followed by redraws through `CALL [0x2DCB]`. |
| Gateway | Direct alternating redraw `CALL [0x2E10]` and move-forward `CALL [0xC01E]` pairs. |
| Pools | Five redraw/movement beats using the late-short tagged host operands `0x8002..0x8004`. |

The values in that column are **raw ECL operand words**, not `op_call` routine ids: the Gen1
VM computes `id = word - 0x7FFF`, so `$2E10` is id `0xae11` and `$2DCB` is id `0xadcc`
(`tools/ecl_host_call_coverage.py:call_operand_word_gen1` publishes both directions).

**Why the redraw entry "moves between titles" -- grounded 2026-09-10, on the C64 side.** The two
raw words are not arbitrary: each is its own title's C64 `LIBRARY` leading-jump-table slot whose
target is `JMP $0803`, the generic overlay-call trampoline
(`docs/engine/research/c64-resident-kernel.md` section 9.2a;
`python tools/c64_kernel.py trampoline --title <t>`). CoK and Gateway build a **32-slot** table
and put the trampoline at slot 24 = `$2E10`; DoK and Secret build a **3-slot** table and put it
at slot 1 = `$2DCB`. That is exactly the split this table records, and **Secret and Gateway were
predicted before their tables were read** -- they played no part in forming the hypothesis, which
came from CoK and DoK alone. Independent DOS-side confirmation from the retail bytes, by raw
16-bit word scan over each title's own `ECL*.DAX`: CoK `$2E10` x112 / `$2DCB` x0, DoK `$2DCB`
x111 / `$2E10` x1, Secret `$2DCB` x147 / `$2E10` x1, Gateway `$2E10` x135 / `$2DCB` x0.

**The limit, which is sharper than the finding.** `$0803` means "jump 3 bytes into whatever
overlay is currently staged at `$0800`" -- it is generic dispatch. So the correspondence settles
WHICH SLOT each title's operand names, and contributes **nothing** to the semantic label
"redrawDungeonView", which still rests only on the script-shape reading above and has never been
checked against any title's `GAME.OVR`. It is likewise not evidence that 23 entries were removed
ahead of DoK's slot: a 3-slot table and a 32-slot table are differently-built tables, not one
minus rows. Note also that `$6803` below is **not** in any of the four titles' jump tables at
all, which is why it is the same word in every title while the redraw word is not.

`CALL [0x6803]` is a different common pattern: the decoded `advanceAnimatedPicture` host routine
used for portrait/combat animation beats. It is useful sequence evidence but is not, by itself,
proof of first-person walking.

## Cross-title census

| Game | Located native demo | Static sequence result | Native pixel verification |
| --- | --- | --- | --- |
| Champions of Krynn | `ECL2.DAX#57` | first-person walk + combat | Yes: retained prior native CoK run. |
| Death Knights of Krynn | `ECL1.DAX#2` | first-person walk + combat | Yes: daytime city walk, nighttime dungeon walk, then auto-combat. |
| Curse of the Azure Bonds | `ECL1.DAX#82` | combat; no walking signature | Not rerun in this round. |
| Secret of the Silver Blades | `ECL1.DAX#3` | first-person walk + combat | Yes: walk visible around capture t=40s; tactical combat by t=60s. |
| Gateway to the Savage Frontier | `ECL2.DAX#82` | first-person walk + combat | Yes: walk visible around t=86s/t=104s; Giant Squid combat by t=126s. |
| Pools of Darkness | `ECL1.DAX#4` | five first-person walk beats + combat | Yes: native walk/art/HUD progression and automatic combat captured. |
| Treasures of the Savage Frontier | `ECL1.DAX#4` | portrait narration + combat; no first-person walk | Yes: RAM proves block 4 loaded; five pictures, native BORD chrome, six-member HUD, and combat captured. |
| Pool of Radiance | none | no Play/Demo prompt | Verified negative. |
| Neverwinter Nights (DOS) | none | no local Play/Demo prompt | Verified negative. |
| The Dark Queen of Krynn | Gen2 `ECL.GLB#7` | portrait-driven narration + terminal combat, no Gen1 walking signature | Separate Gen2 route; not classified by the Gen1 scanner. |

The machine-readable census is regenerated into git-ignored
`build/gen1-demo-sequence-patterns.json`:

```powershell
python tools/analyze_gen1_demo_sequences.py
```

## Reusable native capture

`tools/capture_gen1_demo.ps1` replaces the one-off recording command. It:

- launches the retail title through the focusless DOSBox-X GameLink path;
- validates exclusive ownership of the machine-wide GameLink mapping;
- sends the Demo hotkey through GameLink, never host keyboard APIs;
- retains only changed framebuffers;
- logs DOS file activity;
- dumps the complete first 1 MiB of physical RAM at a configurable interval;
- writes SHA-256 hashes and timing into `manifest.json`; and
- stops only the exact DOSBox-X PID it launched.

Example:

```powershell
pwsh -NoProfile -File tools/capture_gen1_demo.ps1 `
  -Profile secret-of-the-silver-blades `
  -DurationSeconds 180
```

Full RAM snapshots contain every conventional-memory segment. They do not independently identify
which segment owns CS/DS/SS at a phase boundary; that attribution still requires the brief
DEBUGBOX/INT 21 overlay census used by the more specialized runtime traces.

## Browser implementation (updated 2026-07-24)

The browser now consumes the original effects instead of flattening them away. `EclVm` CALL effects
carry a sparse-memory snapshot taken at the exact dispatch point. `demoGen1.ts` uses it to:

1. pair `LOAD_FILES` and `LOAD_PIECES` into a real GEO/WALLDEF/8X8D scene;
2. read the script-visible X/Y/facing cells at each redraw or move call;
3. preserve host-side move-forward changes that do not write back into ECL memory;
4. render every redraw through the same first-person engine compositor used by exploration;
5. pass that viewport through the shared 320x200 exploration-screen compositor, alongside the
   title's own block-201 font, block-202 frame tiles, demo party, position, and narration;
6. retain every decoded PIC/BODY animation frame and advance it on `CALL [0x6803]`; and
7. continue into tactical combat one visible AI action per demo tick, then resume the ECL script.

### Native-fidelity calibration (CoK + DoK)

The compositor no longer treats CoK's block-202 ordering as universal. A cell-by-cell match of the
downsampled native DoK framebuffer against all decoded `8X8D1#202` tiles recovered an MSE=0 DoK
layout: corners `0..3`, horizontal `4`, moon brackets `5/6`, vertical `7`, vertical-divider
junctions `8/9`, and horizontal-divider ends `10/11`. The exported `DOK_FRAME_LAYOUT` is used by
all DoK play profiles, the attract demo, and its combat screen. DoK moon groups are normalized from
their native packing `[red=13, white=21, black=17]`; the fixed demo uses full discs `[23,15,19]`.
CoK's previously recovered `COK_FRAME_LAYOUT` re-matched every tested chrome cell at MSE=0.

The city-walk backdrop is real source art rather than a flat gray proxy. CoK composites
`SKY.DAX#252` at the native ground-strip offset and reads the ECL hour at `[0x4BC9]`. DoK uses
`SKYGRND.DAX#2` as the complete daytime 88×88 background; at 20:00, `SKYGRND.DAX#1` replaces its
upper 44 pixels while #2's ground remains. At DoK retail pose `(5,15,N)`, the resulting 88×88
viewport is pixel-identical to native frame `t074` (7,744/7,744 pixels).

That comparison also found the wall-loader defect: DoK's shared 256-tile bank is zero-based and
every WALLDEF record already stores a global bank index. The loader had subtracted one, relocated
records 2/3 like CoK, and routed low/high ids into boot UI sets. It now uses all DoK ids `0..255`
directly; `dokDemoView.test.ts` pins native cells 55/49/52 plus a low-id case. CoK frame `t040`
now matches all **7,744/7,744** viewport pixels at its recovered `(13,5,W)` pose. A fresh
2026-07-27 GameLink capture isolated the former 312-pixel (96.0%) discrepancy to low-id resident
wall tiles: the area-2 `WALLDEF2` table legitimately refers to the boot `8X8D1` bank (not only
`8X8D2`). The demo profile now loads `8X8D1` before `8X8D2`, preserving area-2 blocks where ids
overlap while making resident blocks 202/203 available. The focused browser test samples five
affected native-brown pixels in the first city viewport, so a return to the area-only archive cannot
pass merely by drawing several nonblank walk frames.

Combat selects CPIC per combatant from the script itself. CoK binds enemy picture ids `10/4/31`
and NPC ids `60/62/61`; DoK binds `72/24/22` and `48/49/50`. Thus dragons, undead, wolves,
warlords, and each party NPC use their own retail art instead of one shared frame. The complete
scripted enemy roster is placed on the field (rather than the former six-figure display cap). Each
title also seeds its logical map from a 7×7 DUNGCOM tile-index snapshot recovered by exact cell
matching against native combat frames (`t0120` CoK, `t136` DoK), embedded in a 13×9 field so
scrolling and observable turn/action progression remain intact.

The full native tactical map and exact per-turn formation are not present in ECL and have not yet
been attributed to a stable RAM structure. The calibration therefore reproduces the title's real
initial terrain viewport and CPIC roster with source-shaped east/west anchors; later camera positions
are engine-driven rather than a frame-by-frame movie replay. This is the remaining combat-fidelity
boundary, not a return to generic terrain or icons.

CoK's former one-off player is now a compatibility wrapper over the generalized implementation.
Its actual picture sources are `PIC2.DAX` (portraits/animation), `BIGPIC2.DAX` (304x120 story art),
and a native `HEAD2#69` + `BODY2#68` 88x88 shopkeeper assembly. DoK's sequence resolves through
`PIC4.DAX`, `PIC5.DAX`, and `BIGPIC1.DAX`. Big pictures replace the complete 304x120 top interior;
88x88 pictures sit at native screen `(24,24)` inside the left game window. DoK and Gateway also load
their resident/global wall banks in addition to the numbered area bank because their scripts address
globally unique wall block ids across DAX files.

The fresh native CoK capture (`tools/capture_gen1_demo.ps1 -Profile champions-of-krynn`) confirmed
the complete progression: small portrait; city walk; shopkeeper composite; more walking; 304x120
story scene; campfire; dragon approach/animated close-up; tactical battle; animated closing portrait.
The file-open log independently identifies `PIC2`, `HEAD2`, `BODY2`, `BIGPIC2`, `CPIC2`, and
`DUNGCOM` at those phases. The existing DoK native capture shows the same screen modes and a visibly
changing tactical fight, not an instant result.

DoK's compact MON decoder still yields zero HP for these demo records. The profile therefore supplies
the three HP values visible in the native HUD (Sir Dryden 134, Tanar 131, Flavius 101) and conservative
named enemy values only when the decoded HP is zero. This fallback becomes inert automatically when
the compact HP field is recovered.

### Forgotten Realms calibration: Secret and Gateway (2026-07-24)

Three deterministic native-frame tools now replace visual guessing:

- `tools/match_gen1_frame_tiles.py` normalizes GameLink's integer-scaled framebuffer and matches
  every standard chrome cell against a selected 8X8D block. Its palette-invariant mode proves tile
  index patterns even when a VGA title has reprogrammed DAC registers.
- `tools/match_gen1_combat_tiles.py` merges unobscured DUNGCOM cells across several tactical frames.
- `tools/match_gen1_combat_icons.py` scans CPIC art (including horizontal flips) against the native
  battlefield. It now recognizes Gateway's prefixed planar5 CPIC and can prove index-pattern
  matches under a changed DAC. Early CPIC treats 0/8 as masks; Gateway proves only source 0 is
  transparent and source 8 is opaque black. JSON reports retain the recovered palette mapping.

Secret native frame `t0040` matches all 237 chrome cells exactly against `8X8D1#202`. Its frame uses
outer tiles 49/52..55 and inset tiles 56..59, with no Dragonlance moons. Combat frames `t0048..0060`
recover 41 unobscured DUNGCOM cells (the remaining eight are occupied) and the complete formation:
Sieglinda CPIC 205 at `(2,3)`, Capet CPIC 76 at `(3,3)`, Averoes CPIC 66 at `(2,2)`, and two
horizontally flipped 48×48 Ancient Dragon CPIC 6 figures at `(3,4)` and `(5,5)`. The large CPICs
are already two-cell art; the renderer now keeps them at 1:1 instead of incorrectly enlarging them
to 96×96.

Gateway exposed two previously conflated 8X8D formats. Ordinary 4-bpp banks remain unchanged, but
its VGA UI and selected wall banks identify themselves exactly as:

```text
UI block:   17-byte header + 33-byte prefix + N * 40-byte planar5 tiles
wall block: 17-byte header + 41-byte prefix + N * 40-byte planar5 tiles
tile:       8 rows * 5 one-bit planes, LSB plane first, MSB-first pixels
```

Treating 33/41 as a suffix produced plausible fragments but could not match the native screen.
Moving the pixel start after the prefix yields 237/237 exact UI cells at frame `t0086`, zero pixel
error. The same correction restores the previously absent city walls; `SKY.DAX#252` supplies the
native stone ground. Gateway's 210-tile banks are combined per-WALLDEF-set banks: relocated ids
must remain in the originating archive and index from base `0x2E`. Switching archives at each
70-tile boundary was the reason the browser substituted block-31 art into the block-36 corridor.
Native cell matches now prove the corrected block-36 indices 71..85 at pose `(2,8,E)`.

The recovered exploration palette retains EGA 0..15, programs gold/orange DAC entries 16/17,
and adds the wall-bank extension colors directly observed in `t0086`. Remaining walk differences
are confined to wall-fan/topology details rather than missing banks, a flat backdrop, or wrong UI
symbols.

Gateway combat is now calibrated from native frames `t0126..t0166` and the full-memory checkpoint
at t=150. That RAM contains a byte-indexed 48×48 Giant Squid buffer whose equality pattern matches
the t0128 figure exactly. It disproves the old CPIC decoder: the common 33 bytes are a prefix and
the raster is five bitplanes per row. `CPIC2#68` now renders the real squid; ids 74/75/76/60 render
Whitman, Prolous, Hal, and Krevish. Palette-invariant matching recovers their visible positions and
individual mirrors in t0138/t0140. The field is uniformly `DUNGCOM#22`; retail remaps its source 0
to tactical index 8 (blue), while CPIC source 8 is opaque black and is kept distinct. The second
squid begins east of the initial camera, preserving the full 4v2 roster without a sprite pile-up.

### Late-Gen1 calibration: Treasures and Pools (2026-07-24)

The apparent Treasures bad opcode was framing, not a wrong script. Retail opcode `0x42` consumes
one trailing byte after its single word-set operand; the dialect table now expresses that via
`trailingBytes`, and the disassembler advances across it without pretending its semantics are
known. The corrected VM reaches `COMBAT` at offset 681 and the native RAM capture independently
contains decompressed `ECL1#4`. A golden test pins the opcode boundary, six NPC ids, five picture
effects, encounter setup, and combat status.

Two late-Gen1 VGA codecs are now reusable rather than title-local guesses:

- `daxVgaChunkyItems.ts` decodes embedded-palette direct-8bpp item arrays used by late UI, combat,
  and title resources, including the retail palette-32 metadata branch.
- `daxVgaCompressedPicture.ts` decodes `PIC*.DAX`: `u16 height`, `u16 width/8`, signed placement,
  palette base/count, 6-bit DAC triples, lookup seed and four flags, then a zero word, declared
  compressed length, one mode byte outside that length, and a flat DRAW18 stream. Literal controls
  emit `c+1` bytes; repeat controls emit `257-c` copies. Acceptance requires exact input and output
  consumption. `tools/dax_decode.py` exposes equivalent Python functions and renders both kinds.

The Treasures portrait proof is byte-level: decoded `PIC1#21` equals all 7,744 bytes of the native
loader buffer. Its 320x200 host presentation uses the full `BORD.DAX#1` red parchment backdrop,
precomposed top/bottom pieces from block 3, side pieces from block 5, portrait at `(24,24)`, and
native HUD HP/AC values. Its initial tactical viewport uses 49 recovered DUNGCOM cells as direct
flattened frame indices (not a second pass through the semantic BackGroundTiles table), exact six
party CPIC ids/positions/flips, and keeps six non-visible enemies east of the initial 7x7 camera;
only the native-visible lead foe begins at `(3,3)`, avoiding the former artificial sprite pile-up.
Combat chrome comes from `BORD.DAX#0`; its top and side placements are palette-invariant exact
matches to native frame t0084. The production e2e pins each calibrated title's first direct tile so
the former double-remap/repeated-stair failure cannot return unnoticed.

Pools now resolves four real story pictures through the same compressed codec. Its native capture
classifies five walk beats and combat. Its combat map/formation remains less precisely calibrated
than Treasures, CoK, DoK, Secret, and CoAB; the browser deliberately uses a source tile field and
real roster/turns rather than claiming an exact native formation.

CoAB was captured for 180 seconds on 2026-07-24 (48 changed frames, seven full-RAM checkpoints).
It confirms the script has no first-person walking phase: three story pictures/11 picture-animation
calls lead directly to two Black Dragons in automatic combat. `8X8D1#202` matches all 237 frame
cells exactly using the already-decompiled `COAB_FRAME_LAYOUT`. Native CPIC matching recovers the
three named figures in ADD_NPC order, all mirrored: Rustle 85 at `(2,2)`, Cynthia 88 at `(4,3)`,
and Grendel 90 at `(4,4)`. One dragon is visible at `(3,4)` later in the native capture; the second
begins beyond the 7×7 camera and moves into view. The sparse vegetation overlay remains unmapped, so
CoAB currently uses an honest flat tactical field with real frame, roster, CPICs, formation, turns,
and actions rather than claiming calibrated DUNGCOM terrain.

Focused production-build pixel/e2e proof:

| Demo | Pictures / animation calls | Walking beats | Distinct tactical frames | Result |
| --- | ---: | ---: | ---: | --- |
| CoK | 7 / 12 | 18 | 179+ | draw at current round cap |
| DoK | 5 / 25 | 17 | 485+ | enemy |
| CoAB | 3 / 11 | 0 (native sequence has none) | 113+ | party |
| Secret | 3 / 0 | 3 | 45+ | draw at current round cap |
| Gateway | 4 / 0 | 18 | 87+ | party |
| Treasures | 4 / 0 | 0 (native sequence has none) | 241+ | party |
| Pools | 4 / 0 | 5 | 319+ | enemy |

`apps/web/test/demo-sequences.mjs` now rejects the shortcuts that allowed the earlier false green:
it requires 320x200 screens, multiple distinct walking frames, all CoK/DoK pre-combat pictures,
animated-frame advancement, zero missing CoK/DoK pictures, at least three tactical actions, and at
least two distinct tactical framebuffer hashes. Setting `GB_DEMO_SCREENSHOT_DIR` plus
`GB_DEMO_CAPTURE_EVERY_VIEWPORT=1` writes native-size 320×200 walk frames; adding
`GB_DEMO_CAPTURE_COMBAT=1` records early and periodic combat frames for pixel auditing. Pools reaches
real combat after five natively classified walk beats. Treasures reaches its real portrait-driven
combat sequence; unlike the walking titles, it has no first-person montage.
