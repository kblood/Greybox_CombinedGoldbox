# Buck Rogers container census, and the C64 disk set as a DOS block-identity oracle

Round 33, item R4. Tooling: `tools/buck_container_census.py` (+ `tools/test_buck_container_census.py`,
skips when `D:/` sources are absent) and `packages/engine/test/buckContainers.test.ts` (pins
`decodeGeoBlock`/`listPairedGen1Areas` against real Buck bytes; requires the DOS install, no skip
needed for CI since it is also `D:/`-gated). Extraction output: `build/buck-c64/side{1..6}/`
(git-ignored), produced by `tools/c64_disk.py --extract ... --strict` against
`{external-game-holdings}/Emulator/C64/Goldbox/Buck Rogers - Countdown to Doomsday/*.d64` (all six sides, `Side N`
in the filename, matched case-insensitively).

The ledger (`tools/goldbox_capabilities.json`) calls Buck's containers un-reverse-engineered. They
are not: every `geoN.dax`/`walldefN.dax`/`mon0*.dax`/`item0.dax`/`eclN.dax` file decodes with the
**same Gen1 loaders already proven on CoK/DoK** (`geo.ts`, `walldef.ts`, `monster.ts`, `item.ts`,
`eclEncode.ts`'s Gen1 sniff), with two genuine exceptions found below (monster and item record
sizes). The transform between searched and executed bytes throughout: every size below is the
**decompressed** size, i.e. `dax_decode.py`'s signed-byte RLE undone — the bytes a Gen1 loader
actually consumes, not the compressed bytes on disk.

## Part 1 — DOS/Matrix container census

| Family | Buck DOS blocks | Matrix Cubed blocks | Loader match |
|---|---|---|---|
| GEO | 17, all exactly 1026 bytes | 25, all exactly 1026 bytes | `decodeGeoBlock` (100%) |
| WALLDEF | 9 blocks, each a multiple of 780 | 11 blocks, each a multiple of 780 | `decodeWalldefBlock` (100%) |
| MON (mon0*) | 115 blocks | 140 blocks | see below — no size uniformly matches |
| ITEM (item0.dax) | 1 block, 1456 bytes | 1 block | neither existing sniff (below) |
| ECL | 25 blocks | 33 blocks | 100% carry the Gen1 `0x1388` magic |

**Monster layout (`mon0cha.dax`)**: 54 name-plausible records (via a name-length/printable-ASCII
sniff, not by size), **all exactly 263 bytes**. Matrix's `MON0CHA.DAX`: 63 records, all exactly
259 bytes. Neither 263 nor 259 matches ANY of the six existing `MonsterLayoutProfile` sizes (216,
285, 409, 422, 439, 510). This contradicts the plan's prediction (CoK 409 or Gateway/CoAB 422) —
reported as the disagreement it is, not silently fitted to the nearest profile. No AC/THAC0 offset
derivation was attempted for a seventh profile in this pass (time-boxed out; see "left undecided"
below) — do not add a `buck (263)` / `matrix (259)` profile without deriving and testing its
offsets against known monster stats first.

**Item record size (`item0.dax`)**: 1456 bytes. `1456 / 63 = 23.1` (not exact — **0 records** by
the 63-byte sniff) and `1456 / 17 = 85.6` (not exact — **0 records** by the 17-byte sniff). The
exact small divisors of 1456 include 16 (91 records) and 28 (52 records); 16 is the most plausible
(`raw[0:2]` little-endian reads 1, 2, 3, ... a sequential item id across the first several
records, consistent with a per-item fixed-size table). Neither of the two currently-supported item
record sizes fits Buck.

## Part 2/3 — C64 disk set as an identity oracle for the DOS install

All six sides extracted cleanly with `c64_disk.py --extract ... --strict` (no strict-mode
failures). **Critical methodology correction, found while building this tool**: the convention
"compare both sides from offset 2" (used by the existing sibling tool
`tools/test_c64_disk.py::_dos_index`) is only valid for families whose *DOS-decompressed* block
genuinely starts with a real 2-byte field — GEO's size/area word and ECL's `0x1388` magic. WALLDEF,
MON and ITEM have **no such DOS-side header** (`decodeWalldefBlock`/`decodeMonsterRecord`/`item.ts`
all read real payload from byte 0); slicing `DOS[2:]` there discards two real bytes and biases
every comparison toward "different". This tool uses a per-family `DOS_HEADER_LEN` (`GEO: 2, ECL: 2,
WALLDEF: 0, MON: 0, ITEMFILE: 0`); the C64 side is uniformly `[2:]` (it always carries the real C64
load-address prefix).

### GEO — the headline result

- **H0** (this tool's claim): C64 and DOS GEO share layout, so same-id payloads are byte-identical.
- **Alternative** (the plan's own falsifier): C64 GEO layout differs from DOS — predicts an
  identical fraction near the shuffled-pairing null, not near 1.0.
- **Measured**: 17 shared ids, **15/17 = 88.2% byte-identical** (from offset 2 both sides).
  **This is NOT the plan's predicted "≥30 shared ids, 100% identical"** — there are only 17 total
  GEO ids across all six Buck disks, and two of them are not byte-identical. Reported as the
  disagreement it is.
- **Shuffled-pairing null** (200 derangement trials, full distribution — not just "0"):
  identical-count min/mean/max = 0 / 0.63 / 4 out of 17; identical-*fraction* min/mean/max =
  0% / 3.7% / 23.5%. The real 88.2% clears the null's max by ~3.7×, so the alternative is rejected
  even though the plan's specific number does not reproduce.
- **The two non-identical pairs**: `GEO43` (DOS id 67, ecl/geo id 0x43) differs in 28/1024 bytes;
  `GEO52` (DOS id 82) differs in 19/1024 bytes. Neither was investigated further (open — see below).

### WALLDEF — non-identity, as measured, not the plan's example

Plan text cited one pair at 12/2338 differing bytes (99.5% identical). That number **does not
reproduce** on any of the 10 named C64 WALLDEF files against their DOS candidates:

| C64 name | DOS candidate(s) | compared | differing |
|---|---|---|---|
| WALLDEF04 | walldef3#4, walldef4#4 (2340b) | 2340 | 2317 (99.0%) |
| WALLDEF07 | walldef1#7, walldef3#7 (2340b) | 2339 | 2325 (99.4%) |
| WALLDEF01 | walldef2#1 (2340b) | 1624 | 1596 (98.3%) |

**0 of 10** WALLDEF pairs are identical, all in the 98–99% *different* range — the qualitative
conclusion ("WALLDEF is not a C64/DOS identity oracle the way GEO is") stands, but the plan's
specific 12/2338 figure is wrong for every pair tested and should not be cited again without a
source.

### ECL — mostly non-identical, but not uniformly so

Plan text cited 325/7812 differing bytes (96% identical) for one pair. The pair whose DOS length
actually is 7812 (`ECL10` ↔ `ecl1.dax#16`) measures **7487/7812 differing (95.8%), the opposite
conclusion** from the plan's number — reported as the disagreement it is. However, ECL is not
uniformly non-identical the way WALLDEF is: of 25 C64/DOS ECL pairs with a DOS candidate, **exactly
1 is byte-identical** (`ECL5E` ↔ `ecl6.dax#94`, 378 bytes, 0 diff, sha256
`9defc8d06881fc6bf5eba0fc2b5ddb792a085a4dbd8836a23558bc494c3d381f` both sides) and one more is
near-identical (`ECL5F` ↔ `ecl6.dax#95`, 2879 of 2989 bytes compared, 16 differing = 0.6%).

### ITEMFILE — a positive identity finding the existing sibling tool cannot see

All six C64 sides name their item table `ITEMFILE00` (hex id 0), while Buck's sole DOS `item0.dax`
block is stored under id **1** — an id-naming offset, not necessarily a content difference.
Compared directly (only one DOS candidate exists): **fully byte-identical**, 0/1456 differing,
sha256 `65d52e9689a454769116b00aa44d131e67be68b2c8127e597b70b2b26f61a1d2` both sides. This positive
match is invisible to the naive `id`-keyed comparison (0 matched) and — more importantly — to
`tools/test_c64_disk.py`'s `_dos_index()`/`test_only_maps_and_scripts_are_ever_byte_identical`,
which strips 2 bytes from **every** DOS family uniformly. That test's conclusion
`shared == {"GEO", "ECL"}` may therefore be a transform artifact for the ITEM family, not a
true negative. **I do not own `tools/test_c64_disk.py`** (outside R4's file list), so this is a
finding + suggested patch, not an edit:

```diff
--- a/tools/test_c64_disk.py
+++ b/tools/test_c64_disk.py
@@ def _dos_index(...):
-    # strips 2 bytes uniformly for every family
-    payload = body[2:]
+    # ITEM (and WALLDEF/MON) blocks have no real 2-byte DOS-side header — only GEO/ECL do.
+    header_len = 2 if family in ("GEO", "ECL") else 0
+    payload = body[header_len:]
```

Applying this correction and re-running that test against Buck Rogers is expected to widen
`shared` from `{"GEO", "ECL"}` to include `"ITEM"` for this title. This should be verified by
whoever owns that file, not assumed from this report alone.

### `listPairedGen1Areas` per disk

Using the exact criterion `gen1AreaIndex.ts` uses (GEO block length 1026 AND ECL block carrying
the `0x1388` magic, matched by shared id): **1, 2, 4, 3, 2, 4 = 16 total** paired areas across
Buck's six disks. The alternative ("Buck's GEO/ECL ids aren't paired the CoK way") predicts 0 on
every disk and is rejected. Independently re-derived in Python
(`tools/test_buck_container_census.py::test_paired_gen1_areas_alternative_predicts_zero_pairs_measured_16`)
and pinned in TypeScript against real bytes
(`packages/engine/test/buckContainers.test.ts`, `EXPECTED_PAIRED_COUNTS`).

## Mutation test

`tools/test_buck_container_census.py`'s `test_mutation_a_corrupted_pinned_c64_sha256_is_detected`
pins the GEO10/geo1#16 sha256 (`4472da19...8757dbc`). Corrupting the first four hex characters to
`ffff` produced:

```
AssertionError: '4472da1959efcf0b796189cf2d3703c96af1c23bb34e41aa0fc164eee8757dbc' != 'ffffda1959efcf0b796189cf2d3703c96af1c23bb34e41aa0fc164eee8757dbc'
```

Restored; `python -m pytest tools/test_buck_container_census.py -q` returns 10 passed both before
and after. `packages/engine/test/buckContainers.test.ts` was likewise mutation-tested during
development (a corrupted plane-hash pin produced the analogous vitest failure) and restored.

## Intended `map_container` ledger patch (Phase B owns `tools/goldbox_capabilities.json` — not applied here)

```diff
- "Buck Rogers geo/walldef/mon0/item0/ecl containers": "un-reverse-engineered"
+ "Buck Rogers geo/walldef/mon0/item0/ecl containers": "map_container — Gen1 GEO/WALLDEF/ECL
+   loaders confirmed byte-for-byte on real Buck data (docs/engine/research/buck-containers.md);
+   mon0cha.dax (263B) and item0.dax (16B) records match NO existing MonsterLayoutProfile /
+   item-record sniff and remain genuinely unmapped"
```

## Consumer

`packages/engine/test/buckContainers.test.ts` is exercised outside its own file by
`pnpm --filter @goldbox/engine test`, which already runs it as part of the standing suite (247/250
suites passed in this run; the 3 failures — `_probe33*.test.ts`, `eclReachability.test.ts` — belong
to concurrent Round 33 agents R1/R6 editing shared ECL files mid-run and are outside R4's scope).

## Left undecided / open

- No new `MonsterLayoutProfile` was added for the 263-byte (Buck) / 259-byte (Matrix) records —
  their AC/THAC0 byte offsets were not derived in this pass. Left as an explicit gap rather than
  guessed.
- The two non-identical GEO pairs (block ids 67, 82; 28 and 19 of 1024 bytes differing) were not
  further diffed to characterize *what* differs (e.g. a single moved door/backdrop tile vs a
  systematic offset). Open for a follow-up.
- `tools/test_c64_disk.py`'s uniform-offset premise for ITEM (and by the same logic, any other
  family without a real DOS header) was not corrected in place, since that file is outside R4's
  ownership — flagged above with the exact patch for whoever owns it.

## Gates run

`pnpm --filter @goldbox/engine test` (buckContainers.test.ts: 3/3 green; 3 unrelated suite
failures from concurrent R1/R6 agents, confirmed unrelated to this file), `pnpm -r exec tsc
--noEmit` (clean, no output), `pnpm test:corpus` (1455 passed, 1 skipped, 2 failed — both in
`test_engine_export_consumers.py`/`test_goldbox_corpus.py` over `./ecl/reachability.js`, a file
owned by the concurrent R1 agent, not R4). No files outside R4's ownership list were edited.
