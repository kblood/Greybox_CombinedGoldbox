# CoAB promoted symbol-candidate runtime byte-match — round 3 (unnamed clusters)

Sibling doc to `docs/engine/research/coab-symbol-runtime-bytematch.md` (round 1) and
`docs/engine/research/coab-symbol-runtime-bytematch-round2.md` (round 2). Rounds 1-2 closed
runtime correlation for every currently-**named** promoted CoAB cluster (23 of 23
`evidence.coab` rows). This round targets the leftover gap both rounds explicitly flagged: the
**25 promoted-but-UNNAMED** (`sub_XXXXX` placeholder) clusters in
`build/goldbox-symbol-candidates.json`.

**Scope boundary, stated up front:** these 25 clusters have no recovered semantic name, and this
round does not invent one. Byte-matching a placeholder cluster only confirms or rejects whether
the *static structural correlation* that promoted it (`tools/emit_symbol_candidates.py`'s
same-game-oracle-retail-cluster join) also holds at runtime — it never produces a named `symbols`
entry. See `docs/engine/BUILD-QUEUE.md`'s P1.3c closure note (~line 1801-1809) for why named vs.
unnamed promotion is treated differently in this program.

## Result

**24 of 25 confirmed, 1 rejected, 0 left unreached.** Every one of the 25 promoted-but-unnamed
CoAB clusters was traced this round; none required a save file (all 25 retail offsets fall
inside descriptors CoAB's loader preloads during ordinary silent `START.EXE` startup, the same
36-descriptor preload shape already proven in rounds 1-2). Each of the 25 was reproduced in **two
independent DOSBox-X sessions** with identical destination segments and identical byte content.

| Placeholder (`oracle_symbol`) | Retail offset | Descriptor (unit) | Relative offset | Runtime segment | Result |
| --- | ---: | --- | ---: | --- | :---: |
| `sub_30168` | `0x8240` | 7 (`ovr008`) | `0x0168` | `303D` | confirmed |
| `sub_30F16` | `0x8FEE` | 7 (`ovr008`) | `0x0F16` | `303D` | confirmed |
| `sub_3B70E` | `0x115F5` | 12 (`ovr013`) | `0x170E` | `27BB` | confirmed |
| `sub_40E00` | `0x16168` | 13 (`ovr014`) | `0x2E00` | `231F` | confirmed |
| `sub_572CF` | `0x2A32C` | 19 (`ovr020`) | `0x32CF` | `36AF` | confirmed |
| `sub_583FA` | `0x2B150` | 20 (`ovr021`) | `0x03FA` | `35C0` | confirmed |
| `sub_59149` | `0x2BDE2` | 21 (`ovr022`) | `0x0149` | `33A2` | confirmed |
| `sub_5919E` | `0x2BE37` | 21 (`ovr022`) | `0x019E` | `33A2` | confirmed |
| `sub_59A19` | `0x2C6B2` | 21 (`ovr022`) | `0x0A19` | `33A2` | confirmed |
| `sub_641DD` | `0x361FF` | 23 (`ovr024`) | `0x11DD` | `2A94` | confirmed |
| `sub_64245` | `0x36267` | 23 (`ovr024`) | `0x1245` | `2A94` | confirmed |
| `sub_643CC` | `0x363EE` | 23 (`ovr024`) | `0x13CC` | `2A94` | confirmed |
| `sub_6460D` | `0x3662F` | 23 (`ovr024`) | `0x160D` | `2A94` | confirmed |
| `sub_646D9` | `0x366FB` | 23 (`ovr024`) | `0x16D9` | `2A94` | confirmed |
| `sub_64728` | `0x3674A` | 23 (`ovr024`) | `0x1728` | `2A94` | confirmed |
| `@sub_66BDB$qn6Player` | `0x38280` | 24 (`ovr025`) | `0x0BDB` | `2752` | confirmed |
| `sub_67A59` | `0x390FE` | 24 (`ovr025`) | `0x1A59` | `2752` | confirmed |
| `sub_6906C` | `0x3A711` | 24 (`ovr025`) | `0x306C` | `2752` | confirmed |
| `sub_69138` | `0x3A7DD` | 24 (`ovr025`) | `0x3138` | `2752` | confirmed |
| `@sub_6B3D1$qn6Player` | `0x3C031` | 25 (`ovr026`) | `0x13D1` | `2612` | **rejected** (see below) |
| `sub_706DC` | `0x3DD82` | 29 (`ovr030`) | `0x06DC` | `242F` | confirmed |
| `sub_71165` | `0x3E127` | 30 (`ovr031`) | `0x0165` | `22E9` | confirmed |
| `sub_71573` | `0x3E535` | 30 (`ovr031`) | `0x0573` | `22E9` | confirmed |
| `sub_716A2` | `0x3E664` | 30 (`ovr031`) | `0x06A2` | `22E9` | confirmed |
| `sub_717A5` | `0x3E767` | 30 (`ovr031`) | `0x07A5` | `22E9` | confirmed |

Byte-for-byte matches are 128/128 bytes each, exactly as rounds 1-2. All 24 confirmed roles were
reproduced twice with byte-identical `observed_hex` and identical runtime segments across the two
sessions. Six descriptors are new to this round (12, 13, 19, 20, 29, 30); the rest (7, 21, 23, 24,
25) were already reached in rounds 1-2 and cost nothing extra beyond one more `D` dump per role.

## The one rejection: `sub_6B3D1` (descriptor 25, `ovr026`, relative offset `0x13D1`)

Not a case of "the structural correlation is wrong." The first **46 bytes** of the 128-byte dump
window (`0x0000`-`0x002D`) byte-match retail `GAME.OVR` exactly and end in a `pop bp; retf`
(`5D CB`) — a complete, correctly-loaded 41-byte function body (matching the cluster's own
`function_size: 41`), immediately followed by 5 more bytes that also match. From `+0x002E` onward
the runtime dump reads all zero, while retail `GAME.OVR` simply continues into the next function's
bytes at that contiguous file offset.

The cause is a **dump-window-boundary artifact**, not a bad correlation: `relative_offset`
(`0x13D1`) + the trace's fixed 128-byte dump width (`0x80`) = `0x1451`, which exceeds descriptor
25's own loaded `code_size` (`0x13FF`) by `0x52` bytes. The `D segment:offset` dump keeps reading
past the end of the descriptor's actually-loaded buffer into unloaded/zero memory in the shared
overlay segment, which retail `GAME.OVR` — a contiguous flat file with no such boundary — does not
have. This is the first case across all three rounds where a target's relative offset sits close
enough to its descriptor's own `code_size` ceiling for the fixed 128-byte window to overrun it;
every prior target (rounds 1-2, plus the other 24 this round) had at least 128 bytes of headroom
before its descriptor's `code_size` boundary.

Recorded honestly as **rejected** (a genuine byte mismatch across the full compared window), per
this evidence file's own classification contract — not silently reclassified as confirmed just
because the divergence has an explained cause. The explanation is retained in the `reason` field
of `build/coab-runtime-validated-symbols.json`'s `rejected_roles` entry and surfaced verbatim in
`docs/engine/research/coab-runtime-symbols.generated.md`. A future round wanting a clean confirm
for this specific candidate would need a narrower dump width (bounded by
`min(128, code_size - relative_offset)`), not a re-run of the same fixed-128-byte technique.

## Method (extends rounds 1-2's tooling; no new seek/dump technique)

`tools/trace_coab_symbol_bytematch.ps1`'s `$Targets` table was extended in place with the 25 new
offsets, using each cluster's own `oracle_symbol` (e.g. `sub_30168`) verbatim as the role key —
never an invented name. Two new target-list entries were computed the same way round 2's doc
insists on (range-containment against `docs/engine/research/coab-oracle-retail-map.md`'s Overlay
Units table, not the `unit - 1` shortcut): every one of the 25 retail offsets was located inside
its enclosing descriptor's `[base, base+size)` range before being added to the table.

**One transcription bug found and fixed before the first real run:** descriptor 30 (`ovr031`) was
initially given descriptor 31's (`ovr032`) code size (`0x0BAD`) instead of its own (`0x1451`),
caught immediately by the trace script's own `observed code size does not match expected` guard
on the very first attempt (which exists precisely to catch this class of error) — fixed to
`0x1451` before any byte comparison was trusted. Both prior rounds' target tables were re-verified
against the oracle map during this pass and found already correct.

### A new operational knob: `-OnlyDescriptors`

Round 2 successfully ran all 7 of its descriptors / 23 roles in one continuous DEBUGBOX session.
Round 3's cumulative target list (13 descriptors, 48 total role-dumps once rounds 1-2's roles are
included for determinism) proved **unreliable as a single continuous session** in this
environment: three consecutive full-list attempts each crashed partway through (`the owned
DOSBox-X process exited mid-session`), but at a **different** point each time — after 8 dumps
once, after 15 once, after 40 once — with no OS-level Application-Error event logged for any of
the three. This points to a session-length/resource ceiling in this particular DOSBox-X DEBUGBOX
build/environment combination under heavy repeated debugger-input automation, not a bug in the
seek/capture/dump technique itself (every partial run's already-resolved roles matched their
eventual full-run values exactly). The three failed full-list attempts are retained, unmodified,
as `build/dosbox-x-coab-symbol-bytematch-round3-attempt1-crashed/` and `...-attempt2-crashed/`
(a third crash occurred inside the very first `-OnlyDescriptors` batch before that flag existed
and is documented alongside these two).

Rather than force a single fragile run, `tools/trace_coab_symbol_bytematch.ps1` gained an
optional `-OnlyDescriptors <int[]>` parameter that filters the (still fully cumulative,
checked-in) `$Targets` table down to a caller-chosen subset of descriptor numbers before the seek
loop starts. This does not change the seek/capture/dump technique or the target table itself — it
only lets one invocation wait for a smaller pending-target set, which proved reliable in practice.
Round 3's 25 new roles were captured across four batches, each independently reproduced:

| Batch | Descriptors | Roles this batch | Run 1 | Run 2 |
| --- | --- | ---: | --- | --- |
| A | 30, 29, 26, 25 | 10 (incl. round-1/2 roles for determinism) | `...batchA-run1` | `...batchA-run2` |
| B | 24 | 16 | `...batchB-run1` | `...batchB-run2` |
| C | 23, 22, 21 | 13 | `...batchC-run1` | `...batchC-run2` |
| D | 20, 19, 13, 12, 7 | 9 | `...batchD-run1` (single pass, all 5 descriptors) | split further after two more crashes: `...batchD1-run2` (20, 19), `...batchD2a-run2` (13, 12 — see note below), `...batchD2b-run2` (7) |

(Batch/descriptor-number naming note: "batch A/B/C/D" are this round's own arbitrary labels for
grouping trace invocations; they are unrelated to the CoAB `descriptor` field's numbering.)

**`batchD2a-run2`'s reproduction evidence is per-role console dumps, not a consolidated JSON:**
that invocation crashed (again, an unrelated-looking process exit, not a logic error) immediately
after dumping `sub_40E00` and `sub_3B70E` but before the script reached its final
`ConvertTo-Json`/`Set-Content` step, so no `coab-symbol-bytematch.json` was written for that run.
The two roles' raw `D segment:offset` console output (`ovr013-dump-sub_3B70E-console.txt`,
`ovr014-dump-sub_40E00-console.txt`) was parsed directly and cross-checked against
`batchD-run1`'s consolidated JSON: byte-for-byte identical (`5589e583ec0289ec5dca0a005589e5c47e0c26c4...`
for `sub_3B70E`, `5589e583ec0831c08946fe31c08946fca124658b...` for `sub_40E00`, both matching
retail `GAME.OVR` exactly, both matching the destination segments already observed in
`batchD-run1`: `27BB` and `231F` respectively) — a valid second reproduction by the same
determinism bar, just sourced from the raw per-role dump rather than the summary file.

Every batch was launched only after confirming no leftover `dosbox-x.exe` process remained from
the previous attempt (`Get-Process ... | Stop-Process -Force`, since a crashed session sometimes
left an orphaned process under a *different* PID than the one the script's own `probe-process.json`
recorded — consistent with DOSBox-X's SDL front end spawning more than one native process per
launch; not investigated further as it was not blocking, just required an explicit sweep before
each retry rather than trusting the script's own tracked PID alone).

All other mechanics are unchanged from rounds 1-2: `BPINT 21 42` seek capture, the debugger's own
`es:[0010]`/`es:[0008]` destination-segment/code-size annotation, the post-read breakpoint at
`CS:(EIP_at_seek+0x12)`, and `D segment:offset` dumps compared byte-for-byte against retail
`GAME.OVR` read directly from the hash-locked stage.

## Reproduction

```powershell
python tools/stage_coab_runtime.py --strict --output build/runtime-coab-base-clean-20260716
# Full cumulative list in one session is unreliable in this environment; batch by descriptor:
& tools/trace_coab_symbol_bytematch.ps1 -OutDir build/dosbox-x-coab-symbol-bytematch-<label> -OnlyDescriptors 30,29,26,25
& tools/trace_coab_symbol_bytematch.ps1 -OutDir build/dosbox-x-coab-symbol-bytematch-<label> -OnlyDescriptors 24
& tools/trace_coab_symbol_bytematch.ps1 -OutDir build/dosbox-x-coab-symbol-bytematch-<label> -OnlyDescriptors 23,22,21
& tools/trace_coab_symbol_bytematch.ps1 -OutDir build/dosbox-x-coab-symbol-bytematch-<label> -OnlyDescriptors 20,19,13,12,7
```

Same hash-locked stage and DOSBox-X 2026.07.02 DEBUGBOX build as rounds 1-2
(`START.EXE 42fcefd6...78acd`, `GAME.OVR a894282513...da51ef`, unchanged).

## Tooling changes

- `tools/trace_coab_symbol_bytematch.ps1`: extended `$Targets` with 6 new descriptor entries (12,
  13, 19, 20, 29, 30) and 19 new roles on the 5 already-present descriptor entries (7, 21, 23, 24,
  25); added the optional `-OnlyDescriptors` batching parameter (see above); fixed the descriptor
  30 code-size transcription bug.
- `build/coab-runtime-validated-symbols.json` (local raw evidence, git-ignored like all
  `build/*.json` corpus artifacts): added a `round: 3` entry to `rounds`, 24 new `confirmed_roles`
  entries, and a new `rejected_roles` list (previously empty across rounds 1-2) with the one
  `sub_6B3D1` entry and its full root-cause `reason`.
- `tools/emit_coab_runtime_symbols.py`: added `unnamed_promoted_clusters()` (the unnamed sibling
  of the existing `named_promoted_clusters()`) and `classify_structural_confirmations()` (the
  unnamed sibling of `classify_candidates()`, reusing the same `index_by_offset` join — offset
  is still the only join key, never name). The output report gained three new top-level keys
  (`unnamed_structural_confirmations`, `unnamed_structural_unconfirmed`,
  `unnamed_structural_rejected`) and three new summary counters, rendered as a new "Unnamed
  Structural Cluster Confirmations (round 3)" section in
  `docs/engine/research/coab-runtime-symbols.generated.md`. The existing `symbols` map, its join
  mechanism, and every round-1/2 behavior are unchanged — verified by the full existing test suite
  passing unmodified plus 8 new tests covering the unnamed path (`unittest`,
  `python -m unittest tools.test_emit_coab_runtime_symbols -v`: 23/23 pass, up from 15).
  `--strict` now also reconciles unnamed confirmed+unconfirmed+rejected against the unnamed
  promoted clusters' own evidence-row count (25), the same shape as the existing named-cluster
  strict check.
- Regenerated `build/coab-runtime-symbols.json` and
  `docs/engine/research/coab-runtime-symbols.generated.md` via
  `python tools/emit_coab_runtime_symbols.py --strict` (same invocation `pnpm corpus` already
  runs). Result: `23` named symbols confirmed (unchanged from round 2), `24`/`25` unnamed
  structural clusters confirmed, `1` rejected, `0` unreached.

## What remains open

- This closes the "25 promoted-but-unnamed CoAB clusters... still need runtime trace passes" gap
  that both round 1 and round 2's docs explicitly left open. All 25 have now been traced: 24
  confirmed, 1 honestly rejected (with an explained, non-invented cause), 0 left unreached.
- This does **not** assign or imply any semantic name for the 24 newly-confirmed placeholder
  clusters. A future decompile or dispatch-join pass that recovers a real name for any of them
  would still need to move that candidate into the *named* evidence path and get its own
  `classify_candidates`-style confirmation — `classify_structural_confirmations`'s output is never
  treated as equivalent to a `symbols` entry.
- Execution reachability remains unproven for all 24 confirmed roles, exactly as rounds 1-2
  record: this proves the resident bytes are correct post-load, not that CS:IP ever executes
  inside these functions during real gameplay.
- Secret's structural blocker (zero promoted clusters carry any `evidence.secret` row) is
  completely unchanged by this round — this was CoAB-only work, per the dispatch brief's scope.
  Pool's own cross-title coverage is also unchanged (still just its one corroborated cluster from
  the round-2-era Pool doc).
- The `-OnlyDescriptors` session-length ceiling observed this round (a continuous run covering
  more than ~7-8 descriptors' worth of dumps became unreliable) is worth keeping in mind for any
  future round that grows this target list further — batching by descriptor, as done here, is the
  known workaround, not a fix to the underlying environment flakiness (which was not diagnosed
  further since it was not blocking).
