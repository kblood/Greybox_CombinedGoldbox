# Decompile — DQK Gen2 ECL opcode dispatch table (Krynn)

> **Current reading, reviewed 2026-10-11:** use the recovered 66-slot table and the later
> operand-count/SHORT_MENU corrections, not the historical histogram or candidate scans.
> The 2026-09-12 original handler proof identifies `0x41` as an XP write
> (`operand2 * 100`, member-local active-class split), with the 2026-10-02 physical-record
> base correction. The VM still emits `gen2Ext41` for DQK rather than applying this award;
> safe native QSV persistence and a live DQK `0x24 COMBAT` handoff remain open.

> Loop iteration 12 (final) of `decompile-worklist.md`. Subsystem: **the Dark Queen of Krynn
> (Gen2) ECL command dispatch table** — the jump table that maps each ECL opcode byte to its
> handler, parallel to Gen1's `ovr003.cs` `CMD_*` set (methodology §3.4 "DQK table UNLOCATED").
> Reference shape: COAB `coab_extracted/engine/ovr003.cs` (Gen1 `CMD_*`, study-only) +
> `docs/engine/research/ecl-krynn-gen1-opcodes.md`.
>
> **STATUS 2026-07-18: SOLVED (dynamic trace executed).** The live Gen2 dispatch table is
> **canonical `2033:0d34`, file `0x032a54`, 0x42 slots (opcodes `0x00`–`0x41`), direct-indexed**
> — live-verified byte-identical between the running interpreter's segment and the retail
> `DQK.EXE` file, with the dispatch `jmp` and the single extended opcode `0x41` both witnessed
> executing live. Full table, handler map, fired-opcode log, and method in the
> **"2026-07-18 DYNAMIC TRACE — SOLVED"** section at the bottom. Everything between here and
> that section is the (now-historical) characterization + negative-result trail that led to it.

## Gen1 reference (what we are looking for the Gen2 analogue of)

Gen1 (CoK/DoK) ECL has **65 opcodes, 0x00–0x40**, fully confirmed from `EclDump.exe`'s IL
(`daxdump_extracted/EclDump.il`) and mirrored 1:1 by ovr003's handler order:
`0x00 EXIT, 0x01 GOTO, 0x02 GOSUB, 0x03 COMPARE, 0x04–0x07 ADD/SUB/DIV/MUL (one handler),
0x08 RANDOM, 0x09 SAVE, 0x0A LOADCHAR, 0x0B LOADMON, 0x0C SETUPMON, 0x0D APPROACH,
0x0E PICTURE, 0x0F INPUTNUM, 0x10 INPUTSTR, 0x11 PRINT, 0x12 PRINTCLEAR, 0x13 RETURN …`.
The VM reads a command byte and does an indexed jump through a near-pointer table — the table
COAB reifies as the dispatch ordering. Gen1 already has documented **no-handler** opcodes
(0x1F "notsure", 0x22 "PARTY SURPRISE"), i.e. holes in the table.

## Gen2 container — VERIFIED

DQK stores ECL in **`DISK3/ECL.GLB`**, an **`HLIB` `DATA` library** (magic `HLIB`, tag `DA`
at offset 12; size 456 526 bytes), **not** a Gen1 DAX archive. So the first Gen1↔Gen2 delta is
structural: the script bytecode is the same *kind* of stream, but it is packed in the Gen2 HLIB
container (the rebuild's target format) rather than DAX. The per-event script bodies decode
(e.g. ECL.GLB entry [05]: `00 00 01 24 00 09 00 01 01 22 00 3D …`).

## Gen2 opcode distribution — EMPIRICAL (numbering largely preserved, set extended)

A byte histogram of the whole `ECL.GLB` script pool:

| band | share | reading |
| --- | --- | --- |
| `0x00..0x40` (Gen1 opcode band) | **56.8 %** | opcodes + low operands |
| `0x41..0xFF` | 43.2 % | high-bit operand type-codes + data (and any extended opcodes) |

The **most frequent low bytes** are `0x00`(EXIT) 45 470, `0x01`(GOTO) 43 298, then
`0x05`(SUB) 10 203, `0x09`(SAVE) 8 261, `0x03`(COMPARE) 8 201, `0x02`(GOSUB) 7 942,
`0x04`(ADD) 7 621, `0x12`(PRINTCLEAR) 7 554, `0x14` 6 964 — i.e. **exactly the opcodes Gen1
uses most, in the same roles**. This is strong evidence that **Gen2 preserves the core opcode
numbering** (EXIT/GOTO/GOSUB/COMPARE/arithmetic/SAVE/PRINT all at their Gen1 values).

Counter-evidence for an **extended command set above 0x40**: `0x4E` (5 120), `0x42` (2 866),
`0x3D` (2 675), `0x41` (2 169), `0x40` (1 736) all occur far more than random data would
predict. `0x80`/`0x81` dominate the high band (19 570 / 10 018) — these are the **EclOpp
operand type-codes** (the high-bit memory-location encoding, akin to the documented Gen1 0x09/
0x7F type codes), not opcodes. So Gen2 looks like **Gen1's table + extra opcodes near/above
0x40**, consistent with DQK's added engine features (the last/most-advanced SSI build).

## 2026-07-13 static narrowing — candidate stream dispatch / operand-advance cluster

A later static pass narrowed one ECL-shaped routine in `DQK.EXE` even though the live COMBAT handler is
not confirmed yet. Disassembling `DQK.EXE:file 0x041645` shows a stream-byte reader keyed by canonical
ECL globals:

```text
041645  les       bx, ptr [0xae5c]
041649  add       bx, word ptr [0xb7f9]
04164d  mov       al, byte ptr es:[bx]
041650  mov       byte ptr [0xb1c7], al
041653  mov       al, byte ptr [0xb1c7]
041656  mov       ah, 0
041658  dec       ax
041659  cmp       ax, 0x40
04165c  jbe       0x41661
04165e  jmp       0x4178e
041661  mov       bx, ax
041663  shl       bx, 1
041665  jmp       word ptr cs:[bx + 0x13aa]
```

That shape is strongly ECL-like: `[ae5c:ae5e]` is the current stream pointer, `[b7f9]` is the stream
cursor, `[b1c7]` receives the current opcode byte, and the dispatch indexes `0x01..0x40` by
`opcode - 1`. The following bytes at file `0x04166a` decode plausibly as a compact near-pointer table
or shared operand-advance table. With the current tentative base interpretation, opcode `0x24`
(`COMBAT`) maps to the shared `0x14ce` / file `0x04189e` landing used by several zero-operand opcodes.

Do **not** treat `0x04189e` as the recovered COMBAT handler. Disassembling there lands in the middle of
function-shaped code (`add sp, 8` nearby), which is more consistent with a shared parser/advance
fragment or a still-wrong overlay/table-base interpretation. An alternate literal table-base read from
`cs:[bx+0x13aa]` at file `0x04177a` produced implausible out-of-overlay targets, so the table base and
live segment mapping are still unresolved.

The dynamic Palace route also does **not** prove this candidate as the COMBAT handler. A focused run
watched `25a4:1275` (candidate dispatch), `25a4:14ce` (candidate zero-operand advance),
`25a4:1d47` (known CA03 setter), and terrain/render consumers. The first pass hit the known CA03 rows
around `b7f9=0x83ae` and `b7f9=0x8498`, but no candidate dispatch watch. A follow-up run with ECL
stream-state logging hit `25a4:14ce` twice much earlier (`b7f9=0x802b` and `0x803d`), while
`25a4:1275` still did not appear:

```powershell
python tools\unicorn_dqk_trace.py --run --load-seg 0x1000 --fake-video --fake-keyboard `
  --fake-key-rearm-after 20 --fake-timer --trace-keys `
  --fake-keys "esc,wait:2500000,space,space,gate:0x0bdb:0x1e3d:title-form-streq,0x1950,gate:0x25a4:0x33c3:party-menu-input-call,l,t,a,enter,b,gate:0x26f8:0x012f:journal-answer-staged,journal-answer,enter,enter,enter,gate-b7f9:0x82d0:palanthas-menu,0x1950" `
  --max-instr 22000000 `
  --watch-ca03-operands --watch-dqk-route --watch-exec-repeat --watch-exec-repeat-limit 80 `
  --watch-exec 0x25a4:0x1275:ecl-dispatch `
  --watch-exec 0x25a4:0x14ce:ecl-zero-op-advance `
  --watch-exec 0x25a4:0x1d47:ca03-write-exec `
  --watch-exec 0x28d0:0x0f25:dungcom-consume `
  --watch-exec 0x28d0:0x0f3e:wildcom-consume `
  --watch-exec 0x2740:0x0846:viewport7x7 `
  --watch-exec 0x2740:0x172c:combat-cell-render `
  --watch-output build\dqk-ca03-watch-load1000-palanthas-palace-eclstate.csv `
  --log build\dqk-load1000-palanthas-palace-eclstate.log
```

### 2026-07-13 correction: Palanthas Palace was not a COMBAT proof

The later filtered DGROUP trace
`build\dqk-load1000-palanthas-2033-combat.log` supersedes the earlier Palace interpretation. The trace
does prove that the `0x2033` interpreter path is live, including `2033:0f76` / live `3033:0f76`
writing `[b1c7]` and `2033:0d1e` / live `3033:0d1e` dispatching early stream opcodes. It does not
prove a Palace COMBAT dispatch:

- `0x8436` dispatches `0x1d`; live code advances to `0x8437`.
- `0x8437` dispatches `0x12` (`PRINTCLEAR`); live code advances to `0x8439`.
- `0x8439` is byte `0x24`, but it is consumed while `[b1c7]` remains `0x12`. It is the
  `PRINTCLEAR` inline-string length, not an opcode.
- The watched `2033:0e7f` COMBAT stub and `2033:081b` COMBAT handler do not fire in this route.

This also proves a DQK Gen2 frame exception: opcode `0x1d` is zero-operand in this interpreter path.
The old Gen1 one-operand frame misdecoded `0x8439` as `COMBAT`.

### Static `2033:081b` COMBAT handler candidate

The `0x2033` table still contains a credible static `0x24` handler candidate even though the Palace
route does not hit it. With subsegment base `DQK.EXE:file 0x031d20`, table entry `0x24` reaches
`file 0x032b9f` / `2033:0e7f`, whose stub calls `file 0x03253b` / `2033:081b`. No direct far-callers
to `2033:081b` are known, which is consistent with a jump-table handler rather than a normal exported
subroutine.

Static disassembly of `file 0x03253b` shows a combat-state / resolution-shaped routine:

- Entry clears `[b256]`, saves/restores `[af3d]`, increments `[b7f9]`, and initializes a local flag.
- The first major branch is `byte [bd4e]`.
- The `[bd4e] == 0` path reads the current record pointer `[b20f]` and branches on record bytes
  `+0x31`, `+0x14`, and `+0x22`, calling `1D99:125B`, `1D99:1251`, or `1D99:1229`.
- The `[bd4e] != 0` path calls `24DA:02B0`, `1D99:1247`, display/UI-looking helpers
  `1FC4:0200`, `0BDB:036C`, `0A62:0046`, then state/tactical-looking helpers
  `1D99:123D`, `1D99:1233`, `1D99:0FC7`, and `1D99:1229`.
- The common tail sets `[ae57]` to `3` or `4` based on current record `+0x22/+0x24`, clears a small
  `DS:C6F6` buffer and `[ae64]`, calls `077E:1AD1` when the local flag is set, and conditionally calls
  `1D99:11F7` when `+0x22 == 0`, `[b7a7] == 0`, and `+0x24 == 1`.

Useful follow-up watches for the next real `0x24` route:

```text
--watch-ecl-opcode 0x24
poke-dgroup8:0xb1c7:0x24[:LABEL] / poke-dgroup16:0xb7f9:STREAM[:LABEL]
2033:081b  candidate handler entry
2033:0839  branch on [bd4e]
2033:088a  large [bd4e]!=0 path
2033:08f0  call 1D99:0FC7
2033:0929  writes [ae57]=3
2033:0931  writes [ae57]=4
2033:0964  call 077E:1AD1
2033:0982  final call 1D99:11F7
28d0:0e70  Dung/Wild setup dispatcher before the existing consume watches
28d0:0f25  DungCom1 consume
28d0:0f3e  WildCom1 consume
2740:0846  7x7 viewport
2740:172c  combat cell render
```

The current conclusion is therefore narrower than the original "dynamic-only" statement: static
analysis has found a credible ECL stream dispatch / operand-advance cluster, but live execution has not
yet bound it to a real top-level `COMBAT` route or to tactical setup. The `25a4:14ce` hits prove that the
address is reachable live, but only as a shared early ECL/control fragment in this run, not as a
COMBAT-specific proof. `tools/unicorn_dqk_trace.py` now logs a
canonical stream-state field in execution-watch summaries:

```text
ecl=b1c7:<last-opcode> cur:<current-stream-byte> at:<stream-seg>:<stream-off+b7f9>
```

The next trace should use that field and `--watch-ecl-opcode 0x24` at a known real dispatch route rather
than guessing segment/file mappings from static offsets alone. A Palanthas/Palace regression with the
opcode watch produced no `ECL-OPCODE` rows, which is the expected result after the correction that
`0x8439` is a `PRINTCLEAR` inline length byte rather than an opcode.

### Static ECL.GLB boundary scan

`tools/dqk_ecl_combat_scan.py` now performs the complementary static scan over retail
`The Dark Queen of Krynn/DISK3/ECL.GLB`: it decodes the Gen2 HLIB DATA members, walks control-flow from
the five ECL header entries in each block, and reports opcode `0x24` only when it lands on a decoded
instruction boundary. This is intentionally different from a raw byte grep; the current stock archive
contains `3252` raw `0x24` bytes but only `35` decoded entry-reachable boundary `COMBAT` rows after
the scanner correction for DQK's dynamic/nonlocal `GOTO` fallthrough:

```powershell
python tools\dqk_ecl_combat_scan.py --show-context
```

The scan re-confirms that Palanthas/Palace `0x8439` is not a top-level opcode. It also separates the
candidate classes:

- temple/service or debug/service gates with `CLEARMONSTERS` immediately before `COMBAT`, such as
  areas 1, 4, 5 (`0x9489` / `0x9dbb`), 18, 31, 32 (`0x9e34`), 38, 40, and 58;
- stronger encounter-shaped entry-reachable candidates such as area 32 `0x939e`, area 39 `0x9ff2`,
  area 59 `0x8a3c`, and area 60 `0x9b71`, which have `PARTYSTRENGTH` / `SURPRISE` paths near the
  handoff;
- direct/static subroutine candidates such as area 66 `0x83cb`, which remain useful but are not
  equivalent to the header-entry CFG rows above.

The row-count increase from the older `18` result is not a looser raw-byte scan. DQK uses operand
forms such as `GOTO cc0:0` after `SETUP_MONSTER`; CCECL falls through to the decoded operand-end offset
for those forms when the target is nonlocal/dynamic. The scanner now mirrors that behavior instead of
treating such `GOTO` instructions as hard terminals. This brings native area 5's dragon path at
`0x91cf` into the entry-reachable CFG while leaving the Palace inline-string negative unchanged.

The scanner now also prints absolute file offsets for each member-local COMBAT row. Current high-value
rows include:

```text
area=005 member=005 combat=91cfh offset=0x11cf file=0x006a2f
area=058 member=038 combat=9967h offset=0x1967 file=0x057137
area=059 member=039 combat=8a3ch offset=0x0a3c file=0x058e96
area=060 member=040 combat=9b71h offset=0x1b71 file=0x05cc09
```

The inspection mode records the corrected paths:

```powershell
python tools\dqk_ecl_combat_scan.py --inspect-area 5 --inspect-vaddr 0x91cf --inspect-context 18
python tools\dqk_ecl_combat_scan.py --inspect-area 58 --inspect-vaddr 0x9967 --inspect-context 14
```

Area 5 reaches `0x91cf` through the dynamic/nonlocal `GOTO cc0:0` fallthrough and a monster setup
sequence ending in `LOAD_MONSTER #37, [0x00c2], #37`, `GOSUB 0xa5bb`, two `SAVE` calls, and `COMBAT`.
Area 58 reaches `0x9967` through the natural descriptor-162 temple/service path:
`PICTURE #138`, `SAVE #14,0x0039`, `PARTY_SURPRISE`, `CLEARMONSTERS`, `SAVE #1,0x0014`, then
`COMBAT`. That is useful as an original top-level opcode/handler target, but it is not a non-empty
encounter proof.

Area 59 and 60 have especially useful local setup paths for the next static/dynamic pass:

```text
area 59:
8a28h PARTYSTRENGTH
8a29h SAVE #22, 0x00bf
8a2fh GOSUB 0xa92d
8a33h SURPRISE ...
8a3ch COMBAT

area 60:
9b5ch SAVE #35, 0x00bf
9b62h GOSUB 0xa7f4
9b66h SURPRISE ...
9b71h COMBAT
```

The `GOSUB` bodies divide `[0x00bf]`, read/write table `0x0191`, and combine another table row into
`[0x00c0]`; they look like encounter/table-state setup, not monster `LOAD_MONSTER` calls. The next
runtime proof still has to bind one of these decoded top-level `0x24` rows to the original DQK
interpreter's `[b1c7]` opcode write and then to the byte-validated tactical setup/render anchors.

Follow-up CFG/context inspection keeps those rows promising but not yet live-walking proofs. The local
`GEO.GLB` does not contain map ids 59 or 60; its decoded ids are
`2, 4, 10, 14, 18, 22, 24, 26, 30, 34, 38, 42, 46, 47, 50, 54, 58, 62, 63, 66`. Local `ECL.GLB` still
contains `area 59 -> member 39` and `area 60 -> member 40`.

Area 59 `0x8a3c` is header-CFG reachable from `vmRun1=0x8201`. The route appears to require a split
descriptor/facing condition, with `[00cb] = [002d] & 0x0f` and likely group/index `0x42` plus facing
`1`, then `SAVE #22,0x00bf`, table setup via `GOSUB 0xa92d`, `SURPRISE`, and `COMBAT`.

Area 60 `0x9b71` is header-CFG reachable from `SearchLocation=0x8c01`. The promising route appears to
use descriptor `0x63`, `[0104] != 0`, and table/check bit index `35` before `SAVE #35,0x00bf`,
`GOSUB 0xa7f4`, `SURPRISE`, and `COMBAT`. A separate static area-60 direct route at `0xa236..0xa267`
does contain `SETUP_MONSTER` plus six immediate `LOAD_MONSTER` groups, but that route is not
header-CFG reachable in the current scan and should stay classified as direct/static until a live entry
edge is proven.

For staged route experiments, fake-key scripts can now write canonical DQK DGROUP values with
`poke-dgroup8:OFF:VALUE[:LABEL]` and `poke-dgroup16:OFF:VALUE[:LABEL]`. The intended use is to combine
route gates with known candidate stream/host state, for example area 5's `0x91cf` dragon combat
fixture, and then require the original runtime to hit the opcode watch and byte-validated combat
setup/render anchors. A synthetic poke is route control only; it does not prove the dispatch table or
combat handler by itself.

Do not treat GBBOOT/CCECL `MEM[...]` rows as DQK DGROUP offsets for those staged runs. Native
`MEM[0023]`, `MEM[0111]`, `MEM[0112]`, `MEM[00ca]`, `MEM[00cb]`, and `MEM[00cc]` are CCECL logical
sparse-memory keys stored through the native `mem_keys` / `mem_vals` VM table, not original
`DQK.EXE` globals. A valid original-runtime probe should watch the known DGROUP stream globals
(`[ae5c:ae5e]`, `[b7f9]`, `[b1c7]`), the `[ca03]` combat context, and the byte-validated
setup/render anchors. If a run pokes any native logical key into canonical DGROUP, label it as
synthetic state corruption, not source evidence.

The latest area-5 accessor-watch regression confirms that distinction. A 15M-instruction
original-`DQK.EXE` route with `--watch-ecl-opcode 0x24`, operand-accessor watches at `2033:0112` and
`1D99:11CF`, setup/render watches, and `--dump-dqk-combat-map` logged 18 `2033:0112` hits and seven
`1D99:11CF` hits, but zero `ECL-OPCODE opcode=0x24` rows and zero byte-validated setup/render hits.
The only `[ca03]` row remained near `b7f9=0x82d0`, and the combat-map hook wrote no accepted surface
rows. The accessor traces improve operand visibility, but they still do not bind area 5 to the
original DQK combat dispatch.

The later 60M stop-on proof run confirms the same route boundary more strongly. It reached load,
`SAVE\SavGamA.qsv`, and the journal answer, but waited for `gate-b7f9:0x91cf` while live state stayed
near `b7f9=0x82fe`; it logged one Palanthas/menu `[ca03]` row at `b7f9=0x82d0`, zero
`ECL-OPCODE opcode=0x24` rows, and zero accepted byte-validated combat-map rows. Therefore area 5
remains a green native/CCECL oracle and a static retail ECL target, but not yet an original-runtime
`DQK.EXE` combat-dispatch trace.

An area-58 descriptor-162 staged-save follow-up produced the same class of negative with different
input bytes. Patching `SAVGAMA.QSV` to area 58, header position `17,15`, and flat pose bytes
`17,15,3` proved that the QSV/current-record copy reaches original runtime (`rec+13=0x3a`,
`rec+25=0x11`, `rec+26=0x0f`, `c9f0=0x11`, `c9f1=0x0f`, `c9f2=0x03`). It still logged zero
`ECL-OPCODE opcode=0x24` rows, zero byte-validated setup/render hits, and zero accepted combat-map
rows.

Correcting QSV `@21` from the old `0x04` fixture value to `0x3a` proves that `@21` is the
loaded-save `eclMemberId`, but it does not by itself drive descriptor 162. The original-runtime
30M trace reaches `1d99:137d` / `1d99:1373` with `rec+16=0x3a`, `[ae63]=0x3a`, and
`cx=0x003a`, then executes the member's initial entry. That entry is not the service-cell
script: at `0x8014` it decodes as `COMPARE #58, 0x0016; IF_EQ; EXIT`. With a resumed area-58
record, `mem[0x0016] == 58`, so the initial-entry path exits at `0x801b`. The descriptor-162
combat at `0x9967` remains a `SearchLocation` target. A post-journal input probe (`s`, Return,
yes/no, arrows) consumed every queued fake key but still produced zero top-level `0x24`, zero
CA03 rows, and zero accepted map rows, so the next dynamic problem is the original
movement/search trigger for descriptor 162 or a staged save that begins adjacent to `(17,15)`.

The corrected area-58 mode-selection trace (`build\dqk-area58-mode-selection-15m-r2.log`,
`build\dqk-ca03-watch-area58-mode-selection-15m-r2.csv`) makes that negative more precise. QSV loads
`ae67=4`, `ae57=2`, `ca03/ca05=fef0`, and the area-58 pose bytes. Post-load code then clears current
mode at `2177:319d` / `DQK.EXE:0x0362fd`, overlay 7 sets mode 4 at canonical `25a4:3722` / live
`389c:07a2` / `DQK.EXE:0x047ed2`, reaches `25a4:3756` / live `389c:07d6` with `ae57=4`, and runs
the `25a4:0024` ECL-PC reset body (`DQK.EXE:0x038075`, `0x03825a`, or `0x0402e4`) with `b7f9=0x8000`.
The later CA03 row is still the Palanthas/menu stream (`b7f9=0x82d0`, `op1=0xba`, `op2=0x07`,
`stream=5b6e:8000`), not area 58's static `0x9967` target. Therefore the remaining blocker is no
longer QSV/current-record copy or the generic mode-2 to mode-4 rebuild; it is the selector that should
install the target area/ECL stream and reach the top-level `COMBAT` handler.

Selector follow-up: `build\dqk-area58-selector-15m.log` adds `[ae5c:ae5e]` watches and
proves the active stream remains the startup/current buffer `5b6e:8000` through the first
CA03 row. The only watched stream writes before that row are `35de:0074` (`[ae5e]=5b6e`),
`35de:0078` (`[ae5c]=0000`), and `35de:0083` (`[ae5c]=8000`). The post-clear HLIB open
is `gen`, and the post-reset HLIB open is `PICB1`, so the trace does not show an
area-58 ECL member being installed. It also rules out the `10b2:02d3` branch for this
route; the resident mode rebuild uses `10b2:00e4`.

The loaded-save ECL member selector chain is now confirmed. `DQK.EXE:0x032ded` /
canonical `1f4e:1ebd` computes `[ae63]` from current-record `+0x16` or fallback values
`4` / `7`, then calls the single-callsite helpers `1d99:137d` and `1d99:1373`. The
overlay-6 loader at `DQK.EXE:0x0403d8` / loaded-save canonical `25a4:0118` reads
`[ae5e:ae5c]`, biases the offset by `0x8000`, pushes the caller's member id, and calls
`1fc4:0130` with DS:`773e` (`"ECL1"` at `DQK.EXE:0x06b15e`).

`build\dqk-area58-selector-ecl-loader-0118-15m.log` confirms the old area-58 fixture
enters this loader with `[ae63]=0x04`, `rec+16=0x04`, and `stream=5b6e:8000`; that
selects ECL member 4. The paired patched run
`build\dqk-area58-eclmember58-ecl-loader-0118-15m.log` changes QSV `@21` to `0x3a`
and reaches `1d99:137d` / `1d99:1373` with `rec+16=0x3a` and `[ae63]=0x3a`. The stream
pointer still stays `5b6e:8000`; the member id controls the HLIB member loaded into that
buffer. This is not yet a combat-handler proof. The next dynamic target is a route that
executes top-level `COMBAT` after the correct member is loaded, so the `0x041645`
dispatcher and tactical setup can be followed live. Keep the `1d99:13b9`
GEO/resource-loader callsites separate from this ECL member-loader target.

## Why the exact table still can't be pinned headlessly — UPDATED NEGATIVE

Three independent walls, all already established by the methodology:

1. **No string anchor.** `DQK.EXE --info` shows **no ECL command strings** to xref — the VM is
   pure indexed jumps over a byte, with no nearby literal to anchor (unlike the combat/economy
   overlays). The Gen1 table itself was *only* recoverable from `EclDump.exe`'s IL, **never**
   from static binary anchoring.
2. **DGROUP / CS-relative wall (methodology §3.2).** The dispatch is a
   `jmp word [bx + table_base]` whose `table_base` is resolved at overlay **load time** from the
   ECL-interpreter overlay's segment (DQK's overlay tail, `[0x218E0..EOF)`, per
   `dqk-overlay-map.md`). Headlessly we don't have the live CS/DS, so the table's file offset
   can't be bound to the running address — the same obstacle that left every DQK overlay
   function byte-unconfirmed.
3. **EclDump is Gen1-only.** `EclDump.exe` / `EclDump.il` are keyed to the Gen1 DAX layout and
   the 0x00–0x40 table; they do not parse the Gen2 HLIB `ECL.GLB` or its extended opcodes.

So, exactly like the seg051 RNG, the **live table base and confirmed handler mapping are still a
dynamic-trace target**, not a solved static fact. The new `0x041645` candidate narrows the search, but
the Palace route's negative watch result means it cannot yet replace a live dump.

### Exact next step (when a dynamic session is available)

- Run DQK under **DOSBox-X**; set an execution breakpoint on the ECL interpreter's
  `jmp word [bx+disp]` dispatch (find it by stepping from a known script-triggered event, e.g.
  the first town `PRINTCLEAR`); read `table_base = CS:disp` from the live registers; dump the
  **65+ consecutive near-pointers** there. Cross-index each handler entry against the Gen1
  `CMD_*` order to confirm the preserved core and isolate the **extended (>0x40) opcodes**.
- **OR** port `EclDump.il`'s opcode table into a Gen2 ECL parser, run it over `ECL.GLB`, and
  validate by re-deriving the byte-frequency profile above (the preserved low opcodes should
  parse cleanly; mis-widths will surface the drifted/added opcodes).

## Engine cross-check

`packages/engine` runs Gen1 ECL via the opcode table in `ecl-krynn-gen1-opcodes.md` (task #10's
VM). For Gen2 the engine should: (a) read ECL from **HLIB `DATA`** (already supported by the
HLIB loaders), and (b) reuse the **Gen1 opcode table for 0x00–~0x40** (now evidenced as
preserved) while leaving the **>0x40 extended opcodes as TODO** pending the dynamic dump. The
safe interim is: parse with the Gen1 table, log any opcode ≥ the highest known Gen1 value as
"Gen2-extended, unhandled" rather than guessing semantics.

## Gen1 ↔ Gen2 summary

| aspect | Gen1 (CoK/DoK) | Gen2 (DQK) |
| --- | --- | --- |
| ECL container | DAX archive | **HLIB `DATA`** (`ECL.GLB`) |
| core opcodes 0x00–0x14 | EXIT/GOTO/… (confirmed) | **same numbering** (byte-frequency evidence) |
| opcode ceiling | 0x40 (65 ops) | **extended past 0x40** (frequent 0x41/0x42/0x4E) |
| dispatch table | ovr003 `CMD_*` order; EclDump IL | in DQK overlay tail; **base needs a live CS/DS** |

The core ECL semantics carry over. The **exact Gen2 dispatch table, its added opcodes, and the live
`COMBAT` handoff target** remain unresolved, now with `DQK.EXE:file 0x041645` as the main static
candidate to confirm or reject under trace.

---

## 2026-07-18 static pass -- entry-reachable extended (>0x40) opcode census + turnkey trace spec (STATIC ONLY, no DOSBox-X)

Scoped for the ROADMAP "Critical path to the two end goals (2026-07-18)" Goal-2 DQK leg:
"Statically enumerate ... every opcode > 0x40 actually used by DQK's own scripts ... [and]
the candidate dispatch/jump-table base(s) ... Produce a turnkey trace spec." This pass adds
a new static tool and a new census; it does not run DOSBox-X and does not move the table
base out of UNLOCATED (that still needs a live CS/DS dump, exactly as the rest of this
document already establishes).

### New tool: `tools/dqk_ecl_extended_opcode_scan.py`

Companion to `tools/dqk_ecl_combat_scan.py`. Reuses that module's real HLIB `DATA` reader,
id table, header-entry list, and the *same* entry-reachable CFG walker/decoder (the known
Gen1 `0x00-0x40` table from `dqk_ca03_stream_decode.OPCODES`), but instead of only
reporting opcode `0x24` (COMBAT), it records
**every point the walker reaches a decoded-instruction-boundary byte whose value is >0x40**
-- i.e. a byte sitting exactly where a real opcode byte would sit, in real decoded script
control flow reachable from one of a member's five header entries.

This is a materially different (and stricter) signal than the raw byte-frequency histogram
this document's earlier 2026-07-13 pass used (`0x4E` 5120, `0x42` 2866, `0x3D` 2675, `0x41`
2169, `0x40` 1736 raw byte counts): a raw grep conflates a real top-level opcode with an
operand byte, a COMPARE immediate, or an inline 6-bit-packed string payload -- the exact
false-positive class this document already documented for `0x24` at Palanthas (`0x8439` is
a `PRINTCLEAR` inline-string length, not an opcode). Walking the same CFG-boundary decoder
already trusted for the COMBAT census means a byte is only counted if it lands where the
walker's own instruction-length arithmetic says a new instruction should start.

**Caveats, stated plainly (this is still a static lower bound):**

- A byte that never appears as a CFG-boundary target in the *reachable* graph (e.g. gated
  behind a runtime condition the walker can't evaluate) is not counted, even if DQK's real
  interpreter would decode it as an opcode somewhere at runtime.
- The walker only knows how to step `0x00-0x40` opcodes. The moment it hits a byte it
  can't decode, it stops there -- it never guesses forward. So each recorded hit is a
  genuine frontier of the currently-reachable graph, not a guess about what follows it.
- **The walker explores a CFG *superset*, not one live execution path.** For the
  `0x16-0x1B` zero-operand `IF_*` comparisons it enqueues *both* the immediate guarded
  instruction *and* the fallthrough after it (mirroring `dqk_ecl_combat_scan.py`'s existing
  behavior), because it cannot evaluate the comparison. A printed "ancestor chain" below is
  therefore *one static path* to a target, useful for real script text/opcode content, but
  not a guarantee that a fresh boot takes that exact branch without further live
  confirmation.
- This method depends on every *preceding* instruction in a chain being correctly decoded
  (right opcode, right operand width) all the way back to a header entry. A width error in
  one of the known opcodes for the Gen2 dialect (this document already found and fixed two:
  `0x1D` PARTYSTRENGTH advances one byte in Gen2, not Gen1's declared word-set; `0x21`/`0x2C`
  use DQK's short operand forms) would silently misplace every downstream "opcode" this walk
  reports. See the `0x80`/`0x81` finding below for live evidence this is still happening for
  at least a few multi-operand opcodes.

Usage:

```
python tools/dqk_ecl_extended_opcode_scan.py                      # full census, default ECL.GLB
python tools/dqk_ecl_extended_opcode_scan.py --opcode 0x41         # every occurrence of one opcode
```

### Census result

```
ECL.GLB=The Dark Queen of Krynn\DISK3\ECL.GLB
areas=47 members=48
total decoded (known 0x00-0x40) CFG boundaries reached across all areas=26490
distinct extended (>0x40) opcode VALUES reached as a CFG boundary=86
```

86 distinct byte values were reached as a CFG boundary somewhere in the retail script pool
(260+ total hit instances). That is a much smaller, much more trustworthy set than the raw
byte histogram's implied "thousands of extended-opcode bytes" -- most of the raw frequency
was operand/string noise, exactly as suspected. Top 20 by hit count (full 86-row table is
reproducible with the tool above; every row below is real decoded data, not an estimate):

| opcode | hits | first example (area/member/vaddr/file) |
| --- | --- | --- |
| `0x80` | 33 | area=010 member=007 vaddr=9ed4h file=0x00ad7a |
| `0x41` | 19 | area=001 member=001 vaddr=98f2h file=0x001a84 |
| `0x81` | 14 | area=015 member=009 vaddr=a4abh file=0x011053 |
| `0x50` | 13 | area=026 member=014 vaddr=9e08h file=0x01d38c |
| `0xa9` | 13 | area=042 member=027 vaddr=a06ch file=0x03c326 |
| `0xbf` | 10 | area=026 member=014 vaddr=81e2h file=0x01b766 |
| `0x9b` | 8  | area=010 member=007 vaddr=9b59h file=0x00a9ff |
| `0xe0` | 8  | area=023 member=013 vaddr=9d71h file=0x01a415 |
| `0x48` | 7  | area=015 member=009 vaddr=aafeh file=0x0116a6 |
| `0x54` | 6  | area=043 member=028 vaddr=9707h file=0x03e3ff |
| `0xab` | 5  | area=010 member=007 vaddr=8364h file=0x00920a |
| `0x64` | 5  | area=010 member=007 vaddr=94edh file=0x00a393 |
| `0xc0` | 5  | area=018 member=011 vaddr=9bfdh file=0x015dfb |
| `0x4c` | 5  | area=018 member=011 vaddr=8b57h file=0x014d55 |
| `0xa6` | 5  | area=030 member=017 vaddr=a538h file=0x0252d6 |
| `0x58` | 4  | area=001 member=001 vaddr=9acfh file=0x001c61 |
| `0xe8` | 4  | area=015 member=009 vaddr=80a7h file=0x00ec4f |
| `0xa4` | 4  | area=016 member=010 vaddr=96a3h file=0x012e4f |
| `0x5c` | 4  | area=022 member=012 vaddr=8c27h file=0x016a7b |
| `0xa1` | 3  | area=010 member=007 vaddr=a078h file=0x00af1e |

(remaining 66 opcodes each hit 1-3 times; full table via the tool, `--top 100`.)

### Confidence tiering (grounded, not asserted uniformly)

Classified every hit by what immediately precedes it in the walker's own CFG:

**SUSPECT -- likely decode-drift artifacts, not real opcodes (`0x80`, `0x81`).** These rank
#1 and #3 by raw hit count, but their predecessor instruction is overwhelmingly a
multi-operand opcode: `0x80` follows `PARLAY` (8x), `SURPRISE` (5x), `LOAD_PIECES` (4x);
`0x81` follows `SURPRISE` (7x). `PARLAY` (word-set 4), `SURPRISE` (word-set 4),
`PARTY_SURPRISE` (word-set 2), and `LOAD_PIECES` (word-set 3) are exactly the class of
multi-operand opcode this document already found two Gen2 width exceptions in (`0x1D`,
`0x21`/`0x2C`). `0x80`/`0x81` also independently matched this document's own 2026-07-13
raw-frequency finding ("`0x80`/`0x81` dominate the high band ... these are the EclOpp
operand type-codes ... not opcodes"). Combined, this is strong evidence `0x80`/`0x81` here
are mostly the walker landing one instruction short inside a `SURPRISE`/`PARLAY`/
`PARTY_SURPRISE`/`LOAD_PIECES` operand stream, not two real Gen2 opcodes used 47 times.
**Actionable lead:** re-deriving these four opcodes' true Gen2 word-set (the same
methodology that already fixed `0x1D`/`0x21`/`0x2C`) would likely retract most of the
`0x80`/`0x81` rows and correct every opcode currently mis-chained after one of these four.

**Tier 1 -- directly the guarded action of a zero-operand `IF_EQ/NE/LT/GT/LE/GE`
(single decode-hop from a known-correct predecessor, the highest-confidence class):**

| opcode | hits (of total) | areas | example |
| --- | --- | --- | --- |
| `0x50` | 4 of 13 | 26, 27 (x2), 67 | area=026 member=014 offset=0x1e08 guard=IF_GE |
| `0x5c` | 3 of 4  | 22, 30, 43 | area=022 member=012 offset=0x0c27 guard=IF_NE |
| `0x64` | 2 of 5  | 50, 51 | area=050 member=033 offset=0x1ec0 guard=IF_GE |
| `0x9c` | 1 of 3  | 40 | area=040 member=025 offset=0x0e8c guard=IF_GT |
| `0x9d` | 1 of 2  | 18 | area=018 member=011 offset=0x04b4 guard=IF_LT |

Real ancestor context, area 26 (`0x50`, file 0x01d38c):

```
0x1dca  PRINTCLEAR "A SPRING. WATER SPLASHES INTO A POOL."
0x1de9  COMPARE 0x0019, #1
0x1def  IF_NE
0x1df1  PRINT " STOP FOR A DRINK?"
0x1e02  PARTY_SURPRISE c17:35, c12:128
0x1e07  IF_GE
0x1e08  <opcode 0x50>
```

Every Tier-1 hit shares this shape: `SURPRISE`/`PARTY_SURPRISE` (a party check) immediately
followed by a zero-operand `IF_*` comparison, whose guarded single instruction is the
unknown opcode. That is a recognisable, recurring Gen1-style idiom ("roll a check, act on
the result"), which is why these five are the highest-confidence real extended opcodes in
the census, not just the highest-count ones.

**Tier 1b -- disproportionately follows one comparison type across many hits (`0xa9`):**
11 of 13 `0xa9` hits follow `IF_EQ` (not always the immediate next byte -- some via a
short guarded body first -- but the concentration on one comparison type across 13
independent script locations is itself a strong non-random signal). Example: area=042
member=027 vaddr=a06ch file=0x03c326.

**Tier 2 -- widest cross-area recurrence, structurally general-purpose (`0x41`):** 19 hits
across **15 distinct areas** (1, 10, 15 x3, 18, 22, 31 x2, 34, 35, 51, 58 x2, 59 x2, 63,
65) -- by far the broadest geographic spread of any opcode in the census. 9 of 19
immediately follow `PARTYSTRENGTH` (opcode `0x1D`); the rest follow a mix of `SUBTRACT`,
`CALL`, `OR`, `SURPRISE`, `UNKNOWN_1F`, `VERTICAL_MENU`, and one `IF_LE`-guarded/`ON_GOTO`-
routed position. Three grounded examples:

```
area 1  (file 0x001a84, a debug/cheat-flavoured script):
  0x18e1  INPUT_NUMBER #3, 0x00bf
  0x18e7  COMPARE 0x00bf, #0
  0x18ed  IF_LE
  0x18f2  <opcode 0x41>
  -- preceded by PRINT "HOW MANY EXPERIENCE POINTS FOR / EVERYONE IN THE PARTY? (0=EXITS)"

area 58 (file 0x057b8c, a real puzzle encounter):
  0x234f  VERTICAL_MENU 0x00bf, "WHAT DO YOU DO?", #3,
             "  PULL THE GNOME FREE.", "  PUSH THE OFF BUTTON.", "  LEAVE."
  0x2391  ON_GOTO 0x00bf, #3, 0xa3bc, 0xa3eb, 0xa3a0
  0x23bc  <opcode 0x41>   (the "PULL THE GNOME FREE" menu choice)

area 65 (file 0x069104, header entry 0, straight-line static path):
  0x00aa  PRINTCLEAR "YOU TUMBLE OVER BONY TEETH, INTO A ROOM THAT SMELLS OF DEATH."
  0x00db  PARTYSTRENGTH
  0x00dc  PRINTCLEAR "YOU HAVE ESCAPED THE ABYSS, AND RETURNED TO THE TOWER OF FLAME!"
  0x010f  PARTYSTRENGTH
  0x0110  <opcode 0x41>
```

`0x41` firing after `PARTYSTRENGTH` in unrelated scenes (a debug XP-award prompt, a menu
choice resolving to "pull the gnome", a scene-transition narration) reads as a
general-purpose statement reused throughout the script pool, not a one-off. It is the
single best static candidate to chase live: highest hit count of any opcode after
`0x80`/`0x81` (which are SUSPECT, above), and the only one with 15 independent areas to
choose a reach path from if one area turns out hard to stage.

**Tier 3 -- everything else (the remaining ~78 opcodes, 1-10 hits each):** real,
CFG-boundary-reached static data (not raw-byte noise), but each individual opcode has too
few independent hits yet to separate "real Gen2 opcode" from "one more decode-chain drift
downstream of an unrelated width error" with confidence. Full list and file addresses via
the tool.

### Dispatch/jump-table base -- still UNLOCATED, restated precisely (no new static claim)

This pass did not move the table-base question past what this document already
established, and it does not invent a new address. For the record, precisely:

- The `DQK.EXE:file 0x041645` stream-byte-reader candidate (opcode range check `cmp ax,
  0x40; jbe`, `shl bx,1; jmp word ptr cs:[bx+0x13aa]`) is still the best static candidate
  for the *real* dispatch, and its table base is still **not resolvable statically** -- the
  literal `cs:[bx+0x13aa]` read at file `0x04177a` "produced implausible out-of-overlay
  targets" (already documented above), because `cs` is only known at runtime (the DGROUP/
  CS-relative wall, methodology SS3.2).
- The separate `"2033:081b"` static `0x24` COMBAT-handler candidate's *target-conversion*
  arithmetic (`file_offset = 0x031d20 + segment_relative_offset`, verified self-consistent
  for both `2033:0e7f` -> `file 0x032b9f` and `2033:081b` -> `file 0x03253b`, both already in
  this document) is **not the same thing as knowing the table array's own file location**.
  This pass tried computing other opcodes' entries from `0x031d20 + 2*opcode` as a
  candidate table-slot formula and it does **not** reproduce the documented `0x24` ->
  `file 0x032b9f` result (computed `0x041626`, not `0x032b9f`) -- so that formula is
  **wrong/unverified** and is explicitly *not* being asserted here. The table array's exact
  file location for the `"2033"` candidate is UNLOCATED by this pass; do not reuse the
  `0x031d20 + 2*opcode` guess in a future round without re-deriving it from a live CS:IP.

Both walls are exactly what this document's "Why the exact table still can't be pinned
headlessly" section already says: a live CS/DS dump is required. Nothing here changes that
verdict; this pass only supplies much better *targets* for that live dump (below).

### Turnkey trace spec

**Reused, already-proven infrastructure (do not rebuild):**

- Watch/verify globals: opcode byte `DS:0xb1c7`, stream cursor `DS:0xb7f9`, stream base
  `DS:0xae5c:0xae5e` (documented above, "candidate stream dispatch / operand-advance
  cluster").
- `tools/unicorn_dqk_trace.py --watch-ecl-opcode <byte>` is **fully generic** (`action=
  "append"`, accepts any `int(x,0)` value, can be repeated) and already supports
  `--stop-on-ecl-opcode` to halt the run and log `writer=CS:IP` the instant `[b1c7]` is
  written with a watched value. This is the exact mechanism to finally capture a live
  dispatch-site `CS:IP` for any opcode in this census -- it does not need new tooling.
- The **loaded-save ECL-member selector chain is already confirmed** (this document,
  "The loaded-save ECL member selector chain is now confirmed"): patching a `SAVGAMA.QSV`
  save's `@21` field (== `rec+16`, the record's stored area/member id) to a target area id
  and loading it drives `DQK.EXE:0x032ded` -> `1d99:137d`/`1d99:1373` -> the overlay-6
  loader (`0x0403d8`) into that area's ECL member, exactly as already proven for area 58.
  The engine's own `patchDqkSaveResumeArea` (`packages/engine/src/loaders/dqkSave.ts`,
  exposed via `tools/build-dqk-dir.mts --save-area N`) already implements this write for a
  content-port build; the same primitive is directly reusable for staging a *retail* DQK
  save for this trace (not a CoK/DoK-port build) by patching a real DQK `SAVGAMA.QSV`.

**New, from this pass -- exact reach targets, ranked by ease of staging:**

1. **Primary target: opcode `0x41`, area 65 header-entry-0 straight-line path**
   (file `0x069104`, `vaddr 8110h`). This is the *only* Tier-1/Tier-2 candidate whose
   printed static ancestor chain contains **no comparison the walker had to choose a branch
   for** between the header entry and the target (two `IF_EQ`s exist earlier at `0x001a`/
   `0x0028` gating a *single* `SAVE`, not the reach path itself) -- so a `--save-area 65`
   load plus free-running instructions is the cheapest thing to try first. Recipe:

   ```
   python tools\unicorn_dqk_trace.py --run --load-seg 0x1000 --fake-video --fake-keyboard `
     --fake-key-rearm-after 20 --fake-timer `
     --fake-keys "esc,wait:2500000,space,space,gate:0x0bdb:0x1e3d:title-form-streq,0x1950,gate:0x25a4:0x33c3:party-menu-input-call,l,t,a,enter,b,gate:0x26f8:0x012f:journal-answer-staged,journal-answer,enter,enter,enter" `
     --max-instr 25000000 `
     --watch-ecl-opcode 0x41 --stop-on-ecl-opcode `
     --watch-exec 0x041645:ecl-dispatch-candidate `
     --log build\dqk-ecl-ext-opcode-0x41-area65.log
   ```

   (This reuses the same load-into-menu fake-key gate sequence already proven working
   elsewhere in this document; the save used for the "journal-answer" load step must be a
   real retail `SAVGAMA.QSV` first patched with `patchDqkSaveResumeArea(qsv, 65, {...})` --
   area/pose fields only, no CoK/DoK content-port involved.) A hit logs `writer=CS:IP`
   directly at the live dispatch call site for `0x41` -- read `table_base = CS:disp` from
   the instruction there (per the existing `jmp word [bx+disp]` shape) and dump the word
   table from that base, exactly as this document's "Exact next step" already specifies,
   now with a concrete, reachable opcode to validate against instead of an unconfirmed
   `0x24` COMBAT guess.

2. **Secondary targets (if area 65 doesn't reach `0x41` cleanly live -- 14 more independent
   areas to retry with the same `--save-area`/`--watch-ecl-opcode 0x41` recipe):** areas 1,
   10, 15, 18, 22, 31, 34, 35, 51, 58, 59, 63 (full offset list via
   `python tools/dqk_ecl_extended_opcode_scan.py --opcode 0x41`). Area 58's is especially
   useful as a *second, independent* opcode target in the same save/route family, since
   area 58's own selector-chain staging is **already proven live** in this document (the
   `dqk-area58-eclmember58-ecl-loader-0118-15m.log` run) -- re-run that exact same staged
   save with `--watch-ecl-opcode 0x41` added and no other changes, and it reaches
   `1d99:137d`/`1373` with `[ae63]=0x3a` exactly as already confirmed; whether it then
   free-runs to `0x23bc` (the "PULL THE GNOME FREE" menu target) needs the `VERTICAL_MENU`
   at `0x234f` answered with menu choice 1 -- add `l` (or the project's already-established
   menu-choice fake-key convention) after the load gate.
3. **Tier-1 targets for a second, independent opcode proof (`0x50`, area 26):** file
   `0x01d38c`, reachable after a `SAVE`d save-drop into area 26 (`--save-area 26`) and,
   per the ancestor dump above, answering the "STOP FOR A DRINK?" prompt such that
   `COMPARE 0x0019,#1; IF_NE` is *false* (falls through to the prompt) and the subsequent
   `PARTY_SURPRISE`/`IF_GE` check passes -- the exact DGROUP encoding of ECL variable
   `0x0019` and the surprise-roll pass/fail condition are **not** resolved by this pass
   (that would need the ECL-variable-to-DGROUP map, a separate open item), so this target
   is a good *second* proof once `0x41`/area 65 or area 58 has established the live table
   base, not necessarily the first one to attempt.
4. **`--dump-dqk-combat-map`** (already implemented) should be run alongside any of the
   above once a hit lands, to opportunistically also capture whether the same table base
   resolves the still-unconfirmed `0x24` COMBAT candidate (`2033:081b`) this document has
   tracked since 2026-07-13 -- one live table dump answers both questions at once.

**What to capture at each breakpoint (unchanged from this document's existing spec, restated for completeness):** the live `CS:disp` operand of the `jmp word [bx+disp]` at the moment `[b1c7]` is written with a watched opcode; the full word table from that base for at least the `0x00-0x60` range (covers every opcode this census found); cross-index each recovered entry against the Gen1 `CMD_*` order (`ecl-krynn-gen1-opcodes.md`) to confirm which low entries are preserved verbatim and which (if any) are Gen2 handler-body rewrites even at a numerically-preserved opcode.

### Engine cross-check (unchanged)

No engine (`packages/engine`) code was touched by this pass. The existing interim policy
stands: parse with the Gen1 `0x00-0x40` table, log any opcode >=0x41 as "Gen2-extended,
unhandled" rather than guessing semantics. This census gives that TODO a concrete priority
order if/when semantics need to be assigned: `0x41` first (widest evidence), then the
Tier-1 five (`0x50`/`0x5c`/`0x64`/`0x9c`/`0x9d`) and `0xa9`, with `0x80`/`0x81` explicitly
flagged as probably-not-real-opcodes pending the `SURPRISE`/`PARLAY`/`PARTY_SURPRISE`/
`LOAD_PIECES` word-set re-derivation.

---

## 2026-07-18 DYNAMIC TRACE — SOLVED: the live Gen2 dispatch table, handler map, and fired-opcode log

Executed the turnkey trace spec above (with corrections noted below) using
`tools/unicorn_dqk_trace.py` against a scratch copy of the untouched GOG
"The Dark Queen of Krynn" directory. No DOSBox-X was needed (or used) — the project's own
Unicorn-based DQK tracer reached the live interpreter directly; the copy-protection journal
prompt was answered by the tracer's existing `journal-answer` mechanism (reads the staged
expected word from live `DS:0xC6F9`). Three runs, logs in `build/`:

| run | log | purpose | result |
| --- | --- | --- | --- |
| r1 | `build/dqk-ecl-ext-opcode-area65-r1.log` | doc recipe as specced (area-65 save, watch `0x41-0xff`) | route reached the interpreter; entry script exited via resume guard; no extended opcode fired |
| r2 | `build/dqk-ecl-ext-opcode-area65-r2.log` | full-band watch `0x00-0xff` + new one-shot dispatch-site scan/table dump | **live table captured + byte-identity proven**; dispatch `jmp` witnessed live for opcode `0x03` |
| r3 | `build/dqk-ecl-ext-opcode-area65-r3.log` | staged first-fetch jump to the natural area-65 `0x41` chain | **opcode `0x41` fired live end-to-end through table slot `0x41`** |

### The dispatch mechanism (live-confirmed, byte-exact)

The live interpreter is the **canonical `2033` overlay** (live segment `3033` at
`--load-seg 0x1000`; overlay body file base `0x031d20`, confirmed by every address below).
Fetch/dispatch loop:

```text
2033:0f65  mov  al, [0xb1c7]          ; previous opcode
2033:0f68  mov  [0xae69], al          ; save as "last opcode"
2033:0f6b  les  bx, [0xae5c]          ; stream base (5b6e:8000-biased)
2033:0f6f  add  bx, [0xb7f9]          ; + cursor (b7f9 == 0x8000-based vaddr)
2033:0f73  mov  al, es:[bx]           ; fetch opcode byte
2033:0f76  mov  [0xb1c7], al          ; <-- THE [b1c7] WRITER (live 3033:0f76, witnessed r1/r2/r3)
2033:0f79  push cs
2033:0f7a  call 0xd1e                 ; near call to the dispatcher
...
2033:0d1e  mov  al, [0xb1c7]
2033:0d21  mov  ah, 0
2033:0d23  cmp  ax, 0x41              ; RANGE CHECK: valid opcodes 0x00..0x41
2033:0d26  jbe  0xd2b
2033:0d28  jmp  0xf45                 ; out-of-range -> 0f45 = retf (silent no-op return)
2033:0d2b  mov  bx, ax
2033:0d2d  shl  bx, 1                 ; DIRECT indexing: slot == opcode (no dec ax)
2033:0d2f  jmp  word ptr cs:[bx + 0xd34]   ; THE GEN2 ECL DISPATCH TABLE
```

**Table location: canonical `2033:0d34` = file `0x032a54` = live phys `0x031064`.**
The r2 one-shot segment scan (new tracer feature, below) dumped the live table and it is
**byte-identical** to the retail file bytes at `0x032a54`
(`b8 0d bf 0d c6 0d cd 0d d4 0d d4 0d d4 0d d4 0d ...`). The r2 exec watch caught the
dispatch `jmp` itself executing with `b1c7=0x03, bx=0x0006` (= opcode x2) nine instructions
after the `0f76` store — the indexed-jump mechanics are live-witnessed, not inferred.

Key structural facts:

- **0x42 slots — opcodes `0x00`–`0x41`. Gen2 adds exactly ONE opcode beyond Gen1's 0x40
  ceiling.** The range check is `cmp ax,0x41; jbe`. Everything the 2026-07-18 static census
  flagged above `0x41` (`0x4E`, `0x50`, `0x5C`, `0x80/0x81`, ... 85 of the 86 values) is now
  **confirmed decode-drift/operand noise**, exactly as the census's own SUSPECT tiering
  predicted — a real occurrence would fall through the range check to `retf` and do nothing.
- **Out-of-range behavior:** `2033:0f45` is a bare `retf` — an out-of-range opcode byte is a
  silent no-op (returns to the fetch loop without advancing anything).
- **Slot `0x24` (COMBAT) = `2033:0e7f` -> near call `2033:081b`** — the table's own entry
  **confirms** the static COMBAT-handler candidate this document has tracked since
  2026-07-13. (A live `0x24` fire is still not demonstrated — see "still open" below — but
  the handler binding is no longer a candidate; it is the verified table's entry.)

### The full handler map (all 0x42 slots, cross-indexed to Gen1)

Slot stubs are 7-byte `push cs; call NEAR; jmp 0xf45` (segment-local handlers) or
`lcall 1d99:XXXX; jmp 0xf45` (Borland overlay trampolines; each `1d99` stub does
`call <ovl-loader>` then `jmp far 25a4:YYYY` — every far handler lands in the **canonical
`25a4` overlay, body file base `0x0402c0`**). Handler file offsets below are mechanically
derived from those two verified bases.

> **Corrected 2026-08-07 — the `25a4` body base was `0x0403d0` here, off by `+0x110`.** Segment
> `25A4` hosts more than one overlay record; `0x0403d0` names a different one (the same confusion
> is visible in `tools/unicorn_dqk_trace.py`, whose comment says `0x0403d0` while its data table
> already uses `0x0402c0`). For the ECL handlers the base is decidable: brute-forcing every base
> for which the far handlers land on Borland `55 8b ec` prologues yields exactly one solution,
> `0x0402c0` (10 of 13 sampled handlers land on a prologue; at `0x0403d0` every one lands
> mid-instruction). The far rows' file-offset column below has been re-derived accordingly — all
> 24 shifted by `-0x110`. The `2033` near base `0x031d20` was and remains correct.

| op | Gen1 name | table slot -> stub | real handler | handler file offset |
| --- | --- | --- | --- | --- |
| 0x00 | EXIT | `2033:0db8` | `2033:01ae` (near) | `0x031ece` |
| 0x01 | GOTO | `2033:0dbf` | `2033:023e` (near) | `0x031f5e` |
| 0x02 | GOSUB | `2033:0dc6` | `2033:025b` (near) | `0x031f7b` |
| 0x03 | COMPARE | `2033:0dcd` | `2033:026d` (near) | `0x031f8d` |
| 0x04 | ADD | `2033:0dd4` | `2033:02c2` (near, shared) | `0x031fe2` |
| 0x05 | SUBTRACT | `2033:0dd4` | `2033:02c2` (shared) | `0x031fe2` |
| 0x06 | DIVIDE | `2033:0dd4` | `2033:02c2` (shared) | `0x031fe2` |
| 0x07 | MULTIPLY | `2033:0dd4` | `2033:02c2` (shared) | `0x031fe2` |
| 0x08 | RANDOM | `2033:0ddb` | `2033:036a` (near) | `0x03208a` |
| 0x09 | SAVE | `2033:0de2` | `2033:03c8` (near) | `0x0320e8` |
| 0x0a | LOAD_CHAR | `2033:0de9` | `2033:0422` (near) | `0x032142` |
| 0x0b | LOAD_MONSTER | `2033:0df0` | `1d99:1337` -> `25a4:29a3` | `0x042c63` |
| 0x0c | SETUP_MONSTER | `2033:0df8` | `1d99:132d` -> `25a4:2db1` | `0x043071` |
| 0x0d | APPROACH | `2033:0e00` | `1d99:1323` -> `25a4:2e4f` | `0x04310f` |
| 0x0e | PICTURE | `2033:0e08` | `2033:0552` (near) | `0x032272` |
| 0x0f | INPUT_NUMBER | `2033:0e0f` | `1d99:1319` -> `25a4:2e7c` | `0x04313c` |
| 0x10 | INPUT_STRING | `2033:0e17` | `1d99:130f` -> `25a4:2ec8` | `0x043188` |
| 0x11 | PRINT | `2033:0e1f` | `1d99:1305` -> `25a4:1cd3` (shared) | `0x041f93` |
| 0x12 | PRINTCLEAR | `2033:0e1f` | `1d99:1305` -> `25a4:1cd3` (shared) | `0x041f93` |
| 0x13 | RETURN | `2033:0e27` | `2033:0569` (near) | `0x032289` |
| 0x14 | COMPARE_AND | `2033:0e2e` | `2033:05be` (near) | `0x0322de` |
| 0x15 | VERTICAL_MENU | `2033:0e35` | `1d99:12fb` -> `25a4:1e91` | `0x042151` |
| 0x16 | IF_EQ | `2033:0e3d` | `2033:06a6` (near, shared x6) | `0x0323c6` |
| 0x17 | IF_NE | `2033:0e3d` | `2033:06a6` (shared) | `0x0323c6` |
| 0x18 | IF_LT | `2033:0e3d` | `2033:06a6` (shared) | `0x0323c6` |
| 0x19 | IF_GT | `2033:0e3d` | `2033:06a6` (shared) | `0x0323c6` |
| 0x1a | IF_LE | `2033:0e3d` | `2033:06a6` (shared) | `0x0323c6` |
| 0x1b | IF_GE | `2033:0e3d` | `2033:06a6` (shared) | `0x0323c6` |
| 0x1c | CLEARMONSTERS | `2033:0e44` | `2033:07fe` (near) | `0x03251e` |
| 0x1d | PARTYSTRENGTH | `2033:0e4b` | `2033:1383` (near) | `0x0330a3` |
| 0x1e | CHECKPARTY | `2033:0e52` | `2033:0812` (near) | `0x032532` |
| 0x1f | UNKNOWN_1F | `2033:0e59` | `1d99:12f1` -> `25a4:32b2` | `0x043572` |
| 0x20 | NEWECL | `2033:0e61` | `1d99:12e7` -> `25a4:1d8d` | `0x04204d` |
| 0x21 | LOAD_FILES | `2033:0e69` | `1d99:12dd` -> `25a4:1dec` | `0x0420ac` |
| 0x22 | PARTY_SURPRISE | `2033:0e71` | `2033:13c4` (near) | `0x0330e4` |
| 0x23 | SURPRISE | `2033:0e78` | `2033:1402` (near) | `0x033122` |
| 0x24 | COMBAT | `2033:0e7f` | `2033:081b` (near) | `0x03253b` |
| 0x25 | ON_GOTO | `2033:0e86` | `2033:0991` (near, shared) | `0x0326b1` |
| 0x26 | ON_GOSUB | `2033:0e86` | `2033:0991` (shared) | `0x0326b1` |
| 0x27 | TREASURE | `2033:0e8d` | `1d99:12d3` -> `25a4:2127` | `0x0423e7` |
| 0x28 | ROB | `2033:0e95` | `1d99:12c9` -> `25a4:28f8` | `0x042bb8` |
| 0x29 | ENCOUNTER_MENU | `2033:0e9d` | `2033:1449` (near) | `0x033169` |
| 0x2a | GETTABLE | `2033:0ea4` | `2033:073a` (near) | `0x03245a` |
| 0x2b | HORIZONTAL_MENU | `2033:0eab` | `1d99:12b5` -> `25a4:1ff7` (al=0) | `0x0422b7` |
| 0x2c | PARLAY | `2033:0eb7` | `2033:1420` (near) | `0x033140` |
| 0x2d | CALL | `2033:0ebe` | `2033:0aba` (near) | `0x0327da` |
| 0x2e | DAMAGE | `2033:0ec5` | `1d99:12bf` -> `25a4:22ac` | `0x04256c` |
| 0x2f | AND | `2033:0ecd` | `2033:06be` (near, shared) | `0x0323de` |
| 0x30 | OR | `2033:0ecd` | `2033:06be` (shared) | `0x0323de` |
| 0x31 | SPRITE_OFF / SHORT_MENU (Gen2) | `2033:0ed4` | `1d99:12b5` -> `25a4:1ff7` (al=1) | `0x0422b7` |
| 0x32 | FIND_ITEM | `2033:0edf` | `1d99:12ab` -> `25a4:2f3b` | `0x0431fb` |
| 0x33 | PRINT_RETURN | `2033:0ee6` | `2033:0a68` (near) | `0x032788` |
| 0x34 | ECL_CLOCK | `2033:0eec` | `2033:0a35` (near) | `0x032755` |
| 0x35 | SAVE_TABLE | `2033:0ef2` | `2033:07a9` (near) | `0x0324c9` |
| 0x36 | ADD_NPC | `2033:0ef8` | `1d99:12a1` -> `25a4:307b` | `0x04333b` |
| 0x37 | LOAD_PIECES | `2033:0eff` | `1d99:1297` -> `25a4:31e8` | `0x0434a8` |
| 0x38 | PROGRAM | `2033:0f06` | `2033:0baf` (near) | `0x0328cf` |
| 0x39 | WHO | `2033:0f0c` | `1d99:128d` -> `25a4:2fe0` | `0x0432a0` |
| 0x3a | DELAY | `2033:0f13` | `2033:0a26` (near) | `0x032746` |
| 0x3b | SPELL | `2033:0f19` | `1d99:1283` -> `25a4:260f` | `0x0428cf` |
| 0x3c | PROTECTION | `2033:0f20` | `1d99:1279` -> `25a4:335e` | `0x04361e` |
| 0x3d | CLEAR_BOX | `2033:0f27` | `2033:0a8d` (near) | `0x0327ad` |
| 0x3e | DUMP | `2033:0f2d` | `2033:0c9b` (near) | `0x0329bb` |
| 0x3f | FIND_SPECIAL | `2033:0f33` | `2033:0cc5` (near) | `0x0329e5` |
| 0x40 | DESTROY_ITEMS | `2033:0f39` | `1d99:126f` -> `25a4:30ec` | `0x0433ac` |
| 0x41 | **GEN2_EXT_41** (new in Gen2) | `2033:0f40` | `1d99:1265` -> `25a4:2719` | `0x0429d9` |

**Gen1 cross-index verdict: the core numbering is preserved 1:1 through `0x40`,** and the
shared-handler groups fall at exactly the Gen1 idiom positions — `0x04`–`0x07` arithmetic in
one handler, `0x11/0x12` PRINT/PRINTCLEAR one handler (Gen1 doc: "same handler as PRINT"),
`0x16`–`0x1B` six IF_* comparisons one handler, `0x25/0x26` ON_GOTO/ON_GOSUB one handler
(Gen1 doc: "same dispatch"), `0x2F/0x30` AND/OR one handler. Two Gen2 deltas beyond the new
`0x41`: **`0x1F` (Gen1 "notsure/no handler") has a real Gen2 handler** (`25a4:32b2`), and
`0x2B/0x31` share one parameterized handler (`25a4:1ff7` with `al=0/1`) despite unrelated
Gen1 names (HORIZONTAL_MENU / SPRITE_OFF) — Gen2 semantics of that pair are **unverified**
(recorded honestly; the Gen1 names may not both survive).

### Opcode `0x41` — the single Gen2 extension, fired live

Run r3 witnessed the complete extended-opcode dispatch end-to-end on unmodified retail
script bytes (area 65, `ECL.GLB` member 45):

```text
ECL-OPCODE #7 opcode=0x41 writer=3033:0f76 b7f9=0x8110 stream=5b6e:8000
  at=41 00 01 00 64 09 00 01 01 04 01 ...        ; retail bytes at vaddr 0x8110
EXEC WATCH ecl-op41-stub canonical=2033:0f40 live=3033:0f40 b1c7=0x41 bx=0x0082  ; = 0x41*2
```

— fetch at the census-predicted vaddr `0x8110`, dispatch through **table slot `0x41`** to
stub `2033:0f40` -> `lcall 1d99:1265` -> far handler `25a4:2719` (file `0x0429d9`), after
which the stream resumed correctly at the following `SAVE` (`0x09`), proving the handler ran
and returned with a proper operand advance. Observed operand bytes: `00 01 00 64` — two
EclOpp literal operands (`1`, `100`).

**Semantics (retail handler disassembly plus controlled live write, 2026-09-12):** the handler
reads two operands, promotes operand two to a 32-bit value, and calls the resident long-multiply
helper with `0:100`, making the award `operand2 * 100`. Operand one selects the branch: zero
uses the selected-record root at `DGROUP:ad67`; nonzero walks the linked party list rooted at
`DGROUP:c6e5`. Each admitted record (`es:[bx+0x18b] != 0`) counts its own seven positive
`es:[bx+0xa5..0xab]` class slots, divides the multiplied award by that count, adds the quotient
to the u32 at `+0x44/+0x46`, then stores the result of the retail readiness helper at `+0xCD`.
Party mode therefore repeats a member-local multiclass split; it does not divide one award across
the party.

A controlled replay reached retail `0x41 [1,100]` bytes and observed the original handler at
`25a4:27f6/27fa` change an admitted record from `0x000f4241` to `0x000f6951` (**+10,000**),
then write `+0xCD = 0` at `25a4:280c`, agreeing with the static `100` multiplier. The shipped
`SAVGAMA.QSV` corroborates that field when offsets use the **full physical record**:
its six records begin at `0x40f,0x60b,0x821,0xa50,0xc5e,0xe7c`, and their u32
`+0x44` values are `1000001,500000,333333,500000,500000,500000`. These match the
Journal's starting XP and multiclass split. The file is 7,965 bytes, SHA-256
`8b657e4af9aa692e14c3720a56349ec63cc695aa8230531563c713fe7f3e0172`.

**Record-base correction, 2026-10-02:** the older text compared runtime `+0x44`
with an importer view beginning eight bytes inside each physical record
(`0x417,0x613,0x829,0xa58,0xc66,0xe84`). In that shifted view, XP is at `+0x3c`;
its `+0x44` instead reads full-record `+0x4c`, which is 200 in all six records.
The previous description of `+0x3c` as a separate threshold-like field was
unsupported and is retracted. Names similarly occur at full-record `+0x68`
and shifted-view `+0x60`; class-level slots are full-record `+0xa5..0xab`
and shifted-view `+0x9d..0xa3`. See [the physical record layout](dqk-save-format.md).
This base correction does not by itself establish safe native QSV writeback.

A fresh static read of the original executable locates the readiness call
at file `0x42ac2`: `lcall 0x77e:0x1fe5`, resident file `0xbbc5`. That routine
walks seven active class slots at `+0xa5`, passes current level plus one and
class index to `1d99:0x0f6d`, compares the returned threshold with `+0x44/+0x46`,
and applies the race/class limit at `DS:0x17dc + race*7 + class` (with a
knight-order exception). This is a source lead for creation/progression;
no new runtime test or complete threshold-table recovery is claimed here.

The control used the old synthetic `ca03=0xfef0` resume state to reach the route; no retail save
in the corpus carries that state. It observed one admitted linked record, and it did not establish
the readiness helper's threshold rule or QSV persistence after the original program exits. Native
DQK writeback remains deliberately unimplemented: the compact transient GBPR projection has no
validated provenance mapping back to each variable-length QSV record, so applying the recovered
field offsets would still risk writing a wrong source record.

### How the trace was actually routed (corrections to the turnkey spec)

1. The spec's `--watch-exec 0x041645:ecl-dispatch-candidate` **does not parse** (file
   offsets are not 16-bit segments; use canonical `SEG:OFF` form).
2. The spec's primary claim that area 65's `0x41` is reachable "straight-line" on a
   `--save-area 65` load is **wrong in exactly the area-58 way this document already
   documented**: the member's initial entry is a resume guard —
   `03 00 41 01 16 00 | 16 | 00` = `COMPARE #65, [0x0016]; IF_EQ; EXIT` (r1/r2 fired-opcode
   log: `0x03, 0x16, 0x00`) — so resuming *into* area 65 exits immediately, like area 58.
3. The working route (r3): stage the save with the `patchDqkSaveResumeArea` field writes
   (`@18=65, @21=65, @1029=4`, init flags; both root and `SAVE\` copies of `SAVGAMA.QSV`
   in a **scratch copy** of the GOG dir — the repo's GOG dir was left untouched), then gate
   the fake-key queue on the interpreter's first fetch and poke the stream cursor to the
   natural narration chain **before** the entry guard runs:

   ```text
   ...,journal-answer,gate:0x2033:0x0f6b:first-ecl-fetch,poke-dgroup16:0xb7f9:0x80aa:area65-narration-jump,enter,enter,enter,enter
   ```

   The poke is **synthetic route control only** (per this document's own convention): it
   selects where the interpreter starts reading; every fetched byte, the dispatch, and the
   handlers are the original runtime operating on unmodified retail script data. The r3
   fired sequence from the poke on — `0x12, 0x1d, 0x12, 0x1d, 0x41 @0x8110, 0x09, 0x12,
   0x1d, 0x12, 0x1d, 0x0c` — matches the census's static ancestor chain for area 65 exactly.
   (Ordering matters: the gate+poke must sit **immediately after `journal-answer`**, before
   the trailing enters — r2 proved that queueing them after the enters arms the gate too
   late, after the entry guard has already run.)

### Fired-opcode log — an ordinary boot-to-gameplay (r1/r2, no poke)

The full-band `[b1c7]` histogram (new tracer feature) over a complete boot -> title -> party
menu -> journal answer -> save-load -> area-entry sequence shows the ECL VM is **not used at
all by the boot/menu path**: the only `[b1c7]` writes are two startup `rep stosw` DGROUP
clears (writers `1000:00b7`, `2d99:0645`) and then the loaded area's entry script —
`0x03 COMPARE, 0x16 IF_EQ, 0x00 EXIT` (writer `3033:0f76`). r3's poked route adds
`0x12 PRINTCLEAR, 0x1d PARTYSTRENGTH (x4 — zero-operand in Gen2, re-confirming the
2026-07-18 census's width fix), 0x41, 0x09 SAVE, 0x0c SETUP_MONSTER`. All fired opcodes
dispatch through the one `2033:0d34` table.

### New reusable tracer features (tools/unicorn_dqk_trace.py)

- `--watch-ecl-opcode` now accepts **inclusive ranges** (`0x41-0xff`, `0x00-0xff`).
- Every `[b1c7]` write is recorded in an **ECL-HISTOGRAM** (value -> count -> writer CS:IP
  list), logged at end of run regardless of the watch set.
- On the first watched hit per writer CS, a **one-shot dispatch capture** runs
  automatically: linear disassembly past the writer, a whole-segment scan for
  `2e ff a7` (`jmp word ptr cs:[bx+disp16]`) dispatch sites, and a live dump of the
  near-pointer table behind each site (`ECL-DISPATCH-SCAN` / `-SITE` / `-TABLE` log rows).
  This is what captured the table without needing a debugger stop.
- `--watch-current-record-pointer OFFSET` selects the DGROUP far-pointer followed by
  `--watch-current-record-write` (default `b20f`). The DQK `0x41` party handler uses `c6e5`,
  whereas `b20f` is save-transfer state and cannot observe the award writes.

### Still open (narrow, honest)

- ~~**The second dispatcher instance**~~ **RESOLVED 2026-08-07 by the base correction above.**
  The `25a4:1275` cluster (file `0x041535`, not `0x041645`) is `dec ax`-indexed
  `jmp word ptr cs:[bx+0x13aa]` over the same `[ae5c]/[b7f9]/[b1c7]` globals and the same `0x41`
  ceiling. Its table was previously read at `0x0403d0+0x13aa = 0x04177a` and judged "code, not a
  table". That verdict was the `+0x110` base error, not a property of the binary: at
  `0x0402c0+0x13aa = 0x04166a` the bytes are unmistakably a 0x42-entry word table, all entries in
  `0x01b0..0x14ce`, and it reproduces the `2033` table's exact shared-handler signature **once the
  documented `dec ax` indexing is applied** (entry `i` <-> opcode `i+1`):

  | shared group | opcodes | entry |
  | --- | --- | --- |
  | ADD / SUBTRACT / DIVIDE / MULTIPLY | 0x04-0x07 | `0x1444` (x4) |
  | IF_EQ / IF_NE / IF_LT / IF_GT / IF_LE / IF_GE | 0x16-0x1b | `0x14ce` (x6) |
  | ON_GOTO / ON_GOSUB | 0x25, 0x26 | `0x1471` (x2) |
  | PRINT / PRINTCLEAR | 0x11, 0x12 | `0x142c` (x2) |

  That the sharing pattern falls out correctly only under BOTH the corrected base and the `dec ax`
  offset is itself strong independent confirmation of the base. It still did not fire as the
  `[b1c7]` writer in any run — the live interpreter for these routes remains the `2033` copy — so
  when this second copy runs is still unknown. But it is now a located, decoded second table
  rather than an unexplained region.
- **A live `0x24` COMBAT fire** is still not demonstrated (the table binds the handler,
  but no run has yet executed a real combat handoff). The area-59/60 routes above remain
  the best candidates.
- **DQK `0x41` persistence and multi-member split** still need a retail-valid control before engine
  adoption; the one-record synthetic-resume control above proves the XP/writeback body only. The
  **`0x2B/0x31` shared handler** question is **CLOSED (2026-08-07)** — see the
  operand-count section below. Both slots trampoline into `25a4:1ff7`; the `0x31` slot stub at
  `2033:0eab` (`0x2b`) differs from `0x31` at `2033:0ed4` only by the `mov al,N` it pushes (0 vs 1), which the handler
  reads as `[bp+6]` and uses purely to pick a rendering branch. Operand framing is identical for
  both (2 words, then a count-driven item list). `0x31` is a MENU in Gen2, not `SPRITE_OFF`.
  Adopted in `ECL_GEN2` in `packages/engine/src/ecl/disassemble.ts`.

### The operand-count table, read out of the binary (2026-08-07)

Every Gen2 handler declares its own operand count. The shared prefetch routine is `2033:0013`,
called as `mov al,N; push ax; (push cs;) call 0x0013`; operand `i` is then read back via
`2033:0112`. `2033:0013` itself carries the operand-code dispatch table at `cs:0x0068` =
`{1, 2, 3, 0x80, 0x81}` — the documented EclOpp codes — and does `add word ptr [0xb7f9], 2` per set
(`[0xb7f9]` is the ECL PC). So **`N` is the wordSet**, read directly rather than inferred from
sample streams. Count-driven opcodes (`0x15`, `0x25`, `0x26`, `0x27`, `0x2b`, `0x31`) issue a
SECOND prefetch with a register argument after `dec [0xb7f9]`.

Extracting `N` for all 0x42 slots corrected six opcodes that both the engine and
`tools/dqk_ecl_combat_scan.py` had wrong:

`INPUT_NUMBER` operand order is pinned by the same parser model and handler body.
DQK ECL member 2, area 2, vaddr `0x84D0` contains `0F 00 03 03 C1 00`:
operand 1 is immediate `#3`, operand 2 is code-3 cell `[0x00C1]`. The parser
stores operand 2 in `[b217]`/`[b187]`/`[ae6c]`; the `0x04313c` handler rebuilds
its address from the latter two slots and passes it to `0x040992`. That helper
writes its numeric result through the address argument and uses operand 2's
code 3 to select a two-byte result. It never reads operand 1. This is why `#3`
cannot be treated as a maximum of three choices and why a value such as 750
fits the source destination.

| op | name | was | is | handler |
| --- | --- | ---: | ---: | --- |
| 0x1f | UNKNOWN_1F | 2 | **1** | `25a4:32b2` |
| 0x27 | TREASURE | 8 | **4** + count at arg 3 | `25a4:2127` |
| 0x29 | ENCOUNTER_MENU | 14 | **0** | `2033:1449` (`inc [pc]; retf`) |
| 0x2c | PARLAY | 4 | **1** | `2033:1420` |
| 0x31 | (menu) | 0 | **2** + count at arg 1 | `25a4:1ff7` (shared with 0x2b) |
| 0x37 | LOAD_PIECES | 3 | **2** | `25a4:31e8` |

Measured over a control-flow walk from the five header entries of all 47 `ECL.GLB` members, the
corrected table reaches **6789 instructions with ONE halt**; the previous table reached 5292 with
**74 halts**. The single remaining halt (member 37 / area 55, vaddr `0x836c`) is not a framing
error — it is the inline string `"DEMAND TO KNOW WHAT GODS THEY WORSHIP."` belonging to the
preceding `VERTICAL_MENU`, reached because the walker followed a false branch target.

`0x2c PARLAY` occurs 130 times and was the dominant desync; `0x29` occurs zero times, so its
14-vs-0 error was harmless in practice. **The "35 combat sites" figure quoted in earlier rounds is
superseded: the byte-grounded count is 41.**

### Engine cross-check (updated policy)

`packages/engine` keeps the Gen1 table for `0x00`–`0x40` (now **verified** preserved 1:1 by
the recovered Gen2 table, not just byte-frequency-evidenced). The former
"log any opcode >=0x41 as Gen2-extended, unhandled" TODO collapses to exactly **one** opcode:
`0x41` (`GEN2_EXT_41`, handler `25a4:2719`/file `0x0429d9`, two EclOpp operands observed).
Opcodes `>0x41` must be treated as **invalid** (the real interpreter's range check makes
them silent no-ops), which also means any Gen2 parser that "finds" opcodes above 0x41 is
mis-aligned — the exact drift-detection rule the static census needed.

---

## Historical 2026-07-18 engine wiring — opcode 0x41 landed in `packages/engine` (static-only, no DOSBox-X)

Closes the "Engine cross-check (updated policy)" TODO immediately above. This session was
scoped STATIC-ONLY (a parallel agent owns the CoK M4 DOSBox-X/Unicorn combat-init trace) —
no DOSBox-X or Unicorn tracing against `DQK.EXE` combat code was run here; everything below
is engine (TypeScript) code plus tests against already-decoded retail data files already on
disk.

**What changed:**

- `packages/engine/src/ecl/disassemble.ts`: `EclDialect` gained a new `opcodeOverrides?:
  Readonly<Record<number, OpcodeDef>>` field, distinct from the pre-existing
  `wordSetOverrides` (which only changes the *operand count* of an opcode both Gen1 and Gen2
  already share — e.g. `0x1D`/`0x21`/`0x2C`). `opcodeOverrides` lets a dialect define a
  **brand-new** opcode number the shared `KRYNN_GEN1_OPCODES` table has no entry for at all —
  exactly `0x41`'s situation, since Gen1's own real dispatch table is dense only over
  `0x00..0x40` (`ECL_OPCODE_MAX = 0x40`, unchanged). `decodeInstructionAt` now resolves
  `dialect?.opcodeOverrides?.[opcode] ?? KRYNN_GEN1_OPCODES[opcode]`.
  `ECL_GEN2.opcodeOverrides = { 0x41: { wordSet: 2, mnemonic: 'GEN2_EXT_41', uncertain: true }
  }` — `wordSet: 2` matches run r3's live-observed operand bytes (`00 01 00 64`, two 2-byte
  `imm` EclOpp sets) exactly; `uncertain: true` uses the same convention already applied to
  Gen1's `0x1F`.
- `packages/engine/src/ecl/vm.ts`: new `case 0x41` in `exec()`. Per this doc's own "grounded
  hypothesis, NOT PROVEN" framing for the handler's semantics, the VM does **not** compute or
  apply any award/split — it only pushes a distinctly-labeled `scriptEffect{kind:
  'gen2Ext41', operands, ins}` so a host can act on the hypothesis (or not) without the VM
  inventing unverified game behavior. New `EclScriptEffectKind` member `'gen2Ext41'`
  documents the same caveat inline.
- Opcodes `>0x41` were **already** `badOpcode`/`halted` before this change (neither
  `KRYNN_GEN1_OPCODES` nor either dialect defines them) — verified, not modified. A new
  regression test pins this explicitly: it is the engine's own decode-drift-detection
  convention (an existing `vm.test.ts` case already expects `'halted'`/`'bad opcode at N'`
  for any truly-unknown byte), not the literal "falls through to a bare retf and silently
  re-enters the fetch loop" the real DQK interpreter does. Given this project's Gen1 desync
  history (mis-framed operand counts silently corrupting downstream decode), a defensive halt
  on a genuinely-unrecognized opcode byte is judged the safer engine behavior; only the ONE
  *proven* opcode (`0x41`) was added, per this doc's own **"treat opcodes above 0x41 as
  invalid"** conclusion.

**Proof, against real retail bytes (not synthetic):** `packages/engine/test/eclGen2.test.ts`
adds:
1. A synthetic decode/dispatch pin for the exact `00 01 00 64` operand shape.
2. A Gen1-dialect regression proving byte `0x41` still bad-opcode/halts under `ECL_GEN1` (no
   `opcodeOverrides` there) — the desync-detector stays intact.
3. A **golden** test against the real `DISK3/ECL.GLB`: decodes area 65 (member 45), confirms
   the retail byte at vaddr `0x8110` is `GEN2_EXT_41` (matching this doc's static census
   exactly), then runs the VM from vaddr `0x80aa` (the same
   `poke-dgroup16:0xb7f9:0x80aa:area65-narration-jump` route-control target the live trace
   used) and reproduces the **live trace's own fired-opcode sequence byte-for-byte**:
   `0x12, 0x1d, 0x12, 0x1d, 0x41 (operands [1,100]), 0x09, 0x12, 0x1d, 0x12, 0x1d, 0x0c`,
   confirming the stream resyncs correctly into a real `SETUP_MONSTER` afterward (i.e. the VM
   consumed exactly the right number of operand bytes and did not desync).

**Browser end-to-end confirmation:** the existing `?dqk=1` e2e route (`explore-dqk` in
`apps/web/test/e2e.mjs`, focusable via `GB_E2E_ONLY=explore-dqk node test/e2e.mjs`) still
passes unchanged after this wiring — the real `dqkExplore.ts` boot/walk/Companion flow, which
already runs the Gen2 dialect over the real 20-map `GEO.GLB` + `ECL.GLB` library, is
unaffected. No new e2e assertions were added; the existing route already exercises the real
`ECL_GEN2` dispatch path end-to-end through the browser engine, and the engine-level golden
test above is the more direct, byte-exact proof of the opcode-0x41 semantics specifically.

**This is a real bug fix, not just wiring.** Before this change, `ECL_GEN2` had no
`opcodeOverrides`, so any script reaching opcode `0x41` as a real decode-boundary byte hit
`badOpcode` and the VM run **halted immediately** — silently truncating that script's
remaining events. The 2026-07-18 static census found `0x41` reachable in **15 independent
areas** (1, 10, 15, 18, 22, 31, 34, 35, 51, 58, 59, 63, 65, plus 2 more per its area list).
Every one of those areas' natural playthroughs now runs to completion past this point instead
of stopping cold.

**Closed 2026-09-25:** the `0x2B/0x31` shared-handler semantics are not open. Retail stubs and
the shared handler establish that `0x31` is the counted short-menu form, not `SPRITE_OFF`; the
scanner now models its two fixed operands, count-driven label tail, and `SHORT_MENU` mnemonic.
Opcode `0x27` likewise has a counted tail after its fourth fixed operand. A retail-shaped fixture
pins both frame sizes. A live `0x24` COMBAT fire remains unverified.

`tsc --noEmit` is clean repo-wide; the full `packages/engine` vitest suite (149 files / 1758
tests) passes.
