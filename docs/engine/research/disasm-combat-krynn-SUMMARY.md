# Combat Decompilation — Krynn Trilogy Synthesis (RE.1)

**Question that triggered this work:** were the tactical-combat mechanics in
`packages/engine/src/combat/tactical.ts` *guessed*, *borrowed from a sibling game*, or
*decompiled from the actual Krynn games?* Answer before RE.1: borrowed from the **COAB**
decompile (Curse of the Azure Bonds, a different Gold Box game) and **assumed** to transfer.
RE.1 closes that gap by disassembling **each Krynn game's OWN binary** and confirming or
refuting every mechanic against the real machine code.

## Method (clean-room)

One subagent per game stood up a 16-bit real-mode disassembly (capstone `CS_MODE_16`) of the
game's own executable and located combat routines by **string-xref anchoring** (find a combat
string's file offset → the immediate the code `push`es to print it → the call site is inside the
combat routine). COAB's decompile (`coab_extracted/`) was used only as a **map of what to look
for** (function names, struct-field meanings) — no third-party source was copied. Tools:
`tools/disasm_cok.py`, `tools/disasm_dok.py`, `tools/disasm_dqk.py`. Per-game detail:
`disasm-combat-cok.md`, `disasm-combat-dok.md`, `disasm-combat-dqk.md`.

## Container formats (verified)

| Game | Binary | Container | Combat code |
| --- | --- | --- | --- |
| CoK | `Champions of Krynn/GAME.OVR` | Borland **FBOV** VROOMM overlay pool (8-byte header + concatenated 16-bit far segments); `INT 3Fh` thunks live in `START.EXE` | combat overlay @ file `0x8A46`–~`0x18000`; movement `0x10F30`–`0x12314`; to-hit/attack `0x14F24`–`0x1785A` |
| DoK | `Death Knights of Krynn/GAME.OVR` | same **FBOV** overlay pool | death `0x8832`, morale `0xB4D2`, move-cost `0x1E2A2`, attack-split `0x13E2E` |
| DQK | `The Dark Queen of Krynn/DQK.EXE` | plain MZ (load image ends `0x218D5`) + **~312 KB Borland overlay tail** (NOT `INT 3Fh`; far-call vector tables); no paging from DISK1/2/3 | combat code `0x50000`–`0x62FFF`, string pool `0x63000`–`0x6C800` |

## Verdict matrix (each mechanic vs the game's OWN code)

| Mechanic (as implemented in `tactical.ts`) | CoK | DoK | DQK |
| --- | --- | --- | --- |
| **Initiative** = stored byte, ×2 hasted / ÷2 slowed, sorted high-first, no per-round d10 | ✅ VERIFIED (struct +0x198) | ✅ haste×2/slow÷2 verified; sort UNLOCATED, no d10 found | ❔ UNLOCATED — *first-pass "0–9 inverted speed" was REFUTED (RE.2 §8): that string is a global game-speed/animation UI setting, not per-combatant initiative.* No init field found → keep Gen1 model |
| **Diagonal move** = **2×** for gen1 (half-steps: ortho 2, diag **4**); gen2 provisional 1.5× | ✅ **VERIFIED 2× (RE.6)** — half-step **unit** (ortho=2; `0x10F30`/`0x11720`) **and diagonal = 4 (2×/Manhattan)** both confirmed in CoK's own movement handler `0x118D8` (`sub [0x6b3b],4` + `sub es:[di+0x18d],4` + `sub es:[di+0x18e],4` + `sub [0x6b2e],4`), reached via RE.5's flattened FBOV call table. The COAB-assumed **1.5× (diag=3) is refuted for Gen1.** `tactical.ts` corrected: gen1 diagCost=4 | ✅ half-step unit verified (ortho=2); shares Gen1 engine → 2× | ❔ UNLOCATED — gen2 keeps 1.5× provisionally |
| **Death** = unconscious at 0 HP; dead only if one hit does `dmg > hp+10` | ✅ VERIFIED | ✅ **byte-identical** | ⚠️ **DIFFERS (one fact)** — the `hp+10` literal is ABSENT (0 `add ax,0Ah` vs CoK 5 / DoK 4). *First-pass "7/12/14 threshold death table" was REFUTED (RE.2 §8): that routine is an affliction ticker.* **RE.4 LOCATED the HP/death site:** HP = unsigned word **+0x4c** (damage-decremented 0x5F784; HP≤0 down-check `cmp es:[bx+0x4c],0; jbe` 0x5F733; all-dead scan exits combat) — HP=0 = down, no negative buffer. Distinct DEAD-vs-unconscious state write still UNLOCATED. gen2 unchanged (corroborates "no +10") |
| **Attacks/round** = fractional, stored in half-units (3/2 → 2,1,2,1…) | ❔ **UNLOCATED (RE.3, confirmed)** — DoK's `field/2 + &1 → 2 globals` split is **provably absent** from CoK's `GAME.OVR` (exhaustive byte scan: 0 matches); CoK field `0xFF` = **damage bonus**, not half-attacks; swing-count is cross-thunked (`lcall 0x116/0xDB/0xE6`). Rule confirmed for the generation by DoK | ✅ VERIFIED (field `0xFF`, `/2` whole, `&1` half) | ❔ UNLOCATED |
| **Morale** = `(ctrl & 0x7F)*2` %, fails below %HP-lost, broken unit flees | ✅ VERIFIED (clamp 102) | ✅ VERIFIED | ⚠️ **DIFFERS in evaluation** — `field0x38 & 0x7F` mask shared, but `== 6` disposition + `ds:0x13CC` reaction table + pool@+0x8B (seed 20). **RE.4 LOCATED the flee consumer:** file 0x8576 rolls **1d20 vs the +0x8b pool** (`pool>roll → flee`, nat-1/nat-20 edges; flee action 0x819b) — a **verified probabilistic divergence** from Gen1's deterministic %. **But not yet faithfully encodable** (the +0x8b derivation is INFERRED + polarity inverted vs our `morale`) → keep Gen1 model for now |

Struct field offsets differ per game even where the algorithm is identical (e.g. HP: CoK +0x197,
DoK +0xD6, DQK +… ; morale: CoK +0xE7, DoK +0x3E, DQK +0x38). The math, not the layout, is what
`tactical.ts` encodes — so the offset differences don't affect the engine.

## Conclusions

1. **Gen1 (CoK + DoK): the engine is now verified against the originals, not assumed.** Death,
   morale, and stored-initiative are confirmed in CoK's own bytes; **RE.3 adds CoK's movement
   half-step unit (ortho=2) and RE.6 the diagonal cost (= 4, 2×/Manhattan)**. DoK additionally
   confirms the fractional-attack split and shares the Gen1 movement engine. Between the two Gen1
   binaries, every mechanic in `tactical.ts` is accounted for. **One Gen1 correction made (RE.6):**
   the engine's COAB-assumed 1.5× diagonal (diag=3) was **wrong for Gen1** — CoK's own movement
   handler `0x118D8` pays **4 half-steps (2×)** on both axes, so `tactical.ts` now uses diagCost=4
   for gen1. CoK's own swing-count site stays UNLOCATED (cross-thunk) even though DoK confirms the
   half-unit rule for the generation.
2. **Gen2 (DQK): one verified divergence, the rest UNLOCATED — do NOT re-guess.** A deeper RE.2
   trace (see `disasm-combat-dqk.md` §8) **walked back two first-pass claims**: the "0–9 inverted
   speed initiative" is a **global game-speed/animation UI setting**, not per-combatant initiative;
   and the "7/12/14 threshold death table" is an **affliction ticker**, not the death handler. The
   **only** verified Gen2 combat divergence is that the Gen1 `hp+10` overkill-death literal is
   **absent** (byte scan: `add ax,0Ah` occurs 5× in CoK / 4× in DoK / **0×** in DQK). DQK's real
   death trigger and its morale flee-emit live in **resident code** and remain UNLOCATED. So RE.2
   forks only that one fact behind a `ruleset: 'gen1' | 'gen2'` flag and keeps Gen1 initiative/morale
   for DQK pending verification — *not* an invented Gen2 table.
3. **Remaining unknowns (honest):** CoK's **fractional-attack** swing-count site (cross-thunked
   overlay, UNLOCATED) — DoK verifies the fractional-attack rule for the shared Gen1 engine, so the
   *rule* is confirmed for the generation if not yet pinned in CoK's own listing. (The diagonal-cost
   discrepancy is now CLOSED by RE.6: Gen1 = 2×, verified in CoK's own bytes.)
   For DQK: the real death trigger, haste/slow on turn order, fractional attacks, diagonal cost,
   and the morale flee-emit are all UNLOCATED (most live in DQK's resident, non-overlay code).

## Follow-ups (BUILD-QUEUE)

- **RE.2** ✅ — added the `ruleset: 'gen1' | 'gen2'` fork and implemented the one verified Gen2
  divergence (DQK drops the `+10` overkill-death rule → downed = unconscious). DQK fights pass `gen2`.
- **RE.3** ✅ — traced CoK's movement (half-step unit **ortho=2 VERIFIED**; located diagonal = **4
  (2×)**, so the COAB diag=3/1.5× is **refuted/unlocated** in CoK's listing) and searched all
  `GAME.OVR` overlays for the fractional-attack split (**provably absent** → CoK swing-count stays
  UNLOCATED, cross-thunked; field `0xFF` is the damage bonus). See `disasm-combat-cok.md` §3.4/§5/§6/§8.
- **RE.4 (new, needs resident-code trace)** — DQK's actual death trigger, turn-order/haste-slow,
  fractional attacks, and morale flee-emit live outside the combat overlay; pin them before
  modelling a fuller Gen2 ruleset.
- **RE.5** ✅ — reconstructed START.EXE's FBOV call table (542 `CD 3F` thunks: 35 descriptor headers
  tiling GAME.OVR + `jmpcnt` 5-byte entry stubs). `disasm_cok.py resolve/thunk/overlays` flattens
  `lcall seg,off` → `overlay_base(sel)+proc_off` (validated 18/18 + 14/14 vs Borland prologues).
- **RE.6** ✅ — used RE.5's call table to reach CoK's movement handler `0x118D8`: diagonal pays **4
  half-steps (2×/Manhattan)**, not 1.5×. **Gen1 diagonal corrected to diagCost=4** in `tactical.ts`;
  gen2/DQK keeps 1.5× provisionally (still UNVERIFIED — its movement cost lives in resident code).
- **RE.4** ✅ — traced DQK's resident-code combat (`disasm-combat-dqk.md` §9). **Located/VERIFIED:**
  HP = unsigned word at **+0x4c** (damage-decremented at 0x5F784; HP≤0 down-check `cmp es:[bx+0x4c],0;
  jbe` at 0x5F733; all-dead scan exits combat) → closes OQ-3; **morale flee = 1d20-vs-pool** at file
  0x8576 (`roll_dice(1,20)`; `cmp es:[bx+0x8b], roll; pool>roll → flee`, nat-1/nat-20 edges; flee
  action 0x819b) → closes OQ-5. **Still UNLOCATED:** haste/slow modifier (no write to the +0x37
  turn-key in the overlay), fractional 3/2 attacks, and the distinct DEAD-vs-unconscious state write.
  **Engine: UNCHANGED this slice** (docs-only) — Target 1 only *corroborates* the existing gen2 (no
  +10 death); Target 4's morale is verified-different but **not yet faithfully encodable** (the +0x8b
  pool's `ds:0x13CC` derivation is INFERRED and its polarity is inverted vs our `morale` field), so
  mapping it now = approximation. Independently spot-verified the offsets before accepting them.
