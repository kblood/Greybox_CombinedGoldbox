# CoK combat roster coverage v2

The bounded scan covers 22 hash-pinned DOS ECL blocks. It reached 192 physical COMBAT sites from
221 entry/site associations and retained 267 distinct ordered rosters across 323 entry/variant
associations. It explored 27,757 states and recorded zero exploration frontiers for these inputs.
Campaign reachability and the runtime and production package remain unverified.

| Bank | v1 mapped / identified | v2 mapped / identified | v2 distinct rosters | Sites with a dynamic picture variant | Sites with an empty roster variant |
| --- | ---: | ---: | ---: | ---: | ---: |
| CPIC1 | 4 / 14 | 4 / 14 | 59 | 4 | 11 |
| CPIC2 | 24 / 24 | 25 / 25 | 112 | 6 | 13 |
| CPIC3 | 22 / 22 | 22 / 22 | 96 | 5 | 15 |
| Total | 50 / 60 | 51 / 61 | 267 | 15 | 39 |

CPIC2 picture 23 is the only new bank-qualified picture ID. Thirteen roster variants at 12
COMBAT sites in ECL2 block 64 reference it, including two variants at offset 1496. Its existing
declaration is `combat/CPIC2/23`. The machine-readable delta also lists four entry/site
associations with a newly visible dynamic picture and seven with a newly visible empty roster.
The ten CPIC1 gaps remain. Player frame admissions and the separate 15-slot demo fixture retain
their v1 values. [Coverage report and delta](cok-runtime-art-coverage-v2.json)

Each receipt site groups the discovered variants by their ordered roster of operand code/value
pairs. Repeated groups remain in the roster. Each variant has a block-scoped ID and one witness
per entry. The witness records instruction count, the last 12 instruction offsets, and whether
the prefix was dropped. The third operand selects the picture. Immediate values contribute their
low byte to the bank-qualified picture union. Dynamic values retain the encoded operand descriptor.
The report stores bindings once per bank and ID. The active disk and exact archive hash still
qualify each binding. [Combat receipt](cok-runtime-art-combat-sites-v2.json)

The opt-in worklist uses the reviewed CoK decoder, condition test, successor function, and full
bounded return stack. It records the location and count of pruned or unresolved traversal events.
The limits are 50,000 explored states per block, 24 call frames and 16 queued monster groups.
A seventeenth group creates a frontier and stops that path. Host effects, cross-ECL transitions and
dynamic branch feasibility remain outside the model. The legacy scanner stays byte-for-byte
identical because the historical v1 report pins that file. V2 pins the shared source helpers and
the new worklist separately. [Consumer contract](cok-runtime-art-consumers-v2.json)

The report carries the 146 independently surveyed PICTURE sites with their fixed operand
descriptors and entry witnesses. The one dynamic operand stays unresolved. Existing source joins
are checked against archive, block and offset evidence. The lazy source browser now consumes this
v2 report and receipt, validates row/count joins and keeps v1 bookmarks compatible. Rendered browser
behavior, production packaging and runtime remain unverified. [PICTURE census](cok-ecl-picture-census-2026-11-03.json)

## Town and main-menu original-source use

The source-use ledger now records the current Town and main-menu rendering inputs separately from
Restyle mappings and replacement compositions: six CoK DOS-EGA outer-border tiles from `8X8D1.DAX`
block 202 (tiles 20–25), and 64 addressable glyphs from block 201 (glyphs 0–63). Both screens use
these source groups. Each ID must match the pinned archive SHA-256 and complete registry locator,
including glyph index. Glyphs 64–176 and the whole-font preview are excluded because these routes
do not select those identities. Both screens use the DOS-EGA surface in every graphics mode; neither
controller verifies the selected archive hash, and neither admits Amiga or Restyle replacements.
The glyph list is the addressable range, not proof that every character appeared during gameplay.
Runtime observation and production packaging remain unverified. This source-use addition changes
no mappings, outputs, compositions, runtime admissions, or request denominators.

Run the report and receipt checks from the repository root.

```powershell
python tools/cok_runtime_art_coverage.py --check
python tools/cok_runtime_art_coverage.py --v2 --check
python tools/test_cok_runtime_art_coverage.py
python tools/test_gen1_ecl_encounter_variants.py
node --test tools/test_cok_runtime_art_coverage_schema.mjs
```

The tests reproduce the v2 receipt byte-for-byte when the pinned local archives are available.
`--v2 --scan-combat "Champions of Krynn"` prints a fresh receipt. To regenerate the owned artifacts
after reviewed source changes, use `--v2 --write-combat "Champions of Krynn"`, review the evidence
and refresh its consumer contract pin, then run `--v2 --write`. The report writer checks the
combined metadata size against 1 MiB and reports the required bytes if it exceeds that limit.
