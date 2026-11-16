# Pools of Darkness ECL1#72 → #69 audit memo

## Verdict

**Fact:** Pools of Darkness opcode `0x21 LOAD_FILES` is a **two-operand instruction**. This is supported independently by its retail `GAME.OVR` handler and by the full installed `ECL1.DAX` corpus. It warrants a **Pools-specific dialect**, not a change to shared `ECL_GEN1_SHORT`.

**Fact:** The former block-69 “nonlocal GOTO” is a decoder artifact. At raw offset `0x3C`, the correct decode is:

```text
803A  LOAD_FILES #69,#5
803F  COMPARE #18,[0x0016]
8045  IF_EQ
8046  GOTO 0x8410
804A  COMPARE #68,[0x0016]
8050  IF_EQ
8051  GOTO 0x839C
```

**Inference:** The bounded route should not be rejected, but it is not yet ready for Greybox promotion. Correct framing and predecessor-member propagation remove the structural blocker; authentic selector, party-strength, member-selection, combat-outcome, and runtime transition state still require one focused native capture.

## Retail evidence

Installed files inspected read-only:

- `C:\Program Files (x86)\GOG Galaxy\Games\Pools of Darkness\ECL1.DAX`
  - SHA-256: `46aab737acb289b1995ae5a8ef495424d2e4e40bae45e33a1e9741f4c50064af`
  - 56 members.
- `C:\Program Files (x86)\GOG Galaxy\Games\Pools of Darkness\GAME.OVR`
  - SHA-256: `bac46d171d1f11584c94beeec4cda548aa797e0b25b899b199a2c49c6e63d402`.

Block hashes:

| Member | Raw length | SHA-256 |
|---|---:|---|
| ECL1#72 | 6,386 | `d3090581b2975ba1090c5349ed6edce90b6f7242ef1096f91a77050b0a9fd2b4` |
| ECL1#69 | 7,654 | `d5cfcd4c657731489f667e5a770e7980c0505b8b39eb09903dda23c9d10a8c0e` |

Pools’ dispatcher maps opcode `0x21` to `GAME.OVR+0x0E9E`. Its prologue is:

```asm
mov al,2
push ax
lcall 0055:002A       ; operand parser
```

It then fetches operands 1 and 2 separately. This directly proves the two-operand frame.

The same retail dispatcher additionally shows:

- `0x1D PARTYSTRENGTH`: handler `+0x1887`, no operand-parser call.
- `0x1F`: handler `+0x2643`; `mov al,1` at `+0x264A`, proving one operand.
- `0x37`: handler `+0x1ECA`; `mov al,2`, proving two operands and a Pools-specific party-name lookup rather than ordinary three-operand `LOAD_PIECES`.
- `0x20 NEWECL`: handler `+0x0E4A`; it stores current block id `[0xC580]` into `Area+0x15` before reading and installing the new id.

These facts support the currently proposed—but uncommitted—`ECL_GEN1_SHORT_POOLS` work in [disassemble.ts](../../../packages/engine/src/ecl/disassemble.ts) and predecessor update in [program.ts](../../../packages/engine/src/ecl/program.ts). They should be treated as work in progress until tests and a durable evidence artifact exist.

## Corpus verdict

Across the retail corpus, 34 unambiguous self-identifying loader sites have the form:

```text
LOAD_FILES #current_member,#disk
<next real opcode>
```

Under the two-operand frame, their next instructions are:

| Next instruction | Sites |
|---|---:|
| SAVE | 24 |
| COMPARE | 7 |
| PARLAY | 1 |
| GETTABLE | 1 |
| GOTO | 1 |

Under the three-operand frame, those actual opcodes are swallowed as operand codes—principally `0x09 SAVE` at 24 sites and `0x03 COMPARE` at seven—and the following stream commonly lands on an invalid opcode, false `EXIT`, or false/nonlocal `GOTO`.

A full five-entry CFG sweep also improves from 26,013 decoded instruction offsets under three operands to 27,034 under two, with no state-limit exhaustion. This is corroboration; the retail handler remains the decisive proof.

Therefore:

- **Yes:** a Pools-wide, Pools-only two-operand `LOAD_FILES` dialect is justified.
- **No:** do not change shared `ECL_GEN1_SHORT`; DoK’s three-operand form and Treasures’ separate two-operand dialect must remain independently pinned.
- **No:** do not justify the dialect solely from block 69’s “more coherent” appearance.

The old contrary claims in [disassemble.ts](../../../packages/engine/src/ecl/disassemble.ts), [gen1_ecl_encounter_scan.py](../../../tools/gen1_ecl_encounter_scan.py), and [pools-of-darkness-eclinit.md](pools-of-darkness-eclinit.md) are superseded by the retail handler.

## Blocks 72 and 69

Block 72’s relevant arm requires the initial `ON_GOTO` selector `[0x027B] == 38`, selecting `0x979B`. Correct Pools framing then yields:

```text
979B  PRINTCLEAR ...
97C5  PARTYSTRENGTH
97C6  opcode 0x1F #7
97C9  SETUP_MONSTER #5,#0,#255,#10
...
9869  LOAD_MONSTER #35,#8,#35    DROW PRIEST ×8
9870  LOAD_MONSTER #39,#4,#39    DROW SORCERESS ×4
9877  LOAD_MONSTER #7,#2,#7      PET OF KALISTES ×2
987E  LOAD_MONSTER #20,#2,#20    PHASE SPIDER ×2
9885  COMBAT
...
98DB  NEWECL #69
```

Thus the first combat is statically **before** the transfer to block 69.

On a genuine `72 → 69` transfer, retail `NEWECL` preserves predecessor `72`. Block 69 begins:

```text
8014  SAVE [0x0016],[0x009D]
801B  COMPARE #69,[0x0016]; IF_EQ; EXIT
8023  COMPARE #72,[0x0016]; IF_EQ; GOTO 0x8439
```

Therefore `[0x0016]=72` must take the local `0x8439` predecessor arm. A fresh synthetic zero instead falls through the general loader at `0x803A`; that is not authentic evidence for the chained route.

Block 69’s selector-38 arm later sets `[0x027B]=27` and reaches `NEWECL #72` at `0x9D8C`. This appears to be a scripted multi-member state machine, not a simple one-way area load.

## Required authentic state

Before claiming the route, capture:

- The source of `[0x027B]=38`; do not seed it merely because it reaches the candidate.
- Current ECL id `[0xC580]`, `Area+0x15`, logical `[0x0016]`, and block-69’s copied `[0x009D]`.
- All live party slots: membership/order, alive or active status, levels/classes, HP/status, and any selected-member index.
- Native `PARTYSTRENGTH` inputs, computed result, and compare flags at both block-72 sites (`0x97C5`, `0x9845`).
- The effect of `0x1F #7`, including selected-member/result state. Its framing is proven; its browser semantics are not.
- Exact four-group roster at `COMBAT 0x9885`, tactical-board population, victory/defeat result flags, and post-combat cursor.
- `NEWECL` transition: departed id `72`, new id `69`, then block-69 branch to `0x8439`.
- Any subsequent selector change, `69 → 72` transfer, and whether another combat actually occurs.

Greybox’s current default `partyStrength: 0` in [vm.ts](../../../packages/engine/src/ecl/vm.ts) is a testing fallback, not authentic Pools state.

## Smallest GameLink/native proof

Use one exclusively owned, hash-locked GameLink session, without patched ECL/GEO or invented quest/strength state:

1. Start from a real retail party/save that naturally selects block 72 and `[0x027B]=38`.
2. Break on relocated handlers corresponding to retail offsets:
   - `0x1887` — `PARTYSTRENGTH`
   - `0x2643` — opcode `0x1F`
   - `0x0E9E` — `LOAD_FILES`
   - `0x0E4A` — `NEWECL`
   - the dispatcher-owned `COMBAT` handler.
3. Record the ECL cursor before and after each handler:
   - block 72: `0x97C5 → 0x97C6 → 0x97C9`;
   - block 69 loader control: `0x803A → 0x803F`, proving two operands.
4. Capture the state listed above, the tactical roster/board, outcome, resume cursor, and the `72 → 69` predecessor branch.

The runtime `LOAD_FILES` fire may require a different predecessor than 72 because the authentic 72 arm bypasses block 69’s `0x803A` loader. It is still the smallest direct cursor corroboration for the dialect, but it must not be conflated with proof of the 72-chain branch.

## Exact tests recommended before merging

1. **Dialect framing — [ecl.test.ts](../../../packages/engine/test/ecl.test.ts)**

   - Pin the file/member hashes above.
   - Assert block 69 raw `0x3C` decodes as two-operand `LOAD_FILES`, followed at `0x41` by `COMPARE #18,[0x0016]`.
   - Assert both GOTOs resolve locally to `0x8410` and `0x839C`.
   - Assert block 72 `0x17C8` is one-operand `0x1F #7`, followed at `0x17CB` by four-operand `SETUP_MONSTER`.
   - Pin `0x37` as two operands under Pools only.

2. **Whole-corpus dialect census**

   - Pin the 34 self-id `LOAD_FILES` sites and the `24/7/1/1/1` successor distribution above.
   - Require each two-op successor to re-land exactly.
   - Assert the shared DoK dialect remains three-operand and Treasures retains its separate dialect.
   - Add the same Pools override to [gen1_ecl_encounter_scan.py](../../../tools/gen1_ecl_encounter_scan.py) and a Python unit test for parity with the TypeScript decoder.

3. **Generic predecessor semantics — [program.test.ts](../../../packages/engine/test/program.test.ts)**

   - Synthetic `NEWECL 72→69`: new VM sees `[0x0016]=72`.
   - Preserve unrelated memory and update the predecessor on every later chain.
   - Real block-69 golden: `[0x0016]=72` writes `[0x009D]=72` and takes `0x8439`; values `69`, `18`, `68`, and `0` exercise their distinct entry guards without title-specific branching in the runner.

4. **Real route golden — [dungeonEvents.test.ts](../../../packages/engine/test/dungeonEvents.test.ts)**

   Add only after native capture. Seed the captured state, assert narration, four-group roster, `COMBAT 0x9885`, outcome-dependent resume, `NEWECL #69`, predecessor branch, and subsequent terminal/chain state.

## Smallest safe engine/browser seam

If native proof succeeds:

- Keep `ECL_GEN1_SHORT_POOLS` as a title-specific dialect.
- Keep predecessor propagation generic in `runEclChain`; `[0x0016]` is cross-title interpreter state, not a Pools route hack.
- Surface opcode `0x37` as an explicit host request until authentic party-name lookup semantics are implemented.
- Extend [dungeon.ts](../../../packages/engine/src/world/dungeon.ts) only if native evidence proves combat can pause during initialization: return a loaded map plus a resumable ECL session, rather than discarding the VM.
- Let [explore.ts](../../../apps/web/src/ui/explore.ts) use the ordinary dialogue/combat continuation and save layer. Do not add a vaddr-specific Pools branch or hard-coded `[0x027B]=38`/party-strength seed.

No files were edited, committed, or deployed, and no DOSBox session was run.