# The Dark Queen of Krynn — title/intro/play/demo (Gen2/HLIB)

Ships the same "full intro with music and title screens, then Play/Demo" the Gen1 titles
(CoK/DoK/CoAB/Secret/Gateway/Pool) already have, but DQK is Gen2 — a different container format
(`HLIB`, not `DAX`) and a different title-prompt mechanism — so it needed its own decode +
compositing pass and its own title-menu widget rather than reusing the Gen1 modules unmodified.

## Title art — `DISK1/TITLE.TLB`, 15 HLIB image members, 7 set-grouped frames

Inventoried by decoding the archive directly (`decodeAsset` → `{format:'hlib', archive}`,
`archive.images: HlibImageMember[]`). The archive contains three full backgrounds and seven
subsequent `setNN` groups. Images sharing a set are pieces of one screen, and each image header
stores its signed placement coordinates. This corrects the earlier 12-frame interpretation, which
incorrectly treated every member as an independent top-left overlay:

- **Group 1** (red-gradient bg, `set01`): 3 screens (`set02`, `set03`, `set04×2`) — MicroMagic/SSI publisher
  credit, the "Official AD&D Computer Product" screen, and the copyright notice.
- **Group 2** (parchment bg, `set05`): 2 screens (`set06×2`, `set07×2`) — the DragonLance logo, the
  series tagline, "the Dark Queen", "of Krynn" (the game-title reveal, split across two words).
- **Group 3** (DQK box-art bg, `set08`): 2 screens (`set09×2`, `set10×2`) — real development credits
  (producer, programmers, project managers, scenario designer, music, encounter authors,
  playtesters, special consultants), transcribed by rendering to PNG and reading them, not
  invented.

## The palette-compositing problem (and the fix already in production)

Unlike Gen1's fixed EGA-16 (every DAX block shares one palette, so index-level compositing always
worked), each HLIB `TILE` leaf carries only a **partial** VGA palette — a `first_col`/`ncolors`
window into the 256-slot DAC. Compositing a background + overlay band with one shared palette
(the naive port of CoK's `compositeBand`) produced illegible garbled overlay text — confirmed by
rendering to PNG and looking, the same "render and look, don't just trust the decode logic"
discipline that caught Gateway's plane-order bug earlier this project.

The fix is `mergePalettes(base.palette, band.palette)` (`packages/engine/src/render/palette.ts`)
— already the production mechanism for exactly this kind of layering (`compositeHlibPalette`,
`docs/engine/research/vga-palette-compositing-dqk.md`, used for DQK's overland BIGPIC art). A
manual RGBA-alpha composite was built first as an independent cross-check; `mergePalettes` +
plain index-level `blitIndexed` was then verified to produce an equivalent, correct result (both
inspected visually) before being adopted as the real implementation — it's simpler and matches
`ScreenSurface.paint()`'s one-indexed-framebuffer-plus-one-palette contract, unlike the RGBA-alpha
cross-check which doesn't fit that API.

## Production code

- `apps/web/src/ui/intro.ts` — `titleScreens()` now dispatches on `decoded.format`: the DAX path
  recovers partial-redraw placement by pixel matching; the HLIB path groups members by `setNN`,
  uses their decoded `xOffset`/`yOffset`, and merges each set's partial palettes. `show()` already
  preferred a per-frame palette over the fixed EGA one (added for Gateway's VGA-extended art), so
  no further change was needed there — DQK's merged per-frame palette flows through the same path.
- `apps/web/src/ui/dqkTitleMenu.ts` (new) — DQK's own **"Play Demo Quit"** prompt. Deliberately
  *not* a 3-way extension of `titleMenu.ts`: that module's exact `,`/`.`-cycle + 30s-idle-to-Demo
  contract is COAB-source-verified for the Gen1 titles specifically, and DQK's real widget is a
  different internal form (a resident "mode-2 generic form", not the overlay-027 `displayInput`
  widget) whose exact navigation contract hasn't been traced — see the module's doc comment for
  exactly what is byte-proven (the string, and that uppercase `P` → real party/load entry) vs.
  what's a reasonable-but-unverified UI approximation (arrow-key cycling, Enter to confirm).
- `apps/web/src/ui/dqkExplore.ts` — exports `DQK_TITLE_PATH` (`'The Dark Queen of
  Krynn/DISK1/TITLE.TLB'`) as a literal so `scripts/bundle-assets.mjs` ships it.
- `apps/web/src/ui/main.ts` — `bootDqkTitleMenu()`: Play → `startDqkExplore()` (the existing real
  Gen2/HLIB dungeon view); Demo → `showDqkDemoGap()` (see below); Quit → closes back to the game
  picker. Sidebar entry + `?intro=dqk` / `?titlemenu=dqk` / `?demo=dqk` routing, mirroring every
  other shipped title.
- `apps/web/src/audio/gameAudio.ts` — already had a full `'dqk'` case (real SFXDQ.VOC/SOUNDS.GLB
  digitized effects + ADDQ*.XMI OPL2 music via `renderXmiSong`) from an earlier phase (C5a/C5b) —
  `startIntro(..., { audioGame: 'dqk' })` arms it for the title screen, same as every other title.

## Demo — genuinely unresolved, left honest rather than invented

DQK's title prompt really does offer "Demo" (byte-verified alongside "Play"/"Quit",
`docs/engine/research/dqk-start-load-route-anchors.md`), but **what it actually plays has not
been located**: no live trace has reached and decoded that branch (only `P` → the real party/load
form has been traced). Per this project's "UNLOCATED beats invention" policy, `onDemo` shows an
honest gap notice (`showDqkDemoGap()` in `main.ts`) instead of a fabricated attract sequence. A
research pass (`docs/engine/research/dqk-demo-route.md`, if/when it lands) may resolve this by
extending the same Unicorn fake-key-injection technique that found the `P` route to a `D` route.
If it locates a real target, `onDemo` should be updated to play it for real — the same way CoK's
own demo went from a placeholder to a byte-verified real attract script
(`docs/engine/research/gen1-demo-entry-generalized.md`).

## Verification

Manual scratch probes (Puppeteer/Edge headless against the dev server, deleted after use, per this
project's convention of not leaving one-off probe scripts in the tree):
- `?intro=dqk` renders exactly 7 title frames (three + two + two set groups).
- The Play/Demo/Quit prompt opens after the last frame; hotkeys `P`/`D`/`Q` all fire.
- `D` (Demo) shows the honest gap notice (`.gb-dqk-demo-gap` present).
- `P` (Play) boots the real DQK Gen2/HLIB dungeon (`dqkExplore.ts`'s panel renders: 20 GEO maps,
  98 named MONCHA creatures, 3 VGA BIGPIC overland pictures) with zero console/page errors.
- Focused production-build smoke covers all ten supported fantasy Gold Box title routes; DQK renders 7
  nonblank set-grouped frames.
- Full engine test suite (164 files / 1881 tests), production web build, and both packages'
  `tsc --noEmit` stay green after the placement correction.
