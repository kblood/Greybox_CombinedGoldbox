# In-Combat Spell Resolution — Disassembly Findings (Krynn Trilogy)

> **CoK overlay resolution update, 2026-09-08:** unpacked START contains direct
> overlay file offsets in its descriptors. The checked reader
> `tools/borland_overlay.py` validates 34 descriptors, 504 stubs and 5529 relocation
> words. E6's file base is `0x365A6`; the older prologue-voting discussion below
> left it unresolved. E6:70 now resolves to item unlink/free at `0x37C3D`.
> See [the descriptor evidence](cok-memorization-menu-next.md).
> This updates call resolution, not the historical spell-damage conclusions.

> ## ⚠️ CORRECTION (lead spot-verification, 2026-06-23) — the "Gen1 spell-damage formula" is MISIDENTIFIED
> The headline below ("Gen1 (CoK/DoK) does NOT use dice; it uses a scripted `(level+K)·HD/count`
> formula at DoK `0x27109`–`0x2735b`") **did not survive independent verification and must NOT be
> encoded as spell damage.** I re-disassembled the routine myself. What it actually is:
> - It loops an index `i = [bp-6]` over **up to 8 categories**, using `i` BOTH as the array iterator
>   (`es:[di+0x45]`, `di=[bp-0xb]+i`) AND as the `switch(i)` selector — so `i` is a **slot/category
>   index, not a `spell_type`**. There is **no spell string in the routine** and no `roll_dice` call.
> - The accumulated constants are **XP-magnitude**: `level*9 + 0x48 (72)`, `level*11 + 0x58 (88)`,
>   a flat `0x70 (112)`, etc. (1e spell damage is ~1–60 HP; these reach the hundreds–thousands.)
> - The tail (`0x27364`) **divides the accumulated total by a count** — i.e. *split among recipients*.
> - `Σ (base + per-HD increment) over ≤8 monster categories, capped per category, then divided` is the
>   classic Gold Box **end-of-combat XP / encounter-value award**, NOT per-target spell damage.
> **Conclusion:** the gen1 in-binary *spell-damage* path is **UNLOCATED** (cross-overlay), like the save
> resolver, range, and AoE fields. This is the 3rd first-pass over-attribution in Phase RE (cf. RE.2's
> affliction-ticker, RE.3's diagonal); verifying first prevented encoding an invented mechanic. The
> genuinely-useful results here are retained: the DoK "Begins Casting" anchor, the cross-overlay save
> call site (`lcall 0xcf,0x124`), and the DQK `roll_dice` anchor (`0x598bf`) confirming **gen2 IS
> dice-based**. Everything tagged "VERIFIED formula" in §2/Gen1 below should be read as **UNVERIFIED /
> likely-XP** until a proper anchor + data dump (DS:0x72a4, DS:0xc36) ties it to a spell.

**Research gate:** CT.4 — faithful in-combat spellcasting implementation.
**Scope:** Six mechanics pinned per game — saving throw, damage dice, range, AoE, Sleep
HD cap, gen1 vs gen2 divergence — using each Krynn game's OWN binary only.

**Clean-room method:** COAB decompile and `docs/engine/research/combat-mechanics-coab.md`
used only as a map of what to look for (routine names, struct field semantics). All
offsets below were read from the Krynn games' own binaries via
`tools/disasm_cok.py` / `tools/disasm_dok.py` / `tools/disasm_dqk.py` (capstone 16-bit
real mode). No third-party source was copied.

**Legend for verdict column:** VERIFIED (byte-confirmed, quoted bytes + offset) /
INFERRED (strong structural evidence, not byte-confirmed) / UNLOCATED (not found; using
hackdoc/AD&D 1e standard as fallback label, not implemented assumption).

---

## 1. Saving Throw Mechanic

### Summary verdict table

| Mechanic | CoK | DoK | DQK |
|---|---|---|---|
| d20-vs-table roll site | UNLOCATED (cross-thunk call, cannot follow flat tool) | INFERRED — call at file 0x27132; target `lcall 0xcf, 0x124` is cross-overlay, UNLOCATED | UNLOCATED |
| Save table in-binary | UNLOCATED | UNLOCATED | UNLOCATED |
| Save type (negate vs half-damage) encoding | INFERRED from hackdoc field | INFERRED from hackdoc field | INFERRED from hackdoc field |

### DoK save call site (VERIFIED in DoK, INFERRED for CoK/Gen1 pattern)

At DoK file `0x27109`–`0x27137` (function starting at `0x270f4`, called from the
damage-dispatch entry point `0x27043 call 0x270f4`):

```
027128  push word ptr [bp + 8]      ; spell type arg
02712b  push word ptr [bp + 6]      ; target combatant far ptr
02712e  mov al, byte ptr [bp - 6]   ; spell_type_index (0–7 per HD table)
027131  push ax
027132  9a 24 01 cf 00  lcall 0xcf, 0x124   ; <<< SAVING THROW RESOLVER — cross-overlay, UNLOCATED target
027137  88 46 fb        mov byte ptr [bp - 5], al  ; result = caster level / count (used as dice multiplier)
```

**Reproduce:** `python tools/disasm_dok.py dis 0x27128 0x20`

The saving throw resolver is an **inter-overlay call** (`lcall seg,off`) that the flat
`disasm_dok.py` tool cannot follow (it does not reconstruct the FBOV segment map
dynamically). The return value in `al` feeds into all subsequent damage formulae as the
"caster level" multiplier.

### Save type encoding — INFERRED from hackdoc

`hackdocs_extracted/CKITFORM.TXT` (offset 6686) documents spell record offset 10:

```
Offset 10   Save Allowed:
    0 = No Save Allowed
    1 = Save to Negate Spell
    2 = Save for Half Damage
    3 = Special Save
```

Offset 12: `0 = save vs. Poison; 4 = save vs. Spell (non-poison)`.

These are CKIT.EXE editor fields for the same game-engine family. Their reflection in
the Krynn game binaries' own spell-data structures is **UNLOCATED** (the in-binary
spell data structures use an 11-byte record stride in DoK, distinct from CKITFORM's
22-byte editor record — see §5 Spell Data Table below). The semantic mapping is
**INFERRED** to be the same engine family.

### Half-damage `shr ax,1` — UNLOCATED in-binary

The "save for half damage" `shr ax,1` instruction was **not found** as a literal in
the reachable DoK/CoK/DQK code. The saving throw resolver (at the cross-overlay
`lcall 0xcf, 0x124`) is the most likely site; its body is UNLOCATED. **Use INFERRED
semantics from hackdoc field 10 value 2 = half damage.**

---

## 2. Damage Dice per Spell

### Gen1 (CoK/DoK) — scripted formula dispatch, NOT dice rolls

**Key finding:** Gen1 does NOT call `roll_dice` for individual spell damage.
Instead, the function at DoK `0x270f4` iterates over up to 8 target slots and
accumulates a **fixed formula** based on `spell_type` (0–7) × `caster_level` + constant,
then divides by count affected to get per-target damage. This is a **scaling formula**
system, not a standard nXdY dice system.

**VERIFIED: DoK damage dispatch, file `0x27109`–`0x2735b`**

Reproduce: `python tools/disasm_dok.py dis 0x27109 0x260`

Variable key:
- `[bp-6]` = spell_type index (0–7, read from `DS:0x72a4` HD-cap table index)
- `[bp-5]` = result of saving throw call (used as "caster level / count")
- `es:[di+0x45]` = target's HD (Hit Dice / level), combat struct field `+0x45`
- `[bp-4]` = accumulated damage total
- `[bp-2]` = count of targets affected

#### Spell-type formula table (VERIFIED from DoK binary, file 0x271xx)

Two code paths exist: targets **below** the HD cap (affected) and targets **at or
above** the HD cap (different scaling — see §3 HD immunity).

**Affected-target path (HD < cap):**

| spell_type | Formula | File offsets |
|---|---|---|
| 0 | `([bp-5]+8) * HD * 1` | `0x27162`–`0x271a7` |
| 1 | `(+8)*(HD+1)*1` when `es:[di+0x23]<=4`; else `(+8)*HD*1` | `0x27162`–`0x271a7` |
| 2, 3 | `([bp-5]+0xa) * HD * 1` (×1.0, flat) | `0x271d5`–`0x271f1` |
| 4 | `([bp-5]+8) * (HD+1) * 1` | `0x27217`–`0x27238` |
| 5 | `([bp-5]+4) * HD * 1` | `0x2723a`–`0x2725a` |
| 6 | `([bp-5]+6) * HD * 1` | `0x2725c`–`0x2727b` |
| 7 | `([bp-5]+0xa) * HD * 1` (same as 2/3) | `0x271f4`–`0x27215` |

**Immune-target path (HD >= cap — still receive partial effect):**

Different scaling constants. At `0x2727f`–`0x2735a`:

| spell_type | Formula (cap_excess = `HD - cap_value + 1`, `[bp-7]`) |
|---|---|
| 0 | `cx = excess<<1; ax = level*9 + 0x48; total += ax+cx` |
| 1 | `total += 0x70` (flat 112) |
| 2, 3, 7 | `cx = excess*3; ax = level*9 + 0x5a; total += ax+cx` |
| 4 | `cx = excess<<1; ax = level*11 + 0x58; total += ax+cx` |
| 5 | `cx = excess; ax = level*11 + 0x2c; total += ax+cx` |
| 6 | `cx = excess<<1; ax = level*10 + 0x3c; total += ax+cx` |

**Final average** (at `0x27364`–`0x27382`):
```
027364  cmp [bp-2], 0     ; if count_affected > 0
027368  jbe 0x2737d
02736a  mov al, [bp-2]
02736d  mov cx, ax
027371  mov ax, [bp-4]    ; total_damage
027374  xor dx, dx
027376  div cx            ; ax = total / count  <-- per-target damage
027378  mov [bp-4], ax
```

**Interpretation:** the "damage" is an accumulated pool divided by the number of targets
hit. This is not dice-per-target but a shared pool.

### Gen2 (DQK) — mixed: `roll_dice` VERIFIED for one spell class

**VERIFIED: DQK `roll_dice(1,6)` in spell area, file `0x598b9`–`0x598c6`:**

```
0598b9  mov al, 6
0598bb  push ax             ; sides = 6
0598bc  mov al, 1
0598be  push ax             ; count = 1
0598bf  9a 68 19 8f 04  lcall 0x48f, 0x1968   ; roll_dice(1, 6) → 1d6
0598c4  pop cx
0598c5  pop cx
0598c6  push ax             ; result pushed for further use
```

Reproduce: `python tools/disasm_dqk.py --disasm 0x598a7 --len 0x70`

The `roll_dice` function address `0x48f:0x1968` is the same as identified in prior RE
work (DQK RE.4; morale roll used `0x48f:0x1968` for d20). This `1d6` call is in the
region `0x5598a7`–`0x5990f` that handles a healing or moderate damage spell class
(the code at `0x5598ab` reads `es:[bx+0x40]` then `es:[bx+0xb]`/`es:[bx+0xd]` — spell
record fields 0x0b/0x0d). The `add dx, 9` at `0x5998da` after accumulating dice results
suggests a base-9 offset, consistent with a Cure Light Wounds (1d8 + base) pattern.

**The full DQK spell damage dispatch is UNLOCATED** — the function containing the
`roll_dice(1,6)` call is a leaf (ends `retf` at `0x59990f`) and its callers in the
larger spell-resolution flow were not pinned in this pass.

### Hackdoc corroboration for AD&D 1e dice (INFERRED for in-binary)

`hackdocs_extracted/SPELLEFF.TXT` (same engine family, UA/FRUA):

| Spell | Dice documented |
|---|---|
| Magic Missile | 1d4+1 per 2 caster levels |
| Fireball | 1d6 per caster level |
| Lightning Bolt | 1d6 per caster level |
| Cone of Cold | 1d4+1 per caster level |
| Ice Storm | 3d10 (NOT cold damage — mundane) |
| Cure Light Wounds | 1d8 |
| Cure Serious Wounds | 2d8+1 |
| Cure Critical Wounds | 3d8+3 |

**These are INFERRED** as the Krynn in-binary dice — the Gen1 binary uses a formula
dispatch (no dice rolls), and DQK's full dice dispatch is UNLOCATED. The hackdoc values
are AD&D 1e standard and likely match.

---

## 3. HD Immunity / Sleep Cap

### VERIFIED: DoK HD cap table at DS:0x72a4

At DoK file `0x27140`–`0x27157` (inside the function at `0x270f4`):

```
027140  8a 95 a4 72     mov dl, byte ptr [di + 0x72a4]  ; HD cap from per-spell-type table
027144  8a 46 fa        mov al, byte ptr [bp - 6]        ; spell_type index
027147  98              cwde
027148  c4 7e f5        les di, ptr [bp - 0xb]           ; target combatant far ptr
02714b  03 f8           add di, ax
02714d  26 8a 45 45     mov al, byte ptr es:[di + 0x45]  ; target HD/level
027151  3a c2           cmp al, dl                       ; HD vs cap
027153  72 03           jb 0x27158                       ; HD < cap → fully affected
027155  e9 27 01        jmp 0x2727f                      ; HD >= cap → reduced effect (not immune!)
```

Reproduce: `python tools/disasm_dok.py dis 0x27140 0x20`

**Key finding:** targets whose HD >= the cap are NOT fully immune — they receive a
**reduced damage** (the immune-target formula at `0x2727f`–`0x2735a`, documented in §2).
True immunity only if the immune-path formula also produces 0.

The DS:0x72a4 table is indexed by `spell_type` (0–7). Its contents were not dumped in
this pass — **the exact HD cap per spell type at 0x72a4 is UNLOCATED** (the table is
in the DS data segment of the DoK overlay; a data dump command against the loaded
binary would be needed, not a disasm).

**For Sleep:** Sleep is not one of the 8 spell-types in this `0–7` dispatch system.
Based on hackdocs, Sleep is AoE type 9 (Small Area), which falls under a different
dispatch path (the CKITFORM AoE=9 branch). The HD cap for Sleep (targets of >4 HD are
immune — AD&D 1e rule) is **UNLOCATED** in the Krynn binaries in this pass.

---

## 4. Range (Game Distance Units)

### UNLOCATED in binary for all three games

The range parameter is in the **spell data table** (CKITFORM offset 3 = base range in
squares, offset 4 = variable range per level). The in-binary spell data is INFERRED
to use the same field layout, but the exact in-binary spell data blocks were not
dumped in this pass.

### INFERRED from hackdoc (CKITFORM.TXT §6620)

```
Offset 3  Base range in squares. 255 = Touch spell.
Offset 4  Variable range (1 square per level).
          Special: 12 = Dimension Door, 16 = Minor Globe of Invulnerability
```

Range unit = **1 combat square** (the map grid unit). Touch spells (Cure spells) = 255.
Variable range adds 1 square per caster level.

---

## 5. AoE Shape and Constants

### VERIFIED: DQK AoE type-9 check in spell resolver

At DQK file `0x596b4` and `0x596da`:

```
0596b4  cmp word ptr es:[bx + 0x64], 9   ; spell AoE field == 9 (Small Area)?
0596b9  jne 0x5969d
```

Reproduce: `python tools/disasm_dqk.py --disasm 0x596b4 --len 0x30`

The field `es:[bx+0x64]` is offset `0x64` (100 decimal) in the DQK spell record
structure — substantially larger than CKITFORM's 22-byte record (the DQK in-binary
spell records are a different / expanded layout). This confirms the AoE type field
exists and value 9 = Small Area is tested in the DQK engine.

### AoE type encoding — INFERRED from CKITFORM (spell record offset 7)

From `hackdocs_extracted/CKITFORM.TXT` (line 6640):

| Value | AoE type | Example spells |
|---|---|---|
| 0 | No target / camp-only | — |
| 1–3 | 1-2 / 1-3 / 1-4 random targets | — |
| 4 | Single target | most offensive/buff spells |
| 5 | 1-5 targets (with range constraint) | Faerie Fire, Charm Monsters |
| 6 | 1-3 targets | Hold Person (Cleric) |
| 7 | 1-4 targets | other Hold spells |
| 8 | Line/Cone | Lightning Bolt, Cone of Cold, Fear, Meteor Swarm |
| 9 | Small Area | Sleep, Stinking Cloud, Dispel Magic, Cloudkill, Death Spell |
| 10 | Medium Area | Bless, Curse, Haste, Slow, Ice Storm, Mass Invisibility |
| 11 | Large Area | Fireball, Confusion, Delayed Blast Fireball |
| 31 | Special | Silence 15' Radius |
| 240 | Special | Snake Charm / Barkskin |

**Canonical spell AoE types:**
- Fireball = 11 (Large Area)
- Lightning Bolt = 8 (Line/Cone)
- Cone of Cold = 8 (Line/Cone)
- Ice Storm = 10 (Medium Area)
- Sleep = 9 (Small Area)
- Magic Missile = 4 (Single — one per target up to level limit)

These are INFERRED for the Krynn in-binary spell records (field `+0x64` in DQK;
UNLOCATED at field `+7` in Gen1 records).

---

## 6. Spell Data Table Location

### DoK (Gen1) — INFERRED: 11-byte records at DS:0x0c36

From the spell-select function at DoK `0x1be80`–`0x1bfad` (located via the
`"Begins Casting"` anchor), DoK fetches spell data with stride `mul 0x0B`:

```
[spell_index * 11 + 0xc36] = spell data record base
```

This is a **16-bit DS-relative table** (data segment, not code segment). The 11-byte
record stride differs from CKITFORM's 22-byte editor record (CKITFORM is the CKIT.EXE
level-design tool, not the game binary). Exact field layout within the 11-byte record
is **UNLOCATED** for this pass.

### CoK (Gen1) — INFERRED: stride-16 table at DS:0x31bd

From CoK spell-select function `0x1be80`:

```
[spell_index * 16 + 0x31bd] = spell data record base
```

CoK uses a different stride (16) than DoK (11). Field layout **UNLOCATED** for this pass.

### DQK (Gen2) — UNLOCATED table base; field `+0x64` confirmed

DQK's spell struct offset `+0x64` (AoE type) is confirmed by the in-binary check at
`0x596b4`. The spell record base address and full layout are UNLOCATED. DQK's spell
records are significantly larger than Gen1 (at least 101 bytes, given offset 0x64).

---

## 7. Gen1 vs Gen2 Divergence Summary

| Item | Gen1 (CoK/DoK) | Gen2 (DQK) |
|---|---|---|
| Damage system | Scripted formula: `(level+K) * HD_factor`, iterated over 8 slots, pool-divided | Mixed: `roll_dice()` confirmed for one class; full dispatch UNLOCATED |
| `roll_dice` in spell code | NOT FOUND — no dice call in located spell area | VERIFIED at file `0x598bf` for `1d6` |
| HD cap check | VERIFIED: `DS:0x72a4` table, per type 0–7, field `es:[di+0x45]` | UNLOCATED |
| AoE type field | In DS record (stride 11 for DoK, 16 for CoK); field offset UNLOCATED | VERIFIED: field `es:[bx+0x64]`, value 9 = Small Area |
| Saving throw call | INFERRED: `lcall 0xcf,0x124` in DoK; UNLOCATED target | UNLOCATED |
| Spell data stride | DoK: 11 bytes/record at DS:0xc36; CoK: 16 bytes at DS:0x31bd | UNLOCATED; record >= 101 bytes |
| `cmp byte ptr [di+0x23], 4` | DoK 0x27165 — spell level check (≤4 vs >4) affects type-0 formula | UNLOCATED equivalent |

---

## 8. What CT.4 Can Faithfully Implement Now

### Can implement with VERIFIED confidence

1. **DoK/CoK (Gen1) damage dispatch structure:** a per-spell-type (0–7) formula driven
   by `caster_level` × `target_HD`, accumulated over up to 8 target slots and divided
   by count affected. The formula constants per type are confirmed (§2 table above).
   *Caveat:* the mapping from named spell IDs (Magic Missile=15, Fireball=47, etc. per
   `hackdocs_extracted/SPELLS.TXT`) to `spell_type` 0–7 is **UNLOCATED**. The
   type-to-spell mapping must use the hackdoc spell record field (INFERRED, not verified
   in-binary for this pass).

2. **DoK HD cap check structure:** HD cap from per-type table, compared against
   `es:[di+0x45]`; targets at or above cap receive a reduced (not zero) damage from
   the alternate formula constants. CT.4 should implement two damage paths, not an
   immunity gate.

3. **DQK uses `roll_dice(sides, count)` for at least one spell class.** The exact
   calling convention is `push sides; push count; lcall roll_dice` (push order: sides
   first, count second — confirmed by both the morale d20 and this 1d6 call).

### Must keep as INFERRED (not yet byte-confirmed)

4. **Saving throw:** implement as `roll 1d20; compare vs class/level table; result
   drives negate-or-half-damage per spell record field`. The d20 roll exists (roll_dice
   called inside the cross-overlay save resolver), but exact table layout and
   negate-vs-half branching within the resolver are UNLOCATED. Use hackdoc
   field-10 values (0=none, 1=negate, 2=half, 3=special).

5. **AD&D 1e dice (Fireball 1d6/level, Cone of Cold 1d4+1/level, etc.):** these
   match SPELLEFF.TXT (same engine family) and are INFERRED. Gen1 Gen1 does not dice
   these spells (it uses a formula system instead), so the dice values apply most
   directly to Gen2 (DQK). Gen1's formula system produces numerically similar results
   (it encodes the expected damage range implicitly).

6. **Sleep HD cap of 4:** AD&D 1e rule, corroborated by hackdoc AoE-type 9 routing.
   Not byte-confirmed in-binary. Implement with explicit note that it is INFERRED.

### Must mark UNLOCATED — do not implement without further RE

7. **Spell-type-to-spell-ID mapping** (which named spell maps to type 0–7): needs a
   data-dump pass of DoK DS:0x0c36 (11-byte records) and CoK DS:0x31bd (16-byte records).

8. **Half-damage `shr` site:** not found; lives inside the cross-overlay save resolver.

9. **DQK full spell damage dispatch:** the containing function of the `roll_dice(1,6)`
   call needs caller-tracing (UNLOCATED for this pass).

---

## 9. Open Questions / Unknowns

| # | Unknown | Impact on CT.4 |
|---|---|---|
| OQ-1 | Saving throw table exact byte location in CoK/DoK/DQK | Cannot verify d20 bounds without it; use INFERRED AD&D 1e table |
| OQ-2 | DS:0x72a4 table contents (HD cap per spell_type 0–7 in DoK) | Need data dump, not disasm — requires loading DoK at runtime |
| OQ-3 | Spell-type-to-spell-ID mapping in Gen1 records | Cannot confirm which of types 0–7 = Fireball, Lightning, etc. |
| OQ-4 | Gen1 11-byte (DoK) / 16-byte (CoK) spell record field layout | Needed to read AoE, range, save-type from game data |
| OQ-5 | DQK full spell damage dispatch (caller of the `1d6` area) | Need to trace callers of `0x5598a7`–`0x5990f` |
| OQ-6 | Half-damage branch inside `lcall 0xcf, 0x124` (DoK save resolver) | Needed to confirm `shr ax,1` vs other halving mechanism. §25: DoK resolver now ported+validated, but `0xcf` itself still UNRESOLVED (rigorous negative, not untried); likely the same routine as CoK's `0xe6` (§15 rear-arc gate) |
| OQ-7 | CoK spell resolution (is it byte-identical to DoK or distinct?) | CoK and DoK are Gen1 siblings; INFERRED identical; not yet confirmed |

---

## 10. Reproduce Commands

All commands run from `C:\Modding\GoldBox`.

```bash
# DoK saving throw call site
python tools/disasm_dok.py dis 0x27128 0x20

# DoK full damage dispatch (spell type 0–7, affected + immune paths)
python tools/disasm_dok.py dis 0x27109 0x260

# DoK HD cap check
python tools/disasm_dok.py dis 0x27140 0x20

# DoK damage average / divide-by-count-affected
python tools/disasm_dok.py dis 0x27361 0x30

# CoK spell dispatch (maps spell IDs to effect constants in [bp-0x66])
python tools/disasm_cok.py dis 0x28b0 0x150

# DQK AoE type-9 check (Small Area)
python tools/disasm_dqk.py --disasm 0x596b4 --len 0x30

# DQK roll_dice(1,6) in spell area
python tools/disasm_dqk.py --disasm 0x598a7 --len 0x70

# DQK broader spell context (AoE walk + save logic)
python tools/disasm_dqk.py --disasm 0x596b4 --len 0x120
```

---

## 11. Primary Sources

- `hackdocs_extracted/CKITFORM.TXT` — spell record format (22-byte editor record; same engine family; INFERRED to match in-binary semantics)
- `hackdocs_extracted/SPELLEFF.TXT` — spell dice values for UA/FRUA engine (same family)
- `hackdocs_extracted/SPELLS.TXT` — spell code numbers (Magic Missile=15, Fireball=47, etc.)
- `Death Knights of Krynn/GAME.OVR` — Gen1 binary (DoK); primary for DoK verdicts
- `Champions of Krynn/GAME.OVR` — Gen1 binary (CoK); spell dispatch confirmed at 0x28b0
- `The Dark Queen of Krynn/DQK.EXE` — Gen2 binary; AoE type-9 and roll_dice(1,6) confirmed
- `tools/disasm_dok.py`, `tools/disasm_cok.py`, `tools/disasm_dqk.py` — RE tools
- Prior RE docs: `docs/engine/research/disasm-combat-dok.md`,
  `docs/engine/research/disasm-combat-cok.md`,
  `docs/engine/research/disasm-combat-dqk.md`,
  `docs/engine/research/disasm-combat-krynn-SUMMARY.md`

---

## 12. CT.4c — Gen1 spell-cast byte-verify pass (2026-06-23, lead)

**Goal:** with RE.5's FBOV resolver, follow CoK/DoK's spell-cast overlay to byte-verify the gen1 spell
**numbers** (damage / range / save / spell→type) that `combatSpells.ts` currently carries as 1e-inferred,
and dump the DS tables (`0x72a4`, `0xc36`, `0x31bd`). **Result: the gen1 damage/range/save numbers stay
UNLOCATED after a real multi-step pass.** What the pass *did* establish (all from CoK's OWN bytes):

### 12.1 The CoK `0x28b0` dispatch is the spell **asset/animation** path — NOT the damage formula
The doc's own reproduce command (§10: "CoK spell dispatch … maps spell IDs to effect constants in
`[bp-0x66]`") points at `0x28b0`. Disassembling it end-to-end (`disasm_cok.py dis 0x28b0 0x150`, then the
convergence at `0x2b26`) shows it is a large `switch(al = spell_id)` (ids `0x09…0x5f+`) that writes a
**per-spell internal effect code** to `[bp-0x66]` (values `0x46,0x0f,0x1d,0x05,0x07,0x18,0x16,0x19,0x17,
0x1c…0x3b` — an opaque enum, **not** the `0–7` HD-dispatch type and **not** dice). At the convergence
`0x2b26` that code is consumed as:
```
0x2b26  mov al,[bp-0x66]; push ax; lea di,[bp-0x59]; push ss; push di; lcall 0xb3,0x61   ; format → local buf
0x2b3d  mov ax,0x3f; push; lcall 0xa46,0x23f → far ptr [0x6b28]                            ; open/alloc (0xa46 = resident RTL)
0x2b52  push [0x6b28]; …; lcall 0xa46,0x9f8                                                ; read into the buffer
```
i.e. **spell_id → effect_code → format an asset name → open & read that asset** — the spell's
**graphics/sound load**, not its damage. Corroboration: the `lcall 0xdb,0x4d` inside the dispatch
**resolves** (RE.5 resolver, 18/18 stub prologues) to CoK file **`0x395b5`**, a draw-shaped helper
(reads far-ptr global `[0x6a2e]`, computes `+3` x/y, pushes colour `0xff`/`8`, `lcall 0x116,0x52`). So
`0x28b0` is correctly characterized as the **cast-animation/asset dispatch**. Documenting this prevents a
**4th Phase-RE over-attribution** (it would be easy to mistake a per-spell constant table for a damage
table — it is not).

### 12.2 The save resolver `lcall 0xcf,0x124` is UNRESOLVED by the current tooling
Re-verified the DoK call site (`disasm_dok.py dis 0x27128`): `lcall 0xcf,0x124` at file `0x27132` is real.
But **selector `0xcf` does not resolve** — the RE.5 resolver reports `UNRESOLVED (no resident stub table
at 0x200+sel*16; 2nd VROOMM stub segment)`. The save resolver lives in the second resident stub segment
whose base paragraph the flat tool does not reconstruct (the same class of selector RE.5 honestly left
unresolved: `0x111/0x116/0x128/0xA46`). The FBOV resolver also exists **only in `disasm_cok.py`** — the
DoK tool has no `resolve`/`overlays`/`thunk`. So the save body (negate-vs-half branch, d20-vs-table) stays
**UNLOCATED**, exactly as in §1.

### 12.3 The DS spell tables (`0x72a4`, `0xc36`, `0x31bd`) are DGROUP data, not code-offset-addressable
`DS:0x72a4` (DoK HD-cap), `DS:0xc36` (DoK 11-byte spell records) and `DS:0x31bd` (CoK 16-byte records) are
**DGROUP** (resident data-segment) offsets. The disasm tools address GAME.OVR by **file offset = code
address**; DGROUP lives in START.EXE's MZ load image at `load_base + DGROUP_para*16 + off`, and
`DGROUP_para` is not recovered by the flat tools (no relocation/segment-map emulation). Dumping these
tables therefore needs either a **runtime/loaded-image dump** (DOSBox memory) or a DGROUP-relocation pass —
out of scope for the static flat disassemblers. So the **spell→type→dice/range/save mapping remains
UNLOCATED** (OQ-2/OQ-3/OQ-4 stand).

### 12.4 CT.4c verdict + engine decision
The gen1 in-binary spell **numbers** (damage formula, range, save mode, spell→type) are **UNLOCATED** after
this pass — cross-overlay (save resolver, 2nd stub segment) and in DGROUP (the data tables) — neither
reachable with the current flat tooling. Per "UNLOCATED beats invention," **no engine change**: the
`addnd1e-dragonlance/combatSpells.ts` geometry/save constants stay **1e-inferred** (honestly labelled), the
verified `SaveThrowValues` continue to supply save *targets*, and no gen1/gen2 fork is justified by the
bytes (DQK's `roll_dice` anchor still confirms the 1e dice model as the shared baseline). **CT.4c is closed
as UNLOCATED-documented.** To ever pin these would need a *new capability*, not another flat pass:
(a) port the RE.5 FBOV resolver to `disasm_dok.py` **and** reconstruct the 2nd VROOMM stub segment base to
follow `0xcf:0x124`; (b) a DGROUP-relocation/dump pass (or a DOSBox memory snapshot) to read the spell
records at `0x72a4`/`0xc36`/`0x31bd`. Tracked as a deferred tooling task, not a blocker for CT.5.

> **Update (§25, 2026-07-01):** part (a) is now DONE — `disasm_dok.py` has a validated resolver — but
> `0xcf:0x124` still does not resolve; the failure mode is now diagnosed precisely rather than attributed to
> an unfound "2nd table" (see §25.5), and `0xcf` is shown to very likely be the same shared routine as CoK's
> own unresolved `0xe6` (§25.4, also used by the §15 rear-arc gate). Part (b) still has no DGROUP dump; the
> parallel DOSBox-X tracing effort this depends on had not produced `dgroup-dynamic-trace.md` as of this pass
> (§25.6).

---

## Lead conclusion (CT.4 implementation decision, 2026-06-23)

Independent spot-verification of the headline "gen1 spell-damage formula" (DoK `0x27109`–`0x2735b`)
**debunked it** (see the ⚠ banner at the top): no `roll_dice`, XP-magnitude constants
(`level*9+72`, flat `112`), a divide-by-count tail — a Gold Box **XP / encounter-value award**, not
spell damage, and with no spell string anchoring it. The byte-level gen1 spell-damage path, the save
resolver (`lcall 0xcf,0x124`), spell range, and AoE constants are all **cross-overlay/UNLOCATED**.

**What CT.4 therefore shipped (faithful-by-construction, not byte-fabricated):** the combat engine's
`cast` action encodes only the **mechanism** — Chebyshev range gate, line-of-fire, area gather
(single/burst/line; cone≈burst), a d20-vs-`save` throw with half/negate, damage/heal application, and
prepared-slot consumption. Every per-spell **number** (range, dice, save mode) is carried by the
`TacticalSpell` *data* (from the ruleset's 1e/COAB `spellEffect()` table), so the engine hardcodes no
spell balance. Saving-throw *values* come from the engine's verified `SaveThrowValues`. The DQK
`roll_dice` anchor (`0x598bf`) confirms gen2 is dice-based, so the AD&D-1e dice model is the faithful
baseline shared with camp casting — no gen1/gen2 behavioral fork was justified by the bytes.

**To byte-verify the gen1 spell numbers later (CT.4b):** use the RE.5 FBOV resolver in `disasm_cok.py`/
`disasm_dok.py` to follow the spell-cast overlay's `lcall 0xcf,0x124` (save) and the *real* damage
routine across overlays, and dump the DS data tables (`0x72a4`, `0xc36`) to map spell→type→dice. Until
then the spell numbers are the documented AD&D-1e values, labeled inferred — not claimed byte-verified.

---

## §13 — Turn-undead table (CT.5b): UNLOCATED in the gen1 binaries

CT.5b needed the cleric **turn-undead** table. Per the §12 doctrine, before encoding it I scanned the
gen1 binaries for the table's own bytes rather than assume the 1e values.

**Byte scan (CoK + DoK `GAME.OVR`, both `START.EXE`).** The canonical AD&D-1e turning table is the d20
target sequence **4, 7, 10, 13, 16, 19, 20** (each stronger undead column = +3; each cleric level = −3).
Searching all four binaries for that sequence — and the sub-sequences `10,13,16,19` and `7,10,13,16,19`,
forward and reversed — returned **0 hits**. The table is **not** present as contiguous code-segment data:
it lives in **DGROUP** (the static data segment), exactly like the gen1 spell-damage / save tables (§12),
and is not addressable by the flat code-offset disasm tools. Undead-immunity (which undead can't be
turned) was already noted UNLOCATED in §  (the type-immunity flag is a per-record DGROUP property).

**Verdict — UNLOCATED; use the standard 1e matrix, labelled inferred.** Same policy as the spell geometry
(CT.4b) and status durations (CT.5a): the engine's `turnUndeadOutcome(clericLevel, undeadHd)` encodes the
1e d20 table as the closed form `t = 10 + 3·HD − 3·level` (verified to reproduce the published PHB cells:
L1/1HD = 10, L1/2HD = 13, L3/1HD = 4, L4/1HD = auto-turn, L6/1HD = destroy). Undead HD is used directly as
the table's "type" column. The two Krynn-specific rules that ARE documented (not byte-derived) come from
the **CoK manual**: Majere clerics turn at **+2 levels** (`deities.ts` `turnUndeadLevelBonus`), and **Death
Knights cannot be turned** (`classifyUndead().turnImmune`). Pinning the real in-binary table would need the
same new tooling the §12 follow-up calls for (DoK FBOV resolver + 2nd-stub-seg base; a DGROUP dump).

---

## §14 — Thief backstab (CT.5c): feature + "from behind" trigger **LOCATED**; multiplier UNLOCATED

CT.5c needed thief **backstab**. Unlike CT.5a/5b (whose tables were UNLOCATED), the RE-gate byte scan here
was a **positive find**: backstab is **byte-confirmed present** in both gen1 games, *with its messages*,
including the positional precondition.

**Byte-located strings (combat message vocabulary).**
- **CoK `GAME.OVR` ≈ 0x14fe3** (region `[0x14fd0:0x15090]`): `-Backstabs-`, `slays helpless`, `Attacks`,
  **`(from behind)`**, `with one cruel blow`, `Hitting for`, ` point `/` points `, `of damage`, `and Misses`.
- **DoK `START.EXE` ≈ 0xe2d8** (region `[0xe2c0:0xe380]`): `-backstabs-`, `slays helpless`, `attacks`,
  **`(from behind)`**, `with one cruel blow`, ` point `/` points `, ` of damage`, `and misses`.

This proves three things directly from the bytes: (1) backstab **exists** as a distinct gen1 combat
outcome; (2) it is **positional** — the `(from behind)` clause is the printed precondition, so the engine
checks attacker-vs-defender geometry, exactly the facing/rear-arc model we implement (`isBehindTarget`);
(3) a sibling **`slays helpless … with one cruel blow`** path exists for asleep/held targets (a coup-de-grace
— shares the "one cruel blow" wording). The coup-de-grace is **noted but not yet implemented**; CT.5a already
auto-hits the helpless, and an instakill-on-helpless extension is a candidate follow-up (logged here, not invented).

**Still UNLOCATED — the multiplier magnitudes.** The numbers themselves (×2/×3/×4/×5 by level band) and the
**+4 to-hit-from-behind** are *not* in these strings; they live in the same **DGROUP** static tables as the
spell/save/turn data (§12, §13) and are not addressable by the flat code-offset tools. The code path that
references the located strings is in the overlay, but resolving the multiply site needs the same FBOV/2nd-stub
tooling the §12 follow-up calls for.

**Verdict — feature + trigger LOCATED (byte-confirmed); magnitudes 1e-inferred, labelled.** The engine
(`backstabMultiplier`, `isBehindTarget`, `resolveHit(..., backstab)`) implements the **standard AD&D-1e**
backstab: from a foe's rear arc, +4 to hit and a level-banded damage multiplier (×2 L1–4 / ×3 L5–8 / ×4 L9–12
/ ×5 L13+) on the opening blow. This is a *stronger* evidentiary footing than CT.5a/5b — the mechanic's
existence and its from-behind condition are proven from the binaries; only the exact factors stay inferred.

**Reproduce.**
```bash
python tools/disasm_cok.py strings 0x14fd0 0x15090   # CoK: -Backstabs- (from behind) …
python tools/disasm_dok.py strings 0xe2c0  0xe380    # DoK: -backstabs- (from behind) …  (START.EXE)
```

---

## §15 — Rear / flank AC (CT.7a): mechanism (facing + "from behind") **LOCATED**; magnitude UNLOCATED

CT.7a needed **rear AC** — a melee strike from a foe's back is easier to land (and complements the §14
backstab). The RE-gate confirmed the *mechanism* is real in CoK's own code but left the *value* behind the
cross-overlay wall, exactly like the backstab multiplier (§14).

**Located / VERIFIED in CoK's OWN binary.**
- **Facing field `0x10A`** (`disasm-combat-cok.md` §4): CoK stores a per-combatant **direction** and
  dispatches on its values **0..8** in the movement stubs (`0x10F33`/`0x10F68`) — the engine genuinely tracks
  orientation, the precondition for any rear/flank rule.
- **`(from behind)` attack message** (§14, CoK `GAME.OVR` ~0x14fe3): the attack-resolution code branches on
  the attacker being behind the defender and prints it — proof the to-hit path is **position-aware**.
- **To-hit gate `0x1785A`** (spot-disassembled this pass): the reachable to-hit code checks the weapon/attack
  fields then delegates the actual AC/roll math to **cross-overlay `lcall 0xe6,0xc0` / `lcall 0xe6,0x10b`** —
  so the front-vs-rear **AC selection and its magnitude are UNLOCATED** (same 2nd-stub-seg / DGROUP wall as
  §12–§14). COAB's separate **`ac_behind` (offset 0x19B)** is the sibling-engine MAP for the stored rear-AC value.
  **Update (§25, 2026-07-01):** `0xe6` was re-tested with a full DoK-resolver-parity pass and is now
  **reclassified from "resolves (10/12)" to UNRESOLVED** (the full 47-call-site sample scores 2/47, not
  10/12 — the earlier figure was a small-sample artifact). `0xe6`'s call-offset fingerprint (47 stride-5
  offsets `0x25`–`0x10b`) is an exact subset of DoK's own unresolved save-throw selector `0xcf` (§12.2, 52
  offsets `0x25`–`0x124`) — strong evidence this rear-arc check and DoK's saving throw invoke the **same**
  shared Gen1 "roll/compare-vs-table" routine. See `disasm-spells-krynn.md` §25 for the full diagnosis of why
  neither selector resolves via the flat-file-offset method.

**Verdict — mechanism LOCATED; magnitude 1e-inferred + labelled.** The engine
(`resolveHit` rear branch, `isBehindTarget`, `rearAc` field, `REAR_TO_HIT_BONUS`) selects the defender's
`rearAc` when one is supplied (the COAB `ac_behind` analogue, to be plumbed from the bestiary later), else
applies the **AD&D-1e generic rear advantage (+2 to hit; negates shield + Dexterity)**. A thief backstab keeps
its own **+4** instead of stacking the +2 (§14). As with §14, the existence + trigger are byte-proven; only the
exact rear-AC number is inferred. Pinning it needs the same FBOV/2nd-stub tooling §12 calls for.

**Reproduce.**
```bash
python tools/disasm_cok.py dis 0x1785a 0x140         # to-hit gate → cross-overlay lcall 0xe6,0xc0 / 0x10b
```

## §16 — Terrain hazards + difficult ground (CT.7b): cost tiers COAB-MAPPED; spell-zone names UNLOCATED

CT.7b adds **battlefield terrain effects** — difficult ground (movement-cost tiers) and **hazard zones**
(web/cloud cells that hold or damage a figure standing in them). The RE-gate here is the weakest of the CT.7
basket — terrain cost is documented only in the COAB *sibling*, and the Krynn games keep their per-tile data
out of the flat code image — so the numbers are honestly **inferred + labelled**, not byte-verified.

**Difficult-ground cost tiers — COAB MAP, Krynn values UNLOCATED.**
- COAB's **`BackGroundTiles`** table (`combat-mechanics-coab.md` §2, Gbl.cs 193-268) gives the first field of
  each terrain entry as a movement cost: **`0xFF` = impassable, `0`/`1` = open/normal, `2` = difficult, `4` =
  very difficult**. Transcribed into the engine as exported `TERRAIN_COST` constants (open 1 / difficult 2 /
  very-difficult 4); `reachableCells` already multiplied the half-step price by the per-cell `cost()`, so this
  slice only *names + grounds* the tiers and documents them.
- Champions/Death Knights of Krynn store their own per-tile cost as **tile DATA** (the same DGROUP/data class
  as the UNLOCATED spell/turning tables §12–§13) — not addressable by the flat code-offset disasm. So the tier
  *values* are the **COAB MAP, labelled inferred**, exactly like the spell geometry (CT.4b).

**Hazard zones — grounded in the games' OWN cloud spells; persistence mechanics UNLOCATED.**
- The hazard model represents the area "cloud" spells the Krynn games genuinely have — **Stinking Cloud** is
  already a modelled CoK spell (CT.5a status set), with **Cloudkill / Ice Storm / Web** in the same family. A
  byte scan of CoK's `GAME.OVR` for the spell-name strings (`Stinking`, `Cloudkill`, `Web`, `Cloud`, `Ice
  Storm`) found **NONE** in the flat code image — they live in game DATA (the spell-name/DAX tables), the same
  UNLOCATED class as everything in §12. So the *existence* of these zone spells is grounded (ruleset/manual),
  but the games' own **zone-persistence code** (how long a cloud lingers, per-round re-save) is cross-overlay/
  data-UNLOCATED.
- Engine model (`TerrainHazard` + `TerrainGrid.hazard`): a figure that **ends a move in** — or **begins its
  turn in** — a hazard cell is subjected to it (web → save-vs-`held`; cloud → damage through the shared death
  rule). Durations/dice are **1e/Gold-Box-inferred + labelled**. A figure only walking *through* a hazard
  isn't caught (exposure is on stopping/starting in it) — a documented simplification, not a verified rule.

**Verdict — cost tiers COAB-MAPPED, hazard zones ruleset-grounded; all magnitudes inferred + labelled.** No
engine number here is byte-verified in a Krynn binary; the slice is an honestly-labelled extension point. The
faithful encoding of specific zone spells (Web's save interval, Cloudkill's HD-instakill, Stinking Cloud's
nausea rounds) waits on the same FBOV/2nd-stub/DGROUP-dump tooling §12 calls for.

**Reproduce.**
```bash
for s in Stinking Cloudkill Web Cloud "Ice Storm"; do python tools/disasm_cok.py strings "$s"; done  # all NOT FOUND → data, not code
```

## §17 — Missile range brackets (CT.7c): range-awareness byte-LOCATED; bracket magnitudes UNLOCATED

CT.7c adds **missile range brackets** — a missile shot's to-hit shifts by distance band (short/medium/long).
The RE-gate found CoK's combat is **demonstrably range-aware** in its own binary, but the bracket *values*
stay behind the usual cross-overlay/data wall.

**Located / VERIFIED in CoK's OWN binary.**
- **`Range = ` readout** (`GAME.OVR` @0x17d5a **and** @0x1810e, byte-located this pass): the combat targeting
  UI literally prints the **range to the aimed target** to the player — proof the engine computes shot
  distance and surfaces it (the classic Gold Box "Range = N" line when you aim a bow). Two copies (likely
  the look/aim and the fire paths).
- **`Cannot target `** (@0x1708b): a targeting **restriction** message — the engine gates some shots
  (out-of-range / no line), corroborating that distance feeds the targeting decision.

**UNLOCATED (inferred + labelled).**
- The code that converts the computed range into a **to-hit modifier** is cross-overlay: an xref of `Range = `
  / `Cannot target ` resolves to **none in-segment** (the string offsets are loaded via a different segment
  base — the recurring VROOMM/2nd-stub wall, as in §12/§15).
- The **short/medium/long modifier magnitudes** are COAB's (`combat-mechanics-coab.md` §6: short **+1** /
  medium **0** / long **−2**), and even in COAB they live in **item data at seg600 ~0x5D10 (UNLOCATED there
  too)**. So the engine uses the AD&D-1e / Gold-Box-community standard **+1 / 0 / −2** over range-thirds,
  **labelled inferred** — same policy as the spell/turn/backstab/rear-AC numbers.

**Verdict — range-awareness byte-PROVEN; bracket magnitudes 1e-inferred + labelled.** The engine
(`missileRangeBracket`, `rangeBracketToHit`, applied in `resolveHit` for missile/thrown attacks; `rangeBracket`
event field; `missileBracket` seam) splits a weapon's `range` into thirds and applies +1/0/−2. The *existence*
of range-driven targeting is grounded in CoK's own `Range = ` UI; only the modifier values are inferred.
Pinning them needs the same seg600/DGROUP-dump tooling §12 calls for.

**Reproduce.**
```bash
python tools/disasm_cok.py strings "Range = "        # @0x17d5a + @0x1810e  (combat shows range to target)
python tools/disasm_cok.py strings "Cannot target "  # @0x1708b           (targeting restriction)
python tools/disasm_cok.py xref    "Range = "        # → none in-segment (cross-overlay; magnitude UNLOCATED)
```

## §18 — Guard / readied reactions (CT.7d): command + state **byte-LOCATED**; trigger details UNLOCATED

CT.7d makes the **Guard** command a real readied reaction (the held figure strikes the first foe to enter
its melee reach), instead of a turn-ending no-op. This is the **best-grounded** slice in the CT.7 basket so
far — both the command and its tracked state are byte-located in CoK's own binary.

**Located / VERIFIED in CoK's OWN binary.**
- **`Guard ` command** (`GAME.OVR` @0xbf28, in the run `…Guard \x0bDelay Quit …`): the combat command bar
  literally offers **Guard** (and **Delay** — initiative deferral), so Guard is a first-class CoK combat
  action, not an invention.
- **`Guarding` state string** (@0x38f51): CoK has a distinct **"Guarding"** *state* a combatant displays —
  proof the engine tracks a readied/held-action stance per figure (exactly the `guarding` flag modelled here).

**UNLOCATED (inferred + labelled).**
- The code that fires the readied strike when a foe enters reach is cross-overlay (the per-turn action
  dispatch + movement handlers route through the VROOMM thunks, as everywhere in §12–§17). So the exact
  trigger geometry — **does Guard strike a foe that enters reach, or only one that attacks; one reaction or
  many; does Delay interleave** — is not pinned in the flat image.
- Engine model: a `guard` action sets the `guarding` flag + ends the turn; in `triggerGuardReactions` (called
  after every move), each guarding foe now within its melee reach takes **one** free `resolveHit` strike
  (tagged `opportunity`) and spends the reaction; a stale guard clears at the figure's next `beginTurn`. The
  "one strike, on the first foe to enter reach" rule is **1e/Gold-Box-inferred + labelled**.

**Verdict — Guard command + Guarding state byte-PROVEN; reaction trigger 1e-inferred + labelled.** The
*existence* of a readied-guard stance is grounded in CoK's own `Guard`/`Guarding` strings; only the precise
fire condition is inferred. Pinning it (and the `Delay` initiative-defer command, a natural CT.7 follow-up)
needs the same cross-overlay action-dispatch trace §12 calls for.

**Reproduce.**
```bash
python tools/disasm_cok.py strings "Guard "    # @0xbf28  (combat command bar: Guard / Delay / Quit)
python tools/disasm_cok.py strings "Guarding"  # @0x38f51 (per-combatant readied-stance state)
```

## §19 — Delay command (CT.7e): command **byte-LOCATED**; defer-target ordering UNLOCATED

CT.7e makes **Delay** a real initiative-defer command: a figure at the untouched start of its turn can push
itself to act **later this round**, then takes its full turn when the cursor reaches it again.

**What is byte-grounded (verified myself, not taken on trust):**
- **`Delay` command** (`GAME.OVR` **@0xbf2f**, inside the same command-bar run as Guard:
  `…\x06Guard \x0bDelay Quit …`). I re-ran the locator before encoding rather than trusting §18's
  "beside Guard @0xbf28" shorthand — the `Guard ` literal starts at 0xbf28, the `Delay` literal at **0xbf2f**;
  the `\x06`/`\x0b` are the menu entries' leading length/format bytes. So **Delay is a first-class CoK combat
  command**, a sibling of Guard, not an invention. (This is the `Delay` half of the same proof §18 cited for
  Guard — now pinned to its own offset.)

**What stays inferred (and is LABELLED so in code):**
- **Where Delay drops you in the order.** The combat-action dispatch that consumes the `Delay` menu pick lives
  in the same cross-overlay handler §12/§18 flag as flat-tool-UNLOCATED, so the *exact* re-insertion rule
  (act after everyone still pending? after the next figure only? re-roll initiative?) is not recoverable from
  the flat code offsets. The engine uses the **1e/Gold-Box-standard model**: the deferred figure re-queues
  **after all figures still to act this round**, capped at **one Delay per figure per round** (so it cannot
  loop the round open forever). Both choices are labelled UNLOCATED-inferred in `applyDelay`.

- Engine model (`packages/engine/src/combat/tactical.ts`): `canDelay()` gates the action to the *untouched*
  start of turn (`!acted && moveLeft === move*2`), requires an un-delayed actor (`delayedThisRound` set,
  cleared each `beginRound`), and requires ≥1 active non-asleep/held figure still pending after the cursor
  (else there is no later slot — the last figure cannot Delay). `applyDelay` splices the actor out of
  `order[oidx]`, pushes it to the end, opens the next figure's turn, and re-positions the cursor. A non-
  deferrable Delay is a no-op (the UI just re-prompts), matching a menu pick that can't legally fire.

**Verdict — Delay command byte-PROVEN; defer-target ordering 1e-inferred + labelled.** The *existence* of a
Delay command is grounded in CoK's own `Delay` string at 0xbf2f; only the re-insertion ordering is inferred.
Pinning it needs the same cross-overlay action-dispatch trace §12/§18 call for.

**Reproduce.**
```bash
python tools/disasm_cok.py strings "Delay"      # @0xbf2f  (combat command bar, beside Guard @0xbf28)
python tools/disasm_cok.py strings "Guard "     # @0xbf28  (same run: …Guard \x0bDelay Quit…)
```

## §20 — Large (2×2) monster footprint (CT.7f): Small/Large icon size **byte-LOCATED**; 2×2 geometry inferred

CT.7f gives big creatures (dragons, giants, ogres) a real **multi-cell footprint**: a Large figure occupies
a 2×2 block, blocks all four cells for movement, melees from — and is shot at / caught by an AoE on — any of
its cells, and must fit its whole footprint to move.

**What is byte-grounded (verified myself before encoding):**
- **A two-tier combat-icon size exists in the originals.** Gold Box's character/monster **icon editor** lets
  you pick a **Small** or **Large** icon, and both literals are byte-located in **both** gen1 Krynn games:
  - CoK `GAME.OVR`: **`Small` @0x2423a**, **`Large` @0x24240**, in the editor run alongside **`Is this icon
    ok?` @0x24283**, `Hair`, `Face` (the icon-customisation screen).
  - DoK `START.EXE`: **`Small` @0xebaa**, **`Large` @0xebb0** (same picker; DoK keeps the editor in `START.EXE`,
    where its backstab/`(from behind)` strings also live — §14).
  I located these myself (raw `find` on the overlay image), so the **Small/Large distinction is proven real**,
  not assumed — a monster/figure is one icon size or the other, and that is what a multi-cell footprint encodes.

**What stays inferred (and is LABELLED so in code):**
- **The 2×2 geometry of a Large icon.** The strings prove a size *flag*; the exact cell footprint a Large icon
  paints (2×2 vs 1×2 vs an arbitrary mask) and the per-monster size *bit* both live in the monster record /
  icon descriptor — **DGROUP/asset data**, the same wall as the undead-immunity flag (undead.ts) and the
  §12–13 tables. So **2×2 is the Gold-Box-standard inference**, and which monsters are Large is a **name
  heuristic** (`ruleset/addnd1e-dragonlance/monsterSize.ts` `monsterFootprint` — dragon/giant/ogre/troll/…),
  exactly mirroring the honest `classifyUndead` pattern. Both are labelled inferred.

- Engine model (`packages/engine/src/combat/tactical.ts`): new `TacticalCombatant.size` (1 = Small, 2 = Large,
  top-left anchor) + pure exported `footprintCells(pos, size)` / `footprintDistance(aPos, aSize, bPos, bSize)`.
  Threaded through `occupied` (reserves all footprint cells), `meleeTargets` / `triggerGuardReactions` /
  missile range / the range bracket (footprint-aware Chebyshev), `clearLineOfFireBetween` (any clear sightline
  between a shooter cell and a target cell; own body never blocks), `spellAffected` (an AoE catches a Large
  figure if any cell is in the blast), and `reachableCells(..., moverSize)` (a Large mover may only enter an
  anchor whose whole footprint is in-bounds, passable, and unoccupied). Web placement reserves the full
  footprint so a Large monster never starts overlapping. **2×2 sprite *art* rendering is deferred** (the icon
  still draws at its anchor cell) — the mechanics are the slice; the renderer learns the size via the `sizeOf`
  seam.

**Verdict — Small/Large icon size byte-PROVEN; 2×2 footprint geometry + per-monster size Gold-Box-inferred +
labelled.** The *existence* of a Large-icon class is grounded in CoK/DoK's own `Small`/`Large` editor strings;
only the cell geometry and the roster of which monsters are Large are inferred. Pinning the per-monster bit
needs the monster-record/icon-descriptor DGROUP dump the §12/§13 tables also wait on.

**Reproduce.**
```bash
python tools/disasm_cok.py strings "Large"   # CoK GAME.OVR @0x24240 (icon editor, beside Small @0x2423a)
python tools/disasm_cok.py strings "Small"   # CoK GAME.OVR @0x2423a
# DoK keeps the icon editor in START.EXE: Small @0xebaa / Large @0xebb0
```

## §21 — Party flee / withdraw (CT.7g): command + both outcomes **byte-LOCATED**; escape condition inferred

CT.7g makes the combat **Flee** command a real party-wide **withdraw**: if the whole party can reach the map
edge it "Gets Away" and the encounter ends as a withdraw (not a loss); otherwise "Escape is blocked" and the
party stays in the fight.

**What is byte-grounded (verified myself before encoding):**
- **The party `Flee` command** — CoK `GAME.OVR` **@0xbadf**, in the combat command-bar run
  `Move/Attack, Move Left = … Done … Flee: … can't go there`. Flee is a first-class combat command (it shares
  the bar with Move/Attack/Done).
- **Both outcomes of a flee attempt** are located, adjacent, at **@0x15b17 `Got Away`** and **@0x15b20
  `Escape is blocked`** — so the engine genuinely has a *two-way* party-flee resolution (escape succeeds OR is
  blocked), not a guaranteed exit.
- **The withdraw banner** — **@0x6cff `The party has fled.`**, sitting in the post-battle outcome block right
  beside `You have lost the fight.`, `You have won the duel.`, `The party has won.` → fleeing is a **distinct
  terminal state**, NOT the same as a defeat. I dumped this block myself to confirm the four banners are
  siblings.

**What stays inferred (and is LABELLED so in code):**
- **The exact escape *condition*** (what makes the difference between `Got Away` and `Escape is blocked`). The
  routine that decides it is cross-overlay (the flee command dispatch routes through the VROOMM thunks, the
  §15/§18 wall), so the precise rule — every member must reach the edge? a die roll vs the enemies? a clear
  path to the entry side? — is not recoverable from the flat offsets. The engine uses a **reachability model**:
  the party gets away iff **every living member can reach a border cell this turn** (`partyCanEscape`); if any
  is boxed in by foes/walls, escape is blocked. Labelled inferred in `attemptPartyFlee`.

- Engine model (`packages/engine/src/combat/tactical.ts`): `partyCanEscape()` (every living party member
  `touchesBorder` now or via `reachableCells`), `attemptPartyFlee()` (emits a `party-flee` event with
  `escaped`; on success flags all party members `fled` + ends with `end` `outcome:'draw'`, `fled:true`; on
  failure a no-op so the fight continues). `result().fled` distinguishes a withdraw from a stalemate. The
  pre-existing single-figure `flee` action (an individual rout used by feared monsters / AI) is unchanged.
  Web: the **Flee** command (`F`/menu) now calls `attemptPartyFlee`; log lines "The party flees — Got Away!" /
  "Escape is blocked!" / "The party has fled."; `partyCanEscape` seam.

**Verdict — Flee command + Got Away / Escape is blocked / The party has fled. all byte-PROVEN; escape
condition reachability-inferred + labelled.** The *existence* of a two-way party-withdraw is grounded in CoK's
own strings; only the precise escape test is inferred. Pinning it needs the same cross-overlay flee-dispatch
trace §12/§15/§18 call for.

**Reproduce.**
```bash
python tools/disasm_cok.py strings "Flee:"             # @0xbadf  (combat command bar)
python tools/disasm_cok.py strings "Got Away"          # @0x15b17 (flee succeeds)
python tools/disasm_cok.py strings "Escape is blocked" # @0x15b20 (flee fails)
python tools/disasm_cok.py strings "The party has fled" # @0x6cff  (withdraw banner, beside win/loss banners)
```

## §22 — Post-battle bring-up (CT.7h): dead-vs-unconscious carry-over **byte-LOCATED**; carry plumbed to roster

**Goal.** When a fight ends, carry each fallen party figure's state to the exploration roster faithfully: a
figure **slain** by the gen1 10-below-zero rule (`damage_player`: `dmg >= hp_before+10`, RE.1 /
§RE.2-verified `add ax,0Ah` threshold family) is **dead** and needs a temple **Raise Dead**; a figure
merely brought to **0 HP** is **unconscious**, and a figure at -1 through -9 is **dying** but recoverable
by rest / cure. Plus the faithful per-character XP-split announcement.

**What is byte-LOCATED (verified myself in `Champions of Krynn/START.EXE`):**

| String                              | file_ofs  | Role                                                            |
| ----------------------------------- | --------- | -------------------------------------------------------------- |
| `Each character receives `          | `0x6dd3`  | per-head XP split prefix (victory bring-up)                    |
| `experience points.`                | `0x6dec`  | …suffix → "Each character receives N experience points."       |
| `The duelist receives `             | `0x6dbd`  | single-survivor variant (duel/last-one-standing)               |
| ` entire party is killed!`          | `0x35b2`  | total-party-kill banner (the loss branch)                      |
| `Raise Dead`                        | `0x57b3`  | temple revive verb — proves dead ≠ down post-combat            |
| `is not dead`                       | `0x57a6`  | Raise Dead refused on a living/standing target                 |
| `cannot be raised`                  | `0x5795`  | Raise Dead refused (race/constitution) — dead is a real state  |

The **10-below-zero overkill→dead rule itself** is already byte-PROVEN in the combat region (RE.1 gen1 /
§RE.2 gen2 — DQK has no `+10` literal). CT.7h does NOT re-derive that; it carries the engine's existing
`dead` / recoverable-down flag **out of the battle and onto the roster**, which the prior bring-up
(`applyCombatHp`) dropped.

**Engine model (`packages/engine/src/combat/tactical.ts`).** New seam `conditionOf(id): 'ok' | 'unconscious'
| 'dead'` reads the figure's flags (`dead` → dead; `unconscious`/`dying` or `hp ≤ 0` → unconscious; else
ok). Internally, `applyHpLoss` now mirrors the source split: exact 0 HP is `unconscious`, -1 through -9
is tactical `dying` with the negative depth stored in `bleeding`, and -10 or lower is `dead` under
gen1. Down/dead figures store HP as 0, matching CoAB `damage_player`; the negative depth lives in the
CoAB-shaped `actions.bleeding` field.

**Web carry-over (`apps/web/src/ui/party.ts`).** A name-keyed **dead set** (`greybox.dead.cok`, mirrors the
memorize/xp stores so `CharacterSheet` stays a pure ruleset value): `applyCombatHp(combatants, conditionOf?)`
now also records any `'dead'` figure; `partyStatus()` exposes `dead` (always implies `down`); `restParty()` and
natural rest leave the permadead untouched; `reviveMember` / `templeRaiseFirstDead` (**Raise Dead**) clear the
flag. `combat.ts` `finalize()` passes `conditionOf` and prints the faithful `Each character receives N
experience points.` line (the split itself was already faithful in `awardPartyXp`).

**COAB Raise Dead source anchors now recovered.** `coab_extracted/engine/ovr005.cs:162` (`raise_dead`)
is the temple service path; `coab_extracted/engine/ovr023.cs:2341` (`SpellRaiseDead` / `cast_raise`) is
the spell path; `coab_extracted/engine/ovr024.cs:1335` (`heal_player`) proves ordinary healing accepts
`unconscious`/`dying` but not `dead`; `coab_extracted/engine/ovr021.cs:358` (`rest_heal`) feeds rest
through the same heal path. `coab_extracted/engine/ovr009.cs:363-389` (`BattleRoundChecks`) increments
`actions.bleeding` for `dying` figures and kills at `> 9`; `coab_extracted/engine/ovr025.cs:1628-1652`
(`bandage`) converts one party-side `dying` member to `unconscious` and clears bleeding. Greybox now
mirrors the target split with shared helpers in `packages/engine/src/combat/party.ts`: combat carry-over
writes permadead, cure/rest can recover unconscious members, and Raise Dead targets only permadead
members and restores 1 HP.

**Current Raise Dead/status parity:** `packages/engine/src/combat/party.ts` now also has
`cleanupCombatRosterAfterCombat` for the recovered normal/duel/fled/killed cleanup cases, and
`raiseRosterMemberWithRules` for `dead || animated`, poison/animate cleanup, and CON decrement.
Spell mode rejects elves and `CON <= 0`; temple mode has no race/CON rejection but still decrements
positive CON, matching `coab_extracted/coab_new.lst:81835-81841`. Web camp-cast Raise Dead uses spell
mode and web temple Raise Dead uses temple mode, with focused e2e coverage proving HP/deadStore and
CON persistence on the live roster.

**What stays partial:** full COAB Raise Dead/status fidelity still needs exact temple menu/text parity,
temple max-HP recalculation after CON loss, exact status-string UI parity, and any DQK/Gen2-specific death
timing (still UNLOCATED). Greybox already has a tactical `dying` flag, gen1 bleeding tick, and bandage
action, but roster carry-over intentionally collapses recoverable down states for the current public web
roster.

**Verdict — bring-up strings (XP split, Raise Dead, party-kill) byte-PROVEN; dead-vs-recoverable-down
carry-over plumbs the already-verified 10-below-zero death flag to the roster. No invention.**

**Reproduce.**
```bash
python tools/disasm_cok.py strings "Each character receives" # @0x6dd3
python tools/disasm_cok.py strings "experience points"       # @0x6dec
python tools/disasm_cok.py strings "Raise Dead"              # @0x57b3
python tools/disasm_cok.py strings "is not dead"            # @0x57a6
python tools/disasm_cok.py strings "cannot be raised"       # @0x5795
pnpm --filter @goldbox/engine exec vitest run test/combatPartyRecovery.test.ts test/tactical.test.ts --reporter=verbose
$env:GB_E2E_ONLY='cure-unconscious'; pnpm --filter @goldbox/web e2e
$env:GB_E2E_ONLY='town'; pnpm --filter @goldbox/web e2e
```

## §23 — Large (2×2) monster SPRITE rendering (CT.7i): footprint-pixel rect is arithmetic from CONFIRMED facts

**Goal.** CT.7f made a Large monster *occupy* 2×2 cells (blocking, footprint reach, AoE — all live and tested),
but the icon still **drew at the single anchor cell**. CT.7i makes it **paint across its whole footprint**.

**This slice introduces NO new byte-claim — it is the arithmetic product of two already-established facts:**
1. **Combat cell = 24×24 px, origin (8,8), 7×7 window — CONFIRMED** from the COAB clean-room oracle (the
   `draw_combat_picture`/`DrawIsoTile` call-chain, `seg040.draw_clipped_picture` ×8 + `*3`+1), documented in
   `packages/engine/src/render/combatScreen.ts` GEOMETRY NOTE and pinned by `combatScreen.test.ts`. Cell (c,r)
   → pixel `(8 + c*24, 8 + r*24)`.
2. **Large = 2×2 footprint, top-left anchored — byte-PROVEN** (§20: `Small`/`Large` icon-editor strings
   byte-LOCATED CoK `@0x2423a`/`@0x24240` + DoK `@0xebaa`/`@0xebb0`; `footprintCells(pos,size)` top-left anchor).

⇒ A Large figure paints a `size·24 × size·24` = **48×48 px** block at `(8 + col*24, 8 + row*24)`. The glyph
fill, the prone (down) bar, and the active-unit cursor all now span that footprint; the **icon** is
nearest-neighbour upscaled by `size` to fill it (new engine `blitIndexedScaledClipped`, unit-tested in
`screen.test.ts`).

**What is a LABELLED approximation (NOT claimed as RE-exact):** scaling the *single-cell SPRIT fallback* by the
footprint factor. In the real game a big-monster SPRIT frame is itself a larger bitmap; we do not yet load
per-monster sprites (that is the separate "real weapon/sprite data from records" candidate), so the shared
fallback icon is ×2-scaled to fill the 48×48 block. The *footprint geometry* is exact; only the *fill bitmap*
for the demo is a stand-in, labelled so in `drawCombatant`.

- Engine: `blitIndexedScaledClipped(dst, src, x, y, scale, clip…)` (nearest-neighbour integer upscale, clipped,
  transparency-aware; `scale 1` ≡ `blitIndexedClipped`). `combatScreen.CombatCellState.size`; `drawCombatant` /
  `drawCursor` footprint-aware. Web: `visibleCells` passes `sizeOf(id)`; `paintedFootprint(id)` seam returns the
  `{w,h}` pixel rect (Ogre 48×48 vs draconian 24×24). 6 engine tests (656 total) + `spriteFootprintOk` e2e.

**Verdict — footprint-pixel rect is the arithmetic product of CONFIRMED 24px geometry × byte-PROVEN 2×2
footprint; no new offsets needed. The fallback-icon upscale is a labelled stand-in for the not-yet-wired
per-monster big sprite.**

## §24 — Coup de grace / slays helpless (CT.7j): feature + helpless precondition **byte-LOCATED** (gen1)

**Goal.** A melee blow on a **helpless** (asleep/held) foe is not just an auto-hit (CT.5a) — it **slays the
target outright** ("slays helpless … with one cruel blow"). CT.7j ships the coup-de-grace.

**Byte-located (verified MYSELF before encoding — not taken from the §14 cross-reference):**

| String (CoK `GAME.OVR`)   | file_ofs  | Note                                                         |
| ------------------------- | --------- | ------------------------------------------------------------ |
| `-Backstabs-`             | `0x14fe3` | combat-message vocabulary region start                       |
| `slays helpless`          | `0x14fee` | **the coup-de-grace outcome** — a distinct combat message    |
| `with one cruel blow`     | `0x15019` | the finishing-blow wording (shared with the backstab path)   |

DoK `START.EXE` shares the path: `with one cruel blow` byte-LOCATED `@0x1eeff` (combat-vocab region beside
`Hitting for ` `@0x1ef13`). So the feature is **byte-confirmed present in both gen1 games**.

This proves: (1) `slays helpless` **exists** as its own combat outcome (not a generic hit), and (2) its trigger
is a **helpless** target — exactly the `asleep`/`held` state the engine already auto-hits (CT.5a). What the
strings do NOT pin: that the result is an *instant kill* (vs max damage). **AD&D-1e standard** is that a
coup-de-grace against a helpless foe is an automatic kill, and the verb is literally "slays" → encoded as an
outright slay and **labelled** inferred-as-instant-kill.

**Engine (`combat/tactical.ts`).** In `resolveHit`, after the CT.5a auto-hit: `coupDeGrace = hit && !missile &&
helpless && ruleset !== 'gen2'`. When set, the blow bypasses the `hp+10` overkill check, zeroes the target's HP
and adds the `dead` flag (a *kill* — carried to the roster by CT.7h if the victim was a party member), and emits
`attack {coupDeGrace:true}` + `slain {dead:true, coupDeGrace:true}`. The multi-attack routine retargets off the
slain foe automatically, so the remaining swings don't strike a corpse. New interface predicate
`slaysHelpless()` (gen1 → true) drives the web hint + e2e seam.

**Per-game fork (only what the bytes justify).** The strings are gen1 (CoK/DoK). **Gen2 (DQK) is NOT verified**,
so under `ruleset:'gen2'` a helpless melee keeps the ordinary CT.5a auto-hit + damage roll (no instant slay) —
conservative, refine when a DQK `slays helpless` equivalent is located. **Range:** coup-de-grace is **melee-only**
(`!missile`) — a missile on a helpless foe auto-hits but cannot deliver the "cruel blow"; a sleeper that survives
a shot still wakes (CT.5a), which is now where that wake-on-survive path lives.

**Verdict — feature + helpless-precondition byte-LOCATED (CoK + DoK); instant-kill semantics 1e-inferred +
labelled; gen2 left to the unverified-conservative auto-hit.** Stronger footing than a pure inference: the
mechanic's existence and trigger are proven from the binaries.

**Reproduce.**
```bash
python tools/disasm_cok.py strings "slays helpless"     # @0x14fee
python tools/disasm_cok.py strings "one cruel blow"     # @0x15019
python tools/disasm_dok.py strings "one cruel blow"     # DoK START.EXE @0x1eeff
```

## §25 — RE.7: DoK FBOV resolver port + 2nd-stub-segment diagnosis (tooling task, 2026-07-01)

**Goal (from the §12.4 follow-up).** Port the RE.5 FBOV call-table resolver
(`docs/engine/research/disasm-combat-cok.md` §9) into `tools/disasm_dok.py`, and reconstruct
the "2nd VROOMM stub segment" base so DoK's saving-throw call `lcall 0xcf, 0x124` (§12.2, DoK
file `0x27132`) and CoK's still-unresolved selectors (`0x111`/`0x116`/`0x128`/`0xA46`, and — new
finding below — `0xe6`) can be followed. **Result: the port is DONE and validated (a real new
capability for DoK); the specific selectors stay UNLOCATED, but the failure mode is now
diagnosed precisely rather than shrugged off as "a 2nd table."** A companion cross-game finding
(§25.4) ties CoK's §15 rear-arc gate to the exact same unresolved dispatch as DoK's save-throw
call, which is new information even though the byte target itself stays UNLOCATED.

### 25.1 DoK's own FBOV descriptor table — reconstructed from DoK's OWN bytes, ported

`Death Knights of Krynn/START.EXE` MZ header: `e_cblp=0x3b e_cp=0x92 e_crlc=0 e_cparhdr=0x20`
→ load module begins at file offset **`0x200`**, identical to CoK's. This is a property of the
Borland linker's fixed-size MZ header for this binary class, not a CoK-specific constant, so the
resolver's `MZ_HDR = 0x200` anchor carries over unchanged.

Scanning DoK's `START.EXE` for the descriptor-header byte pattern (`CD 3F`, `saveret==0`, a
`dword fileofs` indexing inside `GAME.OVR`, and a plausible `word codesz`) — the exact same
discovery method used for CoK, run fresh against DoK's own binary, nothing copied from CoK's
table — yields **35 descriptors** (matching CoK's own count) whose `fileofs` values ascend
monotonically and exactly tile DoK's `GAME.OVR` payload (`0x8 … 0x3da35`, matching FBOV
`body_size = 0x3da2d = filelen-8`). `jmpcnt` is read as a **single byte** at header+0xC (not a
word): DoK's header has a non-zero flag/padding byte at +0xD (e.g. descriptor 0 is `02 0d` at
+0xC/+0xD), whereas CoK's corresponding byte happens to be `00`; reading jmpcnt as a word would
give DoK descriptor 0 a nonsense count of `0x0d02`, but as a byte both games agree
(`jmpcnt=2`) — expected, since descriptor 0 in both binaries is near-identical Borland
runtime-init boilerplate (`fileofs=0x8`, `codesz=0xc4` in **both** games, byte-for-byte).

This table plus `overlays`/`resolve`/`thunk` (verbatim port of the CoK algorithm — same voting
method, same honesty caveats) are now in `tools/disasm_dok.py`:

```bash
python tools/disasm_dok.py overlays            # the 35 reconstructed DoK descriptors
python tools/disasm_dok.py resolve 0xc5        # -> base 0x32197 (validated, see 25.2)
python tools/disasm_dok.py resolve 0xcf 0x124  # -> UNRESOLVED (see 25.3)
```

### 25.2 The port is validated on DoK's OWN binary (not just a copy that runs)

Before trusting the port's negative result on `0xcf`, it needs a positive control. A raw scan of
all `lcall sel:off` (`9A off2 sel2`) sites across DoK's `GAME.OVR` found **123 distinct
selectors**; scoring every selector with ≥3 samples through the ported `_overlay_base_for_selector`
gives four **non-degenerate, single-dominant-candidate** hits (one overlay base wins essentially
all votes, everything else gets 0–1 stray votes — the same signature as CoK's validated
`0xdb`/`0xa8`, §9.2):

| sel | samples | votes for winning base | winning base (GAME.OVR fileofs) |
|---|---|---|---|
| `0xc5` | 23 | **23/23** | `0x32197` |
| `0x92` | 17 | **17/17** | `0x29c0c` |
| `0x5a` | 13 (12 valid stubs) | **12/12** | `0x1bbc2` |
| `0xe5` | 4 | **4/4** | `0x3ac6a` |

This confirms the ported resolver genuinely works on DoK's own bytes (it is not merely
syntactically running) — DoK now has resolver parity with CoK for the selectors where the
underlying formula holds.

### 25.3 Selector `0xcf` (DoK save-throw resolver): still UNRESOLVED — now with a rigorous negative

Running the validated port against the actual saving-throw call:

```
$ python tools/disasm_dok.py resolve 0xcf 0x124
selector 0xcf -> overlay base 0xda (candidate: 2/2 stub entries hit Borland prologues -- LOW
hit-rate/total is a documented false-positive risk on prologue-dense overlays ...)
  lcall 0xcf:0x124: no CD3F stub at START.EXE 0x1013 (off out of this overlay's stub table)
```

Two independent negatives: (1) the selector-wide vote is `2/2` — a sample of 2 is statistical
noise, nothing like the 12–23-sample unanimous votes in §25.2; (2) the **specific** call
(`off=0x124`, the one actually used at DoK file `0x27132`) doesn't even land on a `CD 3F` byte
pair at the computed position (`START.EXE 0x1013` holds `0f 00 b2 00 11`, not `CD 3F …`) — so
there is no ambiguity to resolve away, the formula's addressing is simply wrong for this
selector. This supersedes the §12.2 finding (which never had a real, DoK-native resolver to test
against) with a stronger, tool-backed negative: **`lcall 0xcf, 0x124`'s target is confirmed
UNLOCATED, not merely untried.**

### 25.4 New finding: CoK's `0xe6` and DoK's `0xcf` are almost certainly the SAME shared dispatch

Both selectors' `lcall` sites across their respective `GAME.OVR`s reference an **identical
stride-5 arithmetic sequence of call offsets** starting at `0x25`:

```
CoK sel=0xe6:  47 offsets, 0x25, 0x2a, 0x2f, … , 0x106, 0x10b                (range 0x25-0x10b)
DoK sel=0xcf:  52 offsets, 0x25, 0x2a, 0x2f, … , 0x11f, 0x124                (range 0x25-0x124)
```

CoK's 47-entry set is an **exact subset** of DoK's 52-entry set (verified: `cok_offs.issubset(dok_offs)
== True`, and `dok_offs - cok_offs == {0x110, 0x115, 0x11a, 0x11f, 0x124}` — DoK simply has 5 more
stride-5 entries at the high end). CoK's `0xe6` is exactly the selector used by the §15 rear-arc
to-hit gate (`0x1785a`: `lcall 0xe6,0xc0` and `lcall 0xe6,0x10b`). DoK's `0xcf` is exactly the
selector used by the §12.2 save-throw call (`lcall 0xcf,0x124`). Given both games share the same
Gen1 engine source, this is strong (though not byte-final) evidence that **CoK's rear-arc AC check
and DoK's saving-throw resolver call the same shared "roll/compare against a table, return a
category" utility function** — i.e. the two open mechanics in §12 and §15 are very likely the
*same* underlying routine, just invoked for different checks. This doesn't pin the routine's body
(still cross-overlay/UNLOCATED), but it means a future resolution of *either* call would likely
resolve *both* mechanics at once, and it's recorded here so neither section's follow-up work
duplicates the other.

**Correction to §9.2 of `disasm-combat-cok.md`:** that section's validation table lists
`lcall 0xE6:…` as resolving "10/12 stubs → prologues" against base `0x3AE3F`. Re-tested here with
the **full** 47-entry sample harvested from every `lcall 0xe6:…` site in `GAME.OVR` (not a smaller
hand-picked subset), the vote is **2/47** against any single base — statistically indistinguishable
from noise, and nowhere near `0x3AE3F` specifically. The `10/12` figure was very likely computed
from a small, non-representative sample of `0xe6`'s call sites (plausibly just the ones near the
movement/diagonal handler under discussion at the time) and does not hold under the complete
sample. **`0xe6` should be reclassified from "resolves" to UNRESOLVED**, consistent with `0x111` /
`0x116` / `0x128` / `0xA46`. See the addendum added to that document.

### 25.5 Root-cause diagnosis: why the flat `0x200 + sel*16` formula fails past a point

The formula's honesty note already hedged that larger selectors "live in a 2nd VROOMM stub
segment... base paragraph not `0x200/16`." That framing implies a second clean, findable table.
This pass instead measured *why* the formula degrades, using CoK's own validated 35-descriptor
list (`start_exe_off`, `fileofs`, `jmpcnt` — ground truth, not guesses): for each consecutive pair
of descriptors, `delta = next.start_exe_off - this.start_exe_off` was compared against
`this.jmpcnt * 5` (the byte length of the descriptor's own stub array). The **implied header+fixup
region size** (`delta - jmpcnt*5`) is **not constant** — it ranges `22`–`28` bytes across the 34
gaps (`docs` reproduce script below), correlating with each descriptor's own (nonzero, variable)
`fixupsz` field rather than sitting at a fixed 16-byte "paragraph slot." Trying to locate each
descriptor's *actual* stub-array start (`next.start_exe_off - jmpcnt*5`, i.e. assuming the stubs
are the last `jmpcnt*5` bytes before the next header) validates for only 2 of 34 gaps — confirming
there is *also* variable padding **after** the stub array, before the next header.

**Conclusion:** `0x200 + sel*16` is not a real address-translation formula, it is an
**approximation** that happens to land on the correct descriptor's stub table only while the
*accumulated drift* between "assume every descriptor consumes exactly `sel*16` bytes" and the true
(variable, `fixupsz`-dependent) per-descriptor size stays under about one stub record's width. For
early/small-index selectors (CoK `0xdb`, `0xa8`; DoK `0xc5`, `0x92`, `0x5a`, `0xe5` — see §25.2)
the drift hasn't yet exceeded that tolerance. For others (CoK `0x111`/`0x116`/`0x128`/`0xA46`/`0xe6`;
DoK `0xcf`) it has, and the formula instead lands **inside a different, unrelated descriptor's own
real stub array** purely by file-position coincidence — which is exactly why the vote still
occasionally finds a handful of real prologues (2/47, 2/52, 2/2) without ever converging on one
dominant, high-confidence base: the bytes being read are genuine `CD 3F` stub records, just the
**wrong overlay's**. There is no evidence for a second *flat, uniformly-strided* table anywhere in
either binary; the real per-selector table geometry is link-order-dependent and not recoverable
from file offsets alone. **Reclassifying** the open problem from "find the 2nd table's base" to
"the true selector→stub-table mapping requires the linker's real (non-16-byte-uniform) selector
numbering, which isn't present in these binaries outside of the FIXUP TABLE data each descriptor
already carries (`fixupsz` bytes — confirmed to exist, format not yet reversed)."

> **Correction (2026-09-25).** The final sentence above is superseded by the validated
> reconstruction in [`vroomm-fixup-layout.md`](vroomm-fixup-layout.md) and
> [`disasm-combat-cok.md`](disasm-combat-cok.md) §9.2. CoK's fixup bytes are sorted unique
> little-endian `u16` code-relative offsets, and the runtime selector base is `0x38`
> (1891 descriptor-owned public stubs; next-best candidate scores 730). The per-descriptor
> stub starts are recovered from the loader preambles and paragraph-rounded geometry. Thus
> the flat formula remains invalid, while selector/stub resolution is no longer an open
> geometry problem for these validated installs. Relocated segment words outside the
> recovered public-stub geometry still remain unresolved; this correction does not assign
> guessed targets to them. The current `tools/disasm_cok.py resolve` uses the validated map.

**Resident-RTL/graphics hypothesis for `0x116`/`0xA46` — tested, inconclusive.** `0x116` and
`0xA46` are each called from multiple, unrelated overlays at many different `off` values (e.g.
`0xA46` is called from both the `0xDB`-resolved and `0xA8`-resolved functions at three different
offsets each) — a pattern consistent with a permanently-resident shared library segment
(graphics/RTL) rather than a per-overlay VROOMM entry table. Tested directly: reading START.EXE at
`0x200 + sel*16 + off` **without** the `CD 3F`/`proc_off` indirection (i.e. treating it as
resident code, not a stub) does **not** yield a Borland prologue or plausible code — the bytes
there are still more `CD 3F`-patterned stub records. So this hypothesis is **not confirmed**; it
remains an open, untested-positive idea, downgraded here from "likely explanation" to "unconfirmed
hypothesis, evidence is circumstantial (multi-caller/multi-offset usage pattern only)."

**Generalized brute-force per-selector base search — tried, documented UNRELIABLE.** For a fixed
selector's full off-sample, searching *every* candidate base `C` (not just `0x200+sel*16`) for one
that makes all samples resolve to `CD 3F` stubs whose `proc_off`s land on prologues produces **many
false positives** on prologue-dense overlays: for DoK's `0xcf` 52-entry sample, dozens of candidate
`C` values across a ~1500-byte span each scored a perfect **52/52** against either
`fileofs=0x29c0c` (101-entry descriptor) or `fileofs=0x32197` (53-entry descriptor) — the vote
signal saturates once the target descriptor is stub-record-dense, so a "found a perfect match"
result from this generalized search is **not evidence of the true answer**. Not a viable shortcut;
not implemented as a tool command.

### 25.6 Part (b) dependency check

`docs/engine/research/dgroup-dynamic-trace.md` was checked before starting this pass and again
before writing it up: **it does not exist**. Per the task brief, this is not treated as a blocker —
no DGROUP/DS-segment dump was attempted here, and the DS spell-table dump (`0x72a4`, `0xc36`,
`0x31bd`) from §12.3 remains exactly as UNLOCATED as before. If/when that file appears from the
parallel DOSBox-X headless-tracing effort, re-attempt §12.3's DS dump *and* consider whether the
same runtime approach can read the actual `CS` register at the `lcall 0xe6,…`/`lcall 0xcf,…` call
sites — that would resolve §25.3/§25.4 far more directly than any further static work.

### 25.7 Verdict + concrete next step

**Resolved (this pass):** DoK now has a working, validated FBOV resolver (`overlays`/`resolve`/
`thunk` in `tools/disasm_dok.py`, 35-descriptor table, positive-controlled on 4 selectors). The
"2nd VROOMM stub segment" framing is replaced with a precise diagnosis: the formula is a
drift-prone approximation, not a two-table system, and the wrong-overlay-collision failure mode is
now demonstrated with evidence rather than assumed. CoK's `0xe6` is downgraded from "resolves" to
UNRESOLVED (§25.4), and shown to very likely be the same shared routine as DoK's `0xcf` (§12.2).

**Still UNLOCATED:** the actual saving-throw resolver body (`lcall 0xcf,0x124` target) and the
rear-arc AC body (`lcall 0xe6,0xc0`/`0x10b` target) — same call, per §25.4. Turn-undead (§13),
backstab magnitude (§14), rear-AC magnitude (§15), terrain persistence (§16), and missile-bracket
magnitudes (§17) are **unchanged** by this pass: none of their blocking selectors (`0xe6` here;
the DGROUP tables for the others) became resolvable, so none of those sections' verdicts move.
§15 gains one cross-reference (this section) tying its blocked mechanism to DoK's save-throw call.

**Concrete next static step (not attempted here, out of this pass's scope):** reverse the
per-descriptor **fixup table** format. Every descriptor carries a nonzero `fixupsz` field (e.g.
CoK descriptor 0: `fixupsz=0xe`; DoK descriptor 0: `fixupsz=0xe`) whose record layout has not been
determined. If it encodes "patch the segment word at overlay-relative offset X to the run-time
segment of logical unit Y," decoding it would directly answer "what does selector `0xcf`/`0xe6`
really point to" without needing the flawed `sel*16` arithmetic at all — a different, well-scoped
reversing task from anything attempted in this pass.

**Reproduce.**
```bash
python tools/disasm_dok.py overlays                 # DoK's own 35 FBOV descriptors
python tools/disasm_dok.py resolve 0xc5              # positive control: 23/23
python tools/disasm_dok.py resolve 0x92              # positive control: 17/17
python tools/disasm_dok.py resolve 0xcf 0x124        # UNRESOLVED (save-throw call)
python tools/disasm_cok.py resolve 0xe6 0xc0         # UNRESOLVED (rear-arc call, downgraded from "10/12")
python tools/disasm_cok.py dis 0x1785a 0x140         # the rear-arc gate issuing both lcall 0xe6 sites
python tools/disasm_dok.py dis 0x27109 0x260         # the save-throw dispatch issuing lcall 0xcf,0x124
```
