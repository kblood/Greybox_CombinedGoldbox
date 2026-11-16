# DQK Combat Context Key `ca03`

This note records the current source-recovery evidence for DQK DGROUP word `[0xca03]`, the context key
forwarded into `DungCom1` / `WildCom1` combat terrain group selection.

## Classified Xrefs

Raw little-endian `03 ca` hits in local `DQK.EXE` include the MZ header/reloc area plus the code refs
below. The meaningful refs are:

| File Offset | Instruction | Classification |
|---:|---|---|
| `0x02cc15` | `push word ptr [0xca03]` | Read; `DungCom1` combat group setup key |
| `0x02cc2e` | `push word ptr [0xca03]` | Read; `WildCom1` combat group setup key |
| `0x035b02` | `mov ax,0xca03` | Save/load read target; DOS AH=`3f` reads two bytes into `DS:ca03` |
| `0x035ca6` | `cmp word ptr [0xca03],0` | Read/gate after loading host state |
| `0x0363b0` | `mov ax,0xca03` | Save/write source; DOS AH=`40` writes two bytes from `DS:ca03` |
| `0x038024` | `mov ax,0xca03` | Init/reset; zeroes `ca03..ca06` length 4 |
| `0x03821a` | `mov ax,0xca03` | Init/reset; zeroes `ca03..ca06` length 4 |
| `0x0420fb` | `cmp ax,word ptr [0xca03]` | Live context change check |
| `0x042117` | `mov word ptr [0xca03],ax` | Live context setter |

## Live Setter

The main setter starts at `DQK.EXE:0x0420ac`:

- Calls `0x2033:0013` with `2`, parsing two operands from the current stream.
- Calls `0x2033:0112` with operand index `1`, stores the result in the current combatant/host record at
  `[0xb20f]+0x13`, and calls resident/FBOV stub `1D99:13B9`.
- Calls `0x2033:0112` with operand index `2`, treats `0xff` as a sentinel meaning no update, compares the
  zero-extended byte against `[0xca03]`, and skips if unchanged.
- On change, calls `0x09a4:0009` on `[0xb7a8]`, clears `[0xae43]`, and writes the zero-extended field-2
  byte into `[0xca03]`.

Current interpretation: `[0xca03]` is a persistent combat/context selector byte widened into a word.
`docs/engine/research/dqk-2033-accessor-patterns.md` pins the caller-side accessor pattern:
`0x2033:0013(2)` parses two operands from the current stream at `[ae5c:ae5e] + [b7f9]`, and
`0x2033:0112(2)` returns operand `2` as the immediate source for the live `[0xca03]` update. The helper
body is pinned at `DQK.EXE:0x031d33` / `0x031e32`. Its full value domain remains unknown, but a
retail editor call site and six specific values are now established: `DISK3/ECL.GLB#2` displays
`SELECT THE COMBAT WALL TYPE:` with `NORMAL`, `CAVE`, `WATER`, `SWAMP`, `ABYSS`, and `FLAME` at
`0x855E`, then executes `ADD #1,[0x00BF]` and `LOAD_FILES #2,[0x00BF]` at `0x8591`. Menu answers
0..5 therefore become CA03 values 1..6. Value `0xff` remains the handler's no-update sentinel;
this route does not exercise it.

Operand `1` is partly classified. `1D99:13B9` resolves to overlay 11 `DQK.EXE:0x061bc3`, which loads
through the `back1` / `8x8d%c%d` / `GEO1` string cluster, copies three resource-table regions into
scratch/global pointers around `[0xc393]` / `[0xc397]`, stores the argument at current combatant
`+0xc6`, and is also called from `0x035cb6` using persisted `[b20f]+0x13` when `[ca03] > 0`.
Additional `+0x13` reads/writes at `0x026614`, `0x02662e`, and `0x050b26` show direction/modulo-8 and
valid/active-looking uses, so the safest current classification is combat-art/orientation resource
selector for the live combat context, not the terrain master-set key itself.

## Combat Forwarding

At combat terrain setup:

```text
0x02cc15  push [0xca03]
0x02cc1a  mov ax,0x5da2   ; DungCom1
0x02cc1e  lcall 0x104c:0007

0x02cc2e  push [0xca03]
0x02cc33  mov ax,0x5dab   ; WildCom1
0x02cc37  lcall 0x104c:0007
```

`0x104c:0007` forwards the original `[ca03]` value as `[bp+0a]` into `0x09a4:01dc`. Inside
`0x09a4:01dc`, the value is stored in `[0xa627]`; the parsed filename suffix is stored separately in
`[0xa317]`.

The `0x09a4:004b` callback then looks up master set key `[0xa627]` first, falling back to
`suffix * 100 + [0xa627]`. For shipped `DUNGCOM.TLB` / `WILDCOM.TLB`, context key `1` maps to leaf 1.

## Persistence

`0x035b02` reads two bytes into `DS:ca03` through DOS AH=`3f`; `0x0363b0` writes two bytes from
`DS:ca03` through DOS AH=`40`. Adjacent `DS:ca05` is serialized in the same save/load block.

`0x038024` and `0x03821a` zero `ca03..ca06` through `0x1093:0015`, which wraps the `rep stosb` helper.

## Native bridge state

CCECL keeps both raw Gen2 `LOAD_FILES` operands in GBEF `+12` and `+14`. The
previously unused third word at `+16` carries tagged CA03 state for DQK:
`0xD0xx`, with the current context in the low byte. Reset initializes it to
zero, a non-`0xff` second operand stores its low byte with the DQK tag, and
`0xff` leaves the prior value intact. The stable 116-byte prefix already
survives the v15 menu cold-resume path, so no extension or version change is
needed.

The 2026-10-02 repair moves the third-word store after the DQK sentinel
check. Previously the handler stored Gen2's default zero before testing
`0xff`, erasing the context it was meant to preserve. An isolated old/new
binary comparison catches the loss for tagged values `D000` through `D006`,
both sequentially and across a real CCMENU-produced v2 menu answer. A
two-area `NEWECL` case independently catches it for prior context 4. Fresh
`FF` retains untagged zero, replacement with context 5 yields `D005`, and
Gen1 third operands zero and `FF` remain raw. These are synthetic state
contracts; the sourced retail editor values remain 1..6.

`ccecl-effects-test.ps1` now contains the HLIB/GLIB, reset, replacement,
NEWECL and Gen1/DoK matrix. `ccecl-menu-resume-test.ps1` contains the cold
matrix with matching outcome identity, one-shot consumption, and unchanged
source/pending bytes. CCEFX's legacy `GBLF operands=` label still prints
three words; for DQK the last is serialized context, not a third operand.
Flow expectations must distinguish explicit context zero (`D000`) from a
fresh `FF` keeping reset state (`0000`).

On a combat handoff CCCOMBAT recognizes that tag and resolves the six
source-confirmed contexts independently for each shipped master table. It
packs 1-based group ordinals into one byte (DUNGCOM low nibble, WILDCOM high):

| CA03 | DUNGCOM | WILDCOM | Packed byte |
|---:|---:|---:|---:|
| 1 | 1 | 1 | `0x11` |
| 2 | 2 | 2 | `0x22` |
| 3 | 3 | 0 | `0x03` |
| 4 | 4 | 3 | `0x34` |
| 5 | 1 | 4 | `0x41` |
| 6 | 5 | 0 | `0x05` |

Zero is the explicit no-override result. In particular, missing WILDCOM keys 3
and 6 do not borrow DUNGCOM or exploration-wall state. CCCOMBAT currently
computes this packed value but no combat renderer consumes it; no terrain
rendering or runtime asset selection is claimed.

The selected master entries bound these exact leaf byte ranges, with the end
exclusive. The existing engine test also verifies the decoded image count in
each selected leaf:

| File | Master key | Group ordinal | Byte range | Decoded images |
|---|---:|---:|---:|---:|
| DUNGCOM.TLB | 1, 5 | 1 | `[0x0046, 0x3f2e)` | 26 |
| DUNGCOM.TLB | 2 | 2 | `[0x3f2e, 0x7e16)` | 26 |
| DUNGCOM.TLB | 3 | 3 | `[0x7e16, 0xbd02)` | 26 |
| DUNGCOM.TLB | 4 | 4 | `[0xbd02, 0xfbea)` | 26 |
| DUNGCOM.TLB | 6 | 5 | `[0xfbea, 0x1489e)` | 32 |
| WILDCOM.TLB | 1 | 1 | `[0x003a, 0x5f4a)` | 40 |
| WILDCOM.TLB | 2 | 2 | `[0x5f4a, 0xbe5a)` | 40 |
| WILDCOM.TLB | 4 | 3 | `[0xbe5a, 0x11d6a)` | 40 |
| WILDCOM.TLB | 5 | 4 | `[0x11d6a, 0x17c7a)` | 40 |

`packages/engine/test/dqkCombatCluster.test.ts` pins the end-exclusive ranges
from each top-level pointer table and checks that every end is greater than its
base. These ranges plus the earlier key-to-ordinal lookup now give the native
resolver a precise TLB leaf target; the subsequent work is to make the combat
consumer decode and use that leaf.

## Runtime Probe

`docs/engine/research/dqk-ca03-runtime-probe.md` tracks the automated live-value probe. The probe is
implemented in `tools/unicorn_dqk_trace.py --watch-ca03-operands` and watches `25a4:1d03`,
`25a4:1d2b`, `25a4:1d47`, `28d0:0f25`, and `28d0:0f3e`, applying the Unicorn load segment delta
automatically. The base tracer models the VGA `0x3da` retrace wait that previously stopped at
`DQK.EXE:0x05285..0x05288`.

The first positive runtime capture is
`build\dqk-ca03-watch-load1000-title-P-findfirst.csv`. It follows the boot/title/load-save route using
uppercase/raw BIOS `0x1950` for `Play`, minimal DOS `FindFirst`/`FindNext` for `SAVE\*.*`, and then
opens `SAVE\SavGamA.qsv`, `ECL.glb`, and `GEO.glb`. It hits canonical `25a4:1d47` three times:

```text
instr 17664427 op1=0xba op2=0x03 old-ca03=0x0004 stream=5b6e:8000 b7f9=0x8277
instr 17934408 op1=0xba op2=0x07 old-ca03=0x0004 stream=5b6e:8000 b7f9=0x8295
instr 18463728 op1=0xba op2=0x07 old-ca03=0x0004 stream=5b6e:8000 b7f9=0x82d0
```

These rows prove the live setter is reachable from the automated route. They do not yet prove the later
`DungCom1` / `WildCom1` consumer path or final combat terrain setup.

`build\dqk-load1000-consumers.log` extends the same route to 40M instructions with watches at the
consumer/terrain setup addresses (`28d0:0f14`, `28d0:0f25`, `28d0:0f2e`, `28d0:0f3e`,
`28d0:0f47`, `28d0:0f6d`, `28d0:0f73`, and `2740:172c`). It still hits only the three setter rows.
So the consumer path remains static evidence plus a negative runtime trace, not a confirmed live route.

The CA03 CSV now includes runtime stream byte windows. For the captured rows, the useful address form is
the wrapped real-mode view `stream_wrap_phys = ae5e*16 + ((ae5c+b7f9)&0xffff)`, not the straight linear
sum. The wrapped windows begin:

```text
0x05b957: 09 00 00 01 39 00 11 80 15 64 f5 60 0c f3 94 24 ...
0x05b975: 1d 09 00 01 01 97 00 0e 00 96 09 00 00 01 39 00 ...
0x05b9b0: 2b 01 bf 00 00 07 80 05 40 13 01 0c 50 80 05 50 ...
```

Decoded with `tools/dqk_ca03_stream_decode.py`, those rows are city/Palanthas ECL context:

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

So the first captured CA03 setter calls are associated with city/menu script context, not yet with
combat terrain setup. A later Palanthas Palace route was initially misdecoded as reaching script-level
ECL `COMBAT` at stream offset `0x8439`; `docs/engine/research/dqk-palanthas-palace-combat-route.md`
now corrects that. DQK Gen2 treats `0x1d` as zero-operand there, so `0x8439` is the following
`PRINTCLEAR` string length byte. The static `DungCom1` / `WildCom1` path remains the target for
runtime proof.

## Verification

```powershell
python tools/disasm_dqk.py --dqk-ca03-xrefs
python tools/disasm_dqk.py --dqk-2033-accessors
python tools/disasm_dqk.py --disasm 0x420ac --len 0x80
python tools/disasm_dqk.py --disasm 0x61bc3 --len 0x110
python tools/unicorn_dqk_trace.py --run --fake-video --fake-keyboard --max-instr 1000000 --watch-ca03-operands --watch-output build\dqk-ca03-watch-1m.csv --hot-spots 25 --hot-output build\dqk-ca03-hot.csv --log build\dqk-ca03-watch-1m.log
pnpm --filter @goldbox/engine exec vitest run test/dqkCombatCluster.test.ts --reporter=verbose
```
