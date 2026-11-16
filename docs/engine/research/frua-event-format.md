# FRUA event library and design event pages (NATIVE-TASKS Task 24)

Decoder: `tools/frua_events.py`. Tests: `tools/test_frua_events.py` (real-data tests skip when
the GOG FRUA install at `C:\Program Files (x86)\GOG Galaxy\Games\Unlimited Adventures` is absent).
Written 2026-10-07 from the local GOG FRUA 1.2 install and `hackdocs_extracted/`
(`GEODATA.TXT`, `GEOEVENT.TXT`, `GAMEDAT.TXT`, `SCRIPT.TXT`, `GEOGRIDS.TXT`).

## The key finding: `SCRIPT.GLB` is NOT the event library

The task named `DISK3\SCRIPT.GLB`. It is an HLIB (`DATA` tag) library, but its 58 entries are the
**CKIT editor form definitions** (one editing form per event type: "combat event", "Transfer
Module Event", ... plus global-info/monster/NPC editors). It holds no event data. The real event
pages live in the design directory: `HEIRS.DSN\GEOnnn.DAT`, one file per module (26 for HEIRS).
The decoder handles both, and keeps them separate.

## SCRIPT.GLB (editor form catalogue)

- Header: `HLIB`, u32 file size, **u32** entry count (58; DQK's HLIB has the u16 count + magic
  byte at offset 10-11, so the same bytes read as 16,777,264 for DQK `ECL.GLB`), tag `DATA`,
  then 59 u32 pointers (last = EOF). Equal consecutive pointers = empty entry
  (28, 30, 31, 39-50 empty; 43 non-empty forms).
- Each form starts with a length byte `L`, then `L` bytes = zero-terminated title + one byte
  (page number 1). Titles verified: 0 "common event page 0", 1 "combat event", 11 "Transfer Module
  Event", 23 "Chain Event", 51/52 dungeon/overland global info, 57 "NPC Editor".
- The field-record bodies (types 3-9 per `SCRIPT.TXT`) are NOT decoded.
- DQK `ECL.GLB` is rejected (size/count mismatch); a corrupted size field is rejected.

## GEOnnn.DAT (the event pages) -- 12,962 bytes

Structural markers verified on all 26 HEIRS files: `FORM` + BE size (12,954) + `AMOD`; `MAP `
at 314; `ENCR` at 3778; `STRG` at 5786. Events: 100 x 20-byte records from offset **3786**.
Type 0 = empty slot. Slot numbers are **1-based**; grid byte 5 of each 6-byte cell (grid at 322)
is the slot number and 0 = none. Verified: in all 26 modules every non-zero grid reference lands
on a populated slot (so 0-based would be inconsistent with the data, though that is a
necessary rather than sufficient test).

Common bytes (all types): `[0]` type, `[1]` flags (do-once / chain mode / condition class),
`[2]` condition argument, `[3]` chain-to slot. Typed decode implemented for:
Transfer Module (11), Stairs (5), Chain (23), Text Statement (2), Combat (1). All other types
are kind-named with their 20 raw bytes preserved. Offsets in code are 0-based; the hackdocs use
1-based byte numbers.

## GAME001.DAT (388 bytes)

Name at 0 (32 bytes), start module at 48, start entry point at 49, equipment code at 50.
HEIRS: "Heirs to skull crag", module 5, entry 1.

## HEIRS pinned results

- 26 modules (GEO001-013, 015, 017-019, 025, 033-040); **1040 events**; 31 kinds used
  (Text Statement 443, Combat 117, Teleporter 80, Transfer Module 71, Pick One Combat 58,
  Stairs 36, ... full table in the test). No unknown type bytes.
  Modules 2-4 and 33-40 hold zero events.
- Start: module 5 ("TOWN AT BEGIN"), entry 1 = col 8, row 10, facing 2 (hackdocs facing code
  not checked here). Module 5's only Transfer is slot 36 -> module 6 (Skull Crag Town) entry 2.
- Reachable modules via Transfer events from 5, BFS order:
  5, 6, 1, 9, 8, 17, 11, 12, 15, 7, 25, 13, 10, 18, 19. Sample Transfer decode
  (module 1 slot 3: dest module 17, entry 3) matches the hackdocs field order.

## Verified vs assumed

Verified against bytes: file sizes and section tags; event record count and offset; type
histogram having no out-of-table values; Transfer record layout (dest module = byte 15, entry =
byte 14, placement bit = byte 13 & 1) by hand-reading three records and by the route landing
only on existing modules; 1-based slot convention (necessary test above); SCRIPT.GLB framing;
mutation of one event byte changes only that slot's decoded record.

Assumed / from hackdocs only, not independently checked: the Stairs, Chain, Text Statement and
Combat field meanings (string pointers, monster count/type pairing); the flag-byte semantics;
that Transfer "Party Attempts to Enter" vs "In the Cell" etc. have no routing effect.

## STRG text and cell -> event mapping (added 2026-10-07)

### STRG text (verified on bytes, all 26 HEIRS modules)

- Layout (matches `GEODATA.TXT`, one correction): `STRG` tag at 5786; u16 LE at 5798 is the
  **total compressed byte count** (hackdocs call it "number of text boxes"; it equals
  `sum(lengths)` in all 26 files); 400 length bytes at 5800; blobs concatenated from 6200
  in table order. The string index is the table index.
- Codec (`decode_strg6`): MSB-first 6-bit codes, 4 chars per 3 bytes; 0 ends the string, 1-31
  -> chr(64+v) (A-_), 32-63 plain ASCII. All 1270 strings in HEIRS decode with no code outside
  that alphabet (no lowercase, no `@`).
- Round trip: `encode_strg6` reproduces the stored bytes exactly for **1218 of 1270** strings;
  the other 52 are stored one byte shorter (terminator truncated by the length byte) and decode
  to identical text. Terminator/padding rule for those 52 is not understood (they occur at
  every length residue except n%4==3, where both conventions coincide).
- **String pointers are 1-based**: pointer p = table index p-1, 0 = none. Evidence: 0-based
  leaves 25 of 654 Text pointers dangling; 1-based leaves 1 of 652 (the `0xFFFE` sentinel in
  module 25 slot 64) and all 238 Transfer/Stairs/Combat pointers resolve. It also reads
  coherently: module 5's start event is "THE MEMBERS OF THE CARAVAN ... SIGH WITH RELIEF." /
  "HERE WE ARE AT LAST...SKULL CRAG." / "THE CARAVAN LEADER THANKS THE PARTY..." / "THE
  MERCHANTS YOU HAVE PROTECTED ... WOULD LIKE YOU TO HAVE THIS." (0-based gives an
  incoherent guard/headache pair). Blank modules hold `\` at index 0 (hackdocs' default
  string), which fits pointer 1 being the first slot.
- Mutation: flipping one byte inside string 3 of GEO005 changes only string 3 (all other 1,
  events and cell map identical); a length-byte change would shift every later string.

### Grid: which cell triggers which event

- The grid is **h*w packed 6-byte records** (not a fixed 24x24 square): record index =
  `a * byte27 + b`, where `byte26` is the extent of `a` and `byte27` the extent of `b`.
  Entry/transfer coordinates are `(a, b)`: entry byte 38 is `a` (hackdocs call it "col") and
  byte 39 is `b` ("row"). Evidence: the highest non-zero record is always < h*w (28x20 ->
  559, 15x38 -> 569, 19x19 -> 351, 20x21 -> 419); wall-edge agreement between neighbouring
  cells (E byte of one == W byte of the next, S == N) is far better with stride byte27 than
  with 24 or the swapped stride on 28x20, 15x38 and 20x21 modules (e.g. GEO008 85 vs 343
  vs 367 disagreements of 1072 edges); and entry coordinate 27 in the 28x20 keep modules
  exceeds the width 20, so only this orientation fits.
- Which axis is north-south: along `b` (stride) the E/W wall bytes pair up, so `b` runs
  east-west and `a` north-south. The hackdocs height/width and col/row labels are therefore
  not safe to use as written; only the byte positions are verified.
- Start cell: GAME001 start module 5, entry 1 = bytes (8, 10) -> record 8*19+10 = 162 -> event
  slot 2, a Text Statement (the readable text above). Control: 26 of the 55 non-zero entry
  points across HEIRS sit on an event (mostly the Transfer that returns to the parent module);
  event density is 10% for module 5, so this is not chance.
- NOT verified: the trigger semantics (entering the cell vs. facing a wall; the 8 zone events
  at bytes 70.. and 8 step events at 102.. also fire events with no grid cell -- module 5's
  step event 1 fires slot 32 after 17 steps); the cell byte 6 (backdrop + zone) beyond the
  hackdocs table.

Not decoded: wall-byte semantics, the remaining type-specific layouts, `ENCR`'s meaning,
the bytes after the string blobs (458 in GEO005), STRG001/003.DAT, MONSTnnn.DAT.
The route does not evaluate event conditions, quest flags or chains, so "reachable" means
reachable by Transfer edges ignoring gating; it is an upper bound.
