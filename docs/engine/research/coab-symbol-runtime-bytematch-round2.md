# CoAB promoted symbol-candidate runtime byte-match — round 2

Sibling doc to `docs/engine/research/coab-symbol-runtime-bytematch.md` ("round 1"). Round 1
promoted 5 of `build/goldbox-symbol-candidates.json`'s 46 promoted candidates (21 of which carry a
recovered semantic name) from "static structural correlation only" to "runtime-confirmed identical
bytes." This round extends the same tooling, in the same owned DOSBox-X session shape, to **all 16
remaining named CoAB clusters** (18 more `evidence.coab` rows, since two clusters each carry two
semantic names at two different retail offsets) — closing out runtime confirmation for every
currently-named, promoted CoAB candidate in the corpus, not just a subset.

## Result

**Confirmed for all 18 additional roles, reproduced twice.** Two full passes
(`build/dosbox-x-coab-symbol-bytematch-round2-run1` and `...-round2-run1-r2`) against the same
hash-locked base stage (`build/runtime-coab-base-clean-20260716`, `START.EXE`/`GAME.OVR` hashes
unchanged from round 1) each observed the same 36-descriptor silent-startup preload sequence, hit
all 7 target descriptors (7, 21, 22, 23, 24, 25, 26 — round 1's three plus four new ones), and
byte-matched all 18 new roles plus the 5 round-1 roles (re-checked this round for determinism)
exactly against retail `GAME.OVR` at their expected relative offsets. Every one of the 23 roles
traced across both rounds is now `all_runs_exact_match: true`.

| Descriptor (unit) | Roles this round | Retail base | Code size |
| ---: | --- | ---: | ---: |
| 21 (`ovr022`) | `willOverload`, `treasureOnGround` | `0x2BC99` | `0x21E0` |
| 22 (`ovr023`) | `item_is_scroll` | `0x2DFB5` | `0x6B39` |
| 23 (`ovr024`) | `odd_math` | `0x35022` | `0x2595` |
| 24 (`ovr025`) | `stat_bonus`, `stat_bonus02`, `strenghtHitBonus`, `strenghtDamBonus`, `strength_bonus`, `clear_spell`, `find_affect`, `on_our_team`, `clear_actions`, `offset_above_1`, `offset_equals_20` (11 roles; `count_teams` re-checked, already confirmed round 1) | `0x376A5` | `0x3413` |
| 25 (`ovr026`) | `getExtraFirstSkill`, `getFirstSkill`, `hasAnySkills` | `0x3AC60` | `0x13FF` |

Full per-role hex dumps, expected/observed bytes, and runtime addresses:
`build/dosbox-x-coab-symbol-bytematch-round2-run1-r2/coab-symbol-bytematch.json` (second pass;
first pass at `.../round2-run1/coab-symbol-bytematch.json` is byte-identical for every role).
Consolidated raw evidence for both rounds (used by the new stable-map tool, see below):
`build/coab-runtime-validated-symbols.json`.

All 7 destination segments observed this round: `303D` (descriptor 7), `33A2` (21), `2CEE` (22),
`2A94` (23), `2752` (24), `2612` (25), `24DC` (26) — identical across both reproductions.

## Why these 16 clusters (18 roles)

Round 1's own doc explicitly named the next cheap win: descriptor 24 (`ovr025`) was already proven
reachable (via `count_teams`), and ten more named clusters (`clear_actions`, `find_affect`,
`on_our_team`, `clear_spell`, `stat_bonus`/`stat_bonus02`, `strength_bonus`, `strenghtHitBonus`,
`strenghtDamBonus`, `offset_above_1`, `offset_equals_20`) live in that same descriptor —
"validated essentially for free in a follow-up run (same descriptor, same destination segment,
just more `D` dumps)." This round did exactly that (11 roles, since `stat_bonus`/`stat_bonus02`
are two separate clusters at two separate offsets), then went further: every other named,
promoted, not-yet-confirmed CoAB cluster in `build/goldbox-symbol-candidates.json` was traced too
(`willOverload`/`treasureOnGround` in descriptor 21, `item_is_scroll` in descriptor 22, `odd_math`
in descriptor 23, `getExtraFirstSkill`/`getFirstSkill`/`hasAnySkills` in descriptor 25) — all
reachable in the same single preload pass as the other targets, since CoAB's loader preloads all
36 `GAME.OVR` descriptors sequentially during silent startup regardless of which descriptors carry
a promoted-candidate target. There was no cost saved by stopping short of the full remaining set.

This exhausts the currently-named pool: as of this round, **every one of the 21 named, promoted
CoAB clusters in `build/goldbox-symbol-candidates.json` has runtime-confirmed bytes** for all of
its `evidence.coab` rows (23 of 23). The 25 promoted-but-unnamed (`sub_XXXXX` placeholder) clusters
remain entirely out of scope, as before — no semantic name to attach runtime evidence to.

## Method (extends round 1's tooling; no new technique)

`tools/trace_coab_symbol_bytematch.ps1`'s `$Targets` table was extended in place (not
reimplemented): four new descriptor entries (21, 22, 23, 25) alongside the three from round 1, and
eleven more `roles` added to the existing descriptor-24 entry. The script's queue-based seek loop
already generalized to "walk a queue of several target descriptors in one owned process" in round
1 (its own header comment says so), so no structural change to the trace/compare/breakpoint-hygiene
logic was needed — only more target data. See round 1's doc for the full step-by-step method
(`BPINT 21 42` seek capture, `es:[0010]`/`es:[0008]` destination-segment/code-size annotation,
`CS:(EIP+0x12)` post-read breakpoint, `BPDEL *` + re-arm between resolved targets, `D
segment:offset` dump vs. retail bytes).

One new fact confirmed this round: relative offsets were computed by finding, for each named
candidate's `retail_file_offset`, which descriptor's `[base, base+size)` range from
`docs/engine/research/coab-oracle-retail-map.md`'s Overlay Units table actually contains it —
**not** by assuming `descriptor = unit_field - 1` uniformly (that assumption is correct for six of
the seven descriptors touched across both rounds, but is wrong for descriptor 21: the
`goldbox-symbol-candidates.json` `unit` field for `willOverload`/`treasureOnGround` is `22`, which
would derive descriptor `21` = `ovr022` under the naive rule, but their actual retail offsets
(`0x2BD06`, `0x2CC14`) fall inside descriptor `20`'s (`ovr021`) range under that derivation — the
correct descriptor is actually `21` (`ovr022`, base `0x2BC99`) once computed by range-containment
rather than by the `unit - 1` shortcut, which happens to still land on the same descriptor here
but should not be trusted as a general rule without the range check). Always resolve relative
offsets by range-containment against the oracle map, not by arithmetic on the `unit` field alone.

## Reproduction

```powershell
python tools/stage_coab_runtime.py --strict --output build/runtime-coab-base-clean-20260716
pwsh tools/trace_coab_symbol_bytematch.ps1 -OutDir build/dosbox-x-coab-symbol-bytematch-<label>
```

Same stage and DOSBox-X 2026.07.02 DEBUGBOX build as round 1; the script now confirms 7
descriptors / 23 roles per run instead of 3 descriptors / 5 roles.

## The stable runtime symbol map

The raw per-role evidence from both rounds was consolidated into
`build/coab-runtime-validated-symbols.json` (schema: `confirmed_roles` / `rejected_roles` /
`attempted_but_unreachable_roles`, joined by `retail_file_offset`). A new tool,
`tools/emit_coab_runtime_symbols.py`, joins that evidence file against
`build/goldbox-symbol-candidates.json` and emits the actual stable, deterministic "symbol import
map" the BUILD-QUEUE.md leaf asks for: `build/coab-runtime-symbols.json` +
`docs/engine/research/coab-runtime-symbols.generated.md`. It classifies every named, promoted CoAB
candidate as exactly one of:

- **`symbols`** (confirmed) — the join found an `all_runs_exact_match: true` evidence row at the
  candidate's exact retail offset. Only these are real "runtime-confirmed" symbol-map entries.
  Currently `23` of `23`.
- **`unconfirmed_candidates`** — statically promoted, named, but no runtime evidence yet (or the
  evidence recorded a byte mismatch and doesn't yet warrant "confirmed"). Currently `0` (every
  named candidate has been traced across the two rounds), but the classification path is fully
  exercised by `tools/test_emit_coab_runtime_symbols.py`'s synthetic fixtures.
- **`rejected_candidates`** — a runtime trace was attempted and produced a genuine byte mismatch
  (not just unreachable). Currently `0` — no candidate this round or last produced a contradicting
  result — but the schema and classification path exist and are tested, per this project's
  "retain rejected candidates and reasons" instruction.

The join key is the candidate's `retail_file_offset`, never its name: the trace evidence file's
own role label can differ from the CoAB-oracle semantic name at the same offset (e.g. the trace
records the role as `operand_parser` at `0x810A`, while `goldbox-symbol-candidates.json`'s CoAB
evidence names that same offset `parse_command_sub` — the multi-title-corroborated cluster's
Pool-sourced name and CoAB-sourced name for the identical shared function body). The emitted
`symbols` map is keyed by each cluster's own CoAB-sourced name(s), so `parse_command_sub` (not
`operand_parser`) is the map key for that entry, resolved correctly by offset.

Wired into `pnpm corpus`'s script chain (last step), reading its two inputs
(`build/goldbox-symbol-candidates.json`, `build/coab-runtime-validated-symbols.json`) and writing
`build/coab-runtime-symbols.json` (git-ignored, like all `build/*.json` corpus artifacts) plus the
checked-in `docs/engine/research/coab-runtime-symbols.generated.md`. Verified deterministic: two
consecutive runs into a scratch path produced byte-identical JSON and Markdown output before this
was wired in for real.

## What remains open

- Every one of the 21 currently-**named** CoAB clusters is now runtime-confirmed. The other 25 of
  the 46 promoted clusters remain address-placeholder-only (`sub_XXXXX`) with no semantic name to
  attach runtime evidence to; a future round giving any of those a recovered name (from a fresh
  decompile pass or another title's dispatch join) would still need its own runtime trace before
  `emit_coab_runtime_symbols.py` would classify it as confirmed.
- Execution reachability remains unproven for all 23 confirmed roles, exactly as round 1's doc
  already records: this proves the resident bytes are correct post-load, not that CS:IP ever
  executes inside these functions during real gameplay.
- Nothing in either round required or used the CoAB default GOG `SAVE/` bundle — all 23 roles were
  reached during ordinary silent startup preload, no save file needed.
