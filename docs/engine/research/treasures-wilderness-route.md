# Treasures of the Savage Frontier — the wilderness leg

**Status: proven (static, byte-level).**
**Scope:** what selects wilderness mode in Treasures, what actually loads `WILDCOM.DAX`, which script
block is the overland map, how a party gets into it, and that a wandering encounter on that map runs
end-to-end through the real `EclVm` on retail bytes.

**Evidence class:** retail file bytes + static disassembly of the retail overlay + real-VM execution
in `packages/engine`. **No DOSBox-X / native trace was run** (the task forbade it). Every claim below
is either a byte assertion you can re-check or a VM run you can re-execute; nothing is hand-simulated.

Golden test: `packages/engine/test/treasuresWildernessRoute.test.ts` (12 tests, all passing against
the retail install, no skip when the data is present).

Retail install used (read-only):
`C:\Program Files (x86)\GOG Galaxy\Games\Treasures of the Savage Frontier\`
resolved via `goldbox_corpus.choose_install` / `file_index`, not hardcoded in tooling.

Addressing convention used throughout: Gen1 `vbase = 0x7FFE`, so **file offset = vaddr − 0x8000 + 2**.
Dialect is `ECL_GEN1_SHORT_TREASURES` (word sets `{0x0C:4, 0x1D:0, 0x21:2, 0x22:0, 0x23:0, 0x2C:1}`,
`cellDescAddr = 0x002d`). Gen1 `SAVE` is **(source, destination) — destination last**.

---

## 0. Why this leg looked "structurally absent" and is not

The corpus-wide Gen1 area-mode scan (`tools/map_gen1_area_mode_writes.py`, which looks for
`SAVE <n>, 0x4BE6`) reports **zero** wilderness-mode writes for Treasures, even though the game ships
`WILDCOM.DAX`. That zero is a **model mismatch, not an absence**.

`0x4BE6` is the CoAB/Gateway host address of `Area1.inDungeon`. In those titles the ECL VM exposes the
raw host segment, so a script literally writes the word `0x4BE6`. **Treasures does not expose host
addresses at all** — it uses a small remapped window (§1). Precisely (reworded 2026-08-06; an
earlier draft said `0x4BE6` "is not in this title's address space at all", which is imprecise):
the verified range ladder at file `0x79F6` classifies `0x4BE6` as **type 4**, and the setter's
type dispatch (files `0x7D77` / `0x7D87`) handles only types 0/1/2 before falling through to a
bare `retf` — so **a script write to `0x4BE6` would be silently discarded**. It is therefore
meaningless in this title. Consistently, scanning every word-operand encoding this VM accepts
(codes `0x01`/`0x02`/`0x03`/`0x7F`) across all 30 blocks finds **0 occurrences** of `0x4BE6`.

## 1. Treasures' ECL memory model: `location → area[location − 1]`

`GAME.OVR` is a Borland **FBOV/VROOMM** overlay pool (`46 42 4f 56` = `"FBOV"` at offset 0, file length
310,572). Overlay code segments are located from the 47 descriptor records in `GAME.EXE`
(`CD 3F 00 00` + dword file-offset + word codesz + word fixupsz + word jmpcnt). The two that matter:

| GAME.EXE descriptor | GAME.OVR file offset (segment base) | codesz | contents |
|---|---|---|---|
| `0x0728` | `0x07354` | `0x1A42` | `vm_GetMemoryValueType`, `vm_SetMemoryValue` |
| `0x0806` | `0x0C5B7` | `0x21B0` | `SetupGroundTiles` + the floor-builder dispatch |

**`vm_GetMemoryValueType`** — segment `0x7354`, local `0x0690` (file `0x79E4`). The range ladder at
file `0x79F6` (asserted byte-for-byte in test B):

```
83 7e 06 01     cmp  word [bp+6], 1        ; location
72 0d           jb   .not_area
81 7e 06 00 04  cmp  word [bp+6], 0x0400
77 06           ja   .next
c6 46 ff 00     mov  byte [bp-1], 0        ; type 0 = area struct
eb 26           jmp  .done
81 7e 06 01 04  cmp  word [bp+6], 0x0401
72 0d           jb   ...                   ; -> 0x0401..0x0800 = type 1 (player)
```

so: `1..0x400` → area struct, `0x401..0x800` → player, `0x8000..0xB6B0` → the ECL script buffer,
everything else → type 4 (host specials).

The **type-0 tail** of *both* accessors resolves the pointer as `area_ptr + location − 1`
(getter tail at file `0x7F60`, asserted in test B):

```
8b 46 08        mov  ax, [bp+8]            ; location
c4 3e 10 7e     les  di, [0x7E10]          ; area_ptr
03 f8           add  di, ax
81 c7 ff ff     add  di, 0xFFFF            ; += -1
```

**Independent corroboration inside our own engine:** `ECL_GEN1_SHORT_POOLS` in
`packages/engine/src/ecl/disassemble.ts` already carries `lastBlockIdAddr: 0x0016` documented as
"CMD_NewECL's Area+0x15 store" — the same `loc = field + 1` relation, derived earlier and independently
for a sibling title.

New-game init (file `0x1FDB7`) memsets **0x400** bytes of the area struct — exactly the type-0 window
size — and then sets `area[0x21] = 1`.

## 2. Treasures' own `inDungeon` is ECL location `0x0022` — and the corpus never writes it

`vm_SetMemoryValue` special-cases one area field. At file `0x7CE9` (test B pins all 54 bytes):

```
3d 21 00        cmp  ax, 0x21              ; ax = location-1  => ECL location 0x0022
75 33           jne  .normal
c4 3e 10 7e     les  di, [0x7E10]
26 8a 45 21     mov  al, es:[di+0x21]
30 e4           xor  ah, ah
3b 46 08        cmp  ax, [bp+8]            ; unchanged?
74 22           je   .done
c6 06 c0 a0 00  mov  byte [0xA0C0], 0
a0 24 7e        mov  al, [0x7E24]          ; game_state
a2 25 7e        mov  [0x7E25], al          ; previous game_state
83 7e 08 00     cmp  word [bp+8], 0
75 0c           jne  .dungeon
c6 06 24 7e 03  mov  byte [0x7E24], 3      ; game_state = wilderness
31 c0           xor  ax, ax
a3 c8 a0        mov  [0xA0C8], ax
eb 05           jmp  .done
c6 06 24 7e 04  mov  byte [0x7E24], 4      ; game_state = dungeon
```

The matching **getter** case (file `0x7F1C`) proves the same byte is the dungeon/wilderness
discriminator from the script's point of view: ECL location `0x0011` (facing) returns the raw 8-way
host direction when `area[0x21] == 0`, and the halved 4-way ordinal otherwise.

So Treasures *does* have an `inDungeon`, at ECL location `0x0022`. **And the whole 30-block corpus
never references it.** *Scan recall, stated explicitly (added 2026-08-06 — the earlier text cited
only the `01 22 00` form, and a code-`0x01`-only scan is not the recall of "references to this
address": `packages/engine/src/ecl/vm.ts`'s `rvalue` treats `0x01`, `0x02`, `0x03` and `0x7F` all
as word/memory operands).* Scanning **every** word-operand encoding rather than `0x01` alone:
`0x4BE6` = **0** raw hits; `0x0022` = **2** raw hits (`03 22 00` block 32 @`0x8A8D`, `7F 22`
block 51 @`0x8A6A`), both proven **NOT instruction-aligned** by a reachable-instruction walk under
`ECL_GEN1_SHORT_TREASURES`, which finds **0** references to `0x0022`, **0** to `0x4BE6`, **0** to
`0xC04F` and **174** to `0x002D`; `0x0040` = **22** raw hits, all of them the same 22
`SAVE`-immediates of §4. That is an honest, independent negative about the *flag*, not merely
about the wrong address — and it is why the mechanism had to be somewhere else.

## 3. What actually loads `WILDCOM.DAX`: `SetupGroundTiles`, and a **second** flag `area[0x3F]`

The archive names are stored as Borland Pascal length-prefixed literals in the second overlay segment
(base `0xC5B7`), at file `0xD493`:

```
07 44 75 6e 67 43 6f 6d   .DungCom
07 57 69 6c 64 43 6f 6d   .WildCom
```

**Mixed case** — this is why a case-sensitive `WILDCOM` search over the binary finds nothing and the
name looks "constructed". They are locals `cs:0x0EDC` (DungCom) and `cs:0x0EE4` (WildCom).

`SetupGroundTiles` starts at local `0x0EFC` (file `0xD4B3`). Its predicate, at file `0xD4BF`:

```
c4 3e 10 7e  26 80 7d 21 00  74 5b   les di,[0x7E10]; cmp byte es:[di+0x21],0 ; je  .wild
c4 3e 10 7e  26 80 7d 3f 00  75 50   les di,[0x7E10]; cmp byte es:[di+0x3F],0 ; jne .wild
c4 3e 10 7e  26 80 7d 51 00  75 ..   les di,[0x7E10]; cmp byte es:[di+0x51],0 ; jne <dung variant>
```

i.e. **`if (area[0x21] == 0 || area[0x3F] != 0) load WildCom; else load DungCom`.**

The wilderness arm (file `0xD525`) copies the `cs:0x0EE4` ("WildCom") literal and calls the archive
loader with `(0, 0, 0x27)`:

```
8d 7e f6 16 57  bf e4 0e  0e 57  9a c2 0a 77 0a   lea di,[bp-0x0A]; push ss,di; mov di,0x0EE4; push cs,di; call <strcpy>
b0 00 50  b0 00 50  b0 27 50  9a 25 00 59 01      push 0; push 0; push 0x27; call far 0159:0025
```

The DungCom arm immediately above uses `mov di,0x0EDC; push cs; push di` (file `0xD4E5`:
`bf dc 0e 0e 57`) and passes `0x19` instead of `0x27`.

The **same two-condition predicate** is then reused to choose the floor builder (file `0xD589`):

```
      les di,[0x7E10]; cmp byte es:[di+0x21],0; je  L1
      les di,[0x7E10]; cmp byte es:[di+0x3F],0; jne L1
      push cs; call 0x0697   ; e8 ab f6 — DUNGEON floor builder (fall-through, loc 0x0FE8)
      jmp done               ; eb 04
  L1: push cs; call 0x0EA3   ; e8 b1 fe — WILDERNESS floor builder (loc 0x0FEE)
done: mov sp,bp; pop bp; retf
```

**Wilderness floor builder = segment-local `0x0EA3`; dungeon floor builder = segment-local
`0x0697`.** (Corrected 2026-08-06. An earlier draft's pseudo-listing swapped the two call targets
relative to the byte strings it asserted in the same block — labelling `e8 ab f6` "wilderness" and
`e8 b1 fe` "dungeon" — and silently dropped the `eb 04` separating the two arms. Capstone on the
retail bytes gives the opposite: the FALL-THROUGH at loc `0x0FE8` (i.e. `area[0x21]!=0 &&
area[0x3F]==0`, the dungeon case) is `0e e8 ab f6` = `push cs; call 0x0697`, and L1 — the je/jne
target, the wilderness case — at loc `0x0FEE` is `0e e8 b1 fe` = `push cs; call 0x0EA3`. Anyone
following the earlier listing would disassemble the wrong subroutine.)

**`area[0x3F]` = ECL location `0x0040` is therefore the wilderness selector** — a per-area flag that
overrides `inDungeon` for both the tile archive and the floor generator. (What the third loader
argument `0x27` vs `0x19` *means* is not decoded; it is recorded as an observed constant.)

### 3a. Counter-argument addressed: why `area[0x3F]`, not `area[0x21]` (added 2026-08-06)

The predicate is a **disjunction**, so the earlier argument — which rested only on the ECL corpus
being silent about location `0x0022` — left the strongest objection unanswered: *if the engine
natively clears `area[0x21]` on entering the wilderness, `area[0x21]` alone would select exactly
the same set and `area[0x3F]` would be redundant.* The retail bytes settle it.

`area[0x3F]` has **ZERO native writes** anywhere in `GAME.OVR` (checked across every
`26 C6` / `88` / `89` / `FE` form with byte-displacement modrm) against **15 native reads** — it is
written only through the generic ECL setter tail. And the setter's special-case ladder (files
`0x7C53`..`0x7D2B`) covers ECL locations `0x1A` / `0x11` / `0x22` / `0x34` / `0x35` / `0x3A` /
`0x42` but **NOT `0x0040`**, so a script write to `[0x0040]` falls through to
`area_ptr + loc - 1` = `area[0x3F]`.

`area[0x21]`, by contrast, has exactly **four** native writes: `=1` twice in the 0x400-byte
area-struct init (files `0x1FDD3` and `0x201BC`) and a toggle pair at files `0x0F8D2` (`=1`) /
`0x0F8DD` (`=0`) that sits inside a **developer GEO EDITOR** — its own Pascal literals at file
`0x0F5D0` read `"\x08Overland\x08Dungeon "` and `"Map 1 2 3 Dir Walls Lo Sa Out Ind ExU"`, whose
`Ind` item is that toggle. In normal play `area[0x21]` is therefore 1, the `area[0x21]==0`
disjunct never fires, and the predicate reduces to **`area[0x3F] != 0`**. The editor's own
Overland/Dungeon labels independently corroborate `area[0x21]` as the wilderness/dungeon
discriminator. (Not enumerated: the other 31 native readers of `area[0x21]` and 15 of
`area[0x3F]`; no claim is made that `area[0x3F]` has no further effects.)

## 4. Exactly one playable area block raises `[0x0040]`: `ECL1.DAX#51`, the overland map

Census of the Gen1 encoding `09 00 vv 01 40 00` (`SAVE #vv → [0x0040]`) over all 30 blocks (test E):
**22 sites**, of which **20 write 0** (each in its own `initial_entry`) and **2 write 1**:

| block | vaddr | value | what it is |
|---|---|---|---|
| 4 | `0x83A7` | 1 | the attract/demo script |
| 51 | `0x808E` | 1 | **the overland map** |

Both `=1` sites are immediately followed by a GEO load, which is the corroboration:

```
block 4  @0x83A7:  09 00 01 01 40 00   09 00 02 01 42 00   21 00 33 00 33
                   SAVE #1,[0x0040]    SAVE #2,[0x0042]    LOAD_FILES #51,#51
block 51 @0x808E:  09 00 01 01 40 00   09 00 33 01 16 00   21 01 ee 02 01 ee 02
                   SAVE #1,[0x0040]    SAVE #51,[0x0016]   LOAD_FILES [0x02EE],[0x02EE]
```

Block 4 is disclosed rather than hidden: it is the attract sequence and it hard-codes GEO 51 (a
wilderness map). **Corrected 2026-08-06:** an earlier draft said block 4 "halts early on the `0x41`
opcode", so its `[0x0040]=1` site was unreachable. The retail byte at `ECL1#4` offset 80 (vaddr
`0x804E`) is **`0x42`**, not `0x41` — and `0x42` is precisely the opcode
`ECL_GEN1_SHORT_TREASURES` already overrides (`TREASURES_EXT_42`), so under this profile's own
dialect block 4 does **not** halt there and its `0x83A7` site **is** reachable in a
fall-through-inclusive walk. It is nevertheless not a playable-area write for a different and
sounder reason: **`GEO1.DAX` contains no block 4** (its ids are 16–40, 47, 49, 50, 51–62), so
block 4 is not a walkable area. It is corroborating, not load-bearing.

Also corrected: `ECL1#51` **does** contain a statically reachable bad opcode **`0x41`** at vaddr
`0x8517`, on a scripted-site arm this route never touches — that part of the earlier disclosure
was about the right block and the right opcode.

All 20 zero-writes are reachable from their own block's `initial_entry` under
`ECL_GEN1_SHORT_TREASURES` (verified by BFS, 2026-08-06). Nine blocks — **17, 22, 27, 32, 34, 35,
36, 37, 38** — contain no `[0x0040]` write at all, so they neither raise nor clear the flag;
whether they are entered only from other dungeon areas is **not** established here.

`ECL1.DAX#51` is 7,882 bytes; header magic `0x1388`; `vm_run_1 = 0x80F9`, `search_location = 0x8158`,
`pre_camp_check = 0x80C4`, `camp_interrupted = 0x80EB`, `initial_entry = 0x8014`.

## 5. One script, seven maps: how a party enters the wilderness

The overland map is **one ECL block driving seven GEO blocks**. `GEO1.DAX` holds 41 blocks, twelve of
which (48, 52–62) have no same-id ECL block; ids **51–57** are the ones the handoffs actually pass. The
runtime GEO id lives in `[0x02EE]` and `ECL1#51` loads it dynamically (`LOAD_FILES [0x02EE],[0x02EE]`
above), which is why there is no per-map wilderness script.

The handoff protocol, read from `ECL1.DAX#16` (`vm_run_1 = 0x86AC`), map-exit arm (test F):

```
0x8A3A  09 00 0e 01 ec 02   SAVE #14 -> [0x02EC]   ; X
0x8A40  09 00 04 01 ed 02   SAVE  #4 -> [0x02ED]   ; Y
0x8A46  09 00 03 01 eb 02   SAVE  #3 -> [0x02EB]   ; facing = west
0x8A4C  09 00 39 01 ee 02   SAVE #57 -> [0x02EE]   ; GEO block id
0x8A52  20 00 33            NEWECL #51
```

and `ECL1#51`'s `initial_entry` reads it straight back (destination last):

```
0x80A1  09 01 ed 02 01 35 00   [0x02ED] -> [0x0035]   ; Y
0x80A8  09 01 ec 02 01 34 00   [0x02EC] -> [0x0034]   ; X
0x80AF  09 01 eb 02 01 11 00   [0x02EB] -> [0x0011]   ; facing
```

`0x02EB..0x02EE` are inside the type-0 window of §1 (`1..0x400`), i.e. they are ordinary fields of the
**area struct** — `[0x02EE]` is `area[0x2ED]`. That is precisely why they work as a handoff: the area
struct is not the script buffer, so those four words survive `NEWECL #51` swapping the ECL block out.
(Inference, from the §1 range ladder — not separately traced.)

**Running it (test H, real `EclVm`, not a hand-trace):** seeding only the four words block 16 wrote and
entering at `initial_entry` (`0x8014`) leaves
`[0x0040]=1`, `[0x0016]=51`, `[0x0034]=14`, `[0x0035]=4`, `[0x0011]=3`, `[0x0022]` untouched (0),
and emits exactly one `loadFiles` effect with `geoBlockId = 57`.

**This particular run is dialect-INSENSITIVE and is therefore NOT evidence for the Treasures
dialect** (measured 2026-08-06): the shared `ECL_GEN1_SHORT` and the long `ECL_GEN1` both also
produce `[0x0040]=1`, `[0x0016]=51` and `loadFiles geoBlockId 57`, halting only later — before
the pose read-back — which leaves `[0x0034]`/`[0x0035]` unwritten. The run corroborates the
flag-and-GEO claim; only the `[0x0034]`/`[0x0035]`/`[0x0011]` read-back at `0x80A1`–`0x80AF`
distinguishes the dialects.

**Every handoff site, not a spot check (measured 2026-08-06).** Every `NEWECL #51` (`20 00 33`)
in the corpus — 20 sites across 18 blocks: 16 `0x8A52`, 18 `0x82E2`, 19 `0x8167`, 20 `0x8262`,
21 `0x80FD` and `0x8A32`, 23 `0x828F`, 24 `0x8590`, 25 `0x8139`, 28 `0x8877`, 29 `0x81A8`,
30 `0x837B`, 31 `0x848A`, 33 `0x83D4`, 38 `0xA3BD`, 39 `0x84FF` and `0x8C3F`, 40 `0x81C8`,
49 `0x83AB`, 50 `0x8344` — is immediately preceded by the same protocol writing `[0x02EC]` (X),
`[0x02ED]` (Y), `[0x02EB]` (facing) and `[0x02EE]` (GEO id). The GEO ids handed over are exactly
**{51,52,53,54,55,56,57}**: seventeen sites pass an immediate, and the three `GETTABLE` sites
resolve inside the same set (block 28 `0xB415` = `[51,53,53]`, block 39 `0x9DF3` =
`[56,56,56,55]`, block 50 `0x8A7C` = `[51,56,54]`). So "one script, seven maps" is **measured,
not inferred** — this supersedes the earlier caveats "only spot-checked at `ECL1#16 → 57`" and
"GEO ids 51–57 is an INFERENCE". One unresolved edge: block 28 indexes its 3-byte table with
`[0x0011] & 3`, so facing 3 would read a 4th byte of 4 — recorded, not explained.

## 6. `[0x0034]`/`[0x0035]` are X/Y — proven from the retail engine

**The decisive evidence is in the binary, not in a statistic** (added 2026-08-06; an earlier
heading claimed proof while the body and caveat 8 both conceded only a 17-vs-1 count over a
partially unresolved table). Treasures' ECL accessors special-case ECL location `0x0034` → host
byte `[0xA0C2]` and `0x0035` → `[0xA0C3]` (getter `GAME.OVR` file `0x7F00` `cmp ax,0x33` /
`0x7F0E` `cmp ax,0x34`; setter file `0x7C72` / `0x7C85`), and the retail **single-step routine**
at file `0x87FF` dispatches on facing `[0xA0C4]`: `0 → dec [0xA0C3]`, `2 → inc [0xA0C2]`,
`4 → inc [0xA0C3]`, `6 → dec [0xA0C2]`, each wrapping `0..0x0F` on a 16×16 grid. Therefore
**`[0x0034]` = X and `[0x0035]` = Y**.

The 22-row site-table statistic below is kept as **corroboration only**.

`ECL1#51` carries a 22-row named-site table used by `GOSUB 0x9A01` (the "don't roll a wandering fight on
a scripted site" guard), which returns EQ when `[0x02EE]` matches the row's GEO id **and**
`[0x0034]==a` **and** `[0x0035]==b`. The three columns are at vaddrs `0x9B3A` (geo id), `0x9B50` (a),
`0x9B66` (b), 22 bytes each. GEO ids:

```
57 57 56 56 56 55 55 54 54 53 53 52 52 51 51 51 51 52 56 54 52 51
```

Cross-checking each `(a,b)` against the **retail GEO descriptor plane** (`raw[514 + y*16 + x]`):

* reading `(a,b)` as `(x,y)` → **17 of 22** rows land on a *marked* descriptor (high nibble set);
* reading it transposed as `(y,x)` → **1 of 22**.

That asymmetry is the X/Y identification. The **last five rows land on unmarked terrain under both
readings**; they are recorded as-is and are **not** claimed to be cities.

## 7. The per-step wandering-encounter chain, on real bytes

`ECL1#51` `search_location` (test I), all vaddrs asserted:

```
0x82E5  08 00 63 01 c7 00               RANDOM #99 -> [0x00C7]
0x82EB  2f 00 0f 01 2d 00 01 bf 00      AND #15, [0x002D] -> [0x00BF]     ; terrain = cellDesc & 15
0x82F4  2a 01 f3 9c 01 bf 00 01 c6 00   GETTABLE [0x9CF3],[0x00BF] -> [0x00C6]
0x82FE  03 01 c7 00 01 c6 00  1b        COMPARE [0x00C7],[0x00C6] ; IF_GE -> miss
0x830A  02 01 01 9a  16                 GOSUB 0x9A01 (named site?) ; IF_EQ -> skip
0x8313  02 01 49 97  17                 GOSUB 0x9749 (roster)      ; IF_NE -> skip
0x831C  24                              COMBAT
```

Note the cell descriptor is read from **`[0x002D]`** — established by the byte assertion
`2f 00 0f 01 2d 00 01 bf 00` at `0x82EB` (and the matching read in `vm_run_1` at `0x80F9`), and
corpus-wide by **174** reachable references to `[0x002D]` against **0** to `[0xC04F]`.
**The test-K run does NOT discriminate this** (measured 2026-08-06; an earlier draft cited it as
corroboration): with `cellDescAddr` deleted from the dialect — so `primeSearchLocation` seeds only
`0xC04F`/`0x7F79`, the CoK/DoK convention — the same print / partyStrength / print /
encounterSetup / menu chain still fires, because `[0x002D]` then defaults to 0 → terrain 0 →
chance 8 > the forced roll of 0.

The two retail per-terrain tables, read out of the block:

| terrain | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| encounter % (`0x9CF3`) | 8 | 0 | 15 | 40 | 15 | 40 | 0 | **65** | 2 | 5 | 2 | 8 | 4 | 0 | 5 | 5 |
| clock cost (`0x9D03`) | 11 | 11 | 14 | 16 | 12 | 16 | 16 | 16 | 8 | 9 | 5 | 11 | 8 | 8 | 8 | 6 |

`vm_run_1` (`0x80F9`) recomputes the same `terrain = [0x002D] & 15` and charges the clock cost
(`0x813D: 34 01 c0 00 00 03` = `ECL_CLOCK [0x00C0],#3`) before `search_location` rolls.

## 8. The route, and the encounter actually firing

**Route.** From the pose block 16 hands over (14,4 facing west on `GEO1#57`), eight legal directed
steps reach the terrain-7 cell (12,10):

```
(14,4) → (14,5) → (13,5) → (12,5) → (12,6) → (12,7) → (12,8) → (12,9) → (12,10)
```

`tools/find_geo_path.py --geo GEO1.DAX --block 57 --start 14,4 --target 12,10 --facing west`
→ `step_count 8`, `blocked_cell_count 0`. Test J re-verifies every edge directly against the retail
GEO wall planes (`raw[2:258]` / `raw[258:514]`) and door flags (`raw[770:1026]`): each crossed edge has
wall slot 0 or a door flag, and **no** flag 2 (bash/pick) or 3 (knock) anywhere on the route. The
descriptors crossed are `09 20 25 00 45 05 04 07 07`, i.e. encounter chances `5 8 40 8 40 40 15 65 65`.

**Firing it (test K, real `EclVm`).** On the final cell, `primeSearchLocation(block51, desc=0x07, …)`
with the dialect's `cellDescAddr` seeded and every `RANDOM` forced to 0 produces, in order:

* `print "SNOWING"` (the weather line),
* a `partyStrength` check,
* `print "ENEMIES ATTACK!"`,
* an `encounterSetup` effect,
* a `menu` `{style: horizontal, items: ["ATTACK","FLEE"]}` — the game's own prompt, `awaiting-input`.

`resume(0)` (ATTACK) returns `status: 'combat'` with a `combat` effect carrying three real groups:
`monsterId 108 ×1`, `53 ×3`, `30 ×5`.

**Negative control on the same cell/block/dialect (test K).** Forcing only the 99-roll to 98 (≥ the
terrain-7 chance of 65) makes the block **exit silently**: no `combat`, no `menu`, and the block's own
memory shows `[0x00C6] = 65` (the chance) and `[0x00C7] = 98` (the losing roll). Positive and negative
control differ in exactly one rolled value.

**Chance-table control — the genuinely discriminating one (added 2026-08-06).** Under the forced
roll of 0 the encounter fires on **every** cell of this route whose terrain chance is non-zero
(chances `5 8 40 8 40 40 15 65 65`), so **the terrain-7 (65 %) target cell is convenience, not
evidence**; the earlier draft presented the high chance as if it were load-bearing, and the single
negative control above only varies the *roll*, never the *table*. The control that exercises the
table itself, on the same block, dialect and forced roll 0: descriptors with terrain **1, 6 or
13** (table chance 0) exit silently with no combat and no menu, while terrains
0, 2, 3, 4, 5, 7, 8–12, 14, 15 all fire. **A third gate is also demonstrable:** at the site-table
row-0 pose (GEO 57, `[0x0034]=15`, `[0x0035]=4`) the `GOSUB 0x9A01` named-site guard diverts the
run to a scripted arm with no `encounterSetup` effect.

**Roster reality check (test L).** Each requested `monsterId` resolves in the retail `MON1CHA.DAX`
through `decodeMonsterArchive(bytes, 'treasures-of-the-savage-frontier')` to a record with a non-empty
name and non-zero hit points.

---

## What this does NOT establish

* **No native/DOSBox-X trace.** The task forbade it. The engine-side claims are static disassembly of
  the retail `GAME.OVR` plus byte assertions; the runtime claims are our own `EclVm` executing retail
  block bytes. Neither observes the shipped DOS binary running.
* **No browser wiring.** There is no `?explore=` route id, no live-site check, and no e2e acceptance
  claimed for this leg. This is a data/VM-level proof only.
* The WildCom loader's third argument (`0x27`, vs DungCom's `0x19`) is an **observed constant**, not
  decoded. Likewise `[0x7E25]`, `[0xA0C0]`, `[0xA0C8]` in `vm_SetMemoryValue` are transcribed, not
  interpreted.
* `area[0x51]` (the third condition in `SetupGroundTiles`, selecting a DungCom variant) is untouched by
  this leg and unexplained.
* The 22-row site table's **last five rows** do not land on marked GEO descriptors under either
  reading. They are recorded, not claimed to be cities.
* `ECL1#51` contains a statically reachable **bad-opcode halt** — opcode `0x41` at vaddr `0x8517` — on a
  scripted-site arm the route in §8 never reaches, so coverage of block 51 is incomplete.
  **Corrected 2026-08-06:** `ECL1#4`'s early halt is on opcode **`0x42`** at vaddr `0x804E`, not
  `0x41` — and `0x42` is the opcode this profile's dialect already overrides
  (`TREASURES_EXT_42`), so block 4 does **not** halt under that dialect and its `[0x0040]=1` site
  **is** reachable in a fall-through-inclusive walk. It is excluded as a playable-area write for a
  different reason: `GEO1.DAX` has no block 4 (ids 16–40, 47, 49, 50, 51–62). Its identification
  as the attract/demo script rests on prior repo work (the `ECL_GEN1_SHORT_TREASURES` doc comment
  in `packages/engine/src/ecl/disassemble.ts`, which cites a native-RAM observation), not on
  anything established here.
* The 8-step route is *a* legal path, not a claim about what a player would do; the leg's proof is that
  the mechanism runs, not that this is the canonical journey. Under the forced roll of 0 the
  encounter fires on every non-zero-chance cell of it, so the terrain-7 target is convenience, not
  evidence — see §8's chance-table control for the discriminating one.
* ~~Which GEO id each town hands over is only spot-checked at `ECL1#16 → 57`.~~ **Superseded
  2026-08-06:** all 20 `NEWECL #51` sites across 18 blocks were enumerated and the handed-over GEO
  ids are exactly {51..57}, three of them via `GETTABLE` that resolve inside the same set (see §5).
  One unresolved edge remains: block 28 indexes a 3-byte table with `[0x0011] & 3`, so facing 3
  would read a 4th byte of 4.
* The §5 `initial_entry` run is **dialect-insensitive** and is not evidence for
  `ECL_GEN1_SHORT_TREASURES`; only the `0x80A1`–`0x80AF` pose read-back distinguishes the
  dialects. The §8 positive run likewise does **not** discriminate `cellDescAddr` (see §7).
