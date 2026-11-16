# DQK Start/Load Route Anchors

This note records the current static and dynamic anchors for driving `DQK.EXE` from the early
start/party menu into saved-game load and then toward `Begin Adventuring`. It exists because the
Unicorn harness now proves fake keys are consumed, but those keys are still not reaching the original
party/load/QSV route states.

## Static Anchors

Overlay 7 contains the visible party/start menu labels and dispatch cases:

| Canonical | File offset | Meaning |
|---|---:|---|
| `25a4:3127` | `0x0478d7` | Party/start menu render entry |
| `25a4:3328` | `0x047ad8` | Emits `Load Saved Game` item, hotkey `L` |
| `25a4:32d6` | `0x047a86` | Emits `Begin Adventuring` item, hotkey `B` |
| `25a4:33ef` | `0x047b9f` | Party menu dispatch loop entry |
| `25a4:3515` | `0x047cc5` | Menu selection returned, before jump table |
| `25a4:3664` | `0x047e14` | `Load Saved Game` case |
| `25a4:36d8` | `0x047e88` | Load case sets `[b7a7]=1` |
| `25a4:3702` | `0x047eb2` | `Begin Adventuring` case |

Overlay 3 contains the save-source and slot picker path:

| Canonical | File offset | Meaning |
|---|---:|---|
| `1f4e:50b7` | `0x035fe7` | Load-source / slot-menu flow entry |
| `1f4e:5105` | `0x036035` | QSV path selected: sets `[b7ac]=1`, uses `qsv` |
| `1f4e:5115` | `0x036045` | DKK/PTY path selected: sets `[b7ac]=4`, uses `.pty` |
| `1f4e:52cd` | `0x0361fd` | Slot picker menu after valid slots found |
| `1f4e:535a` | `0x03628a` | Slot `A`-`J` accepted |
| `1f4e:5361` | `0x036291` | Selected slot letter stored into filename |
| `2177:3181` | `0x0362e1` | QSV load call for selected path |
| `2177:2ab4` | `0x035c14` | Selected-QSV loader entry |
| `2177:28f8` | `0x035a58` | QSV state reader entry |
| `2177:29a2` | `0x035b02` | Reads saved `[ca03]` from QSV |
| `1f4e:57ec` | `0x03671c` | `Vault%c.DAT` load/open helper |

Literal evidence:

| Literal | File offset | DGROUP offset | Xref |
|---|---:|---:|---:|
| `Load Saved Game` | `0x06b870` | `0x7e50` | `0x047ad8` |
| `Begin Adventuring` | `0x06b892` | `0x7e72` | `0x047a86` |
| `%c:\\SAVE\\%s` | `0x06991c` | `0x5efc` | includes `0x03318b`, `0x033290`, `0x0355ba` |
| `savgama` | `0x069a33` | `0x6013` | `0x035d9e` |
| `qsv` | `0x069a5e` | `0x603e` | `0x03603e` |
| `Vault%c.DAT` | `0x069a87` | `0x6067` | `0x036734`, `0x036773` |

`TDQK` is not a plain executable literal. The executable-side anchor for the DOSBox "TDQK" route is
currently inferred as the QSV branch at `1f4e:5105`; the DKK route maps to the `.pty` branch at
`1f4e:5115`.

## Trace Instrumentation

`tools/unicorn_dqk_trace.py --watch-dqk-route` now includes all anchors above, in addition to the
older journal and `[ca03]` milestones. Live addresses are canonical segment `+ load_seg`. The current
fixed-memory baseline is `--load-seg 0x1000`; for example `25a4:3664` runs as `35a4:3664`, and
`1f4e:5105` runs as `2f4e:5105`. The QSV state-reader subrange is an important exception to the older
notes: `DQK.EXE:0x035a58` is live at `3177:28f8`, so the canonical watchpoint for the fixed-memory
route is `2177:28f8`, not the older `1f4e:4b28` estimate.

Historical pre-memory-fix verification:

```powershell
python -m py_compile tools\unicorn_dqk_trace.py tools\disasm_dqk.py
python tools\unicorn_dqk_trace.py --smoke-test
python tools\unicorn_dqk_trace.py --run --load-seg 0x2000 --fake-video --fake-keyboard `
  --fake-key-rearm-after 20 --fake-timer --trace-keys `
  --fake-keys esc,wait:2500000,l,t,a,enter,b `
  --max-instr 6000000 --watch-dqk-route --watch-ca03-operands `
  --watch-output build\dqk-ca03-watch-load2000-routecases.csv `
  --hot-spots 20 --hot-output build\dqk-hot-load2000-routecases.csv `
  --log build\dqk-load2000-routecases.log
```

Historical result on 2026-07-13:

- The full scripted key route was consumed by 6M instructions.
- No `party-menu-*`, `load-source-*`, `slot-picker-*`, `qsv-*`, `vault-*`, or `[ca03]` watch fired.
- No route-file marker appeared for `SAVG`, `SAVE`, `VAULT`, `TDQK`, `CHRDAT`, `ROSTER`, or `QSV`.
- The only key evidence is still reads through the generic BIOS keyboard helper at `20d7:005c..007c`.

This is a useful negative result: the problem is no longer whether keys can be queued, but whether the
Unicorn cold-boot route has reached the original start/load/save-slot state at all.

## Active Input Loop Mapping

The next probe mapped the live loop around those consumed keys. `--watch-dqk-route` now also includes
the resident input/title/widget anchors below:

| Canonical | File offset | Meaning |
|---|---:|---|
| `00d7:006e` | `0x0031de` | BIOS keyboard helper read path, `INT 16h` |
| `00d7:0072` | `0x0031e2` | BIOS keyboard helper peek path, `INT 16h` |
| `1102:00a1` | `0x0134c1` | Resident input/idle predicate |
| `1102:00c4` | `0x0134e4` | Resident input flush/settle loop |
| `1102:0439` | `0x013859` | Post-render title/prompt wait loop |
| `1102:0441` | `0x013861` | Post-render prompt key-ready branch |
| `1102:044a` | `0x01386a` | Post-render prompt key-read branch |
| `151e:00e7` | `0x0176c7` | Blocking key-read normalizer |
| `151e:00f8` | `0x0176d8` | Raw key return after `INT 16h` read |
| `264f:0051` | overlay-4 runtime alias, file `0x038411` | Active form calls `1102:00a1` input predicate; live `364f:0051` with current `--load-seg 0x1000` |
| `264f:0079` | overlay-4 runtime alias, file `0x038439` | Active form return after key read; live `364f:0079` with current `--load-seg 0x1000` |
| `1aa6:1703` | `0x01e563` | Widget/menu input poll loop |
| `1aa6:170f` | `0x01e56f` | Widget/menu key read/dispatch |
| `1aa6:1714` | `0x01e574` | Widget/menu key return, `DI=AX` |

Historical pre-memory-fix verification command:

```powershell
python tools\unicorn_dqk_trace.py --run --load-seg 0x2000 --fake-video --fake-keyboard `
  --fake-key-rearm-after 20 --fake-timer --trace-keys `
  --fake-keys esc,wait:2500000,l,t,a,enter,b `
  --max-instr 3000000 --watch-dqk-route --watch-ca03-operands `
  --watch-output build\dqk-ca03-watch-load2000-inputanchors.csv `
  --hot-spots 20 --hot-output build\dqk-hot-load2000-inputanchors.csv `
  --log build\dqk-load2000-inputanchors.log
```

Result on 2026-07-13:

- `resident-input-flush-settle-file-0134e4`, `bios-keyboard-peek-int16-file-0031e2`,
  `blocking-key-read-normalizer-file-0176c7`, `bios-keyboard-read-int16-file-0031de`,
  `blocking-key-read-raw-return-file-0176d8`, `post-render-title-prompt-wait-loop-file-013859`,
  and `resident-input-idle-predicate-file-0134c1` all fire before or around the first `ESC`.
- After the delayed `L`, the active route fires `post-render-title-prompt-key-ready-file-013861` and
  `post-render-title-prompt-key-read-file-01386a`.
- The key stack for `L` is:

```text
KEY int16-read key=0x266c ascii=0x6c ... stack=... 044f 3102 ... 0155 37fa 9e0e
```

This proves `L` is read by the post-render title/prompt loop at `1102:044a`, returning through
`17fa:0155`, not by the party menu `Load Saved Game` case at `25a4:3664`.

- The key stack for `T` is:

```text
KEY int16-read key=0x1474 ascii=0x74 ... stack=... 044f 3102 ... 0221 37fa 9e2f
```

This is the same title/prompt loop shape, returning through `17fa:0221`, again before any load-source,
slot-picker, QSV, vault, party-menu, or `[ca03]` watch fires.

The current bad route is therefore concrete: `L` and `T` are being consumed in the post-render
title/resource prompt flow, not in the party/start menu.

## Gated Input Probe

`tools/unicorn_dqk_trace.py` now accepts `gate:SEG:OFF[:LABEL]` tokens inside `--fake-keys`. A gate
holds later queued keys until execution reaches the canonical address. This is deliberately different
from `wait:N`: it ties input to a recovered code state instead of an instruction-count delay.

The first gated attempt waited for the widget/menu poll itself:

```powershell
python tools\unicorn_dqk_trace.py --run --load-seg 0x2000 --fake-video --fake-keyboard `
  --fake-key-rearm-after 20 --fake-timer --trace-keys `
  --fake-keys esc,gate:0x1aa6:0x1703,l,t,a,enter,b `
  --max-instr 6000000 --watch-dqk-route --watch-ca03-operands `
  --watch-output build\dqk-ca03-watch-load2000-gate-widget.csv `
  --hot-spots 20 --hot-output build\dqk-hot-load2000-gate-widget.csv `
  --log build\dqk-load2000-gate-widget.log
```

Result on 2026-07-13: only `ESC` was consumed. The gate never released because the route remained in
the post-render title/prompt wait path (`1102:0439`) and did not reach `1aa6:1703`.

The next run let the two known post-render/resource prompts consume neutral `SPACE` keys before gating:

```powershell
python tools\unicorn_dqk_trace.py --run --load-seg 0x2000 --fake-video --fake-keyboard `
  --fake-key-rearm-after 20 --fake-timer --trace-keys `
  --fake-keys esc,wait:2500000,space,space,gate:0x1aa6:0x1703,l,t,a,enter,b `
  --max-instr 8000000 --watch-dqk-route --watch-ca03-operands `
  --watch-output build\dqk-ca03-watch-load2000-neutral-gate-widget.csv `
  --hot-spots 20 --hot-output build\dqk-hot-load2000-neutral-gate-widget.csv `
  --log build\dqk-load2000-neutral-gate-widget.log
```

Result: the second `SPACE` advanced the resource path, but `1aa6:1703` still never fired before a later
invalid-instruction stop at `20d7:094a` / `DQK.EXE:0x003aba`. This was not a new party/load proof:
there were still zero `ca03` rows and no QSV/save-route file opens. This is a pre-memory-fix result; the
`20d7:094a` stop is superseded by the root-cause section below.

A broader gate on the resident active input predicate did reach the widget loop:

```powershell
python tools\unicorn_dqk_trace.py --run --load-seg 0x2000 --fake-video --fake-keyboard `
  --fake-key-rearm-after 20 --fake-timer --trace-keys `
  --fake-keys esc,wait:2500000,space,space,gate:0x1102:0x00a1,l,t,a,enter,b `
  --max-instr 8000000 --watch-dqk-route --watch-ca03-operands `
  --watch-output build\dqk-ca03-watch-load2000-neutral-gate-resident.csv `
  --hot-spots 20 --hot-output build\dqk-hot-load2000-neutral-gate-resident.csv `
  --log build\dqk-load2000-neutral-gate-resident.log
```

Result:

- `gate:1102:00a1` released at instruction `5168356`, from the later active loop path called by
  `464f:0051`.
- `L` was then read at instruction `5168430`, before the widget loop, with stack return through
  `464f:0079`.
- `1aa6:1703` finally fired at instruction `5422960`, and `1aa6:170f` fired at `5503033`.
- `T`, `A`, `Enter`, and `B` were all read through the widget-loop stack shape ending in
  `3aa6:1714`.
- The run consumed the whole queue (`10/10`) and reached the 8M instruction cap cleanly.
- It still produced zero `ca03` rows and opened only startup/resource assets
  (`game.FON`, `ADLIB.ADV`, `always.TLB`, `ITEMS.DAT`, `item.dat`, `title.tlb`, `frame.TLB`).

This improves the route diagnosis: the harness can now reach and drive the widget/menu loop, but the
observed widget state is not yet the original party-menu `Load Saved Game` / QSV / slot picker route.
No `25a4:*` party-menu or `1f4e:*` load-source watch fired in the successful resident-gated run.

After adding focused `264f:*` / `1aa6:1714` route watches, the same pre-memory-fix command was re-run
as:

```powershell
python tools\unicorn_dqk_trace.py --run --load-seg 0x2000 --fake-video --fake-keyboard `
  --fake-key-rearm-after 20 --fake-timer --trace-keys `
  --fake-keys esc,wait:2500000,space,space,gate:0x1102:0x00a1,l,t,a,enter,b `
  --max-instr 8000000 --watch-dqk-route --watch-ca03-operands `
  --watch-output build\dqk-ca03-watch-load2000-formctx.csv `
  --hot-spots 20 --hot-output build\dqk-hot-load2000-formctx.csv `
  --log build\dqk-load2000-formctx.log
```

Result:

- `active-form-resident-input-call-overlay8` fired at live `464f:0051`, instruction `5168355`.
- The gate released one instruction later at `1102:00a1`.
- `L` was read at instruction `5168430` and returned through `active-form-key-return-overlay8` at
  live `464f:0079`.
- The widget path then fired `1aa6:1703`, `1aa6:170f`, and `1aa6:1714`; `T`, `A`, `Enter`, and `B`
  share the widget stack shape ending in `3aa6:1714`.
- The CSV still contains only the header row, and the only file opens after boot are
  `game.FON`, `ADLIB.ADV`, `always.TLB`, `ITEMS.DAT`, `item.dat`, `title.tlb`, and `frame.TLB`.

Static disassembly around `DQK.EXE:0x01e563` matches the dynamic widget labels: `1aa6:1703` calls
`1c4c:0053` to poll, `1aa6:170f` calls `1c4c:0059` to read, and `1aa6:1714` stores `AX` into `DI`
before scanning the active widget records at `[dac7]` / `[dac0]`. This confirms the keys are entering
a generic widget dispatcher, not the party/load path by itself.

The tracer now also logs selected DGROUP context and active widget callback records for exec watches.
A shorter callback run:

```powershell
python tools\unicorn_dqk_trace.py --run --load-seg 0x2000 --fake-video --fake-keyboard `
  --fake-key-rearm-after 20 --fake-timer --trace-keys `
  --fake-keys esc,wait:2500000,space,space,gate:0x1102:0x00a1,l,t,a,enter,b `
  --max-instr 5600000 --watch-dqk-route --watch-ca03-operands `
  --watch-output build\dqk-ca03-watch-load2000-widgetcb.csv `
  --hot-spots 20 --hot-output build\dqk-hot-load2000-widgetcb.csv `
  --log build\dqk-load2000-widgetcb.log
```

captured:

```text
pre-memory-fix live: dac0=0x0004 dac7=0x522e:0xdb68
pre-memory-fix live callbacks=[0:3aa6:1183,1:2bdb:008e,2:2bdb:008e,3:2bdb:008e]
current fixed-memory live: dac0=0x0004 dac7=422e:db68
current fixed-memory live callbacks=[0:2aa6:1183,1:1bdb:008e,2:1bdb:008e,3:1bdb:008e]
canonical callbacks=[0:1aa6:1183,1:0bdb:008e,2:0bdb:008e,3:0bdb:008e]
```

Static disassembly of those callback targets does not match the known party/load route:

- `1aa6:1183` (`DQK.EXE:0x01dfe3`) is a generic widget callback wrapper. For event `5`, it computes
  the widget-record index from `[dac7]` and calls the per-record far callback at record `+4`.
- `0bdb:008e` (`DQK.EXE:0x00e23e`) handles widget flags and drawing through `169b:0bd0`.

So the current cold-boot form has four active widget records, but they are not the `25a4:*` party
menu dispatch and still have no QSV/save side effects.

The next run gated directly on the proven party-menu input call instead of the generic widget loop:

```powershell
python tools\unicorn_dqk_trace.py --run --load-seg 0x2000 --fake-video --fake-keyboard `
  --fake-key-rearm-after 20 --fake-timer --trace-keys `
  --fake-keys esc,wait:2500000,space,space,gate:0x25a4:0x33c3:party-menu-input-call,l,t,a,enter,b `
  --max-instr 12000000 --watch-dqk-route --watch-ca03-operands `
  --watch-output build\dqk-ca03-watch-load2000-gate-partyinput.csv `
  --hot-spots 20 --hot-output build\dqk-hot-load2000-gate-partyinput.csv `
  --log build\dqk-load2000-gate-partyinput.log
```

Result: the gate was still waiting at instruction `2648319` for live `45a4:33c3`; only the four
pre-gate inputs were consumed (`ESC`, delay, two `SPACE` prompts), no `25a4:*` party-menu watch fired,
the CA03 CSV contained only the header row, and file opens stayed in startup/title assets
(`DQK.EXE`, `dqk.cfg`, missing `monitor.dat`, `game.FON`, `ADLIB.ADV`, `always.TLB`, `ITEMS.DAT`,
`item.dat`, and repeated `title.tlb`). The run stopped before the instruction cap at the already-seen
invalid instruction `20d7:094a` / `DQK.EXE:0x003aba`. This is a pre-memory-fix result; the section below
resolves that stop as loaded-code overwrite under the old synthetic-DOS memory model.

## 2026-07-13: `20d7:094a` Root Cause and DOS Memory Fix

The `20d7:094a` stop was not an original invalid DQK instruction. The original bytes at
`DQK.EXE:0x003a80..0x003ad0` are normal Borland memory-copy helpers; the live bytes at the stop had
been overwritten by asset data. A `--watch-file-writes 0x2400:0x218d5` diagnostic proved the bad write:
`TITLE.TLB@0x190a0` was read into physical `0x01df41..0x021f41`, overlapping the resident image when
the earlier `--load-seg 0x2000` route was used.

The tracer bug was the synthetic DOS memory model. The PSP did not expose a real top-of-memory word,
and `INT 21h AH=4A` resize was treated like a fresh allocation. `tools/unicorn_dqk_trace.py` now:

- writes `PSP:[0x02] = 0xA000`;
- treats `AH=4A` as a resize of the `ES` block and moves the next free segment to the resized block end;
- keeps `PSP:[0x02]` as the top-of-memory signal rather than rewriting it to the resized PSP block end;
- logs `AH=48/49/4A` calls when `--trace-dos-memory` is enabled;
- supports `--watch-file-drift-after` and logs registers on file-drift detection.

With the fixed memory model, `--load-seg 0x2000` is no longer the right route baseline: DQK reports
`540000 bytes Required` but only `524544 bytes available`. Returning to `--load-seg 0x1000` provides
enough conventional memory and no longer reproduces the `TITLE.TLB`/EXE overwrite. The verification run
`build\dqk-load1000-gate-partyinput-memfix.log` reached the 12M instruction cap without `FILE-DRIFT`
for `0x003a80..0x003ad0`, consumed the four pre-gate inputs, opened repeated `TITLE.TLB` resources, and
reached the generic widget loop again.

The current blocker has therefore moved back to route/input fidelity, not corrupted code. The direct
party-input gate still waited at canonical `25a4:33c3` (`live=35a4:33c3`) with only four of ten fake
keys consumed; the CA03 watch CSV still contains only the header row.

## 2026-07-13: Repeat Watch Route-State Pass

`tools/unicorn_dqk_trace.py` now supports repeated execution watches through `--watch-exec-repeat` and
`--watch-exec-repeat-limit`. This was added to sample the live menu/form state across repeated input
polls instead of removing a watchpoint after its first hit.

The fixed-memory `--load-seg 0x1000` repeat-watch run used:

```powershell
python tools\unicorn_dqk_trace.py --run --load-seg 0x1000 --fake-video --fake-keyboard `
  --fake-key-rearm-after 20 --fake-timer --trace-keys `
  --fake-keys esc,wait:2500000,space,space,gate:0x25a4:0x33c3:party-menu-input-call,l,t,a,enter,b `
  --max-instr 8500000 --watch-ca03-operands `
  --watch-exec 0x25a4:0x33c3:party-input-call `
  --watch-exec 0x25a4:0x3127:party-render `
  --watch-exec 0x264f:0x0079:active-form-key-return `
  --watch-exec 0x1aa6:0x1703:widget-poll `
  --watch-exec 0x1102:0x00a1:resident-input-predicate `
  --watch-exec 0x169b:0x0e68:late-loop-e68 `
  --watch-exec 0x169b:0x0e95:late-loop-e95 `
  --watch-exec 0x169b:0x0ea8:late-loop-ea8 `
  --watch-exec-repeat --watch-exec-repeat-limit 25 `
  --watch-output build\dqk-ca03-watch-load1000-repeat-input.csv `
  --hot-output build\dqk-hot-load1000-repeat-input.csv `
  --log build\dqk-load1000-repeat-input.log
```

Result: the run reached the 8.5M instruction cap without `FILE-DRIFT`, and the CA03 CSV again contained
zero rows. After the gated `SPACE`, `active-form-key-return` fired at live `364f:0079` with
`AX=0x0020`, `a627=0x0007`, and `dac0=0`. Later, the stable loop is still generic form/widget state:
`169b:0ea8` / `169b:0e68` / `169b:0e95` and `1aa6:1703` report `dac0=0x0004`,
`dac7=422e:db68`, callbacks `[0:2aa6:1183,1:1bdb:008e,2:1bdb:008e,3:1bdb:008e]`,
`a627=0x000a`, `ca03=0`, and `c7d8=0`. The proven party-menu watches `25a4:3127` and
`25a4:33c3` still never execute.

So the current evidence rejects both old failure explanations: this is not the `20d7:094a` memory
overwrite, and it is not a lack of keyboard events. The remaining gap is the branch/caller state that
keeps the run in the generic active-form loop instead of transitioning to the party/load form.

## 2026-07-13: Active-Form Branch Trace

`tools/unicorn_dqk_trace.py` now supports `--trace-flow-range SEG:START:END[:LABEL]` plus
`--trace-flow-limit`. This logs only control-flow instructions inside selected canonical ranges, with
registers, stack words, and the same DQK form/widget DGROUP state used by exec watches. The first use
traced the active form (`264f:0040..0090`), resident input (`1102:0080..00d0`), and nearby widget loops
under the fixed-memory `--load-seg 0x1000` route:

```powershell
python tools\unicorn_dqk_trace.py --run --load-seg 0x1000 --fake-video --fake-keyboard `
  --fake-key-rearm-after 20 --fake-timer --trace-keys `
  --fake-keys esc,wait:2500000,space,space,gate:0x25a4:0x33c3:party-menu-input-call,l,t,a,enter,b `
  --max-instr 6200000 --watch-ca03-operands `
  --watch-exec 0x264f:0x0051:active-form-input-call `
  --watch-exec 0x264f:0x0079:active-form-key-return `
  --watch-exec 0x1102:0x00a1:resident-input-predicate `
  --watch-exec-repeat --watch-exec-repeat-limit 8 `
  --trace-flow-range 0x264f:0x0040:0x0090:active-form-return-window `
  --trace-flow-range 0x1102:0x0080:0x00d0:resident-input-window `
  --trace-flow-range 0x169b:0x0e50:0x0ec0:late-widget-loop-window `
  --trace-flow-range 0x1aa6:0x16f0:0x1720:widget-poll-window `
  --trace-flow-limit 20 `
  --watch-output build\dqk-ca03-watch-load1000-flow-activeform.csv `
  --log build\dqk-load1000-flow-activeform.log
```

Result: this is still a negative CA03/party-route run. The CA03 CSV contains only the header row, the
run consumed four of ten fake-key tokens, and the direct party-menu gate remained waiting for
`25a4:33c3` (`live=35a4:33c3`).

The new information is the exact active-form branch after the gated `SPACE`. The key is read at
instruction `5623077`, and `264f:0079` fires at live `364f:0079` with `AX=0x0020`, `a627=0x0007`,
`dac0=0`, `c7d8=0`, and `ca03=0`. `--resolve 0x264f 0x0079` maps this to overlay 4 file
`0x038439`, where the handler stores the key in `[bp-2]`, handles special keys `0x152` and `0x153`,
otherwise normalizes the key/timeout state, calls `1102:00c4`, returns `AL`, and exits. The logged
branch for Space is:

```text
364f:007f  jne 0x36578  AX=0x0020
364f:008d  jne 0x36586  AX=0x0020
```

So the accepted `SPACE` is following the normal active-form key-return path, not a hidden party-menu
dispatch. The form state remains unset for party/load (`dac0=0`, `c7d8=0`, `ca03=0`) at this point.

The caller shell around `264f:03a2..03c3` is now traced too. `--resolve 0x264f 0x03a2` maps it to
overlay 4 file `0x038762`; it calls the active-form helper, stores returned `AL`, tests Escape
(`0x1b`), then tests Space (`0x20`). When Space is returned, it increments a local counter and loops
while the counter is `<= 8`.

The long run `build\dqk-load1000-flow-formshell-long.log` proves that this is exactly what the current
route is doing: `264f:03a5` repeatedly returns `AX=0x0020`, `264f:03b4` accepts it as Space, and
`264f:03bd` advances the local counter from `1` through `9`. At counter `9`, `264f:03c3` executes,
calls `264f:02c9` / file `0x038689`, and returns to startup caller `2d99:0701`. The route then reaches
the already-known generic widget poll at `1aa6:1703` with `dac0=0x0004`, `dac7=422e:db68`, callbacks
`[0:2aa6:1183,1:1bdb:008e,2:1bdb:008e,3:1bdb:008e]`, `a627=0x000a`, `c7d8=0`, and `ca03=0`.

The party-menu canaries `25a4:3127` and `25a4:33c3` still never fire, and
`build\dqk-ca03-watch-load1000-flow-formshell-long.csv` contains only the header row. The remaining
route problem is earlier than the active-form key return and caller shell: the cold-boot path is still
paging through startup/title/resource forms, then installing a generic widget form, not installing or
entering the original party/load form.

## 2026-07-13: DGROUP Form-State Write Trace

`tools/unicorn_dqk_trace.py` now supports `--watch-dgroup-write OFFSET[:LABEL]`, fixed to the
documented DQK DGROUP segment (`0x322e + load_seg`) instead of loose DS/ES/SS aliases. The targeted
run:

```powershell
python tools\unicorn_dqk_trace.py --run --load-seg 0x1000 --fake-video --fake-keyboard `
  --fake-key-rearm-after 20 --fake-timer --trace-keys `
  --fake-keys esc,wait:2500000,space,space,gate:0x25a4:0x33c3:party-menu-input-call,l,t,a,enter,b `
  --max-instr 8300000 --watch-ca03-operands `
  --watch-exec 0x264f:0x03c3:form-shell-after-space-loop `
  --watch-exec 0x1aa6:0x1703:widget-poll `
  --watch-exec 0x25a4:0x3127:party-render `
  --watch-exec 0x25a4:0x33c3:party-input `
  --watch-exec-repeat --watch-exec-repeat-limit 8 `
  --watch-dgroup-write 0xdac0:dac0 `
  --watch-dgroup-write 0xdac7:dac7_off `
  --watch-dgroup-write 0xdac9:dac7_seg `
  --watch-dgroup-write 0xad67:ad67_off `
  --watch-dgroup-write 0xad69:ad67_seg `
  --watch-dgroup-write 0xc7d8:c7d8 `
  --watch-dgroup-write 0xa627:a627 `
  --watch-dgroup-write 0xca03:ca03 `
  --watch-output build\dqk-ca03-watch-load1000-dgroup-formwrites-fixed.csv `
  --log build\dqk-load1000-dgroup-formwrites-fixed.log
```

again produces zero CA03 rows and leaves the party-menu gate waiting. It does, however, pin the generic
widget form installation:

| Live address under `--load-seg 0x1000` | File offset | Write |
| --- | ---: | --- |
| `2aa6:127b` | `0x01e0db` | `dac9 = ES` |
| `2aa6:127f` | `0x01e0df` | `dac7 = BX` |
| `2aa6:1283` | `0x01e0e3` | `dac0 = 0` |
| `2aa6:134c` | `0x01e1ac` | `inc dac0` for each parsed widget |

The observed form writes set `dac7=422e:db68`, then increment `dac0` to `4`. The decoded callbacks
become `[0:2aa6:1183,1:1bdb:008e,2:1bdb:008e,3:1bdb:008e]`, matching the later `1aa6:1703`
generic-widget poll. Static disassembly at `0x01e0d7..0x01e0f3` is the widget-array pointer/count
reset, and `0x01e18e..0x01e37b` is the widget-definition parser. `--lcallers 0x1aa6 0x11eb` finds the
widget-storage setup call at `DQK.EXE:0x037cfa` in overlay-4 startup/form allocation code, but direct
raw scans find no simple `CALL FAR 1aa6:127b`, `1aa6:134c`, or `1aa6:1703`, so the next route question
is the caller/form-definition source that feeds this parser, not the low-level writer itself.

A follow-up canary run added exec watches for the candidate caller chain supplied by a parallel
read-only inspection:

```powershell
python tools\unicorn_dqk_trace.py --run --load-seg 0x1000 --fake-video --fake-keyboard `
  --fake-key-rearm-after 20 --fake-timer --trace-keys `
  --fake-keys esc,wait:2500000,space,space,gate:0x25a4:0x33c3:party-menu-input-call,l,t,a,enter,b `
  --max-instr 8300000 --watch-ca03-operands `
  --watch-exec 0x1aa6:0x11eb:widget-storage-alloc `
  --watch-exec 0x1aa6:0x1277:widget-publish-buffer `
  --watch-exec 0x1aa6:0x1294:widget-variadic-installer `
  --watch-exec 0x1aa6:0x134c:widget-count-inc `
  --watch-exec 0x25a4:0x08ca:overlay-form-heap-setup-candidate `
  --watch-exec 0x25a4:0x1e98:four-widget-form-installer-candidate `
  --watch-exec 0x25a4:0x2639:ad67-context-writer-candidate `
  --watch-exec 0x25a4:0x264f:form-caller-selection-candidate `
  --watch-exec 0x25a4:0x3127:party-render `
  --watch-exec 0x25a4:0x33c3:party-input `
  --watch-exec-repeat --watch-exec-repeat-limit 12 `
  --watch-dgroup-write 0xdac0:dac0 `
  --watch-dgroup-write 0xdac7:dac7_off `
  --watch-dgroup-write 0xdac9:dac7_seg `
  --watch-dgroup-write 0xad67:ad67_off `
  --watch-dgroup-write 0xad69:ad67_seg `
  --watch-dgroup-write 0xc7d8:c7d8 `
  --watch-dgroup-write 0xa627:a627 `
  --watch-dgroup-write 0xca03:ca03 `
  --watch-output build\dqk-ca03-watch-load1000-formcaller.csv `
  --log build\dqk-load1000-formcaller.log
```

The positive hits are the `1aa6` generic widget chain only:

- `1aa6:11eb` / `DQK.EXE:0x01e04b` fires once at instruction `32711`, called by live
  `35de:004a` from file `0x037cfa`, allocating `0x28 * 0x20` bytes of widget/form storage.
- `1aa6:1277` / `DQK.EXE:0x01e0d7` fires at instruction `7926521`, called from live
  `1bdb:0dcf` after `1bdb:0dc2 -> 1bdb:0e37`.
- `1aa6:1294` / `DQK.EXE:0x01e0f4` fires four times at instructions
  `7966373`, `7966632`, `7966954`, and `7967276`.
- `1aa6:134c` / `DQK.EXE:0x01e1ac` fires on each of those installer calls and advances
  `dac0` from `0` to `4`.

No watched `25a4:*` candidate fires in this route, including `25a4:1e98`, `25a4:2639`,
`25a4:264f`, `25a4:3127`, and `25a4:33c3`. The nearest concrete form-definition callers in the
generic route are resident:

- `1bdb:09cc` / `DQK.EXE:0x00eb7c` pushes callback `cs:064f` or `cs:06c6`, pushes widget type `7`,
  then calls `1aa6:1294`.
- `1bdb:08b5` / `DQK.EXE:0x00ea65` calls `1aa6:1294` from a loop that parses text/list entries and
  computes per-entry geometry.

This further narrows the failure: the fixed-memory Unicorn route is not merely entering a generic
poll; it builds that generic form through resident `1bdb:*` form-definition code. The static
`25a4:2639/264f -> 25a4:1e98` chain remains a useful candidate for the party/load form path, but it is
not reached by the current cold-boot/input script.

Address convention for the fixed-memory run: watch arguments and the anchors above are canonical. Under
current `--load-seg 0x1000`, canonical `1aa6:*` widget-parser code appears live as `2aa6:*`, and
canonical `0bdb:*` resident form-definition code appears live as `1bdb:*`. The current route builds the
generic resident form through canonical `0bdb:09cc` / `0bdb:08b5` and the `1aa6:1277` /
`1aa6:1294` / `1aa6:134c` widget installer/parser chain, not through the `25a4:*` party/load path.

## 2026-07-13: Resident Form-Mode Discriminator Trace

The next fixed-memory run expanded the exec-watch state dump with resident form discriminator fields:
`1d0c`, `1d0e`, `1d10`, `1d12`, `1d13`, `a6b0`, `a6b5`, `a70c`, `a711`, `ad6c`, `ae26`,
`ae57`, `ae42`, `ae43`, `b20c..b20e`, `c2ef`, `c3f4`, `c5d0/c5ce/c5d2`, `c6e5:c6e7`,
and `bd30/bd32`. The targeted command was:

```powershell
python tools\unicorn_dqk_trace.py --run --load-seg 0x1000 --fake-video --fake-keyboard `
  --fake-key-rearm-after 20 --fake-timer --trace-keys `
  --fake-keys esc,wait:2500000,space,space,gate:0x25a4:0x33c3:party-menu-input-call,l,t,a,enter,b `
  --max-instr 8050000 --watch-ca03-operands `
  --watch-exec 0x1aa6:0x11eb:widget-storage-alloc `
  --watch-exec 0x1aa6:0x1277:widget-publish-buffer `
  --watch-exec 0x1aa6:0x1294:widget-variadic-installer `
  --watch-exec 0x1aa6:0x134c:widget-count-inc `
  --watch-exec 0x0bdb:0x0801:resident-list-widget-loop `
  --watch-exec 0x0bdb:0x08ef:resident-string-form-wrapper `
  --watch-exec 0x0bdb:0x09cc:resident-header-widget `
  --watch-exec 0x0bdb:0x1008:resident-generic-form-input-loop `
  --watch-exec 0x25a4:0x1e98:four-widget-form-installer-candidate `
  --watch-exec 0x25a4:0x2639:ad67-context-writer-candidate `
  --watch-exec 0x25a4:0x264f:form-caller-selection-candidate `
  --watch-exec-repeat --watch-exec-repeat-limit 12 `
  --trace-flow-range 0x0bdb:0x0800:0x0ecf:resident-form-builders `
  --trace-flow-range 0x0bdb:0x1008:0x11f0:resident-form-input-loop `
  --trace-flow-limit 16 `
  --watch-dgroup-write 0x1d0c:form_mode_1d0c `
  --watch-dgroup-write 0x1d0e:form_flag_1d0e `
  --watch-dgroup-write 0x1d10:form_flag_1d10 `
  --watch-dgroup-write 0x1d12:form_flag_1d12 `
  --watch-dgroup-write 0x1d13:form_flag_1d13 `
  --watch-dgroup-write 0xa6b0:a6b0 `
  --watch-dgroup-write 0xa6b5:a6b5 `
  --watch-dgroup-write 0xad6c:ad6c_count `
  --watch-dgroup-write 0xbd30:bd30 `
  --watch-dgroup-write 0xbd32:bd32 `
  --watch-dgroup-write 0xdac0:dac0 `
  --watch-dgroup-write 0xdac7:dac7_off `
  --watch-dgroup-write 0xdac9:dac7_seg `
  --watch-dgroup-write 0xca03:ca03 `
  --watch-output build\dqk-ca03-watch-load1000-1bdb-formmode.csv `
  --log build\dqk-load1000-1bdb-formmode.log
```

Result: the CA03 CSV again contains only the header row, the party-menu gate remains waiting for
canonical `25a4:33c3`, and the run reaches the instruction cap at `8050000`. There are no route-file
markers and no `25a4:*` party/load hits.

The useful positive evidence is the form discriminator state around the resident form:

- `1aa6:11eb` fires early with `form=1d0c:0x0002`, `1d13=1`, `a6b5=0`.
- `1bdb:0d1f` / `DQK.EXE:0x00eecf` sets `a6b5=1`, and `1bdb:0d22` / `0x00eed2` keeps
  `1d13=1`.
- `1aa6:1277` / `DQK.EXE:0x01e0d7` publishes `dac7=422e:db68` while the active form still reports
  `1d0c=2`, `a6b5=1`, `ae57=4`, `ae42=ae43=ff`, `c5ce=1b58`, and `c5d2=1`.
- `1bdb:09cc` / `DQK.EXE:0x00eb7c` is the first concrete resident header-widget builder in this
  route and calls `1aa6:1294`.
- `1bdb:0801` / `DQK.EXE:0x00e9b1` then enters the resident list/text loop, after `dac0` has reached
  `1`.
- Four `1aa6:1294` / `1aa6:134c` pairs still advance `dac0` to `4`, with callbacks
  `[0:2aa6:1183,1:1bdb:008e,2:1bdb:008e,3:1bdb:008e]`.
- `1bdb:1008` / `DQK.EXE:0x00f1b8` enters the resident generic form input loop with
  `1d0c=2`, `1d13=0`, `a6b5=1`, `dac0=4`, `dac7=422e:db68`, `a627=0x000a`, `c7d8=0`,
  and `ca03=0`.

Follow-up early-state tracing showed that `1d0c=2` is not introduced by a late CPU write in this
route. `tools/unicorn_dqk_trace.py` now routes DOS `INT 21h/AH=3F` buffer writes through the same
DGROUP watch path, and `build\dqk-load1000-early-1d0c-readwatch.log` captures the first source:

```text
DGROUP-WRITE #1 source=int21/3f-read:DQK.EXE@0x63a20
  form_mode_1d0c@dgroup:1d0c ... value=file-bytes:form_mode_1d0c=02 00 ...
```

That read occurs at instruction `680` from writer `2d99:036c` / file `0x0200fc`, loading
`DQK.EXE` file `0x63a20..0x6dc80` into `422e:0000`. The watched field lands at file
`0x6572c` (`0x63a20 + 0x1d0c`) and the surrounding bytes are resident UI/form text data:
`%s`, `%c`, `Press      to continue.`, `Return`. The later startup zero-fill at
`1000:00b7` / file `0x0024b7` starts at `DGROUP:a260`, so it does not clear `1d0c` or `1d13`.

A static pass then found the resident mode setters:

- `0bdb:141e` / file `0x00f5ce`: generic form-mode setter, `mov [1d0c], [bp+6]`.
- `0bdb:1410` / file `0x00f5c0`: `0bdb:1206` wrapper fallback that writes `mov [1d0c], 2`.
- `0bdb:0521` / file `0x00e6d1`: builds the generic form, pushes mode `2`, calls `0bdb:141e`,
  then calls `0bdb:1206`.
- `0bdb:1a1b` / file `0x00fbcb`: another resident mode-`2` caller, with mode writes at
  `0x00fc05` and fallback `0x00fc4c`.
- `0bdb:1f25` / file `0x0100d5`: direct resident generic-input candidate that calls
  `0bdb:0d26`, `1aa6:1277`, and then `0bdb:1008`.

The focused runtime run `build\dqk-load1000-mode2-callers.log` watched those candidates. Result:
`0bdb:0521`, `0bdb:141e`, `0bdb:1410`, `0bdb:1a1b`, and `0bdb:1f25` did not execute in the current
party-gated Unicorn route. Only `0bdb:0dcf` hit at instruction `7926520`, then `0bdb:1206` at
`8020243`, then `0bdb:1008` at `8020250`. So this route is preserving the file-loaded mode `2`; it
is not selecting mode `2` through the known resident setters.

`build\dqk-load1000-1206-callsite.log` then watched the exact near-call sites to `0bdb:1206`. The
only call-site hit was `0bdb:1e87` / file `0x010037` at instruction `8020242`, immediately followed
by `0bdb:1206` and `0bdb:1008`. The surrounding function starts at `0bdb:1e29` / file `0x00ffd9`.
Its first branch calls `0bdb:0521` at file `0x00fffd` when the `0x00d7:2543` compare succeeds;
the current route takes the other branch, calls `0bdb:0d26` through `0bdb:eed6`, then calls
`0bdb:1206` at `0x010037`. That is the concrete fork to explain next.

`build\dqk-load1000-branch-1e29.log` then traced that fork directly. The same fixed-memory
party-input-gated route reaches `0bdb:1e29` at instruction `7923081`, calls the `00d7:2543`
compare/helper, and arrives at `0bdb:1e45` with `AX=0`. The `or ax, ax` / `je` at
`0bdb:1e45..1e47` therefore takes the zero-result branch to `0bdb:1e5c` / file `0x01000c`,
bypassing the `0bdb:0521` call at file `0x00fffd`. The observed path is:

```text
0bdb:1e29 -> 00d7:2543 returns AX=0000
0bdb:1e45 or ax, ax
0bdb:1e47 je 0bdb:1e5c
0bdb:1e73 call 0bdb:0d26/eed6 setup
0bdb:0dcf publishes the generic widget buffer
0bdb:1e87 call 0bdb:1206
0bdb:1008 resident generic form input loop
```

The branch trace also preserves the earlier negative route evidence: no `25a4:*` party/load
watch fires, no `DQK CA03 WATCH` row is logged, and the run stops at the `8050000` instruction cap.

The helper is now statically identified too. `00d7:2543` / file `0x0056b3` calls
`00d7:24de` / file `0x00564e`, a NUL-terminated far-string compare with ASCII case-folding.
`24de` returns `AX=0` for equal strings and a signed-ish lexical result for mismatch; `2543`
inverts that into boolean equality (`AX=1` when equal, `AX=0` when not equal). Therefore the
current `AX=0` result means the string passed in `[bp+0xa]/[bp+0xc]` does not equal the canonical
prompt pointer at `DGROUP:3aee/3af0`.

`DGROUP:3aee/3af0` is a far pointer, not two independent globals. In the loaded DGROUP block it maps
to file `0x06750e`, decodes to canonical `322e:425f`, and targets file `0x067c7f`, the string
`Press button or enter to continue`. The neighboring pointer `DGROUP:3af2/3af4` resolves to
`322e:4281` and the tilde-prefixed variant `~Press button or enter to continue`. Static caller support
at `DQK.EXE:0x04ae08..0x04ae18` pushes `[3af0]/[3aee]` as an argument into `0bdb:1e29`.

The remaining source question is no longer what `00d7:2543` does. It is which prompt/options string is
being passed into `[bp+0xa]/[bp+0xc]` in the bad Unicorn route, why it differs from the canonical
continue prompt, and whether the original party/load route reaches this helper with different prompt
data or bypasses this resident generic-form path altogether.

`build\dqk-load1000-form-gate-streq.log` adds that missing live string. `tools/unicorn_dqk_trace.py`
now dumps far-string arguments for `0bdb:1e29`, `0bdb:1e3d`, and `00d7:2543` exec watches. The useful
hit is at `0bdb:1e3d` / file `0x00ffed`, just before the string-equality call:

```text
streq_args=left:422e:4ed4 'Play Demo Quit'
            right:422e:425f 'Press button or enter to continue'
```

This proves the current bad route is still at the title/demo/quit option form when it reaches
`0bdb:1e29`; the string mismatch is correct, and the `0bdb:0521` continue-prompt special path should
not fire for this form. The run again reaches the `8050000` instruction cap with only four of ten fake
keys consumed, no `25a4:*` party/load execution, and no CA03 watch rows.

Static support from the same pass:

- `0bdb:0d1d` / file `0x00eecd` is the compact setter that sets `[a6b5]=1` and `[1d13]=1`.
- `0bdb:0e2a` copies `[1d13]` into `[a6b5]` and clears `[1d13]` before the generic input loop.
- `0bdb:1008` is a generic input/update loop keyed by `[1d0c]`; mode `2` is one of its special cases.
- `25a4:3127 -> 25a4:33c3 -> 25a4:3664` remains the expected party/render/input/load path, but none of
  those addresses execute in this route.

This closes one more false lead: the route discriminator is not simply "which widget loop did we reach."
The current cold-boot path has specifically selected a resident mode-`2` generic form, with the
resident `1bdb` builder/input loop active, instead of the overlay-7 party/load form-builder path.

## 2026-07-13 Title/Form Route Resolution

`build\dqk-load1000-title-P-gated.log` resolves the previous title/options blocker. The title form is
case-sensitive in the current route: lowercase fake-key `p` (`AX=0x1970`) was not enough, while raw BIOS
word `0x1950` selects `Play`. The same run proves the route leaves the resident title/options form and
enters the overlay-7 party/load path:

```text
0bdb:1e3d compares left:422e:4ed4 'Play Demo Quit'
                with right:422e:425f 'Press button or enter to continue'
0bdb:1416 returns AX=0000 for Play
25a4:33ef party-menu-dispatch-loop-entry
25a4:3127 party-menu-render-entry
25a4:33c3 party-menu-input-call
25a4:3664 party-menu-load-saved-game-case
```

The next blocker in that run was not form routing. It was unmodeled DOS file enumeration:
`INT 21h/AH=4E` on `SAVE\*.*` failed, so DQK displayed the `Tdqk Dkk Exit` / `Ok Exit` path instead of
opening a save.

After adding minimal `FindFirst`/`FindNext` support to the Unicorn harness,
`build\dqk-load1000-title-P-findfirst.log` continues through the save search:

```text
INT21/4E findfirst b'SAVE\\*.*' -> SAVGAMA.QSV
INT21/4F findnext -> VAULTA.DAT
INT21/4F findnext -> no more files
INT21/3D open b'SAVE\\SavGamA.qsv' -> handle 25
```

The same route then opens `DISK3\ECL.glb`, `DISK3\GEO.glb`, and later `DISK2\8x8dc.tlb`,
`DISK2\8x8db.tlb`, `DISK2\back.tlb`, and `DISK2\PICB.tlb`. It reaches the automated CA03 setter watch
at canonical `25a4:1d47` three times:

```text
instr 17664427 op1=0xba op2=0x03 old-ca03=0x0004 stream=5b6e:8000 b7f9=0x8277
instr 17934408 op1=0xba op2=0x07 old-ca03=0x0004 stream=5b6e:8000 b7f9=0x8295
instr 18463728 op1=0xba op2=0x07 old-ca03=0x0004 stream=5b6e:8000 b7f9=0x82d0
```

Those rows are logged on the write instruction before it executes, so `old-ca03` is the pre-write value.
They are nevertheless the first positive automated proof that the route reaches the live CA03 setter
from a title/menu/load-save path.

## Next Work

The title/options and save-enumeration blockers are resolved for the Unicorn route. Do not spend the
next pass on `Play Demo Quit` unless it regresses. The captured CA03 rows have since been reconciled:
the later route selects `PALACE` from the Palanthas menu, but it does **not** reach ECL `COMBAT` at
stream offset `0x8439`. The corrected DQK Gen2 decode treats `0x1d` as zero-operand on that route, and
the byte `0x24` at `0x8439` is the inline `PRINTCLEAR` string length; see
`docs/engine/research/dqk-palanthas-palace-combat-route.md` and
`docs/engine/research/dqk-ca03-runtime-probe.md`. The remaining live-route gap is to find or drive a
real top-level Gen2 `COMBAT` handoff, then trace it into `DungCom1` / `WildCom1` terrain setup
consumers and the 7x7 render path. Positive shipped-script proof still exists separately in
`packages/engine/test/dqkEvents.test.ts` for area 66 subroutine `0x8398`, but that subroutine is not
proved reachable from area 66 `vmRun1`/`SearchLocation`.
