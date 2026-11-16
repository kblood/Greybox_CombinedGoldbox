# Plan: Generate a FRUA adventure from Pool of Radiance

**Status:** proposal; research and implementation have not started under this plan.  
**Scope:** investigate a clean-room, reproducible toolchain that converts a user-supplied copy of *Pool of Radiance* data into a locally generated FRUA design. This is a content-conversion project, distinct from the Greybox engine, the existing FRUA importer, and the OpenUA port.

## Goal

Create tools that automate the mechanical parts of adapting *Pool of Radiance* (PoR) into a FRUA-compatible adventure, while making every lossy conversion explicit and reviewable. The intended output is a usable `.DSN` design folder for a locally installed FRUA runtime. The tools should not require or distribute SSI game files, an existing fan design, or copied proprietary code.

The success criterion is not byte-for-byte equivalence with PoR. FRUA has a different data model and hard limits, so the first release should aim for a documented, playable conversion slice and a clear report of what was retained, changed, omitted, or needs a designer.

## Starting evidence and existing work

- The FRUA community already has a *Pool of Radiance* adaptation, commonly listed as **Game 39**. Treat it as a discovery and comparison lead, not as an implementation source. First establish its provenance, license/permission, and availability before inspecting or using its files.
- OpenUA documents that it can play FRUA designs and convert DOS FRUA artwork into the format its engine reads. That art conversion is **not** a PoR-to-FRUA converter.
- This repository already has FRUA format work: `tools/frua_events.py` and `docs/engine/research/frua-event-format.md` cover portions of FRUA design-event files; `packages/engine/src/module/frua/` decodes/imports FRUA designs into Greybox's internal model. Those tools are useful references and possible reusable components, but they do not currently emit a complete FRUA design.
- `tools/frua_geo_preview_model.py` and related tests provide a map-oriented investigation surface. Re-check their current contracts before relying on them.
- FRUA area files have bounded storage: 576 cell slots, 100 event records, and 400 strings per area. A design has 40 places (36 dungeon and 4 overland). The map-capacity comparison at `docs/engine/research/krynn-frua-map-capacity-port-comparison-2026-11-16.md` documents the evidence and caveats. Do not assume every PoR area fits or that its event logic maps directly.

## Guiding rules

1. **Read-only source inputs.** Decode copies of user-supplied, lawfully obtained game data; never patch or rewrite the originals.
2. **Clean-room conversion.** Implement from documented formats and independently established behavior. Do not copy code from OpenUA, fan modules, or other engines.
3. **Local generated output by default.** Keep converted maps, text, art, and design files outside Git. Do not publish or package copyrighted material. A public tool release must contain only original tooling, synthetic fixtures, and documentation unless distribution rights are separately established.
4. **Traceability.** Every emitted area/event should carry a machine-readable report linking it to source file/member/record identifiers and recording the conversion rule, confidence, and any loss.
5. **Fail visibly.** Unknown opcodes, unsupported fields, capacity overflow, dangling references, and ambiguous coordinate transforms must produce named errors or warnings, never plausible-looking silent fallbacks.
6. **Separate extraction from adaptation.** A decoder describes source data; a converter makes design decisions. Keep these stages independently testable.

## Proposed pipeline

```
user-supplied PoR files
        │
        ▼
read-only inventory and source decoders
        │
        ▼
normalized intermediate adventure model + provenance
        │
        ├── capacity / unsupported-feature report
        ├── designer review and override manifest
        ▼
FRUA design writer (GAME + GEO areas + required data/art)
        │
        ▼
local FRUA/OpenUA playtest and regression report
```

The intermediate model should preserve original identifiers and coordinates alongside normalized values. It should represent areas and transitions, map cells and edges, entry points, ECL instruction/control-flow references, strings, encounters, monsters, items, artwork references, and any game-state flags the source data exposes. It should not pretend a source ECL script is already a FRUA event.

## Work plan

### Phase 0 — Confirm scope and source inventory

- Locate the existing Game 39 adaptation and the original PoR data only in authorized local/community holdings; record source and permission/provenance separately.
- Identify the exact PoR edition/platform to target first (recommended: DOS release), its file/member inventory, and any edition-specific differences.
- Compare the Game 39 module's area coverage and documented limitations with PoR. Do not assume the adaptation is complete or legally reusable.
- Choose a small, representative vertical slice: the start sequence, one connected town/area, at least one text event, one encounter, and one transition.

**Exit gate:** source files and target edition are named; all planned reads are authorized; the slice can be described without copying another module's implementation.

### Phase 1 — Source readers and evidence ledger

- Inventory source archives and derive file/member structure from primary bytes and existing repository format research.
- Build read-only parsers for the source map/area geometry, ECL scripts, text, encounter tables, and referenced graphics needed by the selected slice.
- Preserve unknown record bytes and source offsets. Add bounded disassembly/decompilation views for ECL so control flow and data references can be reviewed.
- Produce a census showing map dimensions, reachable areas, transition destinations, event/script types, and resource references.

**Exit gate:** parsers reject malformed input, round-trip or match independent structural checks where possible, and the slice's source graph is reproducible from the inventory.

### Phase 2 — Define the normalized model and FRUA mapping

- Specify a versioned intermediate representation with stable source IDs and provenance fields.
- Map source geometry into FRUA's wall/cell representation and explicitly decide how to handle any area over 576 cells, unsupported topology, or coordinate-orientation mismatch.
- Translate only well-understood ECL behaviors into FRUA event sequences. Start with text, basic combat, simple transfers, and other demonstrably equivalent actions.
- Represent unsupported scripts as a report plus a designer task. Never replace them with empty events or guessed behavior.
- Define mappings for monster/item records, quest state, party effects, and art IDs. Identify where FRUA's fixed AD&D rules or content limits prevent faithful behavior.
- Add an override file for deliberate manual decisions, with each override tied to a source ID and rationale.

**Exit gate:** the mapping spec covers every field in the first slice as automatic, manual override, intentionally omitted, or unsupported; no field is silently dropped.

### Phase 3 — FRUA writer and minimal playable slice

- Implement a deterministic writer for a `.DSN` folder: design metadata/start record, area `.DAT` files, strings, event records, and only the other files FRUA actually needs for the slice.
- Reuse existing format encoders only after confirming they emit FRUA-compatible bytes; do not confuse the Greybox importer with a FRUA writer.
- Validate every emitted area against FRUA limits and internal references (cell-to-event slots, event chains, strings, map transitions, monster/item IDs).
- Generate a conversion report listing source coverage, emitted content, changes, omissions, unresolved references, and hashes of local inputs/outputs. Keep copyrighted payloads local.

**Exit gate:** the generated slice loads in FRUA and can be played through its declared start-to-end route, with a hand-checked source-to-output trace and no unexplained warnings.

### Phase 4 — Runtime validation and differential review

- Test in the original FRUA runtime first; test in OpenUA as a separate compatibility check, not as the sole correctness oracle.
- Compare source and generated map topology, event order/conditions, text association, encounter composition, transition destinations, and persistent state on the selected route.
- Use synthetic fixtures for public automated tests. Any tests against real game data must be local-only and clearly skip when the user's files are absent.
- Add mutation controls: corrupt a source record, exceed an FRUA limit, or break a reference and confirm the converter fails with a useful diagnostic.

**Exit gate:** the slice passes the original runtime route and all format/consistency checks; known differences are documented rather than hidden.

### Phase 5 — Expand coverage incrementally

- Add areas by dependency order from the start, extending event translation only when a behavior has a verified source interpretation and FRUA equivalent.
- Track route coverage and behavior coverage separately. Reaching every map does not mean every event, condition, or ending is reproduced.
- For oversized areas or unsupported mechanics, evaluate explicit redesigns (split areas, linked FRUA places, substitute events) with a loss record and human review.
- Keep a compatibility matrix for source edition, FRUA version/patch, required community tools, and OpenUA runtime status.

**Exit gate:** a release candidate has a complete route/feature inventory, reproducible generation from user-owned inputs, and no unclassified source behavior on the claimed route.

## Suggested deliverables

1. `tools/por_source_inventory.py` — read-only manifest of source files and members.
2. Source parsers and ECL disassembly/analysis tools, added only as formats are established.
3. A versioned normalized intermediate schema and sample synthetic fixture.
4. `tools/por_to_frua.py` — deterministic generator plus explicit override manifest and conversion report.
5. Synthetic tests for parsers/writer and local-only integration tests for user-supplied retail data.
6. A human-readable status report that distinguishes automated, manually reviewed, omitted, and unsupported content.

Names above are proposals, not existing tools.

## Main technical risks

- PoR ECL behavior may not have direct equivalents among FRUA's event types; translation may require event chains, added maps, or manual redesign.
- FRUA's map, place, event, string, monster, item, and art limits may force structural changes to the adventure.
- Source and FRUA coordinates, map orientation, trigger timing, and chain semantics can appear plausible while being wrong; each requires byte-backed tests and runtime checks.
- FRUA art conversion is a separate problem from converting adventure logic. DOS artwork formats, palette constraints, and asset references need their own measured compatibility path.
- Existing Game 39 may be useful as a behavioral reference, but its files may themselves contain copyrighted game text/art and fan-authored material; do not incorporate them without clear rights.
- OpenUA's ability to run FRUA modules is useful for testing but does not prove the generated design behaves identically in original FRUA.

## Out of scope for the first milestone

- Reimplementing Pool of Radiance as a new standalone engine or Greybox `ModulePackage` campaign.
- Converting the entire Gold Box catalog or every platform release.
- Automatically translating arbitrary ECL into FRUA events.
- Committing generated `.DSN` files, retail data, copied art/text, or external fan-module contents.
- Claiming a complete or faithful PoR conversion based only on successful loading or one short playtest.

## Immediate next step

Perform a provenance-aware, read-only comparison of the existing Game 39 module's structure and documented route against the chosen local DOS PoR source. Produce a short coverage matrix for the proposed vertical slice and identify the smallest parser/writer proof needed next. Do not start the full converter until this comparison exposes the real gaps and confirms the source boundary.
