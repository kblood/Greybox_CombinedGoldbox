# GEO map support assessment: Krynn games

**Date:** 2026-11-16  
**Status:** source-and-documentation assessment; no retail game data was opened, and no code, tests, build, emulator, or runtime was run.  
**Related:** [Krynn vs FRUA map-capacity comparison](krynn-frua-map-capacity-port-comparison-2026-11-16.md)

## Answer

**The engine-neutral map model already has enough shape to represent the exploration maps of CoK, DoK, and DQK. We do not need to enlarge FRUA's GEO file format to do that.** The repository already has format-specific decoders for the fixed 16×16 CoK/DoK GEO DAX blocks and for variable-size DQK GEO HLIB members. Both decode into the same four-plane geometry and engine-neutral `GameMap`.

The key distinction is which layer is being discussed:

- **FRUA's on-disk GEO area format:** keep its fixed 576-cell region and other layout limits. Widening its dimensions alone cannot make it a Krynn format; its cell, event, string, and resource layouts differ.
- **Krynn source GEO formats:** retain separate DAX/Gen1 and HLIB/Gen2 readers. The current decoders already cover the known DOS map geometries.
- **Greybox's neutral map model:** `GameMap` and authored `ModuleMap` carry width, height, row-major cells, entries, and events without inheriting FRUA's 576-cell cap.

This establishes map representation, not full-game Krynn support. ECL behavior, campaign routing, rules, monsters/items, art selection, audio, and save compatibility remain separate integration work.

## Evidence in the repository

| Layer / format | Current shape | Assessment |
|---|---|---|
| FRUA `GEOxxx.DAT` | Fixed file layout; 576 six-byte grid slots, 100 20-byte event records, 400 strings. `parseFruaGeo` rejects width × height above 576. | Correctly bounded by its source format. Do not relax this check to pretend FRUA files can hold more. |
| CoK / DoK Gen1 GEO | A 1026-byte decompressed DAX member: 2-byte title-specific header plus four fixed 256-byte planes (16×16). DoK's first word differs from CoK's; the decoder keys on length and interprets planes at offset 2. | Existing `decodeGeoBlock` already decodes CoK and DoK. No dimension expansion is needed for these DOS formats. |
| DQK Gen2 GEO | HLIB `DATA` member: one-byte height, one-byte width, six resource-set bytes, then four width × height planes. The reader checks exact payload length and builds a dynamic map. Retail maps documented in the comparison note reach 28×28 (784 cells). | Existing `decodeGen2GeoBlock` already handles variable-size maps. The six bytes are resource-set metadata, not generic padding; preserve them in the format-specific result when round-tripping. |
| Greybox `GameMap` / `ModuleMap` | Positive width and height with row-major cells; `ModuleMap` reuses the `GameMap` cell shape and adds map events. Validation checks safe dimensions/product and exact cell count; it has no FRUA 576-cell limit. | Suitable neutral geometry for these three families. Practical allocation/render limits and every consumer's assumptions still need an audit before claiming arbitrary-size maps. |

### Source pointers

- [Engine-neutral `GameMap`](../../../packages/engine/src/model/index.ts): row-major cell indexing, dimensions, entries, and shared-edge flag.
- [Gen1/Gen2 GEO loader](../../../packages/engine/src/loaders/geo.ts): fixed Gen1 16×16 decoder, shared plane assembly, variable Gen2 block decoder, and Gen2 resource-header preservation.
- [Gen2 GEO encoder](../../../packages/engine/src/loaders/geoEncode.ts): writes variable dimensions, validates plane lengths, and exposes the six Gen2 header bytes.
- [Module map type](../../../packages/engine/src/module/types.ts) and [module validator](../../../packages/engine/src/module/validate.ts): map shape and dimension/cell-count checks.
- [FRUA GEO decoder](../../../packages/engine/src/module/frua/decode.ts): FRUA-specific 576-slot budget and parser rejection.
- [Authoring/import ADR](../adr/0006-authoring-data-model-vs-frua-import.md): FRUA is an import format; the authored model is intended as a superset.

## What “expand GEO” should mean

There are three plausible requests hidden in that phrase:

1. **Make FRUA files bigger.** This is not the right route. FRUA's cell capacity is embedded in a fixed binary layout, with the event table and string table at fixed offsets. Extending it would create a non-FRUA variant that the original FRUA runtime and existing tools would not understand. It would still not solve Krynn's ECL, data, rules, or art differences.
2. **Make Greybox's shared map model represent more source geometries.** This is already done for the documented CoK/DoK/DQK DOS map layouts. Keep adding format-specific adapters when another edition has a distinct layout; do not bake source-header or DAX/HLIB details into `GameMap`.
3. **Support playable Krynn campaigns end to end.** This requires campaign loaders and systems beyond GEO. Map conversion is necessary but not a campaign integration by itself.

## Recommended direction

### 1. Keep source formats distinct and validate at their boundary

Keep FRUA's 576-slot check in its parser. Keep Gen1's fixed 16×16 / 1026-byte checks in its decoder. Keep Gen2's width/height header and resource-set metadata in its HLIB reader/writer. A future platform variant should get its own evidence-backed adapter rather than a permissive “try all layouts” parser.

For Gen2, distinguish the byte-level range from the runtime limit: the header can encode dimensions up to 255 per side, but that does not prove DQK.EXE accepts every such map. The documented 784-cell runtime buffer is a disassembly-derived claim whose reproduction is still open in the comparison note. Greybox's in-memory model likewise needs a practical upper bound before accepting untrusted or manually authored huge dimensions.

### 2. Keep the neutral model focused on play semantics

Continue mapping the source's dimensions, cells, edges, door state, floor/backdrop identifiers, entry points, and map-local events into `GameMap` / `ModuleMap`. Keep source-only details such as original block ID, source archive, raw header/resource-set IDs, edition, and orientation transform in loader metadata or a provenance sidecar. That gives a future exporter enough context without making the shared engine model format-specific.

### 3. Test format adapters independently

The next implementation slice, if pursued, should be source-bound tests for the existing adapters—not a new GEO schema:

- Gen1 fixtures prove header handling, 16×16 dimensions, all four plane lengths, and decoded cell values.
- DoK fixtures prove that its different first word is accepted without misclassifying the plane data.
- Gen2 fixtures prove width/height ordering, rectangular maps, all six resource-set bytes, and exact-size rejection.
- Cross-format semantic tests compare the same synthetic four-plane map after Gen1 and Gen2 encode/decode; they should not require checked-in retail assets.
- Model validation tests prove no accidental 576-cell limit in `ModuleMap`, while malformed, overflowing, or impractically large dimensions fail safely.
- Consumer audit checks exploration, automap, transfer destinations, pathfinding, and rendering on rectangular maps; codec tests alone do not prove runtime support.

Real-data integration checks may read user-supplied local game files, but should not commit those files or generated assets.

### 4. Treat full Krynn support as separate vertical slices

After map handling, select a title and edition and trace a small playable route. The loader must associate maps with their ECL/scripts and area IDs, then resolve the matching game rules, databases, art banks, and campaign start/transition data. CoK/DoK's Gen1 data and DQK's Gen2 data should remain distinct source profiles even where GEO planes are shared.

## Decision

**No expanded FRUA GEO format is recommended.** The existing neutral map representation and current DOS Krynn decoders already cover the known geometry. If product requirements later call for exporting a new, editable cross-title map format, define it as a versioned Greybox package format above `GameMap`, with explicit provenance and source-specific metadata. Do not call that format FRUA GEO or mutate FRUA's binary contract.

## Limits of this assessment

This is a static review of the public repository's source and its map-capacity research. It did not verify the decoders against current retail files, test all runtime consumers with rectangular/large maps, establish DQK's maximum accepted area, or establish playable campaign support for any complete Krynn title.
