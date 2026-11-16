# Per-system presentation profiles: design — 2026-11-10

Goal file: [cok-full-implementation-goal-2026-11-09.md](cok-full-implementation-goal-2026-11-09.md).
Related: [cross-platform-art-resolution.md](cross-platform-art-resolution.md) (presentation-only resolver; no mode
is enabled just because a system is named).

## Request (user, 2026-11-10)

- Switching graphics system switches the whole presentation: screen resolution, aspect ratio and combat grid
  shape follow the selected system (DOS, Amiga, and later C64 and others).
- Movement and game logic do not change. Only the presentation differs.
- Design the engine for many systems now, even though only DOS-EGA and Amiga will be implemented first. Other
  systems will be added later.
- Scaling is a user option. Integer scaling is the preferred look, but the player chooses.

## Current state (measured in the repo, 2026-11-10)

- Screen size is hard-coded to 320×200 in several places: `apps/web/src/ui/explore.ts` (frame buffers at
  lines 2946, 3533 and 3816), `apps/web/src/ui/intro.ts` (`SCREEN_W`/`SCREEN_H`), and `companionPanel.ts`
  (`SCREEN_WIDTH`/`SCREEN_HEIGHT`).
- Combat grid geometry is a per-game constant: `COK_COMBAT_GEOMETRY` in `packages/engine/src/render/combatScreen.ts`
  (origin 8,8; cells 24×24; grid 7×7). `CombatGridGeometry` already carries origin, cell size and extent.
- The runtime graphics preference (`apps/web/src/ui/runtimeGraphicsMode.ts`) accepts only `DOS-EGA`, `Amiga`
  and `Restyle`. It does not carry any presentation geometry.

## Design

### 1. A presentation profile per system

A `PresentationProfile` is pure data, selected by the graphics mode:

- `system`: the system id (`dos-ega`, `amiga`, later `c64`, …).
- `screen`: native width and height in pixels, and the pixel aspect ratio.
- `combatGrid`: a `CombatGridGeometry` for that system (origin, cell size, cols, rows).
- `source`: where each value comes from (a measured source file or a dated research note). A profile without a
  source is not selectable.

`COK_COMBAT_GEOMETRY` becomes the DOS-EGA combat profile value, unchanged.

### 2. Logic stays out of the profile

The profile changes presentation only. Movement, combat rules, cell occupancy and game state read logical
cell coordinates and never the pixel geometry. The profile is passed to the renderer and the hit-testing
layer, which convert logical cells to pixels. No rule file changes.

### 3. Scaling is a user option

Two options, stored with the graphics preference:

- `integer` (the default recommendation, to be confirmed): the largest whole-number scale that fits the window,
  with letterboxing. Pixels stay square and sharp.
- `fit`: scale to the window with non-integer scaling, keeping the profile's aspect ratio.

Both options use the profile's native size and pixel aspect. Neither invents geometry.

### 4. Systems without verified data

A system without a measured profile is listed as "no data" and cannot be selected. This follows the
resolver rule: a system is not available until its assets and geometry can be matched and drawn. C64, Atari
and Apple are not added until their data is verified.

## Verification plan

- **DOS-EGA refactor (no visual change):** the existing DOS rendering must stay pixel-identical. Snapshot the
  current combat and explore frames before the change and compare after. A pixel difference is a failure.
- **Amiga profile:** the Amiga combat grid and native screen size are to be measured from the Amiga game data,
  not copied from DOS. Record the measurement in a dated note with its source file and hash.
- **Scaling option:** check integer and fit modes in the browser at several window sizes. Integer mode must
  produce whole native-row scales (vertical). It cannot make the horizontal scale whole for 4:3 profiles; see
  the 2026-11-13 note below.
- **No new thresholds:** the profile values are measured facts, not tuned parameters.

## Phases

1. Profile type and the DOS-EGA profile wired through the existing renderers. Pixel-identical; test added.
2. Amiga profile: measure geometry from the Amiga data, record it, add the profile and browser check.
3. Scaling option (integer and fit) in the graphics settings, with letterboxing.
4. "No data" state for systems without verified profiles.

## Open questions for the user

- Integer scaling as the default, with letterboxing. Accepted 2026-11-13 on Sol's recommendation (goal 213).
- Whether the Amiga combat grid differs from DOS. This is to be measured, not assumed.

## Implementation semantics — 2026-11-13 (goal 213, source only)

- **Integer** = the largest `k ≥ 1` with `k × nativeHeight` inside the fitted box, with width from the display
  aspect. Each native row is `k` CSS rows (fractional device pixel ratios can map these to fractional device rows). Horizontal scale is `k × pixelAspectRatio` (DOS 0.833k, Amiga 1.067k),
  which is the 4:3 correction and not a whole number. In integer mode the box depends on the profile's row count,
  so a system switch can change the picture size. **Fit** keeps one box for all 4:3 profiles.
- **Small container:** integer falls back to the fitted box (`DisplayRect.integer = false`) rather than
  overflowing. Nothing is cropped.
- **Default and storage:** `greybox.presentation-scale.cok` holds `integer` (default) or `fit`; anything else reads
  as `integer`. CoK surfaces follow it live. Non-CoK surfaces keep fit.
- **Availability:** `presentationAvailability(id)` is `verified` only for profiles in the verified list (`dos-ega`
  today). `DISPLAY_PROFILES`, AMIGA_PAL and C64 never imply a profile. Others are `no-data`.
- **Pointer:** `ScreenSurface.nativePointAt` uses the same rectangle as paint, and bars return null.
- Open: the Amiga profile (phase 2), browser acceptance, and the DOS-EGA frame snapshot. A full-axis integer mode
  that breaks 4:3 is not part of this implementation recommendation.
