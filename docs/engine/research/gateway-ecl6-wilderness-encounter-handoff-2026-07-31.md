# Gateway ECL6 wilderness encounter → tactical combat handoff

Date: 2026-07-31

## Result

Gateway's captured ECL6#21 wilderness checkpoint now hands an actionable cadence hit to the
original retail encounter branch. Greybox executes ECL virtual address `0x8136` rather than copying
its roster table into browser code: the script resets `[0x4C00]`, chooses encounter distance/count
and the descriptor-specific monster, displays its picture and `ATTACK / FLEE`, writes
`current_city`, runs `SETUP_MONSTER` and `LOAD_MONSTER`, then pauses at `COMBAT 0x81E5`.
Victory and successful FLEE resume at the following `EXIT`, leaving the surviving party on the
same wilderness cell. Defeat remains owned by the tactical host and is not a return-to-exploration
claim.

Gateway's own `GAME.OVR` proves opcode 08 treats operand `N < 255` as an inclusive maximum `0..N`.
`EclVmOptions.rollRandomInclusive` is therefore an opt-in host callback; the generic VM's existing
exclusive seeded behavior remains unchanged for every other caller. Returned values are validated
against the requested inclusive domain, while operand 255 is rejected because its boundary is not
proven. This models the title's proven range without claiming the unrecovered native PRNG algorithm,
state, or cadence continuity.

## Exact branch contract

- Hit arm: `0x8136`; ATTACK/FLEE menu: `0x944D`; setup/load/combat: `0x81D3/0x81DB/0x81E5`.
- Setup distance is 1–2. Ordinary group counts are 2–6; ANHKEG and HILL GIANT families have their
  narrower byte-proven ranges.
- Descriptor 9 selects WILD BOAR id 24 or HOBGOBLIN id 9. The focused browser evidence controls
  inclusive rolls as `[0,4,1]`, producing distance 1 and six HOBGOBLINs from `MON6CHA.DAX`.
- FLEE roll 34 fails and enters the same combat at distance zero; roll 35 succeeds. Across the
  inclusive 0..100 domain, failure is 35/101 and success is 66/101.
- The raw descriptor families, portrait ids, count ranges, and 18-byte `current_city` table are
  emitted and checked by `tools/analyze_gateway_ecl6_dynamic.py`.

## Browser ownership and claim boundary

The Gateway wilderness host loads and enriches its own MON6CHA/MON6SPC/MON6ITM records. While the
ECL dialogue or tactical overlay is open, movement and the dedicated wilderness save are inert.
After the combat result is dismissed, the dialogue resumes the ECL `EXIT`, releases the host pause,
and redraws the same GEO selector, pose, clock, and reset cadence counter.

Gateway's own ovr012 `current_city` consumer and three procedural floor passes are now recovered,
along with its placement routines and cloud/downed tile lifecycle. The implementation mounts
WILDCOM/RANDCOM, builds the 50x25 floor from Gateway's exact resident table, applies its source
placement candidates over the generated terrain, and keeps its temporary tiles live. See
`gateway-wilderness-combat-floor-2026-07-31.md` and
`gateway-combat-deployment-tile-mutations-2026-07-31.md`. Default combat chrome remains a
presentation gap; native RNG continuity is not claimed.

## Executable evidence

Engine real-byte tests pin ATTACK/FLEE, ETTIN id 57 ×6 with picture 86 and setup distance 2,
`current_city=17`, combat resume, successful FLEE at 35, and failed FLEE at 34. Browser acceptance
`gateway-ecl6-wilderness-encounter` performs a legal GEO24 `(1,4,W) → (0,4,W)` move, proves the
descriptor-9 hit/reset, blocks movement/save at the menu, opens six real HOBGOBLIN combatants over
the recovered 50x25 floor at exact terrain-aware source placements with mutation state enabled,
resolves the battle, and asserts exact GEO24 pose/clock/cadence resume.

The earlier native campaign capture visually shows both GOBLIN successful-flee and GIANT LIZARD
failed-flee/tactical-board sequences. Its gameplay file log is absent/boot-only, so it corroborates
the ECL behavior but is not promoted as a file-I/O/RAM-correlated runtime trace. The later rigorous
ECL6 movement trace observed no random encounter and remains correctly bounded.

## Remaining Gateway leaves

1. Acquire direct native evidence for the ECL2#1 entrance into ECL6#21.
2. Recover native RNG continuity and a fixed-map `mapPos-floorOrigin` placement delta before
   generalizing the focused wilderness contract to those contexts.

The formerly listed boat-abandon and companion-gated exit leaf is complete; see
`gateway-ecl6-boat-companion-exit-static-2026-07-31.md`.
