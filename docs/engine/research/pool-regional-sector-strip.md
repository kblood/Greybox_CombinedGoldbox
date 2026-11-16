# Pool of Radiance regional ECL25/ECL26/ECL27 strip

> Status: four directed retail sector seams and a deterministically step-seeded centre-sector Bandit
> encounter are live in the browser, 2026-07-31.

## Retail binding

Pool's city-region map is split across three ECL archives while all three collision maps remain in
`GEO5.DAX`:

| Sector | Script | Collision map | Monster archive | Initial entry |
| --- | --- | --- | --- | --- |
| west | `ECL6.DAX#25` | `GEO5.DAX#4` | `MON6CHA.DAX` | raw `0x15CF`, vaddr `0xAECD` |
| centre | `ECL7.DAX#26` | `GEO5.DAX#5` | `MON7CHA.DAX` | raw `0x1814`, vaddr `0xB112` |
| east | `ECL8.DAX#27` | `GEO5.DAX#6` | `MON8CHA.DAX` | raw `0x135A`, vaddr `0xAC58` |

In regional mode (`[0x4A9E] != 0xFF`), those entries emit `LOAD_FILES [4,4,0]`, `[5,5,0]`, and
`[6,6,0]` respectively and keep `[0x49E6]=0`, `[0x49FB]=0`. This unusual ECL6/7/8 + GEO5 split is
why generic same-disk dungeon remounting was wrong for sector seams.

The four horizontal transitions are explicit `vm_run_1` bytecode, not host wrapping:

- `#25 (15,y) E`: `SAVE #3,[0x49C3]` at `0x99A4`, `SAVE #7,[0x6E12]` at `0x99AA`,
  `NEWECL #26` at `0x99B0`.
- `#26 (15,y) E`: x=3 at `0x99A8`, selector 8 at `0x99AE`, `NEWECL #27` at `0x99B4`.
- `#27 (2,y) W`: selector 7 at `0x99C2`, x=14 at `0x99C8`, `NEWECL #26` at `0x99CE`.
- `#26 (2,y) W`: x=14 at `0x99D6`, selector 6 at `0x99DC`, `NEWECL #25` at `0x99E2`.

The two exterior edges remain retail-blocked: west from `#25 x=2` and east from `#27 x=15` set
`[0x6DC9]=0xFF` and do not chain.

## Browser route

`openPoolTravel()` preloads the three ECL blocks and GEO5 maps, keeps one overlay, party, clock,
and Area1 memory map alive, and switches the active script/collision map only after retail
`vm_run_1` returns `NEWECL`. It does not apply a second coordinate commit: the seam scripts already
write wrapped x and `[0x6E12]`. Initial entry then binds the target GEO5 block, while the host updates
`[0x49C5]` to the active sector.

Mode remains discriminating. The same ids 25/26/27 can name sector-local dungeons when
`[0x4A9E]==0xFF`; those SearchLocation chains still use the ordinary disk-local dungeon remounter.
Only regional-mode chains stay inside the GEO5 strip, including later returns into any of the three
sectors.

Focused e2e `explore-pool-regional-sector-round-trip` starts at the authentic `ECL7#26 (11,28)`
western-city arrival, chooses `LEAVE`, and drives `E×5, W×15, E×2`. It handles the genuine western
edge menu again on the return pass and asserts the sector sequence `26→27→26→25→26`, final
`(3,28)`, `[0x49C5]=26`, `[0x6E12]=7`, wilderness words zero, the two-BANDIT combat/resume, and
unchanged party item types. The pre-existing Holy Symbol route remains green independently.

`packages/engine/test/poolRegionalTravel.test.ts` pins all three initial entries, all four directed
seams, and both exterior blocked edges against the retail files. The seam tests explicitly model
the host's header-entry dispatch after `NEWECL`; `EclVm`'s default raw `0x16` is `vm_run_1`, not an
implicit header-pointer lookup.

## Retail DrawAreaMap viewport

Pool's regional view is the shared old-engine `DrawAreaMap` routine, not a BIGPIC or an 8X8D5
terrain renderer. The browser composes its exact 11×11/88×88 viewport from each active GEO5 map's
N/E/S/W wall planes and boot-retained `8X8D1.DAX#202` set 4. Local tiles 4..19 encode the 16
wall-presence masks; tiles 0..3 are N/E/S/W arrows selected by native `direction >> 1` and
overlaid with palette index 8 transparent. Each axis uses `clamp(localPosition-5,0,5)`, and regional
coordinates feed the map through their low nibble. Pure tests cover every mask, clamp, marker, and
arrow rule; retail goldens pin SHA-256 hashes for all four seam-arrival views. Browser acceptance
asserts the 88×88 viewport metadata and that its checksum changes across the round trip.

## Regional random combat

The overlay increments one regional step seed for each accepted physical move, including retail
NEWECL seams, and passes it into SearchLocation. It keeps distinct MON6/7/8 lookups because monster
ids overlap across the archives; each lookup joins the sector's CHA records with its SPC affects and
ITM carried-item data. An explicit overland lookup now takes precedence over the unrelated mounted
dungeon lookup for both combatants and encounter names.

On the continuous route, step 17 reaches ECL7#26 `(4,28)` with seed `0x11`. Retail bytecode prints
`YOU SPOT A GROUP OF BANDITS` and presents `COMBAT / WAIT / FLEE / PARLAY`; COMBAT queues
`{ monsterId: 97, count: 2, picBlockId: 11 }`. MON7CHA#97 decodes as BANDIT with 6 HP, so the
tactical overlay contains exactly `e0` and `e1`, both BANDIT and both 6 HP. Focused browser coverage
resolves the battle, resumes the ECL runner, and finishes steps 18–22. The real-byte engine golden
pins the same menu, roster, name, and HP independently.

This is ECL-branch coverage under the clean-room VM's deterministic step seed, not native random
probability. Pool's retail opcode-08 handler increments every bound below `0xFF`, so `RANDOM #19`
means inclusive `0..19`; the current generic VM uses exclusive modulo. With the current substitute
LCG, correcting only that bound makes selector 13's Bandit arm unreachable after a successful gate.
A native-equal schedule therefore requires the still-unrecovered Pool RNG algorithm/state and host
draw cadence, not merely changing one modulus.

## Honest remaining boundary

The exact regional map viewport is live, but the surrounding native 320×200 screen chrome, text,
and command cadence are not yet claimed.
Its combat spawner now deliberately omits the hidden mounted dungeon's terrain, pose, NPC allies,
and scripted ITEM treasure; the tactical screen uses its established flat fallback until a retail
Pool overland-combat host is recovered. Sector roster, names, stats, affects, and MON-carried items
remain correct, but overland-specific battle terrain is not claimed. Each SearchLocation still
starts a fresh VM seeded from the accepted-step count; native regional RNG algorithm, continuity,
cadence, and encounter-probability alignment have not yet been recovered.
