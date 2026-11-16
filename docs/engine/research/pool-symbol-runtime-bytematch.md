# Pool of Radiance promoted symbol-candidate runtime byte-match

Extends the exact methodology of `docs/engine/research/coab-symbol-runtime-bytematch.md` (round
1) and `-round2.md` -- hash-locked, copy-only staged install + DOSBox-X `BPINT 21 42` seek-capture
+ post-read-breakpoint byte-match trace against retail `GAME.OVR` bytes -- to Pool of Radiance's
own promoted symbol-candidate evidence, for the first time. Both CoAB rounds proved this cluster's
*CoAB*-side descriptor byte-identical but explicitly left "Pool/Secret's own surviving
cross-overlay references" open: "no equivalent descriptor-preload runtime-trace tool run against
them in this round" (BUILD-QUEUE.md, `[2026-07-16]`). This doc closes that gap for Pool's one
reachable candidate.

## Result

**Confirmed for Pool's one promoted candidate carrying real `evidence.pool`.** Of
`build/goldbox-symbol-candidates.json`'s 46 promoted clusters, exactly **one** has a non-empty
`evidence.pool` row: the CoAB+Pool corroborated cluster named `operand_parser` (Pool side) /
`parse_command_sub` (CoAB side), the sole `multi_title_corroborated: true` cluster in the current
corpus. Its Pool-side row names candidate `operand_parser` at Pool's own retail `GAME.OVR` file
offset `29907` (`0x74D3`) -- which is exactly Pool VROOMM descriptor 7's own base offset
(`docs/engine/research/pool-runtime-overlay-trace.json`, `build/vroomm-layouts.json`), so the
candidate sits at relative offset `0x0000` inside that descriptor.

An exploratory `BPINT 21 42` trace against the hash-locked Pool base stage (no save file, no
keypress, `START.EXE` launched directly, then `CD POOLRAD`) observed the same "preload every
`GAME.OVR` descriptor during ordinary silent startup" behavior already documented for CoAB and
Gateway: 29 sequential `handle=5` seeks (the header seek plus all 28 remaining `.DAX`/module
descriptor loads relevant to this run), including descriptor 7 at seek offset `0x74D3`, before any
game-specific action. This directly answers the reachability question this round asked: Pool's
`operand_parser` candidate does **not** require a save file, exactly like CoAB's descriptors.

At that seek, the loader's own `es:[0010]`/`es:[0008]` disassembly annotation exposed destination
segment `3089` and code size `0x221A` -- matching descriptor 7's expected retail code size
(`8730` = `0x221A`, from `build/vroomm-layouts.json`) exactly. A post-read breakpoint at
`CS:(EIP_at_seek+0x12)` (loader `CS:EIP` observed as `12C6:028F` for every seek in this run, the
same fixed `+0x12` delta already documented for CoAB, Gateway, and Pool's own
`Invoke-CombatEntryProbe`) landed past the `INT 21h/AH=3Fh` read that actually populates segment
`3089`. Three 128-byte windows dumped from `3089:0000`, `3089:0080`, and `3089:0100` (384 bytes
total, covering the candidate's full 310-byte / `0x136` function body plus margin into the next
function's prologue) all byte-matched retail Pool `GAME.OVR` at `0x74D3`/`0x74D3+0x80`/
`0x74D3+0x100` exactly:

| Candidate cluster | Pool candidate name | Descriptor (unit) | File offset | Relative offset | Runtime address | Bytes compared | Exact match |
| --- | --- | --- | ---: | ---: | --- | ---: | :---: |
| CoAB+Pool corroborated, high confidence, `relocation-normalized` (the only multi-title-corroborated cluster of the 46 promoted) | `operand_parser` | 7 (`ovr008`) | `0x74D3` | `+0x0000` | `3089:0000` | 128 | yes |
| (same cluster, continuation window) | `operand_parser` | 7 (`ovr008`) | `0x7553` | `+0x0080` | `3089:0080` | 128 | yes |
| (same cluster, continuation window) | `operand_parser` | 7 (`ovr008`) | `0x75D3` | `+0x0100` | `3089:0100` | 128 | yes |

The resident bytes begin `55 89 E5 83 EC 08` (`PUSH BP; MOV BP,SP; SUB SP,8`) -- the same `55 89
E5` prologue signature already relied on as a Pool operand-parser identity check in
`tools/trace_pool_ecl18_route.ps1`'s `Capture-EclCursor` (`'(?ms)^30CF:00000000\s+55\s+.*...89E5\s+'`),
independent corroboration from a route-time save-gated trace of the same function at a different
runtime segment alias. The third window (offset `0x136`/`310` into the candidate) begins `55 89 E5
83 EC 0A` -- a second, different function's prologue -- confirming the promoted cluster's own
`function_size: 310` boundary against the live resident image, not just the static file.

Reproduced twice independently (`build/dosbox-x-pool-symbol-bytematch-20260716-run1` and
`build/dosbox-x-pool-symbol-bytematch-20260716-run2`). Both runs observed the identical 29-seek
sequence, the identical destination segment (`3089`), and byte-identical dumps for all three
windows. Evidence JSON:
`build/dosbox-x-pool-symbol-bytematch-20260716-run2/pool-symbol-bytematch.json` (second pass; the
first pass's JSON at `.../run1/pool-symbol-bytematch.json` is byte-identical). Consolidated raw
evidence: `build/pool-runtime-validated-symbols.json`.

**2026-08-11 -- what `emit_pool_runtime_symbols.py` actually reads now.** That consolidated file
lives under git-ignored `build/`, so until today it was the tool's *only* confirmation input and a
fresh checkout regenerated an all-unconfirmed report while the committed
`pool-runtime-symbols.generated.md` still claimed a confirmed symbol -- the "artifact that checks a
claim goes stale" pattern again (ADR-0010). The emitter now reads the **committed**
`docs/engine/research/pool-operand-parser-cs-ip-confirmed-20260722.json` (the stronger 2026-07-22
live CS:IP evidence at the same `GAME.OVR:0x74D3`) as its `--execution-trace`, and that row wins
over the `build/` row at the same offset, so the generated document is a pure function of what is
in git. The `build/` artifact still contributes any offset the committed trace does not cover, and
its `rejected_roles` still override -- a genuine local byte mismatch is never masked by committed
evidence. `tools/test_emit_pool_runtime_symbols.py` holds the regression, including two mutation
controls: `all_runs_exact_match` is re-derived from the trace's own 23 recorded hits rather than
copied from its verdict field, so a doctored hit body or a hit at the wrong pointer downgrades the
symbol to *unconfirmed* instead of riding in on the boolean.

## Why only one candidate

`build/goldbox-symbol-candidates.json`'s `summary.promoted_by_title_counts` reports
`pool-of-radiance: 1` against `curse-of-the-azure-bonds: 46` and `secret-of-the-silver-blades: 0`
-- Pool genuinely has exactly one promoted cluster carrying its own `evidence.pool` row in the
current corpus (checked directly: every other of the 46 promoted clusters has `evidence.pool ==
[]`). This is not a shortlist choice the way CoAB round 1 picked 5 of 21 named candidates; it is
the entire reachable set. The `operand_parser`/`parse_command_sub` cluster was also already the
single highest-evidence candidate in the whole 46-candidate corpus (the only
`multi_title_corroborated: true` cluster), so it needed no further prioritization once identified.

No other promoted cluster's `targets` list resolves a Pool `GAME.OVR` offset with its own recovered
Pool-side semantic name; Pool's separate `map_pool_behavior_clusters.py` output (6 commands, 1
clustered handler -- this same `operand_parser` -- and 4 Pool-local singleton handlers with no
cross-title corroboration) has no other candidate that clears `tools/emit_symbol_candidates.py`'s
promotion join. Pool's combat/dispatcher/route anchors documented in
`docs/engine/research/gen1-dosbox-runtime-trace.md` (dispatcher `0x3C73`, combat handler `0x24E1`)
remain **loaded-byte candidates, not promoted symbol-candidate-JSON clusters** -- exactly the same
situation CoAB's round-1 doc already recorded for its own three combat anchors (`battle_setup`,
`setup_ground_tiles`, `load_24x24_set`): real, static, and useful evidence, but not something this
tool (which only traces clusters that already cleared `emit_symbol_candidates.py`'s promotion
join) can attach a byte-match trace to without inventing a promotion this round wasn't asked to
make.

## Secret: genuinely blocked, not attempted

`build/goldbox-symbol-candidates.json` records **zero** promoted clusters with any non-empty
`evidence.secret` row (`summary.promoted_by_title_counts.secret-of-the-silver-blades == 0`,
verified directly against all 46 promoted clusters, and reconfirmed by the `pnpm corpus` run for
this doc: "secret behavior map: 13 commands, 0 exact cross-title candidates, 9 Secret-local
singletons, 3 dispatcher-internal"). Secret's own `tools/map_secret_behavior_clusters.py` output
has genuinely no function whose behavior cluster is corroborated against another title's own
oracle/dispatch evidence closely enough to clear the promotion join -- its 9 Secret-local
singleton handlers and 3 dispatcher-internal functions never reach `promoted` status at all.

Per "UNLOCATED beats invention" (`docs/engine/HANDOFF.md` section 5): there is no promoted,
named, Pool-or-Secret-evidence-bearing Secret candidate for this round's methodology to trace.
This is a genuine, structural blocker in the current corpus, not a gap in trace-tooling effort --
building a `tools/stage_secret_runtime.py` and a `trace_secret_symbol_bytematch.ps1` today would
have no promoted target to point them at. `tools/map_secret_runtime_symbols.py`'s existing
`count_combat_teams` output is a **different, weaker evidence tier**: an exact-byte-body match
against Secret's own `GAME.OVR` found by direct signature search (not a runtime CS:IP trace, and
explicitly labeled `semantic_status: candidate_pending_secret_cs_ip_hit` in its own output), and it
is not a `goldbox-symbol-candidates.json` promoted cluster (Secret's function-cluster join never
promotes it, per the corpus run above). A future round that first gets a Secret candidate to
`promoted` status (by strengthening `map_secret_behavior_clusters.py`'s cross-title correlation,
or by a fresh decompile pass recovering a semantic name some other title's oracle already has)
would need this same descriptor-preload runtime-trace step next -- it is not skippable, but it is
not yet reachable either.

## Method

New tools: `tools/stage_pool_runtime.py` (hash-locked, copy-only staging, mirroring
`tools/stage_coab_runtime.py`'s exact convention, adapted for Pool's GOG install keeping every
runtime file one level down in a `POOLRAD` subdirectory) and `tools/trace_pool_symbol_bytematch.ps1`
(`tools/trace_coab_symbol_bytematch.ps1`'s technique applied to a single target descriptor).

Steps, all inside one owned DOSBox-X 2026.07.02 DEBUGBOX process
(`build/tools/dosbox-x-2026.07.02`) against the hash-locked base stage
`build/runtime-pool-base-clean-20260716` (`POOLRAD/START.EXE`
`d825df2b174675c9088ba1489488bdeebe66ad2a22943f17d3a198e60b6a07bd`, `POOLRAD/GAME.OVR`
`872964a32cef0fc32bbf83bab68b15e04ad36d59076f37b00a179dfee7928614` -- the same retail hash already
relied on by `tools/patch_pool_protection.py`):

1. **Stage.** `python tools/stage_pool_runtime.py --strict --output
   build/runtime-pool-base-clean-20260716` copies every file already present in the GOG install's
   `POOLRAD` directory (all `.DAX`/`.EXE`/`.OVR`/`.CFG` runtime files, the `ITEMS` sidecar, and any
   retail-shipped `SAVGAM*`/`CHRDAT*` files) into an isolated `<output>/POOLRAD/` directory,
   hash-locking `START.EXE` and `GAME.OVR` against the retail values above. The original GOG
   install is never written to. Unlike CoAB's flat layout, the stage preserves Pool's
   `<root>/POOLRAD/...` nesting so a probe can reuse the same `mount <root> as C:` + `CD POOLRAD`
   + `START` launch shape `tools/trace_pool_ecl18_route.ps1` already established (Pool's unchanged
   retail `POOL.CFG` embeds the literal path `C:\POOLRAD\`, so mounting `POOLRAD` itself as `C:`
   breaks config loading).
2. **Exploratory reachability check (folded into the main run).** `BPINT 21 42` armed before the
   first `RUN`, no save load, no keypress, `START.EXE` launched directly via the shared
   `tools/dosbox_x_debugbox_probe.ps1 -DosWorkingDir POOLRAD` probe. The trace observed 29
   sequential `handle=5` seeks, including descriptor 7 at `0x74D3`, before any game-specific
   action -- confirming (for the first time via an actual byte-match run, not just the prior
   loaded-byte-candidate note in `pool-runtime-overlay-trace.json`) that Pool's loader preloads
   this descriptor during ordinary silent startup, the same shape already proven for CoAB and
   Gateway.
3. `BPINT 21 42`, then `RUN`, exactly as for CoAB. Poll snapshots; parse
   `EAX/EBX/ECX/EDX/CS/EIP`; confirm every stop is really `AH=42h`; reconstruct the 32-bit seek
   offset as `((ECX&0xFFFF)<<16) | (EDX&0xFFFF)`.
4. Wait for a seek whose offset matches the single pending target (`0x74D3`, descriptor 7). Unlike
   CoAB's script (which walks a queue of several descriptors), this run has exactly one target, so
   the loop resolves it in place and stops watching for further seeks.
5. At the target hit, the debugger's own disassembly annotation exposes destination segment
   `3089` and code size `0x221A`, matching descriptor 7's expected retail size from
   `build/vroomm-layouts.json` exactly (cross-check, not the claim itself).
6. Compute the post-read breakpoint as `CS:(EIP+0x12)` from the seek's own `CS:EIP` (observed
   `12C6:028F` for the descriptor-7 seek, both runs -- the same fixed `+0x12` delta already
   documented for CoAB, Gateway, and Pool's own `Invoke-CombatEntryProbe`, confirming Pool shares
   the identical FBOV/VROOMM loader stub shape), set `BP 12C6:02A1`, `RUN`, and confirm the next
   stop's `CS:EIP` is exactly that address.
7. For each of three relative offsets (`0x0000`, `0x0080`, `0x0100`) inside the resolved
   descriptor, issue `D <segment>:<offset>` and collect every hex line the debugger prints (128
   bytes each), then compare byte-for-byte against `GAME.OVR` read directly from the hash-locked
   stage at `<descriptor file offset> + <relative offset>`.
8. **Reused the CoAB round-1 breakpoint-hygiene fix** (not rediscovered): although this run only
   has one target, the script still issues `BPDEL *` then re-arms `BPINT 21 42` after resolving it,
   for parity with the CoAB script and to keep the technique identical for a future multi-target
   Pool round.
9. Terminate the owned process (`Stop-Process`) in a `finally` block; no leftover `dosbox-x.exe`
   processes confirmed after both runs (`tasklist` checked before, between, and after).

## What remains open

This doc proves runtime segment identity and byte content for Pool's one reachable candidate only.
It does **not** prove:

- Any Secret candidate: as documented above, Secret has zero promoted, evidence-bearing
  candidates in the current corpus -- a structural blocker, not a skipped trace.
- The other 45 of the 46 promoted symbol candidates are CoAB-only and have no Pool-side claim to
  trace; they are unaffected by this doc (round 1/2's CoAB docs already cover their CoAB side).
- Execution reachability: this proves the resident **bytes** are correct post-load during ordinary
  silent startup, not that CS:IP ever executes inside this function during real gameplay -- the
  same limitation already recorded for CoAB's and Gateway's docs. Pool's own
  `Invoke-CombatEntryProbe`/`Capture-EclCursor` techniques in `tools/trace_pool_ecl18_route.ps1`
  already establish a *different*, stronger evidence tier for this exact function (an execution
  breakpoint at `30CF:0000` with the same `55 89 E5` prologue identity check, reached via a
  save-gated forward-movement route) -- that is real corroborating evidence but was not repeated
  here; this doc's contribution is specifically the missing byte-match step the CoAB rounds
  already performed for their own candidates and Pool's own evidence had not yet received.
- Nothing here required or used any Pool save file, consistent with the dispatch brief's framing
  of the CoAB precedent -- static Pool runtime symbol validation for this candidate proceeds
  without one, exactly like CoAB's own descriptors reached during silent-startup preload.

## Reproduction

```powershell
python tools/stage_pool_runtime.py --strict --output build/runtime-pool-base-clean-20260716
pwsh tools/trace_pool_symbol_bytematch.ps1 -OutDir build/dosbox-x-pool-symbol-bytematch-<label>
```

Requires the hash-locked stage at `build/runtime-pool-base-clean-20260716` and the local DOSBox-X
2026.07.02 DEBUGBOX build under `build/tools/dosbox-x-2026.07.02`, exactly as for CoAB.
