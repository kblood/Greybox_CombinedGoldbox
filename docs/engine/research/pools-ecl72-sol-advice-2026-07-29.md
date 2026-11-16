# Pools ECL1#69 → #72 → #69 audit memo

## Verdict

**Fact:** The active candidate is a real, finite, same-area natural route. It does not require a fabricated `[027B]=38` seed or cross-GEO descriptor reuse:

```text
GEO1#69 cell (8,6), descriptor 0x97
  → ECL1#69 SearchLocation: 0x97 & 0x3f = 23
  → SAVE #38,[027B]
  → NEWECL #72
  → selector 38
  → four-group Drow combat at v9885
  → victory continuation
  → NEWECL #69
```

The old nonlocal-GOTO diagnosis was decoder drift caused by treating Pools `LOAD_FILES` as three operands.

**Inference:** This is sufficient for the browser to claim a “retail-byte-derived natural map trigger and encounter.” It is not yet sufficient to claim native tactical parity, authentic `PARTYSTRENGTH`/opcode `0x1F` effects, or a completed post-victory state machine.

## Retail-byte findings

Inspected read-only:

- `GAME.OVR`: SHA-256 `bac46d171d1f11584c94beeec4cda548aa797e0b25b899b199a2c49c6e63d402`
- `ECL1.DAX`: SHA-256 `46aab737acb289b1995ae5a8ef495424d2e4e40bae45e33a1e9741f4c50064af`
- ECL1#69 raw: 7,654 bytes, SHA-256 `d5cfcd4c657731489f667e5a770e7980c0505b8b39eb09903dda23c9d10a8c0e`
- ECL1#72 raw: 6,386 bytes, SHA-256 `d3090581b2975ba1090c5349ed6edce90b6f7242ef1096f91a77050b0a9fd2b4`

Handler arities are directly confirmed:

| Opcode | Retail evidence | Verdict |
|---|---|---|
| `0x0C SETUP_MONSTER` | `GAME.OVR+0x052C`: `mov al,4` before operand parser | 4 operands |
| `0x1D PARTYSTRENGTH` | handler `+0x1887`, no operand-parser call | 0 operands |
| `0x1F` | `+0x264A`: `mov al,1` | 1 operand |
| `0x21 LOAD_FILES` | `+0x0E9E`: `mov al,2` | 2 operands |
| `0x37` | `+0x1ECA`: `mov al,2`; party-name lookup | 2 operands |

This supports the Pools-specific dialect at [disassemble.ts:184](../../../packages/engine/src/ecl/disassemble.ts#L184) and scanner table at [gen1_ecl_encounter_scan.py:69](../../../tools/gen1_ecl_encounter_scan.py#L69). Shared `ECL_GEN1_SHORT` should remain unchanged.

### Corrected block 69 boundary

```text
raw003C / v803A  21 00 45 00 05
                    LOAD_FILES #69,#5
raw0041 / v803F  03 00 12 01 16 00
                    COMPARE #18,[0016]
raw0047 / v8045  IF_EQ
raw0048 / v8046  GOTO v8410
```

Thus there is no instruction at “v8042”; that address resulted from consuming the `COMPARE` bytes as a third `LOAD_FILES` operand. The proposed tripwires appear at [poolsNaturalRoute.test.ts:65](../../../packages/engine/test/poolsNaturalRoute.test.ts#L65).

## Natural selector-38 provenance

GEO decoding uses plane 2 as the descriptor byte ([geo.ts:102](../../../packages/engine/src/loaders/geo.ts#L102), [build_gen1_campaign_route_map.py:110](../../../tools/build_gen1_campaign_route_map.py#L110)).

**Fact:** GEO1#69 contains exactly one descriptor matching selector 23:

```text
(x=8, y=6), raw descriptor 0x97; 0x97 & 0x3f = 23
```

The WIP golden independently encodes that assertion at [poolsNaturalRoute.test.ts:80](../../../packages/engine/test/poolsNaturalRoute.test.ts#L80).

ECL1#69 SearchLocation then executes:

```text
raw06C5 / v86C3  AND #0x3f,[002D],[00BF]
...
descriptor-23 target v9961:
v9961  COMPARE #0,[0011]        ; north-facing gate
v9969  COMPARE #1,[0278]
v9971  SAVE #1,[026E]
v9977  AND #2,[0276],[00BF]     ; prior-state gate
v9985  SAVE #38,[027B]
v998B  GOTO v9D6B
...
v9D8C  NEWECL #72
```

Therefore `[027B]=38` has explicit natural provenance from a real cell in the matching GEO, subject to ordinary facing/state guards. Cross-GEO reuse is unnecessary.

Descriptor 23 is common—my read-only census found it in 26 GEO blocks—but reusing another map’s placement would be invalid evidence when GEO1#69 itself supplies the exact trigger.

## Drow route and `NEWECL`

Block 72’s initial `ON_GOTO [027B],39,...` maps zero-based selector 38 to v979B:

```text
v97C5  PARTYSTRENGTH
v97C6  opcode 0x1F #7
v97C9  SETUP_MONSTER #5,#0,#255,#10
v9869  LOAD_MONSTER #35,#8,#35   DROW PRIEST ×8
v9870  LOAD_MONSTER #39,#4,#39   DROW SORCERESS ×4
v9877  LOAD_MONSTER #7,#2,#7     PET OF KALISTES ×2
v987E  LOAD_MONSTER #20,#2,#20   PHASE SPIDER ×2
v9885  COMBAT
```

On a victory result, `IF_NE` at v9886 does not take the defeat/flee branch; execution joins the table-copy tail and reaches:

```text
raw18DD / v98DB  NEWECL #69
```

Pools `CMD_NewECL` at `GAME.OVR+0x0E4A` stores current `EclBlockId` into `Area+0x15` before installing and loading the target. The independent CoAB oracle names the same operation `LastEclBlockId = EclBlockId` at `coab_extracted/engine/ovr003.cs:480` (the local CoAB study checkout is not bundled)..

**Strong inference:** `Area+0x15` is logical `[0016]`: Pools’ low area addresses follow the one-based logical convention, and block 69 immediately branches on `[0016]` as its predecessor ID. The generic runner implementation is at [program.ts:181](../../../packages/engine/src/ecl/program.ts#L181).

With predecessor 72, block 69 takes:

```text
v8014  SAVE [0016],[009D]
v801B  COMPARE #69,[0016]; IF_EQ; EXIT
v8023  COMPARE #72,[0016]; IF_EQ; GOTO v8439
```

Post-victory is not terminal: selector 38 later becomes 27 and chains back to #72. Tests should assert the next finite pause/transition, not simply “exited.”

## `[027B]` and `[026F]` xrefs

A five-entry reachable-CFG census of blocks 69 and 72 found:

- `[027B]`: one read in #69 (`ON_GOTO` v8471), one read in #72 (`ON_GOTO` v8046), and 31 reachable `SAVE` sites in #69. No #72 writer.
- Relevant #69 writers:
  - `v97BC`: `SAVE #13,[027B]`
  - `v9985`: `SAVE #38,[027B]`
  - `v998F`: `SAVE #27,[027B]`
- `[026F]`: one writer in #72 and two reads in #69:
  - #72 `v8D50`: `SAVE #1,[026F]`
  - #69 `v970E`: guard used by the selector-12 state transition
  - #69 `v97C6`: selector-13 spider-fight guard

The selector-13 route is consequently also coherent:

```text
#72 selector 13 → v8BF5
RANDOM #3; ADD #15
COMPARE random+15,[041B]
conditional SAVE #1,[026F]
→ shared NEWECL #69

#69 selector 13 → v97C6
COMPARE #1,[026F]; IF_EQ; GOTO v9CF2
LOAD_MONSTER #35,#4,#35    DROW PRIEST ×4
LOAD_MONSTER #102,#4,#102  ELECTRIC SPIDER ×4
LOAD_MONSTER #100,#2,#100  STONE SPIDER ×2
LOAD_MONSTER #101,#1,#101  GAZE SPIDER ×1
COMBAT v9D5E
```

**Inference:** This is a second natural but character-stat-dependent state-machine arm, not evidence that `[026F]` may be freely seeded.

## Contradictions and stale material

- [pools-natural-route.md:1](pools-natural-route.md:1) says the search route is “genuinely blocked,” the plain dialect is correct, and the nonlocal GOTO is genuine. All three conclusions are superseded.
- [pools-of-darkness-eclinit.md:8](pools-of-darkness-eclinit.md:8) assigns plain `ECL_GEN1_SHORT` and treats post-loader halts as real content boundaries; the loader framing was wrong.
- [pools-of-darkness.json:32](../../../apps/web/games/pools-of-darkness.json#L32) says no byte-verified route exists and all reachable loader operands are dynamic. Block 69 has literal `LOAD_FILES #69,#5`.
- [gen1_ecl_encounter_scan.py:64](../../../tools/gen1_ecl_encounter_scan.py#L64) still contains a stale comment claiming Pools’ plain three-operand loader was independently proven, contradicting its corrected table below.
- Generated output now reports 356/323 Pools candidates at [gen1-ecl-natural-encounters.md:8](gen1-ecl-natural-encounters.md:8), not the old 70/36. The JSON still labels the dialect merely `"gen1-short"` at `build/gen1-ecl-encounters.json:11` (this local generated build artifact is not bundled)..
- The VM’s `PARTYSTRENGTH operand` comment at [vm.ts:1491](../../../packages/engine/src/ecl/vm.ts#L1491) is inaccurate for zero-operand Pools, although its absent-operand fallback is safe.
- The untracked WIP golden is not merge-ready: [poolsNaturalRoute.test.ts:116](../../../packages/engine/test/poolsNaturalRoute.test.ts#L116) compares a nonempty diagnostic object to `{}`, an unconditional failure/debug remnant.

## Recommended real-byte tests

1. Pin all three retail hashes plus GAME.OVR arity fingerprints.
2. Assert exact #69 bytes at raw `003C` and `0041`; assert #72 raw `17C7/17C8/17CB`.
3. Pin GEO1#69’s unique `(8,6,0x97)` trigger and the natural `69 → 72` route without directly seeding `[027B]`.
4. Add negative controls for facing, `[0278]=1`, and `[0276]&2`.
5. Assert victory produces predecessor `[0016]=72`, takes #69 v8439, changes selector 38→27, and stops at the next defined pause/chain.
6. Add the selector-13 route with both outcomes of the `[041B]` comparison and `[026F]=0/1`.
7. Pin the xref census above so future dialect drift cannot invent or erase state provenance.
8. Keep a generic synthetic `NEWECL` predecessor test separate from the Pools golden.

## Native trace decision and browser boundary

A GameLink trace is **not warranted as a gate for dialect correctness or natural-route existence**; retail handlers, exact ECL bytes, and the same-GEO producer close those questions.

A focused native trace remains worthwhile for narrower claims:

- actual Pools `PARTYSTRENGTH` side effects;
- opcode `0x1F #7`;
- tactical-board population versus the four queued groups;
- victory/flee/defeat flags;
- the subsequent 69→72 continuation and save/reload persistence.

If run later, it must use the repository-mandated GameLink path ([CLAUDE.md:307](../../../CLAUDE.md#L307)) and start from an unmodified natural party/save.

Until then, the browser may say:

> “Retail-byte-verified natural GEO1#69 encounter route to the four-group Drow combat.”

It should not yet say:

> “Native-parity encounter,” “complete victory route,” or “save-persistent Pools campaign encounter.”

No files were edited, and no DOSBox, commit, or deployment was performed.