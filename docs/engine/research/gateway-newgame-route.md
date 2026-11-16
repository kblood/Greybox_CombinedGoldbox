# Gateway save-free new-game route toward `ECL5.DAX#19`

Continues the P3.3 leaf in `docs/engine/BUILD-QUEUE.md` ("Gateway then Treasures
promotion"). `docs/engine/research/gateway-ecl5-19-runtime-route.md` already byte-decoded
the `FIGHT`/`LEAVE` -> `LOAD_MONSTER(4,3,4)` -> `COMBAT 0x8C34` interaction inside
`ECL5.DAX` block 19, and separately proved -- two independent DOSBox-X file-open-trace
reproductions -- that `ECL5.DAX` is never even *opened* during a silent, zero-keypress
boot. That leaves two ways to reach the encounter without inventing input: a save file
(confirmed genuinely unavailable, `gateway-save-acquisition.md`) or a save-free static
front-end/character-creation dispatch chain proven by decoded control flow alone. This doc
builds and proves that chain using only decoded branches, per this project's rejection of
raw opcode-byte scanning as evidence.

## Result

> **2026-07-17 update:** the "honestly flagged residual gap" below (Hop 1's dynamic guards)
> has since been pinned by a real DOSBox-X trace, with a **negative** outcome: on an
> ordinary silent, zero-keypress boot, `[0x7ED5]`'s real value is `0`, which fails the
> guard, so Hop 1 is **not** taken and the full chain to `ECL5.DAX#19` is **not** reachable
> with zero player interaction. See the dedicated "2026-07-17: Hop 1's guards pinned by a
> real DOSBox-X trace" section below for full evidence; the static reachability proof in
> Parts 1-2 immediately below is unchanged and still correct on its own terms (it proves the
> chain is *statically reachable*, not that it fires by default).

**Statically reachable, with one flagged caveat that Part 3 below resolves negatively.** A
two-hop, statically decoded `NEWECL` chain exists from Gateway's own proven new-game boot
entry (`ECL2.DAX` block `1`) to the target encounter (`ECL5.DAX` block `19`):

```
ECL2.DAX#1 (vm_run_1)  --NEWECL 21, game_area=6-->  ECL6.DAX#21 (vm_run_1)  --NEWECL 19, game_area=5-->  ECL5.DAX#19
```

Both `NEWECL` instructions and both preceding `game_area` writes are **immediate**
operands (constant literals baked into the ECL bytecode, not host-memory reads) --
`docs/engine/adr/0009-cross-archive-ecl-area-switching.md`'s `SAVE game_area, 0x7F12;
NEWECL block` pattern, confirmed present verbatim in Gateway's own content. Hop 2 is
strong, ordinary-gameplay evidence: a real "world-map destination selector, then confirm
`ENTER SUNDABAR?` Y/N" interaction (Sundabar is a real named city in the Gateway to the
Savage Frontier module) -- the same class of legitimate "explicit player choice" gate this
project already accepts elsewhere. Hop 1 sits behind two **dynamic** (host-memory,
non-immediate) `COMPARE` guards (`[0x7ED5] != 0` and `[0xC04D] != 3`, the latter checked
twice non-atomically) whose true boot-time default values are not resolved by static
analysis alone -- this is the honestly-flagged residual gap. Reaching `ECL5.DAX#19` this
way still needs either a runtime replay to pin those two guards' default values, or a
character-creation-and-travel scripted input sequence; neither is attempted here, per this
project's "UNLOCATED beats invention" ethic (`docs/engine/HANDOFF.md` section 5). **This
result is not wired into the browser and does not promote a Route** -- that is separate,
future work.

Machine-checked evidence backing every claim in this section lives in
`build/gateway-newgame-route.json` / `docs/engine/research/gateway-newgame-route.generated.md`
(regenerate with `python tools/map_gateway_newgame_route.py --strict`).

## Part 1: Gateway's own new-game boot ECL block, proven structurally

`ECL5.DAX#19` and every other Gateway ECL block only becomes reachable once a `NEWECL`
chain is followed from *some* start block -- the start block itself is chosen by native x86
code (`GAME.OVR`), not ECL bytecode, so this part needed a structural match against the
CoAB decompile oracle rather than an ECL control-flow walk.

`coab_extracted/engine/seg001.cs` (CoAB's own decompiled source) shows `sub_29758` making
exactly this decision:

```csharp
if (gbl.inDemo == true) { gbl.EclBlockId = 0x52; }
else { gbl.EclBlockId = 1; ovr025.PartySummary(gbl.SelectedPlayer); }
```

and, upstream in `PROGRAM()`'s own boot loop (shared **resident** `GAME.EXE` code across
the whole `gen1-fbov*` engine family, not overlay code re-authored per title):

```csharp
if (gbl.inDemo == true) { gbl.game_area = 1; gbl.game_speed_var = 9; }
else { gbl.game_area = 2; }
```

`tools/map_gateway_newgame_route.py`'s `boot_dispatch_constants()` locates Gateway's own
compiled counterpart of `sub_29758` by control-flow shape (`map_gateway_ecl_runtime_
candidates.function_shapes`/`best_match`, the same structural matcher already used and
strict-hash-locked for Gateway's dispatcher/operand-parser/ECL-loader candidates), then
finds the *same* two immediate byte-writes inside it by matching the CoAB oracle's own
demo/new-game write **value sequence** `(0x52, 1)` against every `mov byte ptr [addr],
imm8` write-group in the matched Gateway function -- not a hardcoded byte offset, so it is
robust to Gateway's function having extra prologue instructions CoAB's does not:

| | CoAB (`GAME.OVR`, oracle symbol `sub_29758`) | Gateway (`GAME.OVR`, structural match) |
| --- | --- | --- |
| Function offset | `0x4061` | `0x47CF` (size 592; sequence similarity `0.8918`, trigram jaccard `0.7279`) |
| Target address | `byte ptr [0x8B78]` | `byte ptr [0x9E86]` |
| Demo write | `mov byte ptr [X], 0x52` at `+0x59` (`0x40BA`) | `mov byte ptr [X], 0x52` at `0x4830` |
| Non-demo/new-game write | `mov byte ptr [X], 1` at `+0x60` (`0x40C1`) | `mov byte ptr [X], 1` at `0x4837` |

Byte-identical constants at the structurally aligned position, independent of any prior
assumption about Gateway's own numbering. This is the strongest single piece of evidence in
this investigation: Gateway's fresh, non-demo new-game boot loads **`EclBlockId = 1`**.
Combined with `PROGRAM()`'s own hardcoded `game_area = 2` for the non-demo path (not
independently re-derived per title here -- it is resident code, not overlay code, and is
shared verbatim across the family), the proven start node is **`ECL2.DAX#1`**. Gateway's
own `ECL2.DAX` archive containing block `1` *and* block `82` (the demo entry, matching the
`0x52` constant) in the same numbered file is consistent corroboration, not proof by itself
(CoAB itself splits demo/new-game across areas 1 and 2 -- this is shared engine *logic*,
not a shared numeric *constant*).

`gateway_ambiguous_matches` is `false`: of Gateway's 14 candidate byte-write groups in the
matched function, exactly one has the value sequence `(82, 1)` (the others are `(1,1,1)`,
`(0,1)`, `(1,0)` -- none collide).

## Part 2: cross-archive `NEWECL`/`game_area` reachability from that start block

`gen1_ecl_encounter_scan.py`'s own module docstring says plainly: "Cross-ECL NEWECL
transitions are not followed in this pass." `tools/map_gateway_newgame_route.py` adds that
capability (`scan_block_for_newecl`, modeled directly on `map_gen1_area_mode_writes.
scan_block_for_save`'s BFS-over-decoded-control-flow pattern): it walks every ECL block's
control-flow graph from its five retail header entry points, tracks the last **immediate**
value written by `SAVE` (opcode `0x09`) to the `game_area` host location (`0x7F12`, per ADR
0009), and records every statically reachable `NEWECL` (opcode `0x20`) instruction's target
block together with the `game_area` in effect at that point -- or, when no `game_area`
write precedes it on that path, the current archive's own numeral (a `NEWECL` with no
preceding area write stays in the same numbered archive; this matches an observed edge,
`ECL6.DAX#21`'s target block 20 with no game_area write, i.e. `ECL6.DAX#20`). This ran
across all 26 ECL blocks in Gateway's retail install, producing `105` statically reachable
`NEWECL` hits, `87` of them resolved to a concrete `(file, block)` edge (the remainder have
a dynamic target block or a dynamic `game_area` write and cannot be statically resolved). A
second BFS over that graph found the shortest path from `ECL2.DAX#1` to `ECL5.DAX#19`: the
two hops below.

### Hop 1 -- `ECL2.DAX#1` `vm_run_1` entry, path vaddr `0x84D3` .. `0x852D`

| Vaddr | Raw bytes | Decode |
| --- | --- | --- |
| `0x84D3` | `03 01 D5 7E 00 00` | `COMPARE [0x7ED5], 0` |
| `0x84D9` | `17` | `IF_NE` (condition-true taken: `[0x7ED5] != 0`) |
| `0x84E3` | `02 01 65 86` | `GOSUB 0x8665` |
| `0x8665` | `03 01 21 4C 00 01` | `COMPARE [0x4C21], 1` |
| `0x866B` | `17` | `IF_NE` (condition-true) |
| `0x867B` | `03 01 21 4C 00 00` | `COMPARE [0x4C21], 0` |
| `0x8681` | `17` | `IF_NE` (condition-true) |
| `0x8691` | `09 00 0E 01 E1 7E` | `SAVE 14 -> [0x7EA1]` |
| `0x8697` | `0E 00 0D` | `PICTURE 13` |
| `0x869A` | `09 00 FF 01 E1 7E` | `SAVE 255 -> [0x7EA1]` |
| `0x86A0` | (packed 6-bit text) | `PRINTCLEAR "THE GUARDS GLANCE AT YOU ONLY BRIEFLY AS YOU PASS THROUGH THE CITY GATES."` |
| `0x86DA` | `2D 01 09 08` | `CALL 0x0809` |
| `0x86DE` | `03 00 00 00 00` | `COMPARE 0, 0` (both immediate -- deterministic "equal") |
| `0x86E3` | `13` | `RETURN` |
| `0x84E7` | `17` | `IF_NE` (condition-false: forced by the deterministic `COMPARE 0,0` above) |
| `0x84EC` | `03 01 4D C0 00 03` | `COMPARE [0xC04D], 3` |
| `0x84F2` | `16` | `IF_EQ` (condition-false) |
| `0x84F9` | `03 01 4D C0 00 03` | `COMPARE [0xC04D], 3` (redundant re-check; dynamic, not statically proven consistent with the prior compare -- see caveat below) |
| `0x84FF` | `17` | `IF_NE` (condition-false) |
| `0x8506` | `09 00 16 01 24 4C` | `SAVE 22 -> [0x4C24]` |
| `0x850C` | `09 00 0C 01 4C C0` | `SAVE 12 -> [0xC04C]` |
| `0x8512` | `09 01 4B C0 01 C3 4B` | `SAVE [0xC04B] -> [0x4BC3]` |
| `0x8519` | `09 01 4C C0 01 C4 4B` | `SAVE [0xC04C] -> [0x4BC4]` |
| `0x8520` | `09 01 4D C0 01 B2 03` | `SAVE [0xC04D] -> [0x03B2]` |
| `0x8527` | `09 00 06 01 12 7F` | `SAVE 6 -> [0x7F12]` (**sets `game_area = 6`, immediate**) |
| `0x852D` | `20 00 15` | `NEWECL 21` (**-> `ECL6.DAX#21`, immediate**) |

**Caveat (the honest gap):** two `COMPARE` guards on this path read *dynamic* (host-memory)
operands -- `[0x7ED5] != 0` at `0x84D9` and `[0xC04D] != 3` at `0x84EC`/`0x84F9` (checked
twice with no intervening write). `gen1_ecl_encounter_scan.py`'s own scanner treats every
non-immediate compare as fully nondeterministic (`ALL_COMPARE_OUTCOMES`); it does not prove
these two locations' true boot-time default values, nor that the two `[0xC04D]` checks are
mutually consistent (both are decoded independently, not linked). No DOSBox-X trace was run
to resolve them, per this project's static-only method for this task. `[0x7ED5]` recurs
with a similar "leaving map/town" semantic flavor elsewhere in this project's catalog
(`persistent-natural-routes.md`'s Secret's Fourth Route section), which is circumstantial
flavor corroboration only, not proof -- CoAB's own `ovr008.cs` switch_var handler list does
not special-case this address's corresponding switch_var, so it is not a proven engine-level
builtin, only a possibly-shared content convention.

### Hop 2 -- `ECL6.DAX#21` `vm_run_1` entry, path vaddr `0x827D` .. `0x8824`

| Vaddr | Raw bytes | Decode |
| --- | --- | --- |
| `0x827D` | `02 01 1F 82` | `GOSUB 0x821F` |
| `0x821F` | `03 01 24 4C 00 18` | `COMPARE [0x4C24], 24` |
| `0x8225` | `17` | `IF_NE` (condition-true taken) |
| `0x8226` | `13` | `RETURN` |
| `0x8281` | `03 01 C9 7E 00 FF` | `COMPARE [0x7EC9], 255` |
| `0x8287` | `16` | `IF_EQ` (condition-false) |
| `0x8289` | `03 01 F6 4C 00 00` | `COMPARE [0x4CF6], 0` |
| `0x828F` | `16` | `IF_EQ` (condition-false) |
| `0x8294` | `03 01 D5 7E 00 00` | `COMPARE [0x7ED5], 0` |
| `0x829A` | `17` | `IF_NE` (condition-false) |
| `0x829F` | `25 01 4D C0 00 04 ...` | `ON_GOTO [0xC04D]`, 4-way destination selector (world-map hub cell) |
| `0x82CF..0x8332` | -- | Random-encounter roll: `ECL_CLOCK`, `AND`/`ADD`/`DIVIDE` arithmetic on `[0xC04D]`/`[0x7F79]` |
| `0x83EA` | `25 01 79 7F 00 0D ...` | `ON_GOTO [0x7F79]`, 13-way city/location selector |
| `0x8803` | (packed 6-bit text) | `PRINTCLEAR "ENTER SUNDABAR?"` |
| `0x8812` | `2D 01 0C 08` | `CALL 0x080C` (menu confirm) |
| `0x8816` | `16` | `IF_EQ` (condition-false: player chose YES, did not decline) |
| `0x881B` | (packed 6-bit text) | `PRINTCLEAR ""` |
| `0x881E` | `09 00 05 01 12 7F` | `SAVE 5 -> [0x7F12]` (**sets `game_area = 5`, immediate**) |
| `0x8824` | `20 00 13` | `NEWECL 19` (**-> `ECL5.DAX#19`, immediate, our target**) |

Every guard on this hop is either an ordinary explicit player choice (`CALL 0x080C`'s
`ENTER SUNDABAR?` Y/N) or plain destination/random-roll arithmetic, not an unresolved
host-memory precondition -- this hop is assessed as strong, ordinary-gameplay evidence, not
a synthetic seam. `ECL5.DAX#19` itself has an internal `NEWECL(21)`/`game_area=6`
self-referencing hub edge too (an ordinary "leave this location, return to the hub"
pattern), confirming it is a normal hub-connected location, not a special-cased target.

## Method

No DOSBox-X involved; this doc is 100% static. `tools/map_gateway_newgame_route.py`:

1. `boot_dispatch_constants()` -- structural CoAB-oracle match (`map_gateway_ecl_runtime_
   candidates.function_shapes`/`best_match`) to find Gateway's `sub_29758` counterpart, then
   value-sequence matching (not a hardcoded offset) to find the demo/new-game `EclBlockId`
   write pair inside it.
2. `scan_block_for_newecl()` -- a BFS decode-and-walk (reusing `gen1_ecl_encounter_scan`'s
   `decode_one`/`header_entries`/`successors`/`ALL_COMPARE_OUTCOMES` unchanged) over every
   block of every `ECL*.DAX` archive in the retail install, tracking the last immediate
   `game_area` (`0x7F12`) write and recording every reachable `NEWECL` target.
3. `build_newecl_graph()` assembles a directed graph of `(file, block)` nodes from those
   scans; `bfs_route()` finds the shortest path from the proven start node to
   `ECL5.DAX#19`.
4. `build_report()`/`render_markdown()` emit `build/gateway-newgame-route.json` and
   `docs/engine/research/gateway-newgame-route.generated.md`; `--strict` fails closed if the
   hash-locked `GAME.EXE`/`GAME.OVR` bytes drift or the boot-dispatch match becomes
   ambiguous.

`tools/test_map_gateway_newgame_route.py` (14 tests, `python -m unittest
test_map_gateway_newgame_route -v` from `tools/`): unit tests against hand-built minimal
ECL blocks for `scan_block_for_newecl`'s immediate/unset/dynamic `game_area` classification
and `bfs_route`'s graph traversal, plus an integration suite that runs `build_report()`
against the real local Gateway/CoAB installs and asserts the exact hash-locked offsets,
boot-dispatch constants, start/target nodes, and both hops' `to_file`/`to_block`/
`game_area`/`vaddr` values documented above.

## Reproduction

```
python tools/map_gateway_newgame_route.py --strict \
  --json build/gateway-newgame-route.json \
  --markdown docs/engine/research/gateway-newgame-route.generated.md
```

Requires the local retail installs at the default `--gateway`/`--coab` paths (or pass
`--gateway`/`--coab` explicitly) and `build/coab-oracle-map.json` (851-symbol CoAB
oracle map; regenerate per its own existing tooling if missing).

## What remains open

- **Runtime encounter/choice/tactical-board/outcome/resume/persistence checkpoints:**
  unchanged from `gateway-ecl5-19-runtime-route.md` -- still UNLOCATED; this doc only
  advances the *reachability* question, not the runtime-replay ones.
- **Route promotion / browser wiring:** explicitly not done here. This is a static proof of
  reachability only.
- **Gateway's own DGROUP/operand-parser identity:** still UNLOCATED (see the 2026-07-17
  section below for how this round worked around that gap rather than closing it).

## 2026-07-17: Hop 1's guards pinned by a real DOSBox-X trace -- negative result

**Result: Hop 1 is NOT taken on an ordinary silent, zero-keypress Gateway boot.** The
two-hop save-free chain to `ECL5.DAX#19` is proven statically reachable (Parts 1-2 above),
but is **not reachable with zero player interaction** -- Hop 1's real gate fails at its
observed boot-time default.

This round did two things: (1) corrected the prior section's own "two guards" framing using
a new concrete-state static walker (no DOSBox-X needed for this part), and (2) captured the
real boot-time byte values with a DOSBox-X trace, then fed them back into the same walker
for a definitive, non-speculative verdict.

### Part 3a: the guard structure was more (and less) than originally flagged

The prior section flagged `[0x7ED5] != 0` at `0x84D9` and `[0xC04D] != 3` (checked twice,
`0x84EC`/`0x84F9`) as "two dynamic guards" on Hop 1's path, both left fully nondeterministic
by `scan_block_for_newecl`'s `ALL_COMPARE_OUTCOMES` treatment -- correct for a reachability
proof, but not informative about which guard, if any, actually *matters*, or what else the
path depends on that wasn't called out. New `tools/simulate_gen1_ecl_path.py` (+
`tools/test_simulate_gen1_ecl_path.py`, 10 tests, 4 of them integration tests against the
real retail install) answers this by literally walking `gen1_ecl_encounter_scan.decode_one`/
`successors` for one *concrete* `host_state: dict[int, int]` -- every dynamic `COMPARE`
resolves to a real (not enumerated) outcome, and `SAVE` writes mutate a running copy of
`host_state`, so later comparisons against a location the walk just wrote see the update.

Two corrections, both re-derived from the real decoded bytes (`ecl.decode_one` from vaddr
`0x84D3`), not from the prior section's own abbreviated table:

1. **`[0xC04D]` never gated `NEWECL 21` at all.** Both compare outcomes (`==3` and `!=3`)
   independently SAVE a different immediate to `[0xC04B]` (`4` vs `6`) and then reconverge,
   unconditionally, into the same `SAVE 22 -> [0x4C24]` / ... / `SAVE 6 -> [0x7F12]` /
   `NEWECL 21` tail at `0x8506`. `test_guard_7ed5_nonzero_and_4c21_established_and_c04d_
   equals_3_reaches_newecl_21` and its `..._c04d_not_3_...` sibling prove both concrete
   values reach `NEWECL 21` with `game_area=6`, differing only in the captured
   `host_state[0xC04B]`.
2. **`[0x7ED5] != 0` is real but not sufficient by itself.** Simulating with only `[0x7ED5]`
   seeded nonzero (everything else defaulting to `0`, the literal "untouched host memory"
   guess) does **not** reach `NEWECL 21` -- `test_all_zero_default_host_state_does_not_
   reach_newecl_21_even_with_7ed5_nonzero` shows it lands on `exit` instead. Tracing why:
   `[0x7ED5] != 0` sends control into `GOSUB 0x8665` (a "show this location's flavor text
   once" subroutine that always runs regardless of `[0x7ED5]`'s value -- the *value* only
   selects whether an intermediate `SAVE` inside the taken branch fires, not whether
   `GOSUB 0x8665` itself executes), which itself branches on `[0x4C21]`:
   - `[0x4C21]` outside `{0, 1}` -> `PICTURE 13`, `"THE GUARDS GLANCE AT YOU ONLY BRIEFLY AS
     YOU PASS THROUGH THE CITY GATES."`, then a forced-immediate `COMPARE 0, 0` (deterministic
     equal) right before `RETURN` -- back at the caller, the outer `IF_NE` at `0x84E7` sees a
     forced-false outcome, skips its guarded cancel-`GOTO`, and falls through to `0x84EC`
     (the `[0xC04D]` selector, which -- per correction 1 -- always continues to `NEWECL 21`).
   - `[0x4C21] == 0` (the observed silent-boot default -- see Part 3b) -> a *different*
     branch at `0x87ED` (`PICTURE 10`, a different message), whose own tail is a forced
     `COMPARE 0, 1` (deterministic **not-equal**) before `RETURN`. Back at the caller, the
     outer `IF_NE` at `0x84E7` now sees a forced-true outcome, so it **executes** its guarded
     instruction -- `GOTO 0x8530` -> `CALL 0x2E10; SAVE 0xFF -> [0x7EC9]; EXIT` -- a genuine
     cancel path that never reaches `0x84EC` or `NEWECL 21` at all.

   So reaching `NEWECL 21` via this branch needs **both** `[0x7ED5] != 0` **and**
   `[0x4C21]` outside `{0, 1}` -- a real two-variable AND-gate the prior section's table did
   not expose (it only showed the single "recorded path" its all-outcomes BFS happened to
   print, not the alternate `[0x4C21]==0`/`0x87ED` branch).

### Part 3b: the real boot-time bytes, captured twice

New `tools/trace_gateway_boot_guards.ps1` reuses `trace_gateway_operand_parser_execution.
ps1`'s proven-reachable `BP 1B37:0000` stop -- the *only* execution point this project has
shown reachable during silent startup with **zero keypresses**
(`gateway-operand-parser-execution-probe.md`: 30/30 hits, stable `DS=0CEB`, resident bytes
confirmed NOT the ECL operand parser but an unidentified per-frame title/input-wait helper).
At each hit it reads the *live* `DS` register (never a hardcoded segment) and issues
`D <DS>:<addr>` for each of the five target locations, against the same hash-locked
`build/runtime-gateway-base-clean-20260715` stage (`GAME.EXE 0222834b...5c00`,
`GAME.OVR c2e64df2...f5cd`) the sibling Gateway trace scripts use.

Two independent runs, three samples each, all six samples byte-identical:

| Run | Samples | `DS` | `[0x7ED5]` | `[0xC04D]` | `[0x4C20]` | `[0x4C21]` | `[0x4C22]` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `build/dosbox-x-gateway-boot-guards-20260717` | 3/3 identical | `0CEB` | `0x00` | `0x00` | `0x00` | `0x00` | `0x4B` |
| `build/dosbox-x-gateway-boot-guards-20260717-r2` | 3/3 identical | `0CEB` | `0x00` | `0x00` | `0x00` | `0x00` | `0x4B` |

Feeding these exact captured values into `simulate_gen1_ecl_path.py` from vaddr `0x84D3`
gives a definitive, non-speculative trace (not a re-guess): `COMPARE [0x7ED5],0` ->
`IF_NE` false (`[0x7ED5]==0`) -> `GOSUB 0x9A36` (a destination-selector setup routine that
writes `[0x7F79]` from `[0x4BC9]`, unrelated to `NEWECL 21`) -> `RETURN` -> `EXIT` at
`0x84E2`. `game_area`/`[0x7F12]` is never written and `NEWECL 21` is never reached.
**`[0x7ED5]`'s real boot-time default is `0`, which fails the guard** -- consistent with
`[0x4C21]`'s default also being `0` (which, per Part 3a, would independently have blocked
the same branch even if `[0x7ED5]` had been nonzero).

### Honest residual caveat

The captured `DS=0CEB` is the best available candidate for Gateway's ECL host-memory
segment -- corroborated by that same execution stop's own resident instruction
`mov al,[8500]` (an implicit-`DS` byte read of host address `0x8500`, in the same numeric
neighborhood as all five targets here, `0x4C20`-`0xC04D`) -- but it is the `DS` of an
unrelated per-frame title-loop routine, **not independently proven** to be the ECL operand
parser's own DGROUP. `gateway-operand-parser-execution-probe.md`'s underlying gap (Gateway's
operand parser has never been observed to execute) is unchanged by this round; this trace
answers the practical question ("what does live memory hold at these addresses right now,
under the best available segment candidate") without closing that deeper gap. The semantic
reading of `[0x7ED5]`/`[0x4C21]` as "first-time-here" flags that a real visit to this
location would set nonzero is a plausible inference from the decoded bytecode shape only --
**not** confirmed by any input experiment; per "UNLOCATED beats invention," no scripted key
sequence was attempted to test it.

### Reproduction

```powershell
pwsh tools/trace_gateway_boot_guards.ps1 -OutDir build/dosbox-x-gateway-boot-guards-<label> `
  -SilentWindowSeconds 90 -GlobalTimeoutSeconds 300 -SamplesPerRun 3

python -m unittest test_simulate_gen1_ecl_path -v   # from tools/, 10 tests
```

Requires the hash-locked stage at `build/runtime-gateway-base-clean-20260715` and the local
DOSBox-X 2026.07.02 DEBUGBOX build under `build/tools/dosbox-x-2026.07.02`, same as the
sibling Gateway trace scripts.
