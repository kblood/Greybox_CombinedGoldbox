# Map Catalogue and First-Person Rendering Audit

Date: 2026-07-26

## Scope and conclusion

The current browser picker must distinguish two separate facts:

1. **Gen1 DAX GEO maps are fixed-size 16x16 grids.**  A valid Gen1 GEO member is
   exactly 1,026 bytes: a two-byte header plus four 256-byte planes.  This is a
   format invariant, not a UI assumption.
2. **A first-person scene needs more than GEO.**  Its ECL entry selects the
   WALLDEF and 8X8D resources.  A GEO-only/event-only member is still a real map,
   but it must be shown as the read-only top-down atlas rather than with invented
   wall artwork.

DQK/Gen2 is different: its GEO members carry width and height in their headers and
are variable-sized.  The fixed 16x16 rule must never be applied to DQK.

## Complete local Gen1 GEO inventory

The counts below come from decompression of every registered `GEO*.DAX` member and
the exact 1,026-byte invariant, not from ECL pairing.  Therefore they include maps
whose entry scripts are event-only or absent.

| Game | Total valid GEO maps | Archive split |
| --- | ---: | --- |
| Champions of Krynn | 15 | GEO1 2, GEO2 7, GEO3 6 |
| Death Knights of Krynn | 19 | GEO1 4, GEO2 8, GEO3 7 |
| Pool of Radiance | 29 | GEO1..8: 3, 3, 2, 3, 5, 3, 4, 6 |
| Curse of the Azure Bonds | 16 | GEO2..6: 3, 3, 3, 3, 4 |
| Secret of the Silver Blades | 17 | GEO1 4, GEO2 7, GEO3 6 |
| Gateway to the Savage Frontier | 30 | GEO2 4, GEO3 6, GEO4 5, GEO5 4, GEO6 11 |
| Treasures of the Savage Frontier | 41 | GEO1 41 |
| Pools of Darkness | 32 | GEO1 32 |
| Neverwinter Nights (DOS/AOL) | 29 | GEO0 9, GEO1 9, GEO2 10, GEO3 1 |

`listAllGen1Areas()` in `apps/web/src/ui/explore.ts` enumerates this full GEO
corpus.  The picker marks an independently mountable ECL-backed map as an area;
otherwise it opens the raw atlas.  It must not hide an unbootable map merely because
it cannot safely select first-person wall art.

## Rendering safety boundaries

- DoK resolves WALLDEF/8X8D through all five global banks.  Its bank number is not
  its ECL/GEO disk number; disk-local routing produces the known garbled DoK walls.
- NWN uses its own single WALLDEF record and direct wall-bank tile ids.  It is also
  a true 16x16 Gen1 title; changing its geometry would be a regression.
- A first-person entry can be technically mountable while still requiring a
  title-specific wall packing or palette investigation.  Such a result is not proof
  that a guessed bank is correct.  Prefer a raw atlas until the native resource route
  is byte- or screenshot-validated.

### 2026-07-26: later-Gen1 VGA palette defect fixed

Treasures and Pools use 8-bit wall images whose own palette defines the DAC range
starting at index 32.  The shared explorer correctly retained those pixel indices but
then painted the completed framebuffer through the fixed 16-colour EGA palette.  This
made valid later-title wall pixels appear black or incorrectly coloured.

`activeExplorePalette()` now merges the resident wall, frame, and moon tile palettes
over the EGA UI base before painting the final explorer framebuffer.  The change is
format-driven: CoK and DoK remain EGA, while Treasures/Pools each expose at least 128
defined palette entries (16 EGA UI entries plus their 112-colour VGA range).  The
`explore-vga-palette` browser regression checks both titles and was run against the
production site.

Native corroboration exists in the retained GameLink captures:

- `build/native-demo-pools-r3-20260724/frame-t0100.png` shows Pools' full-colour
  first-person/combat presentation.
- `build/native-demo-treasures-r2-20260724/frame-t0100.png` shows Treasures' own
  8-bit combat scene and chrome.

These captures prove the title family owns a VGA palette; they do **not** by themselves
prove every wall-bank selection or explorer pose matches retail.  That remains the
next parity task.

## Verification

The engine regression `packages/engine/test/gen1AreaIndex.test.ts` reads every local
registered Gen1 title's `GEO*.DAX` archives and asserts the complete counts in the
table above and a 16x16 size for every admitted member.  It is intentionally a
format-catalogue check rather than an ECL pairing check: real event-only maps must
remain selectable as raw atlases.

### Demo capture boundary

Native attract-demo footage cannot be assumed to be a first-person wall reference for
every title.  The reproducible static analysis below finds the late-title demo entry
`ECL1.DAX#4` is combat-only for Pools of Darkness and narrative/combat setup for
Treasures; neither has the `LOAD_FILES + LOAD_PIECES + position/redraw` signature of a
scripted first-person walk.  Their existing capture frames are useful evidence for
title chrome and combat palettes, but must not be used to select explorer wall banks.

```powershell
python tools\analyze_gen1_demo_sequences.py `
  --profile pools-of-darkness `
  --profile treasures-of-the-savage-frontier `
  --json build\late-gen1-demo-sequence-report.json
```

The required next visual proof is a native explorer pose with its loaded wall resource
and DAC state, not another attract-demo capture.

### 2026-07-26: Treasures native save acquisition

`Treasures of the Savage Frontier\SAVE\SAVGAMA.PTY` is a shipped, loadable pre-generated
party.  A focusless GameLink session launched the original retail command
`GAME.EXE 2 2 Helm`, skipped the title sequence, selected `PLAY`, then `LOAD SAVED GAME`,
`TREASURES`, and slot `A`.  It reached the original party menu with Maxwell, Tistle,
Mellia, Cheod, Sparkle, and Frazzle, and captured a full 1 MiB RAM checkpoint:

- `build/native-treasures-save-menu-20260726/loaded-save.png`
  SHA-256 `186025174a73cd144257d4f5b6c559a40f9d6f5d1b451570e9a516a578a3a819`
- `build/native-treasures-save-menu-20260726/loaded-save-ram.bin`
  SHA-256 `631087a57a361ab95eaa9aceb20156bf6ff616fa45dcdfbd9eb2ac6bad08197d`

This establishes a reproducible retail starting point for the remaining explorer-pose
trace.  It does **not** yet prove a wall bank or DAC, because the session has not reached
`BEGIN ADVENTURING`; no artwork was inferred from this menu capture.

The deployed site was checked on 2026-07-26 with:

```powershell
$env:GB_E2E_BASE_URL='https://dionysus.dk/greybox'
$env:GB_E2E_ONLY='explore-dok,raw-geo-atlas,explore-nwn'
pnpm --filter @goldbox/web e2e
```

All three checks passed.  This proves the deployed routes load and that raw GEO maps
are visible without guessed art; it is not a substitute for native screenshot parity
of every first-person area.
