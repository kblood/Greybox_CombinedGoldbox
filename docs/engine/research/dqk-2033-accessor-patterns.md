# DQK `0x2033` Operand Parser Accessors

This note records the current source-recovery evidence for the DQK far-call family
`0x2033:0013` / `0x2033:0112`. These helpers are now classified as current-stream operand parsing and
typed operand access, not as a standalone spell-definition table accessor or a global context selector.

## Mapping Status

The normal FBOV overlay resolver does not currently map segment `0x2033`:

```powershell
python tools/disasm_dqk.py --resolve 0x2033 0x0013
python tools/disasm_dqk.py --resolve 0x2033 0x0112
```

Both commands report `UNRESOLVED: no stubs found dispatching to seg 0x2033`. The matching helper body is
instead in the overlay-3 code window with this effective subsegment mapping:

```text
0x2033:0000 -> DQK.EXE file 0x031d20
```

Known mapped entries:

| Logical Entry | File Offset | Role |
|---|---:|---|
| `0x2033:0003` | `0x031d23` | Store byte argument in `[0xacc4]` |
| `0x2033:000f` | `0x031d2f` | Return `[0xacc4]` |
| `0x2033:0013` | `0x031d33` | Parse N operand fields from current stream |
| `0x2033:0112` | `0x031e32` | Return typed value for a 1-based parsed operand index |

Do not use the naive resident mapping `HDR + 0x2033*16 + off`; it lands in unrelated/ambiguous bytes.

## Parser Mechanics

`DQK.EXE:0x031d33` (`0x2033:0013`) parses the next N operands from the current bytecode/data stream:

- Takes N from `[bp+6]`.
- Loops `si = 1..N`.
- Reads stream bytes from far pointer `[0xae5c:0xae5e]` plus cursor `[0xb7f9]`.
- Advances `[0xb7f9]`.
- Stores parsed metadata into parallel arrays:
  - `DS:0xb215 + index`: operand type byte.
  - `DS:0xb185 + index`: low/immediate byte.
  - `DS:0xae6a + index`: high/aux byte.
- Uses a type dispatch table at file `0x031d88` with keys `1, 2, 3, 0x80, 0x81`.
- Type `0x80` uses scratch records at `DS:0xb45f + count*0x28` and calls resident helper
  `1D99:11E3`.
- Type `0x81` reads a word-shaped value and calls resident helper `1D99:11D9`.

`DQK.EXE:0x031e32` (`0x2033:0112`) returns a typed value for a 1-based parsed operand index:

- Loads low byte from `DS:0xb185 + index`.
- Loads high/aux byte from `DS:0xae6a + index`.
- Loads operand type from `DS:0xb215 + index`.
- Uses a type dispatch table at file `0x031e73` with keys `0, 1, 2, 3, 0x80, 0x81`.
- Type `0` returns the low byte.
- Type `2` and `0x81` return `high << 8 | low`.
- Types `1`, `3`, and `0x80` call resident helper `1D99:11CF` for a derived lookup.
- Default returns `0`.

`1D99:11CF` resolves into the overlay-6 family around `DQK.EXE:0x040b57`; it can derive values from
globals such as `[0xc9f0..0xc9f4]`, current combatant `[0xb20f]+offset`, or the current stream pointer
depending on the operand range. That derived-lookup family needs its own deeper pass before the operand
semantic labels are final.

## Raw Caller Counts

Current local `DQK.EXE` raw far-call counts:

| Target | Caller Count | Role |
|---|---:|---|
| `0x2033:0013` | 41 | Parse N current-stream operands |
| `0x2033:0112` | 38 | Read typed value for parsed operand index |
| `0x2033:000f` | 2 | Return `[0xacc4]` |
| `0x2033:10cd` | 2 | Related helper, caller role still open |

Verification:

```powershell
python tools/disasm_dqk.py --dqk-2033-accessors
python tools/disasm_dqk.py --lcallers 0x2033 0x0013
python tools/disasm_dqk.py --lcallers 0x2033 0x0112
python tools/disasm_dqk.py --disasm 0x031d33 --len 0x100
python tools/disasm_dqk.py --disasm 0x031e32 --len 0xb0
```

## Runtime Probe Plan

The tightest runtime breakpoint for the `ca03` setter is after both operands have been returned by
`0x2033:0112`, but before `[ca03]` is compared or written:

```text
file 0x0420ac -> canonical overlay address 25a4:1cdc
file 0x0420d3 -> canonical 25a4:1d03 ; both locals valid: [bp-2]=operand 1, [bp-1]=operand 2
file 0x0420fb -> canonical 25a4:1d2b ; cmp ax,[ca03]
file 0x042117 -> canonical 25a4:1d47 ; mov [ca03],ax

file 0x02cc15 -> canonical 28d0:0f25 ; DungCom1 consumes [ca03]
file 0x02cc2e -> canonical 28d0:0f3e ; WildCom1 consumes [ca03]
```

For a DOSBox-X or Unicorn breakpoint run, apply the live load delta to the canonical segment values.
At `25a4:1d03`, dump:

```text
SS:BP-2       operand 1 byte local
SS:BP-1       operand 2 byte local
DS:ca03       previous terrain/context key
DS:b7f9       post-parse stream cursor
DS:b215..b217 parsed operand type bytes
DS:b185..b187 parsed operand low/immediate bytes
DS:ae6a..ae6c parsed operand high/aux bytes
DS:ae5c..ae5f current stream far pointer
```

Then continue to `25a4:1d47` and confirm `AX == zero_extend(operand 2)` at the `[ca03]` write, and to
`28d0:0f25` / `28d0:0f3e` to confirm the same `[ca03]` value is forwarded into DungCom1/WildCom1.

The known native reference route for a non-empty DQK encounter is:

```powershell
native\gbdqk-combat-flow-test.ps1 -Headless
```

That proves the clean-room/native area-5 dragon combat path, but the operand-value proof still needs the
real `DQK.EXE` breakpoint run above.

An automated Unicorn watch mode now exists for the same anchors; see
`docs/engine/research/dqk-ca03-runtime-probe.md`:

```powershell
python tools/unicorn_dqk_trace.py --run --fake-video --fake-keyboard `
  --max-instr 1000000 `
  --watch-ca03-operands `
  --watch-output build\dqk-ca03-watch-1m.csv `
  --hot-spots 25 `
  --hot-output build\dqk-ca03-hot.csv `
  --log build\dqk-ca03-watch-1m.log
```

Current result: the probe implementation compiles and the Unicorn smoke test passes. The base tracer now
models the VGA `0x3da` retrace wait that previously stopped the run, but a 1M instruction organic run
still produces zero watch rows. Hot spots are generic memory copy/fill helpers, not another narrow
hardware wait. The dump path is ready; the execution route to the real setter remains open.

## Classified Caller Clusters

`DQK.EXE:0x0420ac` is the combat terrain/context setter that feeds `[0xca03]`:

- `mov al,2; lcall 0x2033:0013` parses two operands from the current stream.
- `mov al,1; lcall 0x2033:0112` reads operand `1` and stores it to current record `+0x13`.
- Operand `1` is also passed to `1D99:13B9`.
- `mov al,2; lcall 0x2033:0112` reads operand `2`.
- Operand `2 == 0xff` means no terrain/context update.
- Otherwise operand `2` is compared to `[0xca03]`; on change the old `[0xb7a8]` group is invalidated,
  `[0xae43]` is cleared, and operand `2` is widened into word `[0xca03]`.

`DQK.EXE:0x043071` is a timed spell/effect applicator:

- Parses four operands.
- Operand `1` goes to `[0xbee8]`.
- Operand `2` goes to current record `+0x38`.
- Operand `3` goes to `[0xb1ca]`.
- Operand `4` goes to `[0xc2e7]`.
- The routine then derives duration and writes current record `+0x37`.

`DQK.EXE:0x04258d` parses five operands in a spell/effect-like handler: operands `2` and `3` are passed
to dice rolling, operand `4` is used as a damage bonus, and operand `1` acts as flags for that handler.

Field indexes are therefore not globally fixed semantic fields. They are 1-based operands parsed by the
most recent `0x2033:0013(n)`, and their meaning depends on the current opcode/handler.

## Operand 1 Resource Loader

The `0x0420ac` operand-1 consumer is now partly classified:

- The only raw callers of `CALL FAR 1D99:13B9` are `DQK.EXE:0x035cb6` and `DQK.EXE:0x0420e1`.
- `0x0420e1` is the live setter path and passes operand `1`.
- `0x035cb6` is a restore/load-style path: when `[ca03] > 0`, it reads current combatant `[b20f]+0x13`
  and passes that value to the same stub.
- `1D99:13B9` resolves through an FBOV stub to overlay 11 file `0x061bc3`.
- `0x061bc3` calls `1D99:112F`, then calls `1D99:111B` with DGROUP string `0x9173`.
- DGROUP `0x9173` points into the overlay-12 string cluster at `DQK.EXE:0x06cb93`:
  `back1`, followed by `8x8d%c%d`, `GEO1`, and `Unable to load geo in Load3DMap`.
- The routine validates a loaded resource size from `[ca08:ca0a]`, copies three table regions into
  scratch/global pointers around `[0xc393]` / `[0xc397]`, and stores the argument at current combatant
  `+0xc6`.

Additional `+0x13` evidence keeps the label provisional:

- Raw writes of `mov es:[bx+0x13],al` occur at `DQK.EXE:0x0420da` and `0x050b26`.
- Raw reads of `mov al,es:[bx+0x13]` occur at `DQK.EXE:0x026614` and `0x035cb1`.
- `0x026614..0x02662e` reads a nested combat/object record `+0x13`, adds a direction-derived delta, and
  writes it back modulo `8`.
- `0x050b26` writes `+0x13` as a valid/active-looking flag before using map background data.

Current interpretation: operand `1` is a combat-art/orientation resource selector for the live combat
context. It is not the terrain master-set key; operand `2` feeds `[ca03]` for that. The exact gameplay
or editor-facing label for operand `1` remains provisional until runtime values are captured.

## 2026-07-13 Runtime Operand Rows

`build\dqk-ca03-watch-load1000-title-P-findfirst.csv` is the first positive runtime capture from a
boot/title/load-save route. It reaches the `0x0420ac`-family setter at canonical `25a4:1d47` after
enumerating `SAVE\*.*`, opening `SAVE\SavGamA.qsv`, and loading `ECL.glb` / `GEO.glb`.

The captured rows are:

```text
instr 17664427 op1=0xba op2=0x03 old-ca03=0x0004 stream=5b6e:8000 b7f9=0x8277
instr 17934408 op1=0xba op2=0x07 old-ca03=0x0004 stream=5b6e:8000 b7f9=0x8295
instr 18463728 op1=0xba op2=0x07 old-ca03=0x0004 stream=5b6e:8000 b7f9=0x82d0
```

The watch logs before the setter instruction executes, so `old-ca03` is not the final value after each
row. The key new evidence is that operand `1` is stable at `0xba` across these rows, while operand `2`
changes from `0x03` to `0x07`. The stream decode below resolves these first rows as staged
city/Palanthas ECL context. A later route continues through the Palanthas `PALACE` branch, but the
earlier `0x8439` `COMBAT` reading is disproven: DQK Gen2 treats `0x1d` as zero-operand there, and
`0x8439` is the following `PRINTCLEAR` inline string length. See
`docs/engine/research/dqk-palanthas-palace-combat-route.md`.

`tools/unicorn_dqk_trace.py` now records raw stream windows for these rows. The wrapped real-mode view
is the useful one:

```text
b7f9=0x8277 stream_wrap_phys=0x05b957
  09 00 00 01 39 00 11 80 15 64 f5 60 0c f3 94 24 ...
b7f9=0x8295 stream_wrap_phys=0x05b975
  1d 09 00 01 01 97 00 0e 00 96 09 00 00 01 39 00 ...
b7f9=0x82d0 stream_wrap_phys=0x05b9b0
  2b 01 bf 00 00 07 80 05 40 13 01 0c 50 80 05 50 ...
```

The straight linear address `seg*16 + off + b7f9` lands on code-like bytes for the same rows; use
`seg:((off+b7f9)&0xffff)` when inspecting the ECL-like runtime stream. The runtime windows do not match
raw `ECL.GLB` file bytes at offsets `0x8277/0x8295/0x82d0`, so treat the stream as staged runtime data,
not as direct file offsets.

`tools/dqk_ca03_stream_decode.py` decodes those wrapped windows as Gen2 ECL:

```text
8277: SAVE #0, 0x0039
827d: PRINT "YOU CONTINUE INTO THE CITY."
8295: PARTYSTRENGTH flag:0
8298: GOTO 0x0097
829c: PICTURE #150
829f: SAVE #0, 0x0039
82a5: PRINTCLEAR "THE CITY OF PALAN"
82d0: HORIZONTAL_MENU 0x00bf, #7, "PALACE", "TEMPLE", "HALL", "SHOP", ...
```

This narrows the current runtime provenance to a city/Palanthas menu script context. It does not attach
final gameplay labels to `op1=0xba` or `op2=0x03/0x07`; those remain native setter parser outputs whose
source operands are staged elsewhere in the current stream machinery.

## `ca03` Implication

The direct source shape for `[0xca03]` is now:

1. Current handler parses two operands from `[ae5c:ae5e] + [b7f9]`.
2. Operand `1` is stored at current combatant `+0x13` and passed to the `1D99:13B9` resource loader.
3. Operand `2` is read through `0x2033:0112`.
4. If it is not `0xff` and differs from `[ca03]`, it invalidates the current terrain group and writes
   the operand byte widened to word `[ca03]`.
5. Combat terrain setup later pushes `[ca03]` for both `DungCom1` and `WildCom1`.

Calling operand `2` a terrain/master-set key is supported downstream by the DUNGCOM/WILDCOM selection
path. Its gameplay/editor label remains unresolved.

## Terrain Asset Slot-Zero Follow-Up

The operand parser work narrows where the live terrain key comes from. A separate asset check resolves
the reserved-slot part of the terrain renderer question:

- `DUNGCOM.TLB` leaf 1 member `0` is a palette/color-table record: cycle `5`, first color `32`,
  color count `224`.
- `WILDCOM.TLB` leaf 1 member `0` has the same palette/color-table shape.
- Decoded images begin at `set01_img001`.
- DQK terrain rendering uses `(BackGroundTiles[id].tileIndex + 1) & 0xff`, so terrain member `0` is
  skipped deliberately.

The remaining visual work is contact-sheet or screenshot reconciliation of selected-leaf images against
native runtime captures, not whether member zero is an image.
