# Gateway ECL6#21 engine/browser integration audit — 2026-07-30

## Outcome

Greybox now has a bounded interactive controller and exact renderer for Gateway's retail ECL6#21
wilderness contract. It mounts all six dynamic GEO selections with their direct 8X8D banks, renders
the native 11×11 overland viewport, applies the recovered movement/remount clocks and encounter
cadence, pauses for `ENTER SUNDABAR?`, and resumes the real YES/NO CALL comparison. YES hands off to
the unchanged canonical ECL5#19 Sundabar route. The original read-only inspector remains available
and still proves it does not mutate that ECL5 scene.

The browser route is `?explore=gateway&wilderness=1`; Gateway's ordinary dungeon screen also exposes
it as a clearly labelled **Wilderness checkpoint**. This wording matters: the start state is the
native-captured GEO24 `(8,2,W)` save checkpoint. The earlier ECL2#1 campaign entrance remains
unobserved. The subsequently implemented wandering-combat handoff and boat/companion exit prompts
are documented in the 2026-07-31 follow-up memos; this audit's original boundary is retained as
historical context rather than a current missing-feature claim.

The focused engine and browser tests are:

- `packages/engine/test/gatewayEcl6.test.ts`
- `packages/engine/test/gatewayEcl6Controller.test.ts`
- `packages/engine/test/gatewayOverland.test.ts`
- `GB_E2E_ONLY=gateway-ecl6-wilderness-inspection,gateway-ecl6-wilderness-interactive,gateway-ecl5-fight pnpm --filter @goldbox/web e2e`

## What Greybox previously hard-coded or omitted

`apps/web/src/ui/gameData.ts`'s `gateway` profile boots only ECL5/GEO5 block 19 at the captured
post-wilderness Sundabar arrival `(15,2,W)`. Its seed says the previous block was 21, but it does
not load ECL6, preserve a live wilderness selector, or traverse the preceding world map. That is a
valid bounded canonical route, not an ECL6 implementation.

The generic disk picker knows Gateway disk 6 exists, but selecting ECL6#21 with empty memory asks
the retail `LOAD_FILES [0x4C24]` for GEO block 0. Even with `[0x4C24]` seeded, the normal
`loadDungeon()` path is not the right renderer: ECL6#21 dynamically emits piece triples
`[18,50,51]` through `[18,60,61]`, and GAME.OVR's `inDungeon=0` branch passes them directly to
`Load8x8D` without opening WALLDEF. The dedicated compositor/controller path now models that branch
without routing it through the first-person dungeon loader.

Before this leaf, `EclVm` surfaced the Sundabar native routine as an unknown synchronous `call`
effect, and `onCall` callbacks could mutate memory but not return the comparison result consumed by
the immediately following `IF_EQ`. `EclCallHostResult.comparison` now fills that generic gap while
remaining backward-compatible with every existing void callback. This is distinct from ECL5#19's
recognized `movePositionForward` routine, whose effect is memory/pose mutation rather than a returned
choice.

## Retail byte contract pinned by the new helper

The source block is retail `ECL6.DAX#21`, decoded with `ECL_GEN1_SHORT_GATEWAY`.

- Initial entry vaddr `0x8094`: `LOAD_FILES [0x4C24]`. The operand is a word reference, not an
  immediate. Legal selectors 21 through 26 each decode a distinct 16×16 `GEO6.DAX` block.
- The same runs emit raw `LOAD_PIECES` operands:
  `[18,50,51]`, `[18,52,53]`, `[18,54,55]`, `[18,56,57]`, `[18,58,59]`, and `[18,60,61]`.
- Movement vaddr `0x82DB`: ordinary non-edge forward attempts advance time step 12 in slot 3 before
  the native terrain probe. An accepted host move then adds one minute, producing the native
  +12h01m; rejected non-edge attempts cost +12h00m. Edge attempts bypass this clock, and successful
  remounts, rejected boundaries, and the Sundabar edge prompt cost zero.
- Wandering cadence vaddrs `0x8BEC..0x8C1D`: persistent counter `[0x4C00]` must reach 3; otherwise
  `0x8BF7` increments it by one. The encounter arm at `0x8136` resets the counter to zero before
  building the encounter. The percentage roll begins at `0x8C0B`.
- The native saved state is uniquely GEO 24 at `(8,2,W)`: the six maps' descriptors at `(8,2)` are
  `[4,10,8,9,2,3]`, while the live native descriptor was 9. The exact ten-step route is
  `F×4,L,F,R,F×3,L,F,R,F`, detouring through `(4,2)`, `(4,3)`, `(1,3)`, and `(1,4)` before reaching
  `(0,4,W)`. Every prospective plane-2 descriptor masks to allowed code 9. The former two-south/
  eight-west inspector shortcut crossed code 6 mountains and was only wall-graph legal; the
  controller and inspection golden now reject that shortcut. The next west attempt is the gate.
- Sundabar coordinate gate: GEO 24, `(0,4)`, facing ordinal 3 (west). The descriptor dispatch also
  reaches selector 120's Sundabar arm, so the retail script contains two passes through the same
  prompt boundary.
- Vaddr `0x8803` prints `ENTER SUNDABAR?`; `0x8812` carries raw operand `0x080C`, which the current
  Gen1 CALL transform reports as routine id `0x880D`. Gateway's executable menu is `~Yes ~No`
  and compares the zero-based result with index 1: YES=0 leaves NE and falls through; NO=1 leaves
  EQ and the following `IF_EQ` stays in the wilderness. Real-byte runs now pin YES as
  `{status:chain, chainBlockId:19, gameArea:5}` and NO as `{status:exited}` with no area write.
- The confirmed YES tail writes game area 5 at `0x881E` and chains to ECL5#19 at `0x8824`.

These facts agree with `gateway-newgame-route.md`,
`gateway-newgame-route.generated.md`, and the generated EclDump listing
`build/gateway-ecldump6-20260729/ECL6_021.txt`. The menu-result detail additionally comes from the
Gateway `GAME.OVR` audit summarized by the parallel static/runtime handoff.

## Exact native overland renderer

`packages/engine/src/world/gatewayOverland.ts` transcribes GAME.OVR's bounded non-dungeon draw path.
It takes the selected GEO's raw plane 0, the three direct ECL-selected `8X8D6.DAX` banks, and the
retained `8X8D1.DAX#202` boot bank. No WALLDEF lookup or candidate art tuning is involved.

- `originX = clamp(partyX-5, 0, 5)` and the same formula for Y. The framebuffer is an 88×88
  contiguous 11×11 slice, not edge-padded or wrapped.
- Terrain byte `t` requests global symbol `0x2E+t`, hence bank `floor(t/70)` and local tile `t%70`.
  Sets 1/2/3 are respectively block 18 and blocks `2*S+8`, `2*S+9` for selector `S`.
- Every bank is required to decode as exactly 70 Gateway planar-5 tiles. Every retail terrain byte
  across maps 21..26 is in the proved 0..209 domain; the compositor rejects larger values instead
  of inventing a fallback.
- The arrow uses retained set 4 block 202 and local tile 0/1/2/3 for N/E/S/W. It is blitted with
  GAME.OVR's overlay semantics, treating index 13 as the transparent key while preserving the
  ordinary opaque UI-bank decode elsewhere.
- Retail tests compose all six selectors at `(8,2,W)`, assert maxima `[176,170,181,186,159,188]`,
  the dynamic bank ids and counts, native origin/marker coordinates, and six fixed SHA-256 hashes
  of the indexed 88×88 output. Synthetic tests independently exercise range boundaries 0, 69, 70,
  139, 140, and 209, all clamp regimes, facing selection, and overlay transparency.

The result deliberately excludes the native screen offset `(2,2)` and surrounding chrome: it is a
viewport framebuffer ready for the existing screen/frame/font composer. That UI composition and
input lifecycle belong to the controller seam below; keeping the engine function pure lets tests
pin the source pixels without browser state.

## Implementation boundary

`packages/engine/src/world/gatewayEcl6.ts` exports:

- `selectGatewayEcl6WildernessMap()`: validates persistent selector `[0x4C24]` as 21..26, runs the
  retail initial entry against shared memory, and decodes the selected GEO. It deliberately returns
  geometry plus raw piece operands, not fabricated wall art.
- `runGatewayEcl6SundabarChoice()`: applies the executable-proven choice-index comparison through
  the generic synchronous CALL result channel and runs the retail prompt tail. It is a pure driver,
  not a UI prompt.
- `inspectGatewayEcl6Wilderness()`: validates the byte-located load/cadence/prompt instructions and
  summarizes all six isolated selector runs plus the two modeled prompt outcomes.

`packages/engine/src/world/gatewayOverland.ts` exports:

- `loadGatewayOverlandBanks()`: decodes and validates the three direct 70-tile area banks plus boot
  arrow bank 202.
- `composeGatewayOverlandWindow()`: returns the exact indexed 88×88 viewport together with its GEO
  origin and party-marker tile coordinate used by the live controller.

`packages/engine/src/world/gatewayEcl6Controller.ts` owns the JSON-safe interactive state and exports
the controller plus pure boundary/cadence helpers. It preserves ECL block 21 while remounting GEO
21..26, validates directed edge passability, blocks the proved mountain/avalanche cases, advances
ordinary success by 721 minutes and ordinary rejection by 720, and leaves boundary/remount actions
at zero. A remount performs the statically recovered two SearchLocation passes: suppression is
consumed first and the second pass is actionable. Encounter randomness is injected as an integer
0..100 decision, so unit tests are deterministic.

`EclVmOptions.onCall` now accepts either the existing `void` return or an optional
`{comparison:{left,right}}`. When provided, the VM masks both as ECL words and refreshes EQ, NE, LT,
GT, LE, and GE before executing the next instruction. A synthetic VM regression proves the guarded
instruction sees the new comparison; the Gateway golden proves the actual routine-0x880D use.

`window.__explore.inspectGatewayWilderness()` fetches ECL6/GEO6 independently of the mounted ECL5
scene and returns that summary, including the exact read-only GEO24 route replay. Its e2e asserts
the live pose, current `{disk:5,areaId:19}`, and live
`[0x4C24]` are unchanged before/after inspection.

## Live browser and persistence boundary

The live route composes the exact 88×88 viewport at native tile `(2,2)` inside Gateway's captured
frame/font palette and exposes keyboard plus visible button controls. A dedicated accessible modal
owns the Sundabar pause; movement is inert until NO resumes or YES validates area 5/ECL19 and calls
the unchanged dungeon mount. The focused e2e proves visible sector changes, frame/checksum changes,
zero-time remounts, modal input exclusion, NO retention, and the ECL5 `(15,2,W)` arrival.

Wilderness saves use the dedicated `gateway-ecl6-quick` slot so the established ECL5 `quick` combat
save remains byte-for-byte untouched. Save-v2 identifies disk 6/ECL block 21, retains `[0x4C24]`,
cadence/suppression words, the 16-bit travel-mode word `[0x4CF5]`, pose, and campaign clock, and
`&load=1` restores through the overland controller rather than incorrectly invoking the WALLDEF
dungeon loader. Companion gates are rehydrated from the saved party. Saving and loading are allowed
only in the controller's active phase, not while any boat, companion, or Sundabar prompt is paused.

The retail-roster tactical handoff is now implemented; see
`gateway-ecl6-wilderness-encounter-handoff-2026-07-31.md`. A cadence hit executes the original
ECL arm through ATTACK/FLEE, MON6 roster/setup, tactical combat, and exact wilderness resume.
The boat-abandon and ordered EREK/MUTHTUR/RISHPAL exit prompts are now implemented; see
`gateway-ecl6-boat-companion-exit-static-2026-07-31.md`. Gateway's own WILDCOM/RANDCOM floor,
source placement, and temporary cloud/downed tile lifecycle are also recovered and live; see
`gateway-wilderness-combat-floor-2026-07-31.md` and
`gateway-combat-deployment-tile-mutations-2026-07-31.md`. Remaining bounded work is the unobserved
ECL2#1 entrance plus narrower native RNG/fixed-floor fidelity. Those do not weaken the playable
checkpoint, encounter handoff, six-map remounts, save/reload, or Sundabar handoff.
