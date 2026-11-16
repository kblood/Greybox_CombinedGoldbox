# Gateway wilderness combat floor recovery (2026-07-31)

## Verdict

Gateway to the Savage Frontier uses the same five-routine procedural wilderness combat-floor
generator as Curse of the Azure Bonds, with its own 33-byte `CityInfo` table. The algorithm match is
instruction-exact after removing Gateway's added compiler entry thunk; no probability, flag, dice,
threshold, tile id, loop bound, or branch differs. Greybox now runs that recovered generator from the
`current_city` word written by the retail ECL6 encounter arm and renders it through Gateway's own
WILDCOM, RANDCOM, and CPIC6 banks.

## Retail authorities

- Gateway `GAME.OVR`: 347,622 bytes, SHA-256
  `c2e64df225bf80026d4bc16d865804dd9e51b1296e6496fa46bba3c2e704f5cd`.
- Gateway packed `GAME.EXE`: SHA-256
  `0222834b801d9bae16b50ede0b1e738be5aa4803440980915081a1e5cfca5c00`.
- Gateway `WILDCOM.DAX`: 5,275 bytes, SHA-256
  `184f96781ce658c1d65fe0390dabc6048be5817296df806f7d6fcb8d7b13a9c4`.
- Gateway `RANDCOM.DAX`: 970 bytes, SHA-256
  `d294d63511f3b86a33408489381fe2beefc5a5296887ca31d05f3964d5370bf6`.

WILDCOM decodes to 34 24x24 tiles and RANDCOM to 6. Both archives, including decompressed payloads,
are byte-identical to the corresponding CoAB archives. Retail loads RANDCOM at tile slot `0x22`, so
the browser appends its six tiles after WILDCOM's 34.

## Instruction proof

Gateway overlay block `ovr012` and CoAB `ovr010` contain the following aligned routines:

| Routine | Gateway local/file offset | CoAB local/file offset | Result |
| --- | --- | --- | --- |
| `GetCityInfo` | `09BA` / `0xF875` | `0991` / `0xE0B2` | exact after thunk |
| floor pass 01 | `0A38` | `0A00` | exact after thunk |
| floor pass 02 | `0B4B` | `0B0B` | exact after thunk |
| stepped group helper | `0CEA` | `0CA2` | exact after thunk |
| floor pass 03 | `0E9A` / `0xFD55` | `0E4A` / `0xE56B` | exact after thunk |
| orchestration | `1020` / `0xFEDB` | `0FC8` / `0xE6E9` | exact after thunk |

Gateway adds `mov ax,<locals>; lcall 0343:04DF` to each entry. Removing those two instructions
leaves identical instruction sequences. Data addresses move with Gateway's layout: `current_city`
is `DS:58D6`, `CityInfo` begins at `DS:042C`, the combat-map pointer is `DS:814E`, and the tile-index
member displacement is `31AF`.

Gateway's asset-loader boundary differs: its ground-tile setup caches DUNGCOM/WILDCOM selection and
does not load RANDCOM in the same function. That resource-management change ends before the shared
map allocation/generator dispatch and does not alter the five generator routines.

## Gateway `CityInfo`

The runtime accessor zero-extends `DS:58D6` and returns `DS:[042C + current_city]` without a bounds
check. A retail Unicorn boot recovered the resident table at runtime; the same 33 bytes occur in the
packed file at `0x4ED9` and the decompressed load module at `0x509C`:

```text
00 18 11 15 01 01 60 14 08 01 00 21 71 09 06 04
01 09 09 08 59 00 11 11 00 00 01 11 00 00 20 80 0A
```

Table SHA-256: `5548cab764ad978ebe4bcc60995f7e79c6029768dc9876a09100ad0bfac1c7ab`.
It differs from CoAB only at zero-based city 31: Gateway uses `0x80`, CoAB `0x20`. This is a
discriminating gameplay difference: Gateway skips passes 01/02 and gives pass 03 score zero, while
CoAB enables pass 01, runs pass 02, and gives pass 03 score 80.

## Greybox integration and claim boundary

`buildGatewayWildernessCombatMap` shares the byte-proven three-pass implementation but selects the
Gateway table. The ECL runner's shared memory supplies `current_city` at `0x4CA1` only after the
retail encounter arm has written it. The browser continues the same deterministic host RNG stream,
passes the 50x25 semantic background map to combat, and preloads Gateway `8X8D1`, `CPIC6`, WILDCOM,
and RANDCOM with the Gateway combat palette.

This floor release originally kept source deployment and temporary cloud/downed tile mutations
disabled pending their separate instruction audits. Those audits are now complete and both paths
are enabled; see `gateway-combat-deployment-tile-mutations-2026-07-31.md`. Gateway ECL6 uses the
proven ordinary-2-D party origin `(0,0)`, terrain-aware source candidates, and the title's own
`0x1C/0x1E/0x1F` mutation lifecycle.
