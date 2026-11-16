# Gen1 ECL opcodes above the shared `0x00-0x40` table

> **CORRECTION, 2026-08-06 (same day, commit after `fc5c1fd`).** The first version of this doc
> declared the stalled agent's claim 1 "REFUTED on its stated cause", citing block 75 as having
> zero truncations and `102 -> 102` reachable instructions. **That was wrong, and the agent was
> right.** Those numbers came from a throwaway probe of mine that deduplicated by offset alone and
> discarded the GOSUB return stack, so it never reached the one `0x41` site in the block at all.
> Measured with the real stack-threaded scanner, block 75 goes **244 -> 512** instructions and the
> single truncation sits at vaddr **`0x8A8C`** — the exact address the agent named. Section 5 below
> is rewritten; the sub-claims about `max_states` and `compare_outcomes` were checked separately
> and those refutations still stand.

**2026-08-06.** Started as a verification pass on two methodological claims raised by the stalled
Pools-of-Darkness `ending`-leg agent. That agent stalled before review; its draft doc and draft
test were deliberately **not** committed (the test contained zero `expect()` calls while its header
claimed otherwise), so the claims below arrive as unreviewed leads to test, not as conclusions to
accept. **Both turned out to be substantially correct** — see §5, and the correction notice above
for the round trip it took to establish that. Along
the way the check found a real, previously unrecorded gap in `tools/gen1_ecl_encounter_scan.py`
that was costing measurable coverage on two titles.

Everything below is derived from the retail GOG bytes via `tools/goldbox_corpus.py` +
`tools/gen1_ecl_encounter_scan.py`. **Facts** are byte-measured; **inferences** are labelled.

---

## 1. The gap: Python decodes `0x00-0x40`, the engine decodes more

**Fact.** `dqk_ca03_stream_decode.OPCODES` — the table `gen1_ecl_encounter_scan.decode_one` used
— holds 65 entries, `0x00`–`0x40`, and had **no per-title extension mechanism at all**.

**Fact.** `packages/engine/src/ecl/disassemble.ts` has had one for some time: `EclDialect`
carries an `opcodeOverrides` map (line 69, consulted at line 423), and three dialects populate it:

| Dialect | Override | Status on the engine side |
| --- | --- | --- |
| `ECL_GEN1_SHORT_POOLS` | `0x41` `POOLS_AWARD_XP`, `wordSet: 2` | grounded, not flagged uncertain |
| `ECL_GEN1_SHORT_TREASURES` | `0x42` `TREASURES_EXT_42`, `wordSet: 1`, `trailingBytes: 1` | `uncertain: true` |
| `ECL_GEN2` | `0x41` `GEN2_EXT_41`, `wordSet: 2` | Unicorn-trace-proven frame, semantics unproven |

So the two halves of the project disagreed about how much of the retail script stream is
decodable, and the Python half was silently the poorer one.

**Fact (the silent-failure part).** `scan_block` swallowed every byte it could not decode with a
bare `continue`. It reported `decoded_instruction_offsets` and `state_limit_reached` but nothing
about truncation, so **a scan that stopped early was indistinguishable from one that ran out of
code**. This is the same class of defect as the report-narrowing hazard fixed in `7bfbccd`
(`tools/report_guard.py`): a failure mode whose symptom is a plausible-looking success.

## 2. How far the ceiling actually reached

**Fact.** Reachable bytes the scanner could not decode, per title, measured with the scanner's own
CFG exploration (not a simplified probe):

(Site counts are from the before-run. Treasures' `0x41` count rises 2 → 3 afterwards, because
decoding past `0x42` opens a path that reaches one more `0x41`.)

| Title | Truncated, before | `0x41` sites | `0x42` sites | Truncated, after |
| --- | ---: | ---: | ---: | ---: |
| Pools of Darkness | 83 | 69 | — | **15** |
| Treasures of the Savage Frontier | 47 | 2 | 29 | **22** |
| Secret of the Silver Blades | 40 | 40 | — | 40 |
| Champions of Krynn | 33 | 33 | — | 33 |
| Death Knights of Krynn | 50 | 29 | 1 | 50 |
| Gateway to the Savage Frontier | 1 | 1 | — | 1 |
| Neverwinter Nights (DOS/AOL) | 1 | 1 | — | 1 |
| Pool of Radiance | 1 | 0 | — | 1 |
| Curse of the Azure Bonds | 0 | 0 | — | 0 |

**Fact.** `0x41` is reachable in **seven of the nine** Gen1 titles. Only Pool of Radiance and
Curse of the Azure Bonds — the two oldest — are clean of it. It is not a Pools quirk.

**Correction to an earlier reading in this same session.** A first, simplified probe (offset-only
deduplication, no operand/stack state) reported `0x41` in Pools and DoK only, and pronounced the
other six titles clean. That was wrong: the real scanner's stack-tracking exploration reaches
strictly more code, and finds `0x41` in Champions (33) and Secret (40) as well. The table above is
from the real scanner and supersedes it.

**Inference (high confidence).** The scattered one-off bytes (`0x80`, `0x9c`, `0x9d`, `0xb5`,
`0xeb`, …) are not opcodes. They are single hits reached by branch exploration wandering into
string or table data — exactly what a static CFG walk that takes both sides of an unresolvable
comparison is expected to do. The concentrations are the signal: `0x41` ×69 in Pools and `0x42`
×29 in Treasures are not noise.

## 3. The frame

**Fact.** Every Pools and DoK `0x41` site begins `41 00 01 <op>`, and the second operand is a
`code 2` or `code 3` word form. Read as `wordSet: 2` the immediate values are
`500, 250, 191, 10000, 25000, 50000`. Round decimal amounts.

**Inference (moderate confidence, and it is the engine's own).** That value distribution fits an
award of money or experience, which is what the engine already calls it — `POOLS_AWARD_XP`.
The frame agrees independently with the DQK Gen2 dispatch-table trace, which observed operand
bytes `00 01 00 64` at its own `0x41` and pinned `wordSet: 2`
(`docs/engine/research/decompile-dqk-ecl-dispatch.md`). Two independent groundings, same frame.

**Honest negative — the frame cannot be pinned by chain validation.** The obvious test (try each
candidate `wordSet`/`trailingBytes`, keep whichever keeps the following instruction stream
decoding cleanly) **does not discriminate**. Across all 48 Pools sites, framings `(0,0)`, `(0,1)`
and `(2,1)` were all unanimously clean; on Treasures' `0x42`, six different framings were
unanimously clean. Gen1 ECL bytes are dense enough that many mis-framings still land on valid
opcodes for twenty instructions. Anyone tempted to settle an operand frame this way should not:
the technique is sound only where it produces a *unique* survivor, and here it does not. The two
framings adopted are adopted because the engine already grounds them, not because of this test.

## 4. What changed

`tools/gen1_ecl_encounter_scan.py`:

- `scan_block` now counts every reachable byte it cannot decode and reports `truncated_offsets`
  plus an `unknown_opcodes` histogram, per block and aggregated per game. The generated
  `docs/engine/research/gen1-ecl-natural-encounters.md` table carries both columns and states
  plainly that a non-zero count makes the other numbers lower bounds.
- `PROFILE_EXTENDED_OPCODES` mirrors the engine's `opcodeOverrides` for the **two** titles the
  engine has grounded, and only those. `Opcode` gained a `trailing_bytes` field so Treasures'
  `0x42` can be carried at its real shape.
- `decode_one` / `successors` / `scan_block` take the per-profile table; `opcodes_for_profile`
  merges it over the shared one.

**Fact (measured effect).** Pools recovered **6 previously invisible COMBAT paths** (356 → 362,
rostered 323 → 329) and Treasures **1** (193 → 194). Corpus total 2861 → 2868.

**Fact (reachability, measured with the real stack-threaded scanner).** Pools `ECL1.DAX` decodes
**28,645 → 29,356** instructions (+711, +2.5 %); Treasures **17,928 → 18,184** (+256, +1.4 %).

**The aggregate badly understates it, and that is the real lesson here.** The gain is not spread
evenly — it is concentrated at chain heads, because one undecodable byte severs everything
downstream of it. **Block 75 alone accounts for 268 of Pools' 711 recovered instructions (38 %)
from a single `0x41` site.** A corpus-level "+2.5 %" invites the conclusion that the ceiling was a
rounding error; per block it ranges from nothing at all to losing half the block.

`0x41` in Champions, Death Knights, Secret, Gateway and Neverwinter Nights is **deliberately left
undecoded**. Neither side of the project has a grounded frame for those titles, and the Gen2 range
check that proved `0x00..0x41` was a *DQK* interpreter fact — it does not transfer to a Gen1
interpreter without its own trace. Leaving them out keeps them visible in `truncated_offsets`
rather than decoded on an assumption. `tools/test_goldbox_corpus.py` enforces this: every entry in
`PROFILE_EXTENDED_OPCODES` must appear inside *that dialect's own* declaration in
`disassemble.ts`. (The first version of that test searched the whole file and was vacuous — Gen2's
`0x41` satisfied an invented Champions entry. It is now scoped to the dialect block and verified
to fail on both an invented opcode and a wrong `wordSet`.)

## 5. Verdict on the two claims that started this

**Claim 2 — "Pools' opcode `0x41` must be in the decoder's table." CONFIRMED.** 69 reachable
sites across 30 of Pools' 56 `ECL1.DAX` blocks; closing it recovered 711 instructions and 6 COMBAT
paths. The one correction is scope, not substance: it is not a Pools-specific defect. `0x41` is
reachable in seven of the nine Gen1 titles, and five of them are still undecoded.

**Claim 1 — "the reachability model has a measured 46.0 % recall and cannot see this ending at
all; the opcode ceiling amputates `0x8A8C..0x966C`, the entire finale, from block 75." CONFIRMED.**
Measured against `ECL1.DAX#75` (6,233 bytes, vaddr `0x7FFE..0x9856`) with the real stack-threaded
scanner, before and after the fix:

| Measure | Table stops at `0x40` | With `0x41` = `POOLS_AWARD_XP` |
| --- | ---: | ---: |
| Reachable instructions | 244 | **512** |
| Truncations | 1, at vaddr **`0x8A8C`** | 0 |
| Instructions in `0x8A8C..0x966C` (3,040 B) | **0** | **262** |
| Instructions in `0x87F3..0x89C1` (462 B) | 46 | 46 |

- The single undecodable byte sits at **exactly** the start of the range the agent named. One
  `0x41` severed the whole 3,040-byte finale.
- Recall before the fix is **244/512 = 47.7 %**, against the claimed 46.0 % — close enough that
  the agent had clearly measured something real rather than estimated.
- Its one genuine error: `0x87F3..0x89C1` was **never** unreachable (46 instructions both before
  and after), so that half of the range claim was wrong.

**How the first version of this doc got the opposite answer.** A throwaway probe written to test
the claim deduplicated visited addresses by offset alone and pushed successors with an empty call
stack, so every `GOSUB` return was dropped. It reported 102 reachable instructions and zero
truncations because it never walked far enough to reach `0x8A8C`. The lesson is narrow and worth
stating: **do not refute a claim with a reimplementation of the tool the claim is about.** Running
`scan_block` itself — which threads the stack correctly, and which the fix had already been wired
into — would have shown 244 vs 512 immediately.

**The two sub-claims that DO stay refuted.** These were checked independently of the broken probe
and survive the correction.

**Fact.** `scan_block`'s `max_states = 50000` cap is
hit by **0 of 56** Pools blocks and **0 of 30** Treasures blocks. And the `compare_outcomes`
narrowing is not a recall limiter — it only narrows when *both* compare operands are immediates
(`scan_block`, `ins.opcode == 0x03`), which is exact constant folding; every other flag-setting
opcode resets it to `ALL_COMPARE_OUTCOMES`.

**What is now open on block 75.** With the fix it decodes 512 instructions and **zero**
truncations, and only two runs of ≥48 unreached bytes remain (`0x8079..0x80D7`, 95 B, and
`0x824F..0x8287`, 57 B) — both look like ordinary branch-outcome shadows, not structural holes.
Block 75 is Pools' ending block and it is now essentially fully readable: `initial_entry`
(`0x8014`) selects among three denouement variants on `[0x2EE]`/`[0x254]`/`[0x1D0]`, runs a long
`PICTURE` + `PRINTCLEAR` narration chain, iterates the party with `LOAD_CHARACTER` at `0x9817`,
and the `0x966F` variant ends `SAVE #4->[0x3A]; SAVE #9->[0x25]; SAVE #4->[0x26]; NEWECL #0x18`.

That makes the Pools `ending` leg newly tractable — it was blocked on code the scanner could not
see, and it can now see it. The leg stays `not-investigated` in
`tools/goldbox_campaign_matrix.json` until it is actually run through the find → refute →
transcribe pipeline against these bytes; this section is the input to that run, not a substitute
for it.

## 6. Side result: Pools does share Treasures' non-CoAB memory model

This closes a separate open question ("does Pools of Darkness share Treasures' non-CoAB memory
model?"). **Yes**, and the engine already implements it — but it had not been checked against the
bytes independently of the code comment asserting it.

**Fact.** Counting `AND` (`0x2f`) source operands reachable from `search_location`, per title:

| Title | Top `AND` source addresses in `search_location` |
| --- | --- |
| Pools of Darkness | **`0x2d` ×47**, `0x99` ×30, `0x197` ×27 |
| Treasures of the Savage Frontier | **`0x2d` ×48**, `0x80` ×40, `0xc0` ×10 |
| Champions of Krynn | `0x80` ×9, `0x1` ×8, `0x2` ×8, `0x4` ×8 — **no `0x2d` at all** |

Pools and Treasures both read the cell descriptor from the low address `[0x002d]`; the CoK-family
`[0xc04f]` convention is absent from both. That matches `ECL_GEN1_SHORT_POOLS.cellDescAddr` and
`ECL_GEN1_SHORT_TREASURES.cellDescAddr` in `disassemble.ts`. Pools additionally declares
`lastBlockIdAddr: 0x0016`, which Treasures does not.

## 7. Effect on already-committed work

**None of the four Pools campaign legs committed in `c653df2` are affected.** A recall gap in a
static scanner produces false *negatives* only: it can hide a route that exists, never manufacture
one that does not. Every `proven` leg rests on decoded bytes plus an engine golden, and both were
computed from code the scanner did decode. The gap bears on **coverage claims** — statements of
the form "there are no other X" — which is why the `ending` leg stays `not-investigated` rather
than being promoted on the strength of an absent finding.

---

## 8. `0x31` in the Gen1-SHORT dialects is a MENU, not `SPRITE_OFF` (2026-08-06)

The largest single recall win found so far, and a correction to previously committed engine
behaviour rather than only to the Python scanner.

### 8.1 The two framings

`0x31` is `SPRITE_OFF` — zero operands — in the Gen1-LONG dialect (Pool of Radiance, Curse of the
Azure Bonds, Secret of the Silver Blades). The engine and the scanner both applied that frame to
the SHORT dialects too. In the SHORT dialects it is a **menu**: `wordSet 2`, `countAt 1`, i.e. a
destination operand, a count operand, then `count` inline packed-string items — the same shape as
`0x2b HORIZONTAL_MENU`.

Two independent titles, disassembled both ways:

**Death Knights of Krynn `ECL2.DAX#67` @ `0x879b`** (the middle-area ambush)

```
OLD (0x31 = 0-operand SPRITE_OFF)      NEW (0x31 = SHORT_MENU)
0x879b [31] SPRITE_OFF                 0x879b [31] SHORT_MENU (1,0x7f79) (0,0x2)
0x879c [01] GOTO (code 121, 0x7f)                     'RETREAT' 'ATTACK'
0x879f [00] EXIT                       0x87b0 [25] ON_GOTO (1,0x7f79) (0,0x2)
0x87a0 [02] GOSUB 'RETREAT'                           (1,0x9bc4) (1,0x87bc)
0x87a9      *** TRUNCATED (0x80) ***   0x87bc [12] PRINTCLEAR 'THE ENEMY IS UPON YOU!'
```

**Pools of Darkness `ECL1.DAX#51` @ `0x8385`** (the wilderness distant-monsters arm)

```
OLD                                    NEW
0x8385 [31] SPRITE_OFF                 0x8385 [31] SHORT_MENU (1,0x98) (0,0x4)
0x8386 [01] GOTO (code 152, 0x0)                      'ATTACK' 'FLEE' 'TALK' 'WAIT'
0x8389 [00] EXIT                       0x83a1 [25] ON_GOTO (1,0x98) (0,0x4)
0x838a [04] ADD 'ATTACK' 'FLEE' 'TALK'                (1,0x83c9) (1,0x8549) (1,0x8442) (1,0x849f)
0x839c      *** TRUNCATED (0x80) ***
```

### 8.2 Why the menu framing is the right one

Five independent facts, none of which is "the tests pass":

1. **The phantom operand code is the destination address.** Under the old frame the following
   `GOTO`'s operand *code* byte is `121` (DoK) and `152` (Pools). Those are the low bytes of
   `0x7f79` and `0x0098` — the menu destination the new frame reads. An operand code of 121 or 152
   is not a legal code at all.
2. **The next instruction reads that same cell.** In both titles the byte immediately after the
   menu is `0x25 ON_GOTO`, whose selector operand is *the identical address* the menu writes, and
   whose target count equals the menu's count operand. Menu-then-dispatch is a mutual reference the
   old frame cannot produce.
3. **`0x7f79` is already the project's known menu destination**, asserted independently by the
   Gateway `HORIZONTAL_MENU` golden in `dungeonEvents.test.ts` (`destAddr: 0x7f79`). Two titles,
   two opcodes, one convention.
4. **The items decode to coherent player verbs**, and the counts match: DoK ×2 `RETREAT/ATTACK`,
   Pools ×4 `ATTACK/FLEE/TALK/WAIT`. Across the corpus the SHORT titles unpack **DoK 142/142** and
   **Pools 491/491** inline items to real labels. Pool of Radiance — a LONG title, correctly still
   `SPRITE_OFF` — gives 100/161 with desync garbage, the expected negative control.
5. **The dispatch targets are corroborated by an existing golden.** DoK's `ON_GOTO` item-1 target
   `0x87bc` loads `0x46 ×6 / 0x2b ×10 / 0x42 ×6`, exactly the `{70,6},{43,10},{66,6}` roster the
   *already-passing* east-facing ambush golden asserts.

Under the old frame both sites truncate within a handful of bytes. Under the new one every byte is
consumed and the flow lands on a valid dispatch.

### 8.3 What this changed

| | candidates | rostered | truncated |
| --- | ---: | ---: | ---: |
| Death Knights of Krynn | 166 → **185** | 154 → **172** | 50 → **74** |
| Pools of Darkness | 362 → **403** | 329 → **371** | 15 → **16** |

**The rising truncation count is not a regression.** Decoding the menus makes previously
unreachable code reachable, and some of *that* code contains bytes the Python scanner still cannot
frame. A scan that stops at instruction 3 truncates once; a scan that gets to instruction 300
truncates more. Candidates and truncations rising together is the signature of exploring further.
The remaining DoK/Pools long tail (`0x80`, `0x9c`, `0x4d`, …) is unanalysed and stays declared.

### 8.4 Two goldens were corrected, not accommodated

Both had encoded the skipped-menu artifact, and both are now fixed with the byte evidence recorded
inline in the diff:

- `dungeonEvents.test.ts` — the DoK non-east ambush asserted `kind: 'end'` and rationalised the
  silence as "the ambush stays armed". Retail presents `RETREAT`/`ATTACK` and waits.
- `poolsWildernessRoute.test.ts` case J(f) — asserted the distant arm "dies on a GOTO target our VM
  cannot resolve", pinning an `unhandled` opcode-`0x01` effect. That unresolved GOTO *was* the
  mis-framing. It is gone, and the case now asserts the four-way menu plus a FLEE/ATTACK
  discriminating control on the same cell and roll.

Neither golden was changed to make a suite green; each changed because the retail bytes say the old
assertion was wrong. The `poolsWildernessRoute` route verdict is unaffected — the proven leg is the
RANDOM-driven ambush arm, not this player choice, which remains explicitly outside it.

### 8.5 Scope

Applied to the Gen1-SHORT dialects only (`ECL_GEN1_SHORT` and, by inheritance, Gateway, Treasures
and Pools — the latter two now **merge** the base `opcodeOverrides` instead of replacing it, which
previously would have silently dropped the inherited entry). The LONG dialects keep `SPRITE_OFF`.
`tools/test_goldbox_corpus.py` carries a parity test that fails if the Python and TypeScript tables
disagree; it was proved to fail on both an invented opcode and a wrong `wordSet` before being
trusted, and it resolves dialect inheritance so a merged override cannot satisfy it vacuously.
