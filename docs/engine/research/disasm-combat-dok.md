# DoK Combat — Disassembled from Death Knights of Krynn's OWN Binary

**Goal:** confirm or refute, against **DoK's own machine code**, the 5 combat
mechanics our engine (`packages/engine/src/combat/tactical.ts`) currently inherits
from the **COAB** decompile (a *different* game). DoK is the same Gold Box
generation as Champions of Krynn (Gen1), so combat is expected to be near-identical;
the value here is **byte-level confirmation** from DoK and flagging any DoK deltas.

**Method, not source copy:** COAB's decompile (`coab_extracted/`) and the distilled
`docs/engine/research/combat-mechanics-coab.md` were used only as a *map* (which
routine does what, expected idioms). Every offset and verdict below was read from
**`Death Knights of Krynn/GAME.OVR`** with the project tool **`tools/disasm_dok.py`**
(capstone 16-bit real mode). No COAB or DoK source is reproduced in engine files.

---

## 1. FBOV / VROOMM container — format and unpack method

`Death Knights of Krynn/GAME.OVR` is a **Borland VROOMM overlay pool** (the same
"FBOV" mechanism documented for other DOS Borland C titles —
[Ghidra issue #5543](https://github.com/NationalSecurityAgency/ghidra/issues/5543),
[SWAG Borland Overlays QA](http://swag.dapsen.com/FAQ/0009.PAS.html)).

### Header (DoK GAME.OVR, verified)

| Off | Size | Field          | DoK value            | Meaning |
|-----|------|----------------|----------------------|---------|
| 0   | 4    | magic          | `"FBOV"`             | overlay marker |
| 4   | 4    | payload_size   | `0x0003DA2D` (252461)| = filesize − 8 (verified) |
| 8   | …    | payload        | overlay segments     | code **and** CS-relative string tables, interleaved |

In a *normal* Borland `.EXE` the `FBOV` record sits at the **end** and carries
`exeinfo` (offset to the 8-byte-per-entry `_SEGTABLE_` descriptor array:
`uint16 seg, maxoff, flags, minoff`) and `segnum`. **DoK differs in packaging:** the
loader is **`START.EXE`** (a normal MZ, **511 `INT 3F` overlay stubs** — each stub is
`CD 3F  dw ovr_id  dw proc_off  dw size`), and **`GAME.OVR` is the pure overlay
code/data pool** prefixed only by the 8-byte `FBOV`+size wrapper. (CoK's GAME.OVR is
structured identically — same loader model.)

### Unpack method actually used

GAME.OVR does **not** need byte-relocation to be *read*: each overlaid code segment is
a contiguous run of real-mode code with its own **CS-relative string table** embedded.
Strings are printed via `mov di,<cs_off>; push cs; push di; lcall print`. The key to
turning a string into a code anchor:

> **`file_offset(code) = seg_base + cs_offset(code)`**, and the *same* `seg_base`
> maps a string's file offset to the CS-relative immediate the printing code pushes.

Worked example (the death/damage segment): the strings ` dies. `, ` is hit FOR `,
` points of Damage` live at file `0x87E2`. The death routine pushes immediates
`0x1C47`/`0x1C54` to print them. `0x87ED − 0x1C47 = 0x6BA6` and `0x87FA − 0x1C54 =
0x6BA6` → **seg_base = 0x6BA6** for that overlay segment. So the function at file
`0x8832` is at **cs:0x1C8C** in that segment.

`tools/disasm_dok.py` provides: `header`, `strings` (printable runs + offsets),
`find <str>` (string-xref → candidate code refs), and `dis <fileoff> <len>` (16-bit
capstone disasm at a file offset). Cross-**segment** call targets (`lcall seg,off`)
resolve through START.EXE's stub table and are **not** flattened by this tool — a
known limitation that affects only inter-overlay control-flow tracing (see Unknowns).

---

## 2. Code-segment map (located combat routines)

All offsets are **file offsets into `GAME.OVR`** unless noted as `cs:`.

| Routine (our name)                | File off  | Conv.    | String / data anchor |
|-----------------------------------|-----------|----------|----------------------|
| **Death / damage display**        | `0x8832`  | `retf 6` | prints ` dies. `, ` is hit FOR `, ` points of Damage` (file `0x87E2`, seg_base `0x6BA6`) |
| **Morale / flee / surrender**     | `0xB4D2`  | `retf 4` | `(field&0x7F)*2` morale calc; surrender via `ds:0x2B68` |
| **Haste ×2 movement**             | `0x1D826` | `retf A` | affect byte `0xBE6D` bit1 → `[0xBE6C] <<= 1` |
| **Slow ÷2 movement**              | `0x1DB55` (+ `0x1BF79`, `0x1C173`, `0x1DD74`, `0x3194C`) | — | affect bit → `[0xBE6C] >>= 1` |
| **Base step-cost deduction**      | `0x1E2A2` | `retf A` | `sub [0xBE6C],2; sub [0xBE78],2` (orthogonal = 2 half-steps) |
| **Fractional-attack split**       | `0x13E2E` | —        | `field0xFF/2 → [0x8C52]`, `field0xFF&1 → [0x8C54]` |
| **Fractional-attack recombine**   | `0x144B3` | —        | `[0x8C52]<<1 + [0x8C54] → field0xFF` |
| **Spell "Begins Casting"**        | `0x2128F` | —        | inline string + prologue `55 89 E5` |
| **Char combat-status panel**      | `0x243F1` | —        | header `Class/Encumbrance/THAC0/Movement/Damage` |

### DoK combat-struct field offsets (read from the code, **differ from COAB**)

DoK's *combat* code operates on a **condensed combatant record** (~0x150–0x200 bytes),
**not** COAB's full `charStruct` (0x1A6). The algorithms match; only the byte offsets
differ. Confirmed DoK combat-struct fields:

| Field            | DoK off | COAB off | Notes |
|------------------|---------|----------|-------|
| status (enum)    | `0xC7`  | `0xC7` (status) | tested `==6` (dead) in death func — same `dead=6` enum |
| max HP           | `0x28`  | (charStruct differs) | divisor in morale wound-% |
| current HP       | `0xD6`  | `0x1A4` | the `+10` death buffer & morale wound-% use this |
| control_morale   | `0x3E`  | `0xF7`  | `>0x7F` = monster gate; `&0x7F` morale base |
| half-attacks     | `0xFF`  | `0x11C` | attacks stored in half-units (3 = 3/2) |
| moral_failure fl | `0x14` (via ptr `[di+0xBD]`) | `0x14` | flee flag set on morale fail |
| nonTeamMember    | `0x13`  | `0x13`  | `>5` → surrender instead of flee |
| facing/parity    | `0xC9`  | —       | toggled `xor al,1` (move/facing) |

Globals: `0xBE6C` = current half-moves (COAB `halfActionsLeft`/`byte_1D2C0`);
`0xBE6D` = affect bitfield (**bit 0x02 = haste**); `0xBE7B` = morale_score scratch
(COAB `byte_1D2CC`); `0x8C52/0x8C54` = whole/half attack split.

---

## 3. Per-mechanic verdicts (vs the COAB model our engine assumes)

### 1. INITIATIVE — **PARTIAL: haste×2/slow÷2 VERIFIED; per-group-vs-d10 UNLOCATED**

> **SUPERSEDED 2026-10-07:** the UNLOCATED part is resolved. The retail DoK rule (per-round d6 + DEX reaction adj, floor 1, surprise -6, one sort per round, coin-flip ties) is derived and oracle-verified in `docs/engine/research/dok-initiative.md` (`tools/dok_initiative.py`). The text below is the earlier, partial reading.

Our engine assumes a *stored* per-combatant value, ×2 hasted / ÷2 slowed, sorted
high-first, **not** a per-round d10. DoK's code at **`0x1D826`** confirms the
**haste = ×2** and (`0x1DB55` et al.) **slow = ÷2** modifiers — applied to the
half-move/action value `[0xBE6C]`:

```
01D829  mov al,[0xBE6D]     ; affect flags
01D82C  and al,2            ; HASTE bit
01D830  je  +0x0A
01D832  mov al,[0xBE6C]
01D837  shl ax,1            ; *2
01D839  mov [0xBE6C],al
```

The **stored-initiative-field sort** (and the *refutation* of per-round d10) could
**not** be located by static pattern — the turn-order builder lives behind the
combat-loop dispatcher, reached via cross-segment overlay stubs the flat tool cannot
follow. No `d10` (`bound 10`) roll was found in the located combat code, but absence
is not proof. **Verdict: the spell-modifier half of the model is VERIFIED in DoK;
the "stored, not rolled, sorted high-first" claim is UNLOCATED (consistent with the
haste/slow evidence, but not byte-confirmed).** No evidence DoK differs from CoK here.

### 2. DIAGONAL MOVEMENT (1.5×) — **PARTIAL: half-step unit VERIFIED (ortho=2); diag=3 site UNLOCATED**

DoK stores movement in **half-steps** and the base per-step deduction is **2**
(`0x1E2A2`: `sub [0xBE6C],2; sub [0xBE78],2`) — confirming the unit model
(orthogonal = 2 half-steps). The **diagonal = 3** rule in COAB lives in the
*path-cost/stepping* logic, not the deduction site; no literal
`sub [0xBE6C],3` / `+1-if-diagonal` was found at the deduction. **Verdict: half-step
encoding (ortho=2) VERIFIED; the explicit diagonal=3 cost site is UNLOCATED in DoK
(consistent with COAB, not byte-confirmed).** No CoK/DoK delta evidence.

### 3. DEATH — **VERIFIED, byte-identical to COAB (damage > hp + 10)**

DoK's death/damage display (`0x8832`) reads current-HP (field `0xD6`), adds **10**,
and only proceeds to "dies" when **damage > hp + 10**:

```
008868  mov al, es:[di+0xD6]   ; current HP
00886D  xor ah,ah
00886F  add ax, 0x0A           ; hp + 10
008872  cmp ax, [bp+0xA]       ; vs damage
008875  jae  not_killed        ; hp+10 >= damage -> survives (-> "is hit FOR")
```

Raw bytes `30 E4 05 0A 00 3B 46 0A 73 35`. The function also early-outs if status
(`field 0xC7`) `== 6` (already `dead`). **Verdict: VERIFIED-MATCHES-COAB.** `hp==0` =
down/revivable; truly `dead` only when a single hit's damage > `hp+10`. No DoK delta.

### 4. ATTACKS — **VERIFIED, fractional half-units (3/2), matches COAB**

DoK stores attacks in **half-units** in combat-struct field **`0xFF`**. At `0x13E2E`:

```
013E32  mov al, es:[di+0xFF]
013E39  shr ax,1   ; whole attacks   -> [0x8C52]
013E47  and al,1   ; the half (carry) -> [0x8C54]
```

and recombines at `0x144B3` (`[0x8C52]<<1 + [0x8C54] → field0xFF`). This is the
COAB `(whole, carry)` split that yields **2 swings one round / 1 the next** for a 3/2
fighter. **Verdict: VERIFIED-MATCHES-COAB.** (The exact round-parity *which* round
gets the extra swing is in the loop consuming `[0x8C52]/[0x8C54]`; consistent with
COAB's `combat_round` parity.) No DoK delta.

### 5. MORALE — **VERIFIED, percentage model, near byte-identical to COAB**

DoK morale function (`0xB4D2`):

```
00B4D5  cmp es:[di+0x3E], 0x7F ; control_morale > 0x7F => monster (AI) gate
00B4E2  mov al, es:[di+0x3E]
00B4E6  and al,0x7F
00B4EA  shl ax,1               ; morale_score = (ctrl & 0x7F) * 2
00B4EC  mov [0xBE7B],al
00B4EF  cmp [0xBE7B],0x66      ; clamp to 102
00B4F4  jbe +5
00B4F6  mov [0xBE7B],0         ; (>102 -> 0, same quirk as COAB)
...     wound% = 100 - (curHP*100 / maxHP)   ; HP=0xD6, maxHP=0x28
00B533  cmp morale_score, wound% ; jl => fail
```

Failure path (`0xB591`): gets remaining movement, `shr 1` (÷2), and if
`movement/2 <= morale_score` sets the **flee flag** (`[di+0xBD]→[+0x14]=1`); if
`field 0x13 (nonTeamMember) > 5` prints **Surrender** (`ds:0x2B68`) and clears
actions. **Verdict: VERIFIED-MATCHES-COAB** — percentage system `(ctrl&0x7F)*2`
clamped at 102, compared to %HP-lost; flee vs surrender on the same field 0x13 > 5
test. **No DoK delta** (the clamp-to-102 quirk is present in DoK exactly as in COAB).

---

## 4. DoK-vs-CoK / DoK-vs-COAB differences found

| Area | Difference | Impact |
|------|-----------|--------|
| **Combat struct layout** | DoK uses a **condensed combatant record** (HP=`0xD6`, maxHP=`0x28`, morale=`0x3E`, status=`0xC7`, half-attacks=`0xFF`) vs COAB's full `charStruct` offsets (HP=`0x1A4`, morale=`0xF7`, attacks=`0x11C`). | Loader/struct mapping only — **algorithms identical**. |
| **Combat strings** | DoK does **not** carry the menu/verb strings (`Move Cast View Encamp`, `forced to flee`, `Surrenders`) inline in GAME.OVR; they are in **DS data segments / ECL string tables** (e.g. surrender at `ds:0x2B68`). COAB had some inline. | Cosmetic; mechanics unaffected. |
| **No mechanics divergence** | Every located mechanic (death +10, morale %, fractional attacks, haste/slow) is **byte-faithful to the CoK/Gen1 model**. | **DoK = Gen1, confirmed.** No DoK-specific combat rule change found in the located code. |

**No evidence of any DoK-only combat feature** in the located routines. DoK's
"additions over CoK" (where they exist) appear to be content/encounter-level (in ECL
scripts and data), **not** changes to the core tactical resolution above.

---

## 5. Delta table — what `tactical.ts` needs for DoK

The earlier COAB-grounded corrections in `combat-mechanics-coab.md` are **valid for
DoK** (now confirmed against DoK's own bytes). DoK adds **no** new requirements; it
only *confirms* and supplies DoK struct offsets for the future data loader.

| # | Mechanic | tactical.ts assumption | DoK verdict | Action |
|---|----------|------------------------|-------------|--------|
| 3 | Death | `hp<=0` slays | **VERIFIED**: dead only if `dmg > hp+10` | implement `hp+10` buffer + unconscious/dying states |
| 5 | Morale | "2d6 vs 12" | **VERIFIED**: `(ctrl&0x7F)*2` clamp 102 vs %HP-lost; flee/surrender | replace with percentage model; surrender if nonTeamMember>5 |
| 4 | Attacks | flat integer/round | **VERIFIED**: half-units, whole=`field/2`, extra half on alt rounds | store half-attacks; alternate extra swing by round parity |
| 1 | Initiative | per-round d10 ascending | **PARTIAL**: haste×2/slow÷2 VERIFIED; sort/d10-refute UNLOCATED | apply ×2/÷2; treat stored-not-rolled as COAB-grounded pending trace |
| 2 | Diagonal | Chebyshev cost 1 | **PARTIAL**: half-step unit (ortho=2) VERIFIED; diag=3 UNLOCATED | use half-step units; diagonal=3 per COAB pending trace |

**Loader note (future):** when DoK combatant data is loaded, map DoK offsets
HP=`0xD6`, maxHP=`0x28`, morale=`0x3E`, status=`0xC7`, half-attacks=`0xFF` (not the
COAB charStruct offsets).

---

## 6. Open questions / unknowns

| # | Question | Status |
|---|----------|--------|
| 1 | Initiative ordering routine: stored-field sort vs any per-round roll — refute d10 in DoK directly. | **UNLOCATED** — behind cross-segment combat-loop dispatcher; flat tool can't follow `lcall seg,off` overlay stubs. |
| 2 | Diagonal = 3 half-steps: locate the path/stepping cost site in DoK (deduction site is uniform 2). | **UNLOCATED** — likely in a stepping-path overlay segment not yet anchored by a string. |
| 3 | Where DoK's combat code reads `control_morale`/initiative *source* values (encounter setup) — same OQ-1 as COAB. | **UNKNOWN** — encounter/ECL pre-processing, not in the located combat routines. |
| 4 | Full overlay segment table: building START.EXE's stub→GAME.OVR segment map would let the tool follow inter-segment calls. | **Future work** — parse the 511 `INT 3F` stubs + `_SEGTABLE_` to map `ovr_id → file range`. |

---

## 7. Reproduce

```
python tools/disasm_dok.py header
python tools/disasm_dok.py dis 0x8832 200     # death/damage (+10 rule)
python tools/disasm_dok.py dis 0xB4D2 200     # morale (%-based)
python tools/disasm_dok.py dis 0x1D826 40      # haste x2 movement
python tools/disasm_dok.py dis 0x13E2E 60      # fractional-attack split
python tools/disasm_dok.py dis 0x1E2A2 16      # base step cost = 2 half-steps
python tools/disasm_dok.py find "is hit FOR"   # string-xref anchor
```

**Sources:** DoK binary `Death Knights of Krynn/GAME.OVR`, `…/START.EXE`;
[Ghidra FBOV issue #5543](https://github.com/NationalSecurityAgency/ghidra/issues/5543);
[SWAG Borland Overlays QA](http://swag.dapsen.com/FAQ/0009.PAS.html). COAB map only:
`coab_extracted/`, `docs/engine/research/combat-mechanics-coab.md` (no source copied).
