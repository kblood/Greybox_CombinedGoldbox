# P1.5 — Broader-roster evidence declarations (Treasures, Pools of Darkness, NWN, FRUA)

> Scope: `docs/engine/BUILD-QUEUE.md` P1.5. Ground truth was the 2026-07-16
> `build/goldbox-corpus.json` gaps for `treasures-of-the-savage-frontier`,
> `pools-of-darkness`, `neverwinter-nights-dos`, `forgotten-realms-unlimited-adventures`, and
> `death-knights-of-krynn` (see `docs/engine/BUILD-QUEUE.md`'s P1.5 line for the exact task
> text). This doc records what was actually checked, byte-for-byte, and why each result landed
> where it did. "UNLOCATED beats invention" — see `docs/engine/HANDOFF.md` §5.

## Result summary

| Game | Manifest | Route | Tier | Verdict |
| --- | --- | --- | --- | --- |
| Death Knights of Krynn (DOS) | **added** (`apps/web/games/death-knights-dos.json`) | already declared | exploration | manifest gap closed |
| Neverwinter Nights (DOS/AOL) | already declared | **added** (`neverwinter-nights-dos` route) | exploration | route gap closed |
| Treasures of the Savage Frontier | **added** (`apps/web/games/treasures-of-the-savage-frontier.json`) | not declared | — | **route blocked**, see below |
| Pools of Darkness | **added** (`apps/web/games/pools-of-darkness.json`) | not declared | — | **route blocked**, see below |
| Forgotten Realms Unlimited Adventures | **added** (`apps/web/games/forgotten-realms-unlimited-adventures.json`) | not declared | — | **route blocked**, see below |

All manifest/route work lives in `tools/goldbox_corpus_routes.json` (routes) and
`tools/goldbox_corpus.py`'s `PROFILES` table + `apps/web/games/*.json` (manifests). Acceptance
was `python tools/goldbox_corpus.py --strict`, re-inspected against `build/goldbox-corpus.json`.

## What "exploration-tier route" actually checks

`tools/goldbox_corpus.py`'s `verify_dax_gen1_route` (the `dax-gen1` route verifier used by every
Gen1 DAX title, including the two minimal "exploration" declarations for `champions-of-krynn` and
`gateway-to-the-savage-frontier`) proves a route by **literal byte-substring search**: it builds
the exact encoded bytes of a `LOAD_FILES <a>,<b>,<c>` and a `LOAD_PIECES <d>,<e>,<f>` ECL
instruction — where every operand is encoded as the two-byte pair `(0x00, value)`, i.e. ECL
**operand code 0** ("plain immediate byte") for all three operands of both instructions — and
searches for those exact byte sequences anywhere inside the target ECL block's decompressed
bytes (`tools/goldbox_corpus.py:261-274`). It does not care whether that byte pattern is actually
reached by control flow; it is a pure archive-content check.

Because of that, an *honest* exploration-tier declaration needs a genuinely-reached
`LOAD_FILES`/`LOAD_PIECES` pair (found by following the real ECL control-flow graph from the
block's own header entry table, the same way `tools/gen1_ecl_encounter_scan.py`'s `scan_block`
does) whose operands all use **ECL operand code 0**. A coincidental byte match elsewhere in the
file that isn't the actual area-load instruction would satisfy the checker but would be a
fabricated claim, not evidence — not done here.

## Positive result: Neverwinter Nights (DOS/AOL) — exploration route added

NWN's `ECL0.DAX` block 1 (and, it turns out, most of its ~30 area-entry blocks across
`ECL0..3,5,7`) load their own dungeon geometry with clean code-0 operands, exactly like CoK's
`ECL1.DAX#34` and Gateway's `ECL2.DAX#2`:

```
ECL0.DAX#1  offset 93   LOAD_FILES  [1, 2, 255]   codes [0, 0, 0]
ECL0.DAX#1  offset 100  LOAD_PIECES [25, 15, 14]  codes [0, 0, 0]
```

reached from the block's own header entry table (`tools/gen1_ecl_encounter_scan.py`'s
`header_entries`/`successors`, replicated with a small standalone traversal for this check).
`GEO0.DAX` block 1 is a valid 1026-byte (16x16) map, `WALLDEF.DAX` contains ids 1-37 (superset of
`{25,15,14}`), and `8X8D.DAX` has 40 tile blocks. The route is declared as
`neverwinter-nights-dos` in `tools/goldbox_corpus_routes.json` (`surface: "exploration"`,
`engine_test: packages/engine/test/dungeon.test.ts`, the same generic engine test CoK and Gateway
already point at) and verifies `verified-byte-contract` with all nine checks passing.

This is genuinely useful evidence: despite NWN's very different distribution model (AOL/GEnie
dial-up, multiplayer party hosting — see `apps/web/games/neverwinter-nights-dos.json`'s existing
notes), its **on-disk container generation is the ordinary DOS Gen1 DAX/FBOV format**, and its
dungeon-loading ECL convention matches the *oldest*, simplest CoK/Gateway style rather than the
later titles' dynamic-operand style found below. NWN is also SSI's earliest Gold Box release
(1991), which is consistent with it using the earliest/simplest encoding convention.

This is still only the **exploration** tier (archive/block/entry-point identification, matching
`champions-of-krynn`'s and `gateway-to-the-savage-frontier`'s own declarations) — no
`search_location`/`natural_encounter`/persistence claim is made, and none should be inferred from
this doc. NWN's actual multiplayer session/party-hosting model was not investigated further; that
remains a separate, much larger open question if NWN combat is ever pursued.

## Blocked: Treasures of the Savage Frontier — route not declared

**What was checked.** Treasures' `ECL1.DAX` has 30 blocks. A CFG-following traversal from every
block's own header entry table (the same method used for the NWN result above) found genuinely
reached `LOAD_FILES`/`LOAD_PIECES` instructions in 13 blocks, but **only one block (34) has both
mnemonics reachable from the same header entry**, and its operands do **not** use code 0
throughout:

```
ECL1.DAX#34  offset 60   LOAD_FILES  words=[34, 2, 2]              codes=[0, 0, 35]
ECL1.DAX#34  offset 732  LOAD_PIECES words=[5, 200, 51201]         codes=[128, 1, 3]
```

The `LOAD_FILES` third operand uses code `35` (not 0), so its raw bytes (`0x23, 0x02`) do not
match the literal `(0x00, value)` pattern the checker requires. The `LOAD_PIECES` instruction is
far more telling: its decoded word values (`200`, `51201`) are **outside byte range entirely** —
operand codes `128`/`1`/`3` are non-immediate operand types (per
`tools/gen1_ecl_encounter_scan.py`'s `read_operand`, codes `1`/`2`/`3` consume an extra byte and
therefore encode 16-bit values), meaning Treasures' wall-piece load here is **not** three literal
bank-id constants at all — it is computed/indirect. An exhaustive sweep of every block in
`ECL1.DAX` for a fully code-0 `LOAD_FILES` or `LOAD_PIECES` instruction, under both candidate
address addends (`26368`, the Pool-era addend, and `32768`, the CoAB/Secret/Gateway-era addend),
found **zero** matches anywhere in the file — not just in block 34.

**Why this matters.** `docs/engine/research/savage-frontier-targets.generated.md` (generated by
`tools/map_savage_frontier_targets.py`) already documents a **decoded** Treasures combat
candidate at `ECL1.DAX#24 -> COMBAT 0x856E` with an explicit `FIGHT`/`FLEE` menu — but that
document's own "Claim Boundary" section is explicit that these are "decoded ECL candidates, not
completed retail playthroughs," requiring separate runtime checkpoints before promotion (a much
higher bar than this task's exploration tier, and one none of the four games here were asked to
clear). Even setting combat-tier evidence aside, the much smaller exploration-tier bar —
reproducing CoK's/Gateway's/NWN's own simple literal area-load pattern — is not clearable for
Treasures with the current byte-contract verifier, because Treasures' own initial-area script
genuinely does not use that literal encoding.

**What would unblock it.** Either (a) extend `verify_dax_gen1_route` to accept routes whose
`load_files`/`load_pieces` declare per-operand ECL operand codes (not just implicit code 0), which
is a real, if small, semantics change to the shared Gen1 verifier used by every title in the
corpus and was judged out of this task's scope (`tools/goldbox_corpus.py`'s route-matching logic,
as opposed to its manifest logic, per the assigning message's explicit scope boundary), or (b)
find/derive the semantic meaning of code `35`/`128`/`1`/`3` well enough to prove the *effective*
file/piece ids at runtime (a genuine RE task, not a declaration task). Neither was attempted here.

`apps/web/games/treasures-of-the-savage-frontier.json` documents this in its `ECL1.DAX` entry's
`note` field so the browser asset viewer doesn't imply more than is proven.

## Blocked: Pools of Darkness — route not declared

**Format generation, confirmed first.** Despite PoD's later release date, its install root
(`C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness`) is **Gen1 DAX/FBOV**, not Gen2
HLIB — `GAME.EXE`/`GAME.OVR`, `ECL1.DAX`/`GEO1.DAX`/`WALLDEF1.DAX`/`8X8D0-1.DAX`/`MON1CHA.DAX`
etc., no `.TLB`/`.GLB`/`HLIB` magic anywhere. This matches its existing `family: "gen1-fbov"`
assignment in `tools/goldbox_corpus.py`'s `PROFILES` table (same family as Pool of
Radiance/Curse of the Azure Bonds/Secret of the Silver Blades, the natural-combat-tier titles) —
confirmed by direct inspection, not assumed from release year.

**What was checked.** The same CFG-following traversal used for NWN and Treasures was run across
all 56 blocks of PoD's `ECL1.DAX`. Every block that reaches a `LOAD_FILES` instruction from its
own header entry uses a non-zero third operand code (almost always `9`, e.g. `ECL1.DAX#21`
`LOAD_FILES [21, 1, 0]` codes `[0, 0, 9]`); every block that reaches a `LOAD_PIECES` instruction
uses non-immediate codes with out-of-byte-range words (e.g. `ECL1.DAX#34` offset `7326`
`LOAD_PIECES [5, 191, 48897]` codes `[128, 1, 3]`). As with Treasures, an exhaustive sweep for any
fully code-0 `LOAD_FILES` or `LOAD_PIECES` anywhere in the file, under both candidate address
addends, found **zero** matches. Sibling title Pool of Radiance was directly re-checked with the
identical method as a sanity control and **does** have a clean code-0 pair
(`ECL1.DAX#18` `LOAD_FILES [18,2,255]` / `LOAD_PIECES [1,3,5]`, codes all `0` — this is exactly
the pair its own already-declared `pool-of-radiance` natural-combat route uses), confirming the
scanning method is sound and that PoD's divergence is a real property of PoD's own scripts, not a
tooling artifact.

**Interpretation.** PoD is the last (1992) title in the Pool of Radiance tetralogy and appears to
have moved its area-load wall/piece selection to computed/indirect operands throughout, unlike
its own three predecessors' (at least partially) literal convention. This is a genuine,
title-specific engine-evolution finding, not a search gap.

**What would unblock it.** Same as Treasures: either loosen the verifier's operand-code
assumption (out of scope here) or RE the actual runtime semantics of PoD's indirect operands.

`apps/web/games/pools-of-darkness.json` documents this in its `ECL1.DAX` entry's `note` field.

## Superseding update (2026-07-31): HEIRS.DSN retail Route declared

The historical HLIB investigation below remains correct for FRUA's bundled `DISK3/SCRIPT.GLB`,
but its conclusion no longer blocks a representative playable route. The installed retail
`HEIRS.DSN` is now imported through FRUA's documented design-folder layer: one `GAME001.DAT` plus
all 26 `GEOxxx.DAT` maps are read by normalized relative path, so its files cannot be confused with
the sibling `TUTORIAL.DSN`. The two route anchors are hash-locked:

- `GAME001.DAT` SHA-256
  `a9ce8098a3db84055c9b834d9d1c6586644117ef35328c9d971c96e06f18cd28`;
- `GEO017.DAT` SHA-256
  `42cc7fd6038a14e52b7f140186078e81027290676e1a19355e7d3e6c92d4ab80`.

Retail `GAME001.DAT` stores starting module 5 and entry byte 1. Cross-checking both installed
HEIRS and TUTORIAL designs establishes that the entry byte is one-based, so the importer validates
the retail range 1..8 and normalizes it to the engine's zero-based contract. Module 17 resolves to
package map index 14 and entry 0 at `(1,0,E)`; those derived package identifiers are not hardcoded
in the browser host. Turning right and moving forward reaches `(1,1,S)`, cell event slot 41, whose
type-2 Text Statement correctly decodes as `THE ODOR AND PHYSICAL EVIDENCE SUGGEST THAT THIS CAVE
IS THE DEN OF SOME ILL-BRED FLYING CREATURES. ` after the 2026-08-01 correction for FRUA's
one-based string references; the earlier `GRIFFONS RACE...` transcription was the next string.
The FRUA 6-bit
alphabet correction is also retail-derived: values 1..31 map ASCII `A` through `_`, including the
`^` used by HEIRS.

The `frua-dsn` corpus contract verifies the hashes, GAME start bytes, GEO dimensions/entry, target
cell event reference, type, and decoded text, with negative tests for both a corrupted hash and
corrupted event text. The Library always preserves GAME001's authentic module-5 start; only the
exact hash-locked GAME001/GEO017 pair adds a second, explicitly labelled module-17 checkpoint, so
a renamed or modified design cannot be redirected by folder name. Browser and Electron acceptance
import the complete selected design folder, open that checkpoint, render all 576 cells, perform the
legal turn/move, and observe the exact statement in both engine state and visible DOM. Electron's
native recursive scan sees all 35 files (33 at the design root plus two nested SAVE files), while
the current importer consumes one GAME and 26 GEO maps and leaves four MONST, two STRG, and two SAVE
files outside its claimed coverage. Generated support therefore promotes FRUA from `Mapped` to
`Route`.

### Once-only/repeat-question state update (2026-08-01)

Installed `HEIRS.DSN/GEO001.DAT` is pinned at SHA-256
`d43a499497c7af97fe92e0518b2d0ab62998d10b89ce4bc40e31c17401f8df85`. Its 20-byte event-slot 11
record at file offset `0x0F92` is
`0A 01 00 00 12 00 00 A0 13 00 0C 0D 0F 10 00 00 00 00 00 00`: byte 2 marks the always-triggered
Question-Button do-once, while byte 8 combines no art with button 4's return-to-question flag. The
five decoded targets are 12, 13, 15, 16, and 0. Event 16, YELL's Text Statement target, is not
do-once; event 13, SLINK AWAY's Text target, is do-once. The authentic route starts at entry 0
`(7,13,S)`, turns east, and walks through `(8,13)` to the sole event-11 cell `(9,13)`.

One shared `ModuleEventRuntime` now owns automatic chains, global do-once consumption by source
event ID, suspended choice/combat continuation, and per-option return-to-question behavior. Its
versioned snapshot is optional additive data in Greybox SaveGame v2; module-ID validation prevents
state from being restored into another design, and paused interactions cannot be serialized. The
web module host and author playtest both use this runtime instead of maintaining separate recursive
VM traversal.

Engine goldens prove first visit, two consecutive YELL selections with the complete question
restored each time and no map movement, SLINK AWAY completion, legal off-and-back silence, global
consumption of a shared event ID, legacy repeatable events, serialization/renumbering survival, and
snapshot repair/rejection. Browser and Electron acceptance import the real installed folder, walk
the retail route, repeat YELL twice in place, save at `(10,13,E)`, restart the renderer, re-import
the selected bytes, load consumed IDs 11 and 13, and prove the legal return to `(9,13)` stays
silent. The canonical corpus verifies that byte/state contract independently and promotes FRUA
from `Route` to `Persistent`; this is Greybox save-v2 coverage, not original-FRUA save compatibility.

This is a `.DSN` map/Text-Statement route, not native CKIT execution. `SCRIPT.GLB`, MONST/STRG
databases, transfer/combat events, conditions/common chains, backup movement, pictures, original
presentation, broader event coverage, and a complete authored reference campaign remain explicit
gaps.

## Historical blocker (superseded): Forgotten Realms Unlimited Adventures — route not declared

**Format generation, confirmed first.** FRUA's retail distribution (`DISK1`/`DISK2`/`DISK3` under
`C:/Program Files (x86)/GOG Galaxy/Games/Unlimited Adventures`) is genuinely **Gen2 HLIB**, same
generation as DQK: `DISK1/TITLE.TLB` starts with the `HLIB` magic, and `DISK3/GEO.GLB`,
`DISK3/SCRIPT.GLB`, `DISK3/GAME.GLB` are all `HLIB`-tagged `DATA`-style archives (readable with
the same `tools/dqk_ecl_combat_scan.read_hlib_data_archive` used for DQK). This matches its
existing `family: "gen2-rtlink"` assignment. FRUA ships a bundled base/tutorial dataset directly
on disk (`DISK3/GAME.GLB`, `DISK3/GEO.GLB`, `DISK3/SCRIPT.GLB`), separate from the
user-authorable `.DSN` module packages also present at the install root (`HEIRS.DSN`,
`TUTORIAL.DSN` — not inspected here, a different, CKIT-specific packaging layer).

**What was checked.** `verify_hlib_gen2_route` (the same Gen2 verifier `dark-queen-of-krynn` uses)
requires member 0 of both the ECL-equivalent and GEO archives to be a `(area_id, member_index)`
lookup table: a little-endian `uint16` count followed by that many `(uint16 area, uint16 member)`
pairs. `DISK3/GEO.GLB` matches this exactly — its member 0 is 174 bytes, decodes to a count field
of `43`, and `2 + 43*4 = 174` bytes exactly, producing a sane area table (areas `1..~40s` mapping
to 4 real map members). **`DISK3/SCRIPT.GLB` does not.** Its member 0 is 1039 bytes and begins
with the literal ASCII text `"common event pa..."` — it is real script content (an event script,
almost certainly a "common"/shared event pack referenced by every area), not an index table at
all. Reading its first two bytes as a count field yields `25365`, nonsensical against the
archive's real 58-member count, confirming member 0 is not structured as DQK's area table.

**Interpretation.** FRUA's own script-archive layout genuinely differs from DQK's `ECL.GLB`
convention that `verify_hlib_gen2_route` was built against — plausibly because FRUA (an authoring
toolkit assembling arbitrary user-designed modules) indexes area-to-script mapping through the
separate `GAME.GLB` "session"/module archive instead of a per-script self-contained table, or
through the `.DSN` module-package layer entirely. Neither `GAME.GLB`'s internal structure nor the
`.DSN` format was reverse-engineered in this pass — that is real, separate, unscoped RE work.

**What would unblock it.** Reverse-engineer FRUA's actual area-to-script indexing (most likely
inside `GAME.GLB`, or in the `.DSN` module-package format) well enough to locate a genuine
ECL-area/GEO-area pair the same way DQK's own route was found, then either reuse
`verify_hlib_gen2_route` (if the resulting archive/member shape matches) or extend it.

`apps/web/games/forgotten-realms-unlimited-adventures.json` preserves the distinction in its
`SCRIPT.GLB` entry's `note` field. The statement above that `.DSN` was "not inspected here" is a
historical record of this earlier pass and is superseded by the dated update.

## Reproduction

The CFG-following sweep used for the NWN/Treasures/PoD checks above was a short standalone script
built on the repo's existing `tools/gen1_ecl_encounter_scan.py` primitives (`header_entries`,
`decode_one`, `successors`) — it was not checked in as a new tool because it is a one-shot
diagnostic, not a repeated pipeline step (per `docs/engine/HANDOFF.md`'s "delete throwaway probe
scripts after use" convention). To reproduce: for each ECL block, seed a BFS from
`gen1_ecl_encounter_scan.header_entries(raw, address_addend)`, follow `successors(...)` exactly
as `scan_block` does, and record every `decode_one` result whose mnemonic is `LOAD_FILES` or
`LOAD_PIECES`, noting each operand's `.code` and `.word`. A "clean" instruction is one where every
operand's `code == 0`.

The FRUA HLIB check used `tools/dqk_ecl_combat_scan.read_hlib_data_archive` and
`tools/dqk_ecl_combat_scan.parse_id_table` directly against `DISK3/GEO.GLB` and
`DISK3/SCRIPT.GLB`.

## Acceptance

`python tools/goldbox_corpus.py --strict` regenerates `build/goldbox-corpus.json` cleanly. Gaps
cleared: `death-knights-of-krynn` (`browser-manifest-missing` gone),
`neverwinter-nights-dos` (`retail-route-not-declared` gone, now zero gaps). Gaps intentionally
remaining: `treasures-of-the-savage-frontier`, `pools-of-darkness`,
`forgotten-realms-unlimited-adventures` each still show `retail-route-not-declared` — their
`browser-manifest-missing` gap is gone, but no route is declared, for the reasons documented
above.

**2026-07-31 acceptance update.** Subsequent route work cleared those three historical gaps:
Treasures and Pools reached `Persistent`, while FRUA now has the hash-locked HEIRS `.DSN` Route
described above. Current strict-corpus output, not this historical count paragraph, is authoritative.

## Claim boundary

This doc proves container-format generation (DAX vs HLIB) for all four titles by direct magic-byte
and archive-shape inspection, and proves (or disproves) the exploration-tier byte contract by
genuine CFG-reached-instruction inspection, not coincidental byte search. The dated HEIRS update
adds only its `.DSN` Text-Statement exploration route; it does not imply FRUA combat, persistence,
or native CKIT compatibility. This doc does not claim NWN's multiplayer/session model is understood
beyond its on-disk container compatibility.
