# CoAB promoted symbol-candidate runtime byte-match

Promotes five of `build/goldbox-symbol-candidates.json`'s 46 promoted candidates from "static
structural correlation only" to "runtime-confirmed identical bytes", for the CoAB-only and
CoAB+Pool-corroborated clusters that carry a recovered semantic name. This is a hand-written
sibling doc, not a regeneration of `goldbox-symbol-candidates.json` itself (that file is produced
by `tools/emit_symbol_candidates.py` from static evidence only); runtime segment/byte identity is
orthogonal evidence layered on top of it, following the exact precedent of
`docs/engine/research/gateway-descriptor9-runtime-bytematch.md`.

## Result

**Confirmed for the five selected candidates.** `Curse of the Azure Bonds` (`START.EXE` +
`GAME.OVR`, profile id `curse-of-the-azure-bonds`) preloads **all 36 `GAME.OVR` descriptors**
during ordinary silent startup -- no save file, no menu navigation, no keypress required. This is
the same shape already documented for Gateway (`gateway-descriptor9-runtime-bytematch.md`), not a
Pool-style on-demand load: an exploratory `BPINT 21 42` trace against the hash-locked base stage
observed 36 sequential `INT 21h/AH=42h` seeks (handle 5 = `GAME.OVR`) whose offsets match
`docs/engine/research/coab-oracle-retail-map.md`'s 36 descriptor base offsets exactly, in
descending order, before any further game-specific action.

Three of the descriptors touched by that preload pass contain the five selected named candidates.
All five byte-match retail `GAME.OVR` exactly (128/128 bytes each) at their expected relative
offsets within the loaded segment, reproduced twice independently with identical destination
segments both times:

| Candidate cluster | CoAB semantic name(s) | Descriptor (unit) | File offset | Relative offset | Runtime address | Bytes compared | Exact match |
| --- | --- | --- | ---: | ---: | --- | ---: | :---: |
| CoAB-only, high confidence, `exact` match kind | `getStringListEntry` | 26 (`ovr027`) | `0x3C09C` | `+0x000F` | `24DC:000F` | 128 | yes |
| CoAB-only, high confidence, `relocation-normalized` | `count_teams` | 24 (`ovr025`) | `0x39C2D` | `+0x2588` | `2752:2588` | 128 | yes |
| **CoAB+Pool corroborated**, high confidence, `relocation-normalized` (only multi-title-corroborated cluster of the 46 promoted) | `operand_parser` / `parse_command_sub` | 7 (`ovr008`) | `0x810A` | `+0x0032` | `303D:0032` | 128 | yes |
| CoAB-only, high confidence, `exact` match kind | `bytes_to_word` | 7 (`ovr008`) | `0x87AF` | `+0x06D7` | `303D:06D7` | 128 | yes |
| CoAB-only, medium confidence, `relocation-normalized` | `cmd_table01` | 7 (`ovr008`) | `0x8E2A` | `+0x0D52` | `303D:0D52` | 128 | yes |

Reproduced twice independently (`build/dosbox-x-coab-symbol-bytematch-20260716b` -- first pass;
`build/dosbox-x-coab-symbol-bytematch-20260716b-r2` -- second pass). Both runs observed identical
destination segments (`24DC`, `2752`, `303D`) and identical byte content for all five roles.
Evidence JSON: `build/dosbox-x-coab-symbol-bytematch-20260716b-r2/coab-symbol-bytematch.json`.

## Why these five

Selected from `build/goldbox-symbol-candidates.json`'s 21 promoted clusters that carry a recovered
semantic name (`has_recovered_semantic_name: true`), prioritizing:

- **The one multi-title-corroborated cluster** (`operand_parser` / `parse_command_sub`,
  `promoted_by: [curse-of-the-azure-bonds, pool-of-radiance]`) -- the single strongest-evidence
  candidate in the whole 46-candidate set, and a direct structural parallel to Gateway's own
  already-validated `operand_parser` descriptor (Gateway descriptor 9, CoAB descriptor 7 -- same
  named role, same FBOV/VROOMM shared-loader-stub shape, independently confirmed in a different
  title).
- **Two more named roles sharing that same descriptor** (`bytes_to_word`, `cmd_table01`) --
  validating them cost nothing extra once descriptor 7's destination segment was already reached
  and dumped, exactly mirroring how Gateway's descriptor-9 doc validated six roles from one load.
- **`count_teams`** -- `evidence_status: same_game_oracle_retail_cluster_and_call_target` (the
  strongest per-candidate evidence status in the schema), and the correct candidate to check
  because BUILD-QUEUE.md's own evidence trail already names combat/character-stat anchors as
  priorities; `count_teams` lives in descriptor 24, the same overlay unit (`ovr025`) as ten other
  named-but-unvalidated candidates (`clear_actions`, `find_affect`, `on_our_team`, `clear_spell`,
  `stat_bonus`, `strength_bonus`, `strenghtHitBonus`, `strenghtDamBonus`, `offset_above_1`,
  `offset_equals_20`) -- a strong next-round candidate cluster, noted but **not** validated in this
  round to keep scope to 3-5 candidates.
- **`getStringListEntry`** -- `match_kind: exact` (not merely relocation-normalized), a different
  descriptor (26) than the other four, for evidence-kind and overlay-unit diversity rather than
  clustering every pick in one place.

`battle_setup` (`GAME.OVR:0xf35c`), `setup_ground_tiles` (`0xe751`), and `load_24x24_set`
(`0x41469`) -- the three combat anchors named directly in BUILD-QUEUE.md's own evidence trail --
were considered first, per the dispatch brief, but **do not appear in any of the 46 promoted
symbol-candidate clusters** in the current `build/goldbox-symbol-candidates.json` (checked
directly: no cluster's CoAB evidence or target list resolves to any of these three retail
offsets). They are combat-anchor rows in `coab-oracle-retail-map.md`'s own oracle table, not
symbol-candidate-JSON promotions -- `tools/emit_symbol_candidates.py` only promotes clusters that
also clear the VROOMM-call-correlation join (`vroomm-call-correlations.json`'s 63 exact/
relocation-normalized target-start clusters), and these three anchors evidently didn't clear that
join in the current corpus run. They were dropped from the shortlist for that reason, not
substituted by assumption, per the dispatch brief's own instruction to pick from what's actually
promoted.

## Method

New tools: `tools/stage_coab_runtime.py` (hash-locked, copy-only staging, mirroring
`tools/stage_gateway_runtime.py`'s exact convention) and `tools/trace_coab_symbol_bytematch.ps1`
(mirroring `tools/trace_gateway_descriptor9_bytematch.ps1`'s `BPINT 21 42` seek-capture +
`es:[0010]`/`es:[0008]` destination-segment/code-size annotation + post-read-breakpoint-at-
`CS:(EIP_at_seek+0x12)` technique, generalized to walk a queue of several target descriptors in one
owned process instead of just one).

Steps, all inside one owned DOSBox-X 2026.07.02 DEBUGBOX process
(`build/tools/dosbox-x-2026.07.02`) against the hash-locked base stage
`build/runtime-coab-base-clean-20260716` (`START.EXE 42fcefd6...78acd`,
`GAME.OVR a894282513...da51ef`):

1. **Stage.** `python tools/stage_coab_runtime.py --strict --output
   build/runtime-coab-base-clean-20260716` copies every `.DAX`/`.EXE`/`.OVR`/`.CFG` runtime file
   plus the `ITEMS` sidecar and the default GOG `SAVE/` bundle from the CoAB GOG install root into
   an isolated `build/` directory, hash-locking `START.EXE` and `GAME.OVR` against the retail
   values above. The original GOG install is never written to.
2. **Exploratory reachability check.** Before committing to a target list, an ad hoc `BPINT 21 42`
   + repeated `RUN` loop against the fresh stage (no save load, no keypress, `START.EXE` launched
   directly) showed 36 sequential `handle=5` seeks whose offsets are exactly the 36 descriptor base
   offsets from `coab-oracle-retail-map.md`, confirming CoAB's loader preloads every descriptor
   during ordinary silent startup -- the same behavior already proven for Gateway, and *not*
   requiring the save-file-gated navigation Pool's combat-route probe needed. This directly answers
   the dispatch brief's reachability question: none of the five selected candidates require a save
   file.
3. `BPINT 21 42` (breaks on every `INT 21h` with `AH=42h`), then `RUN`, exactly as for Gateway.
   Poll snapshots; parse `EAX/EBX/ECX/EDX/CS/EIP`; confirm every stop is really `AH=42h`; reconstruct
   the 32-bit seek offset as `((ECX&0xFFFF)<<16) | (EDX&0xFFFF)`.
4. Maintain a pending-target queue keyed by the three CoAB `GAME.OVR` file offsets of interest
   (`0x80D8` descriptor 7, `0x376A5` descriptor 24, `0x3C08D` descriptor 26). Continue `RUN`-ing
   through the preload sequence; whenever a seek's offset matches a pending target, resolve it in
   place (do not require a fixed encounter order -- the three targets are actually reached in the
   order 26, 24, 7 during the descending preload pass, not ascending descriptor-index order).
5. At each target hit, the debugger's own disassembly annotation for the loader's next two
   instructions exposes the destination segment and code size without any extra command: `mov
   ds,es:[0010]` / `mov cx,es:[0008]`. Observed code sizes (`0x2354`, `0x3413`, `0x135D`) match each
   descriptor's expected retail size from `coab-oracle-retail-map.md` exactly (cross-check, not the
   claim itself).
6. Compute the post-read breakpoint as `CS:(EIP+0x12)` from the *current* stop's own `CS:EIP`
   (observed `10C5:028F` for every one of the 36 preload seeks, both runs -- the same fixed
   `+0x12` delta already documented for Gateway and Pool, confirming CoAB shares the identical
   FBOV/VROOMM loader stub shape), set `BP 10C5:02A1`, `RUN`, and confirm the next stop's `CS:EIP`
   is exactly that address (i.e. past the `INT 21h/AH=3Fh` read that actually populates the
   destination segment, before the loop advances to the next descriptor).
7. For each named relative offset inside the resolved descriptor, issue `D <segment>:<offset>` and
   collect every hex line the debugger prints (128 bytes), then compare byte-for-byte against
   `GAME.OVR` read directly from the hash-locked stage at `<descriptor file offset> + <relative
   offset>`.
8. **Breakpoint-hygiene fix found during this round:** the post-read `BP` set in step 6 stays
   registered after its target is dumped (the loader revisits the identical fixed `CS:IP` for
   every remaining descriptor in the same preload pass), so the very next plain `RUN` immediately
   re-stops there instead of at the next `INT 21h/AH=42h` seek. Fixed by issuing `BPDEL *` then
   re-arming `BPINT 21 42` after each resolved target, before resuming the seek loop. (First
   attempt without this fix failed exactly as predicted, at the first target after the initial
   one -- see `build/dosbox-x-coab-symbol-bytematch-20260716/` for the failed first attempt,
   retained as evidence of the diagnosed and fixed bug, not deleted.)
9. Terminate the owned process (`Stop-Process`) in a `finally` block; no leftover `dosbox-x.exe`
   processes confirmed after every run (including the failed first attempt).

## What remains open

This doc proves runtime segment identity and byte content for five candidates only. It does
**not** prove:

- The other 41 of the 46 promoted symbol candidates in `build/goldbox-symbol-candidates.json`
  remain runtime-unconfirmed. In particular, descriptor 24 (`ovr025`) alone hosts ten more named
  candidates (`clear_actions`, `find_affect`, `on_our_team`, `clear_spell`, `stat_bonus`
  /`stat_bonus02`, `strength_bonus`, `strenghtHitBonus`, `strenghtDamBonus`, `offset_above_1`,
  `offset_equals_20`) that this round's tooling could validate essentially for free in a follow-up
  run (same descriptor, same destination segment, just more `D` dumps) but did not, to keep this
  round's scope to the requested 3-5 candidates.
- The 25 promoted-but-unnamed (`sub_XXXXX` placeholder only) clusters are entirely out of scope
  here; they have no semantic name to attach runtime evidence to yet.
- Execution reachability: this proves the resident **bytes** are correct post-load, not that
  CS:IP ever actually executes inside these functions during real gameplay (the same limitation
  Gateway's descriptor-9 doc records). Pool's `Invoke-CombatEntryProbe` technique (arm an execution
  breakpoint at the function's own entry, not just the post-read address) was not attempted here.
- Nothing here required or used the CoAB default GOG `SAVE/` bundle, consistent with the dispatch
  brief's caution about CoAB save-file blockers elsewhere in this project -- static CoAB runtime
  symbol validation can proceed without one, at least for candidates reached during the silent
  startup preload pass.

## Reproduction

```powershell
python tools/stage_coab_runtime.py --strict --output build/runtime-coab-base-clean-20260716
pwsh tools/trace_coab_symbol_bytematch.ps1 -OutDir build/dosbox-x-coab-symbol-bytematch-<label>
```

Requires the hash-locked stage at `build/runtime-coab-base-clean-20260716` and the local DOSBox-X
2026.07.02 DEBUGBOX build under `build/tools/dosbox-x-2026.07.02`.
