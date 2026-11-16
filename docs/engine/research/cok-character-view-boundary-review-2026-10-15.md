# View inventory: unresolved boundary review and next evidence task

2026-10-15, Astra source-only review. Actual inventory `build/cok-recomp/character-view-inventory-sol-20261015-a/luna-validation-a/focused-controls/view.json` SHA256 `af50d442f1c3262a13ed3879adac0e52850e6b080e3451ef7e090c32b703fd90`. Luna's receipt reports27 controls, repeat equality and truthful cap1 exhaustion. No application, test, decode tool or generation executed by this review.

## Decision

Do **not** proceed to View admission yet. The complete directly traversable primary graph contains12,033 new tuples/30,514 unique bytes against34,172/87,539. Selector audit adds zero new tuples/bytes. There are no exhausted caps, pending work or missing decode extents, but four new far-call sites have no reviewed target contract.30,514 is the direct closure before those missing targets are recovered; the2,254-byte remaining batch headroom cannot justify excluding dependencies. Primary has316 function roots/28,503 rows; selector100/5,656; union28,646 rows. `complete=false` is correct.

## All computed sites

| Original site | Bytes | Classification |
| --- | --- | --- |
| 0661:0355 | FF1E764A | Existing MIDI caller/DS/AH/offset and live driver allocation/generation guard |
| 0A46:03B7,03C3 | FF1E9A43 | Existing manager target0038:0025 with original stub or live body/binding/stub validation |
| 0A46:0601 | 26FF19 | Existing file-record variable slot10/14/18/1C, magic/bounds/target/source guard |
| 0A46:07FB | 26FF5D14 | Same existing record contract, slot14 |
| 0A46:088C | 26FF5D18 | Same existing record contract, slot18 |
| 0A46:02F3 | FFD3 | **Existing near guard**, not new: `guest.c::near_call_register` requires source load+A46:02F3 and target02B1 or02D1; otherwise fault4. This already-admitted site is absent from the scanner's far-dispatch annotation table |
| 00BA:15C7 | FF1E3A6E | **New unresolved** far pointer DS:6E3A |
| 00BA:1712 | FF9D3A6E | **New unresolved** indexed far pointer DS:6E3A+DI |
| 00DB:01C1 | FF1E746D | **New unresolved** far pointer DS:6D74 |
| 00DB:01E1 | FF9D946B | **New unresolved** indexed far pointer DS:6B94+DI |

Selector's four computed sites are0661:0355 and0A46:0601/07FB/088C, all inherited. Do not treat all11 primary computed sites as new or silently promote unresolved ones to existing guards.

BA's two calls are in whole functionBA:1415,368 inventoried instructions, return17A7.15C7 receives pushed byte arguments BP+0E/BP+0C and far argument BP+6. At1712, original code copies byte BP+0E through DS:6B33, zero-extends it and multiplies by4 into DI. These instructions establish scaling, **not the permitted index range or targets**.

DB's two calls are in whole functionDB:01A8,28 instructions, RETF0Ch at01E6. DS:713C selects01C1 when nonzero; otherwise01E1 receives DI=zero-extended byte BP+10 times4. Both push the original far argument BP+0C and words/byte from BP+0A/+8/+6. Again, neither zero-extension nor four-byte stride proves a legal table extent.

No direct writes to those exact pointer operands were found in the measured primary instruction strings. That is not proof of immutable tables: initialization may be indirect, copied, relocated or outside the current direct closure. Do not derive targets from current RAM alone, assume zero/one entries, use a generic admitted-target escape hatch, or prune the selecting branch.

## All primary interrupt sites (22)

| Sites | Request/contract |
| --- | --- |
| 0661:0333,07E8:130F,0A46:0164 | Existing AH25 vector installation; original value and IVT admission retained |
| 0962:0306,0152 | Existing INT16 AH01 ring-validated status |
| 0962:031D,0158 | Existing INT16 AH00 consuming input/InputWait; complete keyboard journal retained |
| 0962:0169 | Exceptional INT23, unresolved return; existing rejection preserved |
| 0962:060F | Generic INT10 wrapper; only actual supported request shapes succeed. Inherited unsupported text/cursor/scroll variants remain rejected |
| 09C4:00A7 | Existing AH2C deterministic clock |
| 09C4:0135 | Existing AH1A DTA selection |
| 09C4:0141 | AH4E, request-dependent. Exact search and reviewed WHO profile remain separate from the newly observed CX8 root-volume query, whose oracle/service is still pending |
| 0A46:01A3 | AH4C nonreturning, unsupported; no invented fallthrough |
| 0A46:01EB | AH06 diagnostic output, unsupported |
| 0A46:140F | Original AH3D/3C open/create through current bounded asset/save routing |
| 0A46:145F | AH3E close |
| 0A46:14E2 | AH3F/40 original block read/write, unchanged record arithmetic/error propagation |
| 0A46:1541,15AB,15B9,15C7 | AH42 origins0,1,2 and restore0, respectively |
| 0A46:1686 | AH30 version query, unsupported |

These are16 DOS interrupt sites, four BIOS keyboard sites, one CtrlBreak and one video site. Selector's13 interrupts are a subset: vector trio, keyboard quartet, INT23, video, AH2C, AH4C, AH06 and AH30. No new interrupt site alone requires expanding service policy. Actual newly reached argument shapes still require evidence; the volume-label discovery demonstrates why existing INT admission does not imply universal host support.

## Approved next task: original callsite/table evidence only

Sol may prepare a fresh ignored source-only evidence preparer and focused Python controls. It takes explicit pinned original inputs, accepted cold baseline and the measured View inventory as declared review input; do not edit this frozen inventory or run tools during implementation. Luna executes only after Astra source review.

1. Recover exact original byte/relocation witnesses for the four sites and their whole enclosing bodies. Follow their direct callers to establish actual argument sources, index bounds and DS ownership. Record branch predicates and all caller alternatives rather than only the observed default state.
2. Locate original writers/initializers/copies for DS:6E3A,6D74 and6B94, including relocation-bearing source tables, destination extents, initialization order and mutable replacement paths. Start with actual resident data and catalog initializer procedures; any raw byte search is only a candidate locator and requires decoded code/data provenance. No guessed table length or pointer target list. Keep global DS:713C/6B33 provenance explicit.
3. Resolve proven far-pointer targets through original descriptor procedure tables, with per-overlay namespace, body/source hash and relocation words. Distinguish pointers to original public stubs from loaded body pointers; propose exact future guard inputs for caller owner/generation/body, DS, index/slot, table source and target binding. The present generic far-target guard does not already authorize these sites.
4. Produce a data-only contract proposal and dependent whole-function worklist. If writer/target/index proof remains incomplete, report the precise gap; a later bounded runtime observation may supply evidence but cannot independently justify arbitrary targets. Do not add scanner table contracts or native dispatch branches yet.
5. Controls must reject mutated call bytes, wrong descriptor/DS/table namespace, offset/stride/bound changes, missing relocation words, unproven writer/target claims and overlap with instruction interiors. Retain all current six far guards and the already-existing near guard byte-for-byte. Source proposal must not manufacture success through table initialization.

After those contracts are reviewed, rerun the whole View inventory with only the proven computed targets and report the complete new deduplicated budget against current accepted ancestry. Keep analysis131,072 and eventual batch32,768 limits. If complete closure exceeds one batch, return for an explicit whole-helper dependency ordering plan; never remove error/cancel paths or raise the limit implicitly. No View admission/native build/application key is authorized by this boundary review. Cold Add's volume-query repair remains the immediate runtime priority; WORLD source work is independent.
