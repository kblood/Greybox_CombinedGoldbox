# DQK `ca03` Runtime Operand Probe

This note records the current automated probe for the DQK runtime values behind the
`0x0420ac` combat terrain/context setter. It complements
`dqk-2033-accessor-patterns.md` and `dqk-combat-context-ca03.md`: those notes pin the static
operand parser/accessor and `[ca03]` dataflow; this note tracks the live-value capture path.

## Probe Tool

`tools/unicorn_dqk_trace.py` now has a focused watch mode:

```powershell
python tools/unicorn_dqk_trace.py --run --fake-video --fake-keyboard `
  --fake-keys enter,space,c `
  --max-instr 1000000 `
  --watch-ca03-operands `
  --watch-output build\dqk-ca03-watch.csv `
  --hot-spots 25 `
  --hot-output build\dqk-ca03-hot.csv `
  --log build\dqk-ca03-watch.log
```

The mode watches the canonical DQK addresses already documented for the `0x0420ac` setter and
`DungCom1` / `WildCom1` forwarding path. With the default Unicorn `--load-seg 0x1000`, each
canonical segment is watched at `canonical + 0x1000`:

| Watch | Canonical | Default Unicorn Live Address | Meaning |
|---|---:|---:|---|
| `operands-ready` | `25a4:1d03` | `35a4:1d03` | Both locals valid: `[bp-2]=operand1`, `[bp-1]=operand2` |
| `ca03-compare` | `25a4:1d2b` | `35a4:1d2b` | Compare pending operand 2 against `[ca03]` |
| `ca03-write` | `25a4:1d47` | `35a4:1d47` | Write widened operand 2 into `[ca03]` |
| `dungcom-consume` | `28d0:0f25` | `38d0:0f25` | `DungCom1` setup consumes `[ca03]` |
| `wildcom-consume` | `28d0:0f3e` | `38d0:0f3e` | `WildCom1` setup consumes `[ca03]` |

When a watchpoint is reached, the tool logs a human-readable `DQK CA03 WATCH` line and writes a CSV
row with:

- instruction count and live `CS:IP`;
- `AX`, `DS`, `SS`, `BP`;
- local bytes `SS:BP-2` and `SS:BP-1`;
- `[ca03]`, `[b7f9]`, and stream pointer `[ae5c:ae5e]`;
- parsed operand arrays `[b215..b217]`, `[b185..b187]`, and `[ae6a..ae6c]`.

This makes the runtime capture step reproducible once an organic DQK route reaches the combat setter.

## Synthetic Input Route

`--fake-keyboard` now supports queued BIOS key input with `--fake-keys`. The sequence accepts
comma-separated key names or raw BIOS `AX` words:

```powershell
python tools\unicorn_dqk_trace.py --run --fake-video --fake-keyboard `
  --fake-keys enter,space,c `
  --max-instr 200000 `
  --log build\dqk-fake-keys-smoke.log
```

Equivalent raw input is also accepted, for example `--fake-keys 0x1c0d,0x3920,0x2e63`.
After the sequence is consumed, `--fake-key` remains the repeating fallback, preserving the old default
`Enter` behavior. The key model still deliberately goes empty after each consumed key and only re-arms
after empty peeks, because DQK has real keyboard-buffer flush loops that hang if a fake key is always
ready.

The route sequence recovered from the DOSBox smoke flow is:

```text
ESC or SPACE to leave intro/title, L = Load Saved Game, T = TDQK, A + Enter = first slot,
B = Begin Adventuring
```

In tracer form this is currently driven as `--fake-keys esc,l,t,a,enter,b` or
`--fake-keys space,l,t,a,enter,b`.

Verification on 2026-07-13:

```powershell
python -m py_compile tools\unicorn_dqk_trace.py
python tools\unicorn_dqk_trace.py --smoke-test
python tools\unicorn_dqk_trace.py --run --fake-video --fake-keyboard --fake-keys enter,space,c `
  --max-instr 200000 --log build\dqk-fake-keys-smoke.log
python tools\unicorn_dqk_trace.py --run --fake-video --fake-keyboard `
  --fake-keys 0x1c0d,0x3920,0x2e63 `
  --max-instr 200000 --log build\dqk-fake-keys-hex-smoke.log
```

Both short DQK runs completed to the instruction cap with real overlay-12 reads and INT16h activity.
This proves the queued-input mechanism is usable, but it is not yet proof that a natural input sequence
has reached the `[ca03]` combat-context setter.

## Route Watches and Timer Stub

The tracer now has additional route instrumentation:

- `--watch-dqk-route` watches the known overlay-3 journal call site (`1f4e:0be1` /
  `DQK.EXE:0x031b11`), the overlay-4 journal prompt entry (`26f8:008b` /
  `DQK.EXE:0x038edb`), and the `ca03` operand-ready/write anchors.
- `--watch-exec SEG:OFF[:LABEL]` adds focused canonical execution watches.
- `--watch-file-writes START:END` reports writes that overlap loaded EXE file-offset ranges, including
  `INT 21h/3F` file reads into buffers that collide with the loaded image.
- `--fake-timer` advances DQK's timer globals at `DS:cda6/cda8` whenever the timer getter
  `151e:00c6` is called. This models the missing asynchronous BIOS timer interrupt enough to pass the
  observed delay loop at `DQK.EXE:0x0135ec`.
- `--trace-keys` logs synthetic BIOS key peeks, re-arms, and reads with `CS:IP`, instruction count,
  queue index, and ASCII value.
- `--fake-key-rearm-after N` controls how many empty key peeks must happen before the next queued key
  is exposed; this keeps keyboard-flush loops honest while making menu-driving tunable.
- `--fake-key-min-instr-gap N` and `wait:N` tokens inside `--fake-keys` can delay later route keys by
  instruction count. Example: `--fake-keys esc,wait:2500000,l,t,a,enter,b`.
- `INT 21h/AH=06` direct console I/O is now modeled: `DL=FFh` behaves as a non-blocking input poll
  using the same fake-key queue, and other `DL` values are treated as console output.
- Save/roster/area-like `INT 21h/AH=3D` opens now emit `ROUTE-FILE` markers, so route-progress checks
  do not depend on manually scanning all file-open lines.

Two 2026-07-13 harness findings matter for interpreting older runs. These are historical
pre-memory-fix observations; the later memory-model update below supersedes the load-segment conclusion:

- Pre-fix `--load-seg 0x1000` diagnostics showed DQK reading `FRAME.TLB` over resident EXE bytes. The
  later fix showed this was caused by incorrect PSP top-of-memory / `AH=4A` resize modeling, not by
  `0x1000` being inherently too low.
- Re-running with `--load-seg 0x2000` avoided that pre-fix collision, but it is no longer recommended:
  with the fixed memory model, `--load-seg 0x1000` is the route baseline and `0x2000` is memory-starved
  for DQK.

The next historical pre-memory-fix gate was then the timer wait loop. A 10M-instruction
`--load-seg 0x2000` route run without
`--fake-timer` stopped at:

```text
3102:01cc file 0x0135ec  lcall 0x351e,0x00c6
351e:00c6 file 0x0176a6  mov dx, word ptr [0xcda8]
351e:00ca file 0x0176aa  mov ax, word ptr [0xcda6]
```

The caller stores an initial tick value, calls the getter repeatedly, and waits until the current
`cda8:cda6` value advances by five ticks. With `--fake-timer`, that narrow loop is no longer the hot
spot: a 10M-instruction run logged fake ticks through `tick=2000` and reached the cap at
`32b7:2638` / `DQK.EXE:0x0175a8`, inside a word-compare/copy helper. It still produced zero
route-watch and `ca03` rows, so the current gap is route/control-flow fidelity after startup and save
selection, not VGA retrace, keyboard buffering, load-segment collision, or the timer wait itself.

Historical pre-memory-fix input-timing probes on 2026-07-13:

```powershell
python tools\unicorn_dqk_trace.py --run --load-seg 0x2000 --fake-video --fake-keyboard `
  --fake-key-rearm-after 20 --fake-timer --trace-keys `
  --fake-keys esc,l,t,a,enter,b `
  --max-instr 3000000 --watch-dqk-route --watch-ca03-operands `
  --watch-output build\dqk-ca03-watch-load2000-rearm20.csv `
  --log build\dqk-load2000-rearm20.log
python tools\unicorn_dqk_trace.py --run --load-seg 0x2000 --fake-video --fake-keyboard `
  --fake-key-rearm-after 20 --fake-timer --trace-keys `
  --fake-keys esc,wait:2500000,l,t,a,enter,b `
  --max-instr 6000000 --watch-dqk-route --watch-ca03-operands `
  --watch-output build\dqk-ca03-watch-load2000-wait-after-esc.csv `
  --log build\dqk-load2000-wait-after-esc.log
```

Results:

- The plain `rearm20` route consumed `ESC`, `L`, `T`, and `A` by 3M instructions, proving the queued
  input code can feed multiple keys. It still opened only startup/title/frame assets, not save files.
- The `wait-after-esc` route consumed the whole scripted sequence by 6M instructions. It also still
  opened only `game.FON`, `ADLIB.ADV`, `always.TLB`, `ITEMS.DAT`, `item.dat`, `title.tlb`, and
  `frame.TLB`; grepping for `SAVG`, `SAVE`, `VAULT`, `TDQK`, `CHRDAT`, `ROSTER`, and `QSV` found no
  route-file evidence.
- Both timing variants wrote zero `ca03` rows and no route-watch hits.

This converts the route question from "are fake keys being consumed?" to "which original menu/dialog
state should receive them?" The current harness is reaching a generic BIOS keyboard polling loop at
`20d7:005c..007c`, but the consumed keys do not yet correspond to a proven load-save/begin-adventure
state.

## Start/Load Route Anchors

The first focused answer to that question is now split out in
`docs/engine/research/dqk-start-load-route-anchors.md`.

That note pins the early route anchors for the visible party/start menu, the `Load Saved Game` case,
the QSV/slot picker path, the selected-QSV loader, the saved `[ca03]` reader, `Vault%c.DAT`, and
`Begin Adventuring`. `--watch-dqk-route` now includes those anchors.

Historical pre-memory-fix verification on 2026-07-13 still produced a negative runtime result:

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

The full key sequence was consumed, but no party-menu, load-source, slot-picker, QSV, vault, route-file,
or `[ca03]` watch fired. The follow-up input-anchor probe has now mapped the live loop: `L` and `T` are
being consumed by `1102:044a` / `DQK.EXE:0x01386a`, the post-render title/prompt key-read branch, with
returns through `17fa:0155` and `17fa:0221`. They are not reaching the party menu `Load Saved Game`
case (`25a4:3664`) or the QSV/slot path.

That made the next route task narrower: watch the `17fa` post-render/resource return sites and the
`1aa6:1703` / `1aa6:170f` widget/menu input loop, then expose `L` only after the real menu dispatcher
has fired. Later fixed-memory repeat-watch and branch-trace runs supersede this as the current next
step, but the result remains useful chronology for why fixed input delays alone were rejected.

Follow-up gated probes on 2026-07-13 refined that again:

- `gate:0x1aa6:0x1703` immediately after `ESC` deadlocked in the post-render title/prompt loop. Only
  `ESC` was consumed, and `1aa6:1703` never fired.
- `esc,wait:2500000,space,space,gate:0x1aa6:0x1703,...` let two neutral prompt/resource gates advance,
  but still never released the widget gate before the run stopped at `20d7:094a` /
  `DQK.EXE:0x003aba`. That stop was later resolved by the 2026-07-13 memory-model fix and is not
  current evidence of party-route divergence.
- `esc,wait:2500000,space,space,gate:0x1102:0x00a1,l,t,a,enter,b` released at the later resident
  active-input predicate (`3102:00a1`) and then reached both widget watches:
  `1aa6:1703` at instruction `5422960` and `1aa6:170f` at `5503033`.
- In that resident-gated run, all queued route keys were consumed. `L` was read from the `464f`
  active loop before the widget watch; `T`, `A`, `Enter`, and `B` were read through the `3aa6:1714`
  widget stack shape.
- The run still opened no `SAVG`/`SAVE`/`VAULT`/`TDQK`/`CHRDAT`/`ROSTER`/`QSV` files, hit none of the
  `25a4:*` party-menu or `1f4e:*` load-source watches, and wrote zero `ca03` rows.

So the current Unicorn route is past the earlier title/resource prompt problem and can enter a
widget/menu loop, but it is not yet proven to be the start party menu. This pre-memory-fix discriminator
used live `464f` / `1aa6` addresses; fixed-memory runs use live `364f` / `2aa6` for the same canonical
form/widget code.

The form-context discriminator now has one concrete result. A follow-up run added DGROUP logging to
the exec-watch lines and captured the active widget table when `1aa6:1703` / `1aa6:170f` / `1aa6:1714`
fired:

```text
pre-memory-fix live: dac0=0x0004 dac7=0x522e:0xdb68
pre-memory-fix live callbacks=[0:3aa6:1183,1:2bdb:008e,2:2bdb:008e,3:2bdb:008e]
current fixed-memory live: dac0=0x0004 dac7=422e:db68
current fixed-memory live callbacks=[0:2aa6:1183,1:1bdb:008e,2:1bdb:008e,3:1bdb:008e]
canonical callbacks=[0:1aa6:1183,1:0bdb:008e,2:0bdb:008e,3:0bdb:008e]
```

Static disassembly identifies those callbacks as generic widget infrastructure, not the party/load
case: `1aa6:1183` (`DQK.EXE:0x01dfe3`) is a widget callback wrapper that dispatches per-record
callbacks from record `+4`, and `0bdb:008e` (`DQK.EXE:0x00e23e`) handles widget flags/drawing through
`169b:0bd0`. The callback run still opened no QSV/save/roster/vault files and wrote zero `ca03` rows.
This makes the current `1aa6` route a negative proof: it is a generic four-widget form, not sufficient
evidence of the start party menu or `Load Saved Game` path.

The direct follow-up gate on the proven party-menu input call also stayed negative:
`esc,wait:2500000,space,space,gate:0x25a4:0x33c3:party-menu-input-call,l,t,a,enter,b` reached
`KEY gate-wait` for live `45a4:33c3` at instruction `2648319`, consumed only the four pre-gate inputs,
and stopped later at `20d7:094a` / `DQK.EXE:0x003aba` without any party-menu, load-source, route-file,
or `ca03` watch hits. The opened files remained startup/title assets only, ending in repeated
`title.tlb` opens. The `20d7:094a` stop is now known to be a pre-memory-fix loaded-code overwrite, not a
current DQK route blocker.

## DOSBox-X Debugger Route

The fastest route to true original-runtime values is still a real DOSBox-X debugger session, not the
current Unicorn cold-boot path. The in-repo launcher skeleton is:

```powershell
pwsh tools\dosbox_x_debugbox_probe.ps1 `
  -DbxExe "C:\LLM\DOS\cc\dosbox-x\dosbox-x_XPx64_SDL2.exe" `
  -CheckMountOnly
```

If that confirms `MOUNT` works in the external DOSBox-X build, launch:

```powershell
pwsh tools\dosbox_x_debugbox_probe.ps1 `
  -DbxExe "C:\LLM\DOS\cc\dosbox-x\dosbox-x_XPx64_SDL2.exe" `
  -GameDir "C:\Modding\GoldBox\The Dark Queen of Krynn" `
  -Exe "DQK.EXE" `
  -OutDir C:\scratch\dqk-dbx
```

Then compute `delta = live_entry_CS - 0x1d99` and set the same breakpoints:

```text
BP (0x25a4 + delta) 0x1d03
BP (0x25a4 + delta) 0x1d47
BP (0x28d0 + delta) 0x0f25
BP (0x28d0 + delta) 0x0f3e
```

The debugger route is blocked only by tooling/automation, not by address uncertainty:

- `tools\dosbox_x_debugbox_probe.ps1` can launch `DEBUGBOX DQK.EXE`, but does not yet type debugger
  commands or scrape register/memory output.
- `docs/engine/research/dgroup-dynamic-trace.md` records the current negative: the known external
  DOSBox-X debug build previously had a broken `MOUNT` command, and DOSBox-X's debugger has no shipped
  command-file automation.
- The plausible automation follow-up is still Win32 `WriteConsoleInput` into the debugger console.

## Current Run Result

Verification commands run after adding the probe:

```powershell
python -m py_compile tools\unicorn_dqk_trace.py
python tools\unicorn_dqk_trace.py --smoke-test
python tools\unicorn_dqk_trace.py --run --fake-video --fake-keyboard `
  --max-instr 1000000 `
  --watch-ca03-operands `
  --watch-output build\dqk-ca03-watch-1m.csv `
  --hot-spots 25 `
  --hot-output build\dqk-ca03-hot.csv `
  --log build\dqk-ca03-watch-1m.log
```

Results:

- Python compile passed.
- Unicorn smoke test passed.
- Queued fake-key input was verified with short real-DQK runs using both named keys
  (`--fake-keys enter,space,c`) and raw BIOS `AX` words (`--fake-keys 0x1c0d,0x3920,0x2e63`).
- The organic run boots real `DQK.EXE`, loads overlay/DGROUP data, and produces the expected
  overlay-12 file-range reads.
- The base tracer now models VGA port `0x3da` retrace polling under `--fake-video`, plus ignores VGA
  palette/sequencer output ports `0x3c4`, `0x3c5`, `0x3c8`, and `0x3c9`. This lets the run pass the
  previous palette wait at `DQK.EXE:0x05285..0x05288`.
- It did not reach any `ca03` operand watchpoint before the instruction cap:
  `build\dqk-ca03-watch-1m.csv` contained only the header row.
- The 1M instruction run now stops at the instruction cap at `27fa:0ff9`, physical `0x028f99`,
  base-image file `DQK.EXE:0x01b399`, executing `lcall 0x10d7,0x2b2c`. The surrounding log still shows
  HLIB/resource-runtime activity, not a `ca03` capture.
- Hot-spot output (`build\dqk-ca03-hot.csv`) does not show a narrow hardware wait loop. The top rows are
  generic memory fill/copy work:
  - `DQK.EXE:0x003a7f` / `10d7:090f`: `rep movsw`, count `23606`.
  - `DQK.EXE:0x003a2c` / `10d7:08bc`: `rep stosw`, count `16002`.
  - `DQK.EXE:0x005928` / `10d7:27b8`: `rep stosb`, count `15764`.
  - The hottest routine entry is `DQK.EXE:0x003a32` / `10d7:08c2`, a far memory-copy helper.
- A follow-up 1M-instruction run with queued input:

  ```powershell
  python tools\unicorn_dqk_trace.py --run --fake-video --fake-keyboard --fake-keys enter,space,c `
    --max-instr 1000000 `
    --watch-ca03-operands `
    --watch-output build\dqk-ca03-watch-fakekeys.csv `
    --hot-spots 25 `
    --hot-output build\dqk-ca03-hot-fakekeys.csv `
    --log build\dqk-ca03-watch-fakekeys.log
  ```

  also wrote zero `ca03` rows. The top hot spots were the same generic memory copy/fill helpers, so
  queued input is now available but this particular sequence is not a proven encounter-launch route.
- A fixed-memory `--load-seg 0x1000` party-input-gated run now supersedes the older `0x2000`
  route-shaped probe: it reaches the cap without file drift in the previously corrupted range, but still
  writes zero `ca03` rows and does not organically reach a saved-game/adventure/combat route.

This is a useful negative with a narrower blocker than before: the dump machinery is in place and the
old VGA retrace stall, low-load image collision, and timer wait are resolved, but the current
synthetic-DOS path is still spending its budget in startup/resource/runtime helpers rather than
organically driving the game to the `0x0420ac` combat setter.

## Interpretation

The runtime value gap is narrower than before:

- Static evidence proves operand `2` feeds `[ca03]`.
- Static evidence proves operand `1` is stored at current combatant `+0x13` and passed to the
  `1D99:13B9` `back1` / `8x8d%c%d` / `GEO1` loader path.
- The new probe can capture the actual operand values, parsed operand types, stream pointer, and
  downstream forwarding values if real execution reaches the setter.

What is still missing is the organic route into that setter under real `DQK.EXE`. The native
`native\gbdqk-combat-flow-test.ps1 -Headless` route proves the clean-room GBBOOT area-5 dragon
combat/resume path, but it does not execute DQK's original `0x0420ac` handler and therefore cannot
prove the real operand values by itself.

## 2026-07-13 Memory-Model Update

The previous `20d7:094a` stop is now resolved as a harness memory-layout failure, not a DQK code path.
`TITLE.TLB` had been loaded over resident EXE bytes because the synthetic DOS model lacked a useful
`PSP:[2]` top-of-memory word and treated `INT 21h AH=4A` resize as allocation. The tracer now models
`AH=4A` as resize, keeps a DOS-like `PSP:[2]=0xA000`, and can log `AH=48/49/4A` with
`--trace-dos-memory`.

The route baseline should now be `--load-seg 0x1000`, not the earlier `0x2000` workaround. At
`--load-seg 0x2000`, DQK's own memory check prints `540000 bytes Required` and `524544 bytes
available`; at `--load-seg 0x1000`, the same party-input-gated run reaches 12M instructions without
`FILE-DRIFT` in the previously corrupted `0x003a80..0x003ad0` range.

This is still a negative CA03 result: `build\dqk-ca03-watch-load1000-gate-partyinput-memfix.csv`
contains only the header row. The fixed run consumed the four pre-gate inputs and reached
`25a4:33c3` as a gate-wait target, but did not yet release into the party/load route.

A follow-up repeat-watch run added state sampling at the active form and widget loops. It also produced
zero CA03 rows. The gated `SPACE` returns through live `364f:0079`, then later loop samples stabilize at
generic widget state (`dac0=0x0004`, `dac7=422e:db68`,
`[0:2aa6:1183,1:1bdb:008e,2:1bdb:008e,3:1bdb:008e]`, `a627=0x000a`, `c7d8=0`,
`ca03=0`). The party-menu anchors `25a4:3127` / `25a4:33c3` still do not execute, so this remains a
route/form-state problem before the combat setter, not a CA03 operand parsing result.

The branch-trace follow-up confirms that `364f:0079` itself is not hiding the missing party dispatch.
`--trace-flow-range 0x264f:0x0040:0x0090` maps the accepted gated `SPACE` (`AX=0x0020`) through
overlay 4 file `0x038439`: special-key checks for `0x152` / `0x153` are skipped, the normal key path
calls `1102:00c4`, and the active form returns with `dac0=0`, `c7d8=0`, and `ca03=0`. The party-menu
gate still waits for `25a4:33c3`, and `build\dqk-ca03-watch-load1000-flow-activeform.csv` contains
only the header row.

The caller-shell trace then maps `264f:03a2..03c3` at overlay 4 file `0x038762`: returned `AL=0x20`
is treated as Space, a local counter advances through `9`, `264f:03c3` returns to startup caller
`2d99:0701`, and only later does the route reach the generic widget poll with `dac0=0x0004`,
`dac7=422e:db68`, and the same generic callbacks. The party-menu gate still waits for `25a4:33c3`,
and `build\dqk-ca03-watch-load1000-flow-formshell-long.csv` also contains only the header row.

The form-state write trace now identifies the generic form installer that produces that state.
`--watch-dgroup-write` watches fixed DQK DGROUP offsets, using canonical DGROUP `0x322e + load_seg`.
The run `build\dqk-load1000-dgroup-formwrites-fixed.log` shows:

- `1aa6:1277` / `DQK.EXE:0x01e0d7` publishes the active widget buffer.
- `1aa6:127b` / `0x01e0db` writes `dac9 = ES`.
- `1aa6:127f` / `0x01e0df` writes `dac7 = BX`.
- `1aa6:1283` / `0x01e0e3` clears `dac0`.
- `1aa6:134c` / `0x01e1ac` increments `dac0` for each parsed widget record.

The follow-up canary run `build\dqk-load1000-formcaller.log` hits only the generic `1aa6` chain:
`1aa6:11eb` allocates widget storage once, `1aa6:1277` publishes `dac7=422e:db68`, and
`1aa6:1294` / `1aa6:134c` run four times from resident `1bdb` callers. Static file offsets for the
observed generic form-definition callers are `DQK.EXE:0x00eb7c` (`1bdb:09cc`, callback `cs:064f` or
`cs:06c6`, widget type `7`) and `DQK.EXE:0x00ea65` (`1bdb:08b5`, list/text widget loop). The likely
party/load candidates from the static scan, including `25a4:1e98`, `25a4:2639`, `25a4:264f`,
`25a4:3127`, and `25a4:33c3`, do not fire in this Unicorn route.

A later form-discriminator run, `build\dqk-load1000-1bdb-formmode.log`, keeps the same negative CA03
result while making the wrong route more concrete. The command added `--trace-flow-range` over
`0bdb:0800..0ecf` and `0bdb:1008..11f0`, plus DGROUP writes for `1d0c`, `1d0e`, `1d10`, `1d12`,
`1d13`, `a6b0`, `a6b5`, `ad6c`, `bd30/bd32`, and the existing widget/CA03 fields. It reached the
8.05M instruction cap, left `build\dqk-ca03-watch-load1000-1bdb-formmode.csv` as a header-only file,
and still left the direct `25a4:33c3` party-input gate waiting.

Address convention: those watch addresses are canonical. Under current `--load-seg 0x1000`, canonical
`1aa6:*` widget-parser code appears live as `2aa6:*`, and canonical `0bdb:*` resident form-definition
code appears live as `1bdb:*`. The active route is therefore canonical `0bdb:09cc` / `0bdb:08b5` plus
`1aa6:1277` / `1aa6:1294` / `1aa6:134c`, not the `25a4:*` party/load form-builder path.

The stable form state at the resident `1bdb:1008` generic input loop is now:

```text
1d0c=0002 1d0e=00 1d10=00 1d12=00 1d13=00
a6b5=01 ae57=0004 ae42=ff ae43=ff c5ce=1b58 c5d2=01
dac0=0004 dac7=422e:db68
widgets=[0:2aa6:1183,1:1bdb:008e,2:1bdb:008e,3:1bdb:008e]
a627=000a c7d8=0000 ca03=0000
```

This means the current Unicorn route is not merely "a generic widget loop"; it is specifically the
resident mode-`2` generic form path. `1bdb:0d1f` / `DQK.EXE:0x00eecf` sets `a6b5=1`,
`1bdb:09cc` / `0x00eb7c` installs the header widget, `1bdb:0801` / `0x00e9b1` enters the list/text
builder, and `1bdb:1008` / `0x00f1b8` handles input. None of that is the original
`25a4:*` party/load route that can lead to the `0x0420ac` CA03 setter.

The source of `1d0c=2` is now narrowed further. After extending `--watch-dgroup-write` so DOS
`INT 21h/AH=3F` reads are logged as DGROUP writes, `build\dqk-load1000-early-1d0c-readwatch.log`
shows `2d99:036c` / file `0x0200fc` reading `DQK.EXE@0x63a20..0x6dc80` into `422e:0000`; the
`DGROUP:1d0c` bytes come from file `0x6572c` and are `02 00`. Nearby bytes are resident UI/form
strings including `Press      to continue.` and `Return`. So this is file-loaded initial
form/resource state, not a late runtime setter.

A focused follow-up, `build\dqk-load1000-mode2-callers.log`, watched the static resident mode setters
and callers (`0bdb:0521`, `0bdb:141e`, `0bdb:1410`, `0bdb:1a1b`, `0bdb:1f25`). None of those executed
in the current route. The hits were `0bdb:0dcf` / file `0x00ef7f` at instruction `7926520`,
`0bdb:1206` / file `0x00f3b6` at `8020243`, and `0bdb:1008` / file `0x00f1b8` at `8020250`.
`build\dqk-ca03-watch-load1000-mode2-callers.csv` has zero CA03 rows. So the current route preserves
the initial mode `2` into the input wrapper; it does not actively choose mode `2` through the known
setter path.

`build\dqk-load1000-1206-callsite.log` narrowed the wrapper caller: the only resident near-call site
to `0bdb:1206` that executes is `0bdb:1e87` / file `0x010037`, at instruction `8020242`. The enclosing
function at `0bdb:1e29` / file `0x00ffd9` has a fork: one branch calls `0bdb:0521` at file
`0x00fffd`, while the branch hit here calls the `0bdb:0d26` setup path through `0bdb:eed6` and then
enters `0bdb:1206`.

The follow-up branch trace `build\dqk-load1000-branch-1e29.log` resolves that fork's immediate
condition. At `0bdb:1e29`, the function pushes `DGROUP:3aee/3af0` plus stack arguments and calls
`00d7:2543`. The helper returns with `AX=0`, so the `or ax, ax` at `0bdb:1e45` sets ZF and the
`je` at `0bdb:1e47` jumps to `0bdb:1e5c` / file `0x01000c`. That path then calls the
`0bdb:0d26` setup helper at `0bdb:1e73`, publishes the resident widget buffer through `0bdb:0dcf`,
and eventually reaches `0bdb:1e87 -> 0bdb:1206 -> 0bdb:1008`.

Static disassembly now identifies `00d7:2543` as a case-insensitive string-equality wrapper. It calls
`00d7:24de` / file `0x00564e`, which compares two NUL-terminated far strings with ASCII case-folding
and returns `AX=0` for equal strings. `00d7:2543` / file `0x0056b3` inverts that into boolean
equality: `AX=1` for equal, `AX=0` for mismatch. The `DGROUP:3aee/3af0` argument is the canonical
far pointer `322e:425f`, targeting `DQK.EXE:0x067c7f` / `Press button or enter to continue`;
`DGROUP:3af2/3af4` points at the tilde-prefixed variant.

This run still contains no `DQK CA03 WATCH` rows and never reaches the `25a4:*` party/load anchors.
The branch condition is therefore known to be a string mismatch in the current route. The open
runtime-value problem has moved one step earlier: dump the live string passed in `[bp+0xa]/[bp+0xc]`
when Unicorn reaches `0bdb:1e29`, and determine why it differs from the canonical continue prompt or
whether the true party/load route avoids this resident prompt gate.

`build\dqk-load1000-form-gate-streq.log` performs that dump after extending exec-watch logging for
far string arguments. The decisive hit is the `0bdb:1e3d` watch immediately before the equality call:
the left argument is `422e:4ed4` / `Play Demo Quit`, and the right argument is `422e:425f` /
`Press button or enter to continue`. So the current route is not failing a valid continue-prompt gate;
it is still in the title/demo/quit options form. The `AX=0` result and `0bdb:1e5c` branch are correct
for that form, and the same run still logs no CA03 rows or `25a4:*` party/load execution.

## 2026-07-13 Positive Runtime Capture

`build\dqk-load1000-title-P-findfirst.log` and
`build\dqk-ca03-watch-load1000-title-P-findfirst.csv` are the first positive automated CA03 runtime
captures from a boot/title/load-save route. Two route fixes made the capture possible:

- The title `Play Demo Quit` form needs uppercase/raw BIOS `0x1950` for `Play`; lowercase `p`
  (`0x1970`) is not accepted by that form path.
- The harness now models DOS `INT 21h/AH=4E` and `AH=4F` enough for `SAVE\*.*`, so DQK can enumerate
  `SAVGAMA.QSV` and `VAULTA.DAT`, then open `SAVE\SavGamA.qsv`.

The route reaches `DISK3\ECL.glb`, `DISK3\GEO.glb`, `DISK2\8x8dc.tlb`, `DISK2\8x8db.tlb`,
`DISK2\back.tlb`, and `DISK2\PICB.tlb`, then hits canonical `25a4:1d47` three times:

```text
instr,op1,op2,old-ca03,b7f9,stream
17664427,0xba,0x03,0x0004,0x8277,5b6e:8000
17934408,0xba,0x07,0x0004,0x8295,5b6e:8000
18463728,0xba,0x07,0x0004,0x82d0,5b6e:8000
```

The watch fires at the setter instruction before it executes, so the logged `ca03=0x0004` is the
pre-write value. The captured `op2` values are the immediate candidates that the instruction will widen
into `[ca03]` when they differ from the current value and are not the `0xff` no-update sentinel.

This proves the automated route can now reach the live setter, but it does not yet prove the later
`DungCom1` / `WildCom1` consumer or native combat map setup.

Follow-up consumer trace:

- `build\dqk-load1000-consumers.log`
- `build\dqk-ca03-watch-load1000-consumers.csv`

That run extended the same route to a 40M instruction cap and added watches at canonical
`28d0:0f14`, `28d0:0f25`, `28d0:0f2e`, `28d0:0f3e`, `28d0:0f47`, `28d0:0f6d`,
`28d0:0f73`, and `2740:172c`. It still produced only the three `25a4:1d47` setter rows and no
`DungCom1` / `WildCom1` consumer hits. The current route therefore proves save-load-to-setter, not
setter-to-combat-terrain consumption.

The tracer now also records raw stream windows for each CA03 row:

- `stream_phys` / `stream_at`: linear `seg*16 + off + b7f9`. For these rows this points at code-like
  bytes and is probably not the useful ECL stream view.
- `stream_wrap_phys` / `stream_wrap_at`: real-mode wrapped `seg:((off+b7f9)&ffff)`. For these rows it
  points at ECL-like opcode/operand bytes.

`build\dqk-ca03-watch-load1000-streambytes-wrap.csv` captures the useful wrapped windows:

```text
b7f9=0x8277 wrap=0x05b957 bytes=09 00 00 01 39 00 11 80 15 64 f5 60 0c f3 94 24 ...
b7f9=0x8295 wrap=0x05b975 bytes=1d 09 00 01 01 97 00 0e 00 96 09 00 00 01 39 00 ...
b7f9=0x82d0 wrap=0x05b9b0 bytes=2b 01 bf 00 00 07 80 05 40 13 01 0c 50 80 05 50 ...
```

These windows support treating the captured rows as script/runtime-stream rows, but they still do not
provide a confident gameplay/editor label. Direct `ECL.GLB` file offsets `0x8277/0x8295/0x82d0` fall
inside member 5, but those file bytes do not match the runtime wrapped bytes; the runtime stream has
already been relocated, unpacked, or otherwise staged by the engine.

`tools/dqk_ca03_stream_decode.py` makes that stream decode reproducible:

```powershell
python tools\dqk_ca03_stream_decode.py build\dqk-ca03-watch-load1000-streambytes-wrap.csv --max-instructions 5
```

Current decoded context:

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

This is strong evidence that the current loaded route is in a city/menu script context around Palanthas,
not the combat terrain consumer path. The `op1/op2` values are still parser outputs on the native
setter stack; the adjacent ECL context gives provenance, not a direct "next bytes are operands" mapping.

Static QSV-reader correction: the fixed-memory Unicorn route maps the selected-QSV reader to canonical
`2177:*` (`DQK.EXE:0x035a58` live as `3177:28f8`), not the older `1f4e:*` estimate. The reader shape is
now byte-checked:

- `DQK.EXE:0x035a58` reads `0x400` bytes from `SAVGAMA.QSV` into `[b20f:b211]+1`; this covers flat QSV
  offsets `0..1023`, including `@18 CurrentModule`, `@36/@37` header position, and the party/init
  fields.
- It then reads `5` bytes into `DS:c9f0` (`@1024..@1028`), `2` into `DS:ae67` (`@1029..@1030`), `2`
  into `DS:ae57` (`@1031..@1032`), `2` into `DS:ca03` (`@1033..@1034`), and `2` into `DS:ca05`
  (`@1035..@1036`).

`tools/unicorn_dqk_trace.py --watch-dqk-route` now logs those QSV-backed fields at the corrected
`2177:*` route anchors.

Journal-gate follow-up:

- `build\dqk-load1000-journal-gate.log`
- `build\dqk-ca03-watch-load1000-journal-gate.csv`
- `build\dqk-load1000-journal-state.log`
- `build\dqk-load1000-journal-autoanswer.log`
- `build\dqk-ca03-watch-load1000-journal-autoanswer.csv`

This run proves the post-load route can reach the party Begin Adventuring path and the real journal
prompt draw routine:

```text
party-menu-begin-adventuring-case-file-047eb2 canonical=25a4:3702 ... instr=13437101
journal-prompt-draw-entry-file-038edb canonical=26f8:008b ... instr=13897005
```

The same run wrote zero CA03 rows because the queued key sequence gated the next key on
`1f4e:0be1:journal-call`, which did not fire on this organic route before the prompt draw. The useful
gate for the next run is `26f8:008b:journal-draw`. After that, the tracer needs either live prompt
state dumping plus a solved answer, or a deliberate journal bypass, before the route can be expected to
continue toward `DungCom1` / `WildCom1` and the combat terrain consumers.

`tools/unicorn_dqk_trace.py` now logs the live prompt table state for canonical `26f8:*` watches. The
prompt table is `DGROUP:6dd2`, stride `0x14`: heading pointer at `+0`, page number at `+4`, three word
numbers at `+5..+7`, and three expected-answer pointers at `+8/+0c/+10`. The raw table strings are
obfuscated-looking until copied by the routine's helper, so the reliable decoded fields are the staged
expected answer at `DS:c6f9`, typed answer at `DS:c723`, and decoded heading at `SS:BP-0x2a` after
`26f8:027f`.

The deterministic loaded route currently selects page/row index `0x0b`, entry `0x02`: journal page
`0x0b`, word `0x05`, decoded heading `"RUNNING AWAY"`, and expected answer `"FROM"`. The new
`journal-answer` fake-key token reads `DS:c6f9` at runtime and expands it to keyboard input plus Enter.
`build\dqk-load1000-journal-autoanswer.log` proves the expansion and compare:

```text
journal-expected-answer-staged-file-038f7f ... staged:422e:c6f9 'FROM'
KEY journal-answer-expand chars=4
journal-answer-compare-call-file-039112 ... staged:422e:c6f9 'FROM' typed:422e:c723 'FROM' decoded_heading:422e:ffa0 'RUNNING AWAY'
```

The auto-answer route reaches the same three city/Palanthas CA03 rows as the manual `FROM` trace. It
does not hit `DUNGCOM.TLB`, `WILDCOM.TLB`, `28d0:0f25`, `28d0:0f3e`, `2740:0846`, or `2740:172c`
before the current caps. A later Palace route, corrected below, proves navigation can now select the
Palanthas `PALACE` branch; it does not prove script-level `COMBAT`.

## Palanthas Palace Route Correction

The next deterministic route uses the decoded Palanthas menu and selects `PALACE`. Earlier notes
misdecoded this as a script-level `COMBAT` route. The focused correction is in
`docs/engine/research/dqk-palanthas-palace-combat-route.md`.

The working fake-key sequence is the same loaded-save/journal path, followed by three Return prompts
before the Palanthas menu gate:

```text
...,gate:0x26f8:0x012f:journal-answer-staged,journal-answer,enter,enter,enter,gate-b7f9:0x82d0:palanthas-menu,0x1950
```

Two details matter for reproducing the route:

- `gate-b7f9` now reads `B7F9` from canonical DQK DGROUP (`self.dgroup_seg`), because current `DS` can
  be transient when the hook checks the stream offset.
- `gate-b7f9` blocks later fake keys until the target offset is reached. Intervening prompt keys must
  appear before the gate or the route stalls before the Palanthas menu.

`build\dqk-ca03-watch-load1000-palanthas-palace3.csv` contains six CA03 setter rows. The older decode
of row `b7f9=0x83ae` used Gen1's one-operand `PARTYSTRENGTH` framing and incorrectly produced:

```text
83b5: PRINTCLEAR "'AH, MY CHAMPIONS, I AM HONORED BY YOUR PRESENCE..."
8436: PARTYSTRENGTH c12:128
8439: COMBAT
```

The corrected DQK Gen2 frame treats `0x1d` as zero-operand:

```text
8436: PARTYSTRENGTH
8437: PRINTCLEAR "'ONCE AGAIN, OUR BELOVED KRYNN NEEDS YOUR AID.' "
```

The byte `0x24` at `0x8439` is the `PRINTCLEAR` string length, not an opcode. The same run watched
`28d0:0f25`, `28d0:0f3e`, `2740:0846`, and `2740:172c`, and none fired before the 36M instruction cap,
which is now expected for this non-combat route.

## `[bedb]+9` Combat-Map Dump Hook

`tools/unicorn_dqk_trace.py` now has a focused dump hook for the original DQK combat background-id
surface:

```powershell
python tools\unicorn_dqk_trace.py --run --load-seg 0x1000 --fake-video --fake-keyboard `
  --fake-timer --watch-ca03-operands `
  --dump-dqk-combat-map build\dqk-bedb9-50x25-original `
  --log build\dqk-bedb9-50x25-original.log
```

The option watches the known setup/render anchors:

- `28d0:0e70` setup dispatcher (`DQK.EXE:0x02cb60`)
- `28d0:06a7` dungeon fill (`0x02c397`)
- `28d0:0e3b` wilderness fill (`0x02cb2b`)
- `28d0:0000` cell writer (`0x02bcf0`)
- `28d0:006a` cell writer store (`0x02bd5a`)
- `28d0:006e` cell writer return/early-return target (`0x02bd5e`)
- `28d0:09e7` wilderness variant walker (`0x02c6d7`)
- `28d0:0f25` / `28d0:0f3e` `DungCom1` / `WildCom1` consumers
- `2740:0846` / `2740:172c` 7x7 viewport/cell renderers

On each anchor hit it first validates the live bytes against the expected `DQK.EXE` file offset for
that anchor. This is required because DQK reuses overlay memory: an earlier staged area-5 trace hit
physical `0x038d00` as live `389c:0340`, but byte validation showed party-menu code
(`50 b8 14 00 50 b8 12 00`) where the real `0x02bcf0` cell writer should begin
(`55 8b ec 83 ec 02 a0 5e`). Validated anchor hits then read the far pointer stored at DGROUP
`[0xbedb]:[0xbedd]`, and write exactly `0x04e2` bytes from `ptr_seg:(ptr_off+9)` as
`<prefix>-NNN-<label>.bin`. That matches the original setup/render code shape: `[bedb]` is the
combat-map structure pointer, and the row-major `50x25` background-id payload starts nine bytes into
that structure with stride `0x32`.

CPU writes that overlap the current `[bedb]+9` surface are only dumped after one of those
byte-validated anchors has armed the surface. This prevents generic memory copies through stale or
non-combat `[bedb]` pointers from becoming false combat-map artefacts.

The sidecar `<prefix>.csv` records hit label, instruction count, live/canonical state, pointer
segment/offset, physical surface address, `[b20f]+0x22`, map-origin words at structure `+2/+4`,
`[b7f9]`, `[ca03]`, checksum, nonzero count, unique id count, byte histogram, optional write offset,
and, for the cell writer, stack arguments plus computed `x/y` bounds state.

Validation of the hook itself:

```powershell
python -m py_compile tools\unicorn_dqk_trace.py
python tools\unicorn_dqk_trace.py --smoke-test
python tools\unicorn_dqk_trace.py --run --fake-video --fake-keyboard --max-instr 2000 `
  --dump-dqk-combat-map build\dqk-bedb9-smoke --log build\dqk-bedb9-smoke.log
```

The short smoke reaches no combat-map anchors and correctly writes `0` CSV rows. A nonzero dump must
therefore come from a route that actually reaches the original DQK setup/render anchors above.

A staged area-5 loaded-save run now confirms the alias guard is necessary:

```powershell
python tools\unicorn_dqk_trace.py --run --exe build\dqk-area5-save-trace\DQK.EXE `
  --load-seg 0x1000 --fake-video --fake-keyboard --fake-key-rearm-after 20 --fake-timer `
  --fake-keys "esc,wait:2500000,space,space,gate:0x0bdb:0x1e3d:title-form-streq,0x1950,gate:0x25a4:0x33c3:party-menu-input-call,l,t,a,enter,b" `
  --max-instr 13000000 --dump-dqk-combat-map build\dqk-bedb9-area5-validated `
  --log build\dqk-area5-validated.log
```

That run consumes the staged save route and logs three `DQK-COMBAT-MAP alias-skip` rows for the old
physical `28d0:0000` watch, but writes `0` CSV rows. Therefore the earlier zero-filled
`cell-writer-entry-file-02bcf0` dumps were overlay alias false positives, not evidence that area 5 has
reached DQK's original combat-map writer.

The tracer also has a direct opcode watch for the next DQK handoff search:

```powershell
--watch-ecl-opcode 0x24 --watch-ecl-opcode-limit 20
```

This logs writes of opcode byte `0x24` to canonical DGROUP `[0xb1c7]`, including the current
`[ae5c:ae5e]+[b7f9]` stream window. It is stricter than scanning raw stream bytes, because inline data
such as the disproven Palanthas `PRINTCLEAR` length byte `0x24` never becomes a `[b1c7]` opcode write.
A 15M-instruction Palanthas/Palace regression with this option produced no `ECL-OPCODE` rows and zero
accepted combat-map dumps; it only reproduced the expected `alias-skip` rows for the old physical
`28d0:0000` watch.

For staged DQK routes, `--fake-keys` also supports canonical DGROUP pokes:

```powershell
--fake-keys "...,gate-b7f9:0x91cf:area5-combat,poke-dgroup8:0xb1c7:0x24:force-current-opcode,poke-dgroup16:0xb7f9:0x91cf:force-stream-offset,..."
```

The poke tokens execute only after earlier waits/gates release, write through the same canonical
`dgroup_seg` used by the watches, and log `KEY poke-dgroup` rows with `--trace-keys`. Use them to
stage known original cursor globals after a route has reached the right mode; do not count the poke
itself as an original-game proof. The acceptance bar remains an organic or deliberately staged route
that then reaches a real opcode dispatch and byte-validated setup/render anchors.

Important correction: the native `MEM[0023]`, `MEM[0111]`, `MEM[0112]`, `MEM[00ca]`,
`MEM[00cb]`, and `MEM[00cc]` values used by GBBOOT/CCECL are CCECL logical sparse-memory keys, not
original `DQK.EXE` DGROUP offsets. `native/src/ccecl.asm` stores VM memory in `mem_keys` /
`mem_vals`, `native/src/gbboot.asm` seeds those rows with `/0 addr value`, and `native/README.md`
describes them as sparse debug host-state inputs. Do not use `poke-dgroup*` on those offsets in an
original DQK Unicorn trace unless the run is explicitly labelled as synthetic corruption. Watch
canonical original globals such as `[b1c7]`, `[b7f9]`, `[ae5c:ae5e]`, `[bedb:bedd]`, and `[ca03]`
instead.

### 2026-07-13 area-5 accessor-watch regression

A follow-up original-`DQK.EXE` area-5 trace added execution-watch detail for the current stream
operand helpers:

- `2033:0112` now logs the far-call operand index from `SS:SP+4` plus the parsed operand-array bytes
  from canonical DGROUP tables `B215`, `B185`, and `AE6A`.
- `1D99:11CF` now logs its far-call `value` / `kind` arguments from `SS:SP+4` and `SS:SP+6` plus
  nearby derived-lookup state.

The 15M-instruction run consumed all staged keys and produced one `[ca03]` watch row at
`35a4:1d47` with `op1=0xba`, `op2=0x07`, old `ca03=0xfef0`, `b7f9=0x82d0`, and wrapped stream bytes
starting `2b 01 bf 00 00 07 ...`. It hit `2033:0112` eighteen times and `1D99:11CF` seven times, but
it produced:

- zero `ECL-OPCODE opcode=0x24` rows;
- zero hits on `2033:0e7f`, `2033:081b`, `28d0:0e70`, `28d0:0f25`, `28d0:0f3e`, `2740:0846`, or
  `2740:172c`;
- three expected `DQK-COMBAT-MAP alias-skip` rows for stale overlay aliases;
- zero accepted combat-map CSV rows.

The accessor detail is useful, but the route is still in early/menu script state around
`b7f9=0x82d0`, not the native area-5 `0x91cf` combat handoff. This run is another negative guard for
original combat setup: it proves the watch instrumentation works, not that original DQK has reached
tactical map population.

### 2026-07-13 area-5 route91cf stop-trace regression

The follow-up long stop trace reused the staged area-5 fixture with `--stop-on-ecl-opcode`,
`--stop-on-dqk-combat-map-hit`, `[b7f9]` write filtering around `0x91c0..0x91e0`, and byte-validated
combat-map dumping:

```text
log:        build\dqk-area5-route91cf-stop.log
ca03 csv:   build\dqk-ca03-watch-area5-route91cf-stop.csv
map csv:    build\dqk-bedb9-area5-route91cf-stop.csv
```

The run reached the real loaded-save path (`SAVE\*.*`, `SAVE\SavGamA.qsv`) and solved the journal
prompt (`RUNNING AWAY`, word 5, typed answer `FROM`). It then waited for
`gate-b7f9:0x91cf:area5-combat`, but the live state was still the Palanthas/menu stream:
`b7f9=0x82fe`, `b1c7=0x2b`, `cur=0x25`, `ca03=0xfef0`, `a627=0x0096`.

Result:

- the emulator reached the `60000000` instruction cap instead of either stop condition;
- the CA03 CSV contains only one row, at `b7f9=0x82d0`, decoding to the seven-item
  `PALACE` / `TEMPLE` / `HALL` / `SHOP` / `INN` / `BAR` / `LEAVE` menu context;
- there are zero `ECL-OPCODE opcode=0x24` rows;
- `build\dqk-bedb9-area5-route91cf-stop.csv` is header-only, so no accepted byte-validated combat-map
  snapshot was captured.

This supersedes the 15M accessor-watch regression as the strongest area-5 original-runtime negative:
the tracer can reach save load and journal answer, but the generated/staged loaded-save state still
does not transfer original `DQK.EXE` into the native area-5 `0x91cf` combat stream. The next CA03-side
work should therefore trace the target area/ECL stream selector after save load, or find a natural
original-runtime route into area 5, before spending more time on the existing `gate-b7f9:0x91cf`
loaded-save fixture.

Follow-up save-transfer probe: `build\dqk-area5-record-transfer-16m.log` reran the same staged area-5
loaded-save path with `--watch-current-record-write` on current-record offsets `+0x13`, `+0x24`,
`+0x25`, and `+0x26`. The INT 21h `SAVGAMA.QSV` read writes `rec+13=0x05`, `rec+24=0x00`,
`rec+25=0x00`, and `rec+26=0x00` into the active `[b20f:b211]` record. The QSV state reader then
shows `hdr@18=0x05`, `@21=0x04`, `@31=0x06`, `@33=0x01`, `@36=0x00`, `@37=0x00`,
`res@1024..1028=0x07,0x0d,0x00,0x00,0x00`, `ae67=0x0004`, and `ae57=0x0002`; the post-load gate
preserves `rec+13=0x05` with active pose-like globals `c9f0=0x07`, `c9f1=0x0d`, `c9f2=0x00`.

That same run also fixes a stale negative in the route watches: `25a4:3756` can be overlay-7
`DQK.EXE:0x047f06`, not only overlay-6 `DQK.EXE:0x043b26`, because runtime segment `25a4` is reused.
The accepted `pose-step-or-resident-mode-loop-file-043b26-or-047f06` hit occurs with `ae57=0x0004`
and the same loaded QSV/current-record state. This is useful mode-loop evidence, but it is not a DQK
combat-map population proof; the run still logs only the Palanthas/menu `[ca03]` row at `b7f9=0x82d0`
and then reaches the `gate-b7f9:0x91cf` wait later in the trace.

### 2026-07-13 area-58 descriptor-162 staged resume probe

Area 58 is a useful negative-control companion to the area-5 and area-18 save-resume probes because the
local `GEO.GLB` does contain map id 58 and the static scanner now proves a header-CFG reachable
top-level `COMBAT` at `0x9967`. The corresponding natural descriptor is cell `(17,15)`, descriptor
`162`, but the script path is a temple/service gate: it uses `PARTY_SURPRISE`, `CLEARMONSTERS`,
`SAVE #1,0x0014`, and then `COMBAT`.

The staged fixture copied `build\dqk-area5-save-trace` to
`build\dqk-area58-desc162-save-trace` and patched both root and `SAVE\` `SAVGAMA.QSV` copies with
area/header/pose values:

```text
@16=3 @18=58 @21=4 @31=6 @33=1 @36=17 @37=15
@1024=17 @1025=15 @1026=3 @1029=4 @1031=2
@1033..@1036=f0 fe f0 fe
```

That `@21=4` value is now known to be part of the failure model: it is copied to
current-record `+0x16`, then to `[ae63]`, and then passed as the `ECL1` member selector
to the loaded-save ECL loader. For an area-58/member-58 fixture, `@21` must be `0x3a`.

The runtime run used the same loaded-save/journal route plus current-record watches and stopped only on
top-level `0x24` or a byte-validated combat-map hit. It ran to the 22M instruction cap:

```text
log:      build\dqk-area58-desc162-runtime.log
ca03 csv: build\dqk-ca03-watch-area58-desc162.csv
map csv:  build\dqk-bedb9-area58-desc162.csv
```

The QSV/current-record transfer is proven for this area:

```text
rec+13=0x3a rec+25=0x11 rec+26=0x0f
hdr@16=0x03 @18=0x3a @21=0x04 @31=0x06 @33=0x01 @36=0x11 @37=0x0f
res@1024..1028=0x11,0x0f,0x03,0x00,0x00 ae67=0x0004 ae57=0x0002
post-load: c9f0=0x11 c9f1=0x0f c9f2=0x03 ca03=0xfef0
```

The same overlay-7 mode loop watch fired at `25a4:3756` / `DQK.EXE:0x047f06` with `ae57=0x0004`, and
the journal answer was solved (`FROM`). The combat result stayed negative: zero `ECL-OPCODE
opcode=0x24` rows, zero setup/render watch hits, and `build\dqk-bedb9-area58-desc162.csv` contains
only the header. Therefore the loaded-save route failure is not specific to area 5 or area 18; the
remaining gap is still target area/ECL stream selection or a natural route into the target script,
not QSV byte loading.

A focused 15M-instruction follow-up (`build\dqk-area58-mode-selection-15m-r2.log`,
`build\dqk-ca03-watch-area58-mode-selection-15m-r2.csv`) pins that handoff more tightly.
The staged area-58 QSV bytes still load correctly:

```text
hdr@18=0x3a @36=0x11 @37=0x0f
res@1024..1028=0x11,0x0f,0x03,0x00,0x00 ae67=0x0004 ae57=0x0002
post-load: rec+13=0x3a +25=0x11 +26=0x0f
  c9f0=0x11 c9f1=0x0f c9f2=0x03 ca03=0xfef0 ca05=0xfef0
```

The post-load path then overwrites the active handoff state:

- `2177:319d` / `DQK.EXE:0x0362fd` executes with `ae57=0x0002` and clears current mode.
- `25a4:3722` / live `389c:07a2` / `DQK.EXE:0x047ed2` executes the overlay-7 mode-4 setter.
- `25a4:3756` / live `389c:07d6` / `DQK.EXE:0x047f06` immediately follows with
  `ae57=0x0004`.
- `25a4:0024` executes the byte-validated `mov [b7f9],0x8000` reset body
  (`DQK.EXE:0x038075`, `0x03825a`, or `0x0402e4`).

The first CA03 handler row in that same run is still not the area-58 `0x9967` target:

```text
instr=14835201 ca03-write op1=0xba op2=0x07 ca03=0xfef0
  b7f9=0x82d0 stream=0x5b6e:0x8000
```

The narrowed conclusion is that QSV/current-record transfer is good enough for area
number, pose, mode, and CA03 bytes, but the post-load resident mode path selects the
current `0x5b6e:8000` stream and advances to the Palanthas/menu CA03 setter instead of
installing area 58's `0x9967` ECL position.

A selector-focused rerun confirms that this is a stream/member-selection failure, not
only an ECL-PC reset. In `build\dqk-area58-selector-15m.log`, the only watched
`[ae5c:ae5e]` writes before the first CA03 row are the startup installer:

```text
35de:0074 [ae5e]=0x5b6e
35de:0078 [ae5c]=0x0000
35de:0083 [ae5c]=0x8000
```

The post-clear resource opens are `gen` immediately after `2177:319d`, then `PICB1`
after the later `b7f9=0x8000` reset. The watched `10b2:02d3` path is absent; the route
uses `10b2:00e4`. The single CA03 row remains:

```text
build\dqk-ca03-watch-area58-selector-15m.csv
instr=14835201 b7f9=0x82d0 stream=0x5b6e:0x8000 op1=0xba op2=0x07
```

Static xrefs now make `DQK.EXE:0x032ded` / canonical `1f4e:1ebd` -> `1d99:137d` ->
`1d99:1373` -> overlay-6 `DQK.EXE:0x0403d8` the next selector chain to trace.
`0x032ded` computes `[ae63]`; `0x0403d8` passes DS:`773e` (`DQK.EXE:0x06b15e`,
bytes `45 43 4c 31 00`, `"ECL1\0"`) plus the caller member id into `1fc4:0130` while
using `[ae5e:ae5c]` as the destination stream buffer. The loaded-save run maps that
loader to canonical `25a4:0118` (`file[0x0402c0] -> live 35a4:0000`), not the static
overlay-table shorthand `25a4:0008`.

`build\dqk-area58-selector-ecl-loader-0118-15m.log` confirms that this chain is reached with
`ae63=0x04`, `rec+16=0x04`, `rec+22=0x01`, `rec+24=0x00`, and `stream=5b6e:8000`.
`1d99:137d` jumps to live `35a4:0118` and calls `1fc4:0130`; `1d99:1373` then jumps to
live `35a4:0001` and the ECL-PC reset body. The active stream still does not retarget to
area 58 before the later Palanthas/menu CA03 row.

The paired patched-member run
`build\dqk-area58-eclmember58-ecl-loader-0118-15m.log` changes only QSV `@21` in both
copies from `0x04` to `0x3a`. It reaches `1d99:137d` and `1d99:1373` with
`rec+16=0x3a` and `[ae63]=0x3a`, and produces zero CA03 rows before the 15M cap. This
confirms the missing loaded-save selector was QSV `@21` / current-record `+0x16`, not a
separate `[ae5c:ae5e]` retarget write.

### 2026-07-13 area-18 save-resume probes

Three generated-save probes tested whether patching `SAVGAMA.QSV` could force original `DQK.EXE` into a
natural area-18 `COMBAT` gate:

- `build\dqk-area18-save-trace` copied the area-5 generated trace fixture and patched both root and
  `SAVE\` `SAVGAMA.QSV` copies with `@18=18`, `@21=4`, `@1029=3`, `@1031=2`, and the same
  `0xfef0`-style `@1033..@1036` values used by the loaded-save route.
- `build\dqk-area18-cell115-save-trace` additionally patched `@16=2`, `@36=11`, `@37=5`, and used
  `@1029=4` to test the natural GEO-backed area-18 descriptor-157 cell `(11,5)`.

> CORRECTION (R4, round 29): `(11,5)` is the pre-`dc12cd1` `(width, height)` reading of area 18's
> descriptor-157 cell. Area 18 (GEO.GLB member 5) is h=16, w=11 under the corrected decoder; the
> unique raw byte `157` (0x9D) in its backdrop plane sits at plane index 91, which is `(3,8)` under
> the real stride (w=11), not `(11,5)` (the w=16 reading of the same index). The QSV fixture's
> `@36=11, @37=5` party-position patch therefore targeted a cell that is NOT the descriptor-157
> cell under the corrected decoder -- it patched (11,5), a different, unexamined cell. This does not
> by itself explain the probe's "zero top-level `0x24`" result (that could equally be an unrelated
> reachability gap), but the experiment as logged did not exercise the cell its own description
> claims. Re-running with `@36=3, @37=8` is the natural next step, not done here (out of R4's scope
> — no DOSBox-X work). See `docs/engine/research/dqk-geo-shape-audit.md`.
- `build\dqk-area18-cell115-resume2-save-trace` patched both QSV copies with the header mirror
  (`@16=2`, `@36=11`, `@37=5`) and the documented flat-QSV resume block:
  `@18=18`, `@21=4`, `@31=6`, `@33=1`, `@1024=11`, `@1025=5`, `@1026=2`, `@1029=4`, `@1031=2`,
  `@1033..@1036=f0 fe f0 fe`, and `@1037=6`.

The first run reached the loaded-save/journal path but did not provide the live journal answer, so it
stalled before any useful area/combat proof. The second run used
`gate:0x26f8:0x012f:journal-answer-staged,journal-answer,enter,enter,enter` and proves the journal
blocker is not the issue: the log shows staged answer `FROM`, typed answer `FROM`, and the compare-call
hit at `26f8:02c2`.

The combat result is still negative. `build\dqk-area18-cell115-resume2-clean.log` ran 26M
instructions, consumed all fake keys, opened `SAVE\SavGamA.qsv`, solved the journal prompt, and
produced one `[ca03]` row at `35a4:1d47` with `op1=0xba`, `op2=0x07`, old `ca03=0xfef0`, and
`b7f9=0x82d0`. It produced:

- zero `ECL-OPCODE opcode=0x24` rows;
- zero hits on `2033:0e7f`, `2033:081b`, `28d0:0e70`, `28d0:0f25`, `28d0:0f3e`, `2740:0846`, or
  `2740:172c`;
- three expected `DQK-COMBAT-MAP alias-skip` rows;
- zero accepted combat-map CSV rows in `build\dqk-bedb9-area18-cell115-resume2-clean.csv`.

Conclusion: even patching both the header mirror and the documented flat-QSV resume block is not enough
to seed original DQK into the area-18 search/combat state. The route still follows the loaded-save
city/menu stream around `b7f9=0x82d0`. Future original-runtime probes should first recover or watch the
actual save-load transfer into current map/pose/mode globals, or return to the stronger area-5
natural-step candidate with confirmed original DGROUP watches.

The corrected `2177:*` QSV-state trace proves this is not because the patched bytes failed to load.
`build\dqk-qsv-state-resume2-2177.log` hits `qsv-state-reader-ca03-file-035b02` at instruction
`9653424` with the patched values present in runtime:

```text
hdr@16=0x02 @18=0x12 @21=0x04 @31=0x06 @33=0x01 @36=0x0b @37=0x05
res@1024..1028=0x0b,0x05,0x02,0x00,0x00 ae67=0x0004 ae57=0x0002
```

So the next area-18 route question is not "did QSV patching reach original memory?" It did. The open
question is which later routine copies or ignores `[b20f]+1+18`, `[b20f]+1+36/37`, and `c9f0..c9f4`
when selecting the active ECL/map pose.

That first post-reader consumer layer is now split out in
`docs/engine/research/dqk-qsv-save-transfer-consumers.md`. The important narrowed result is that
`[b20f]+0x13` is passed to `1D99:13B9` by the selected-QSV loader when `[ca03] > 0`, `[b20f]+0x25/+0x26`
are record-local coordinate fields consumed by movement/draw helpers, `c9f0/c9f1/c9f2` are active
x/y/facing-like globals, and `DQK.EXE:0x031b9e` restores `ae57` from QSV-backed `ae67`. Those are
save-transfer consumers, not yet original combat setup proof.

The same consumer note now corrects QSV `@21`: it lands at current-record `+0x16` and
is the loaded-save `ECL1` member selector. The old `@21=4` area-18/area-58 fixtures
therefore intentionally or accidentally select member 4 unless patched to the target
member id.

Follow-up runtime tooling: `tools/unicorn_dqk_trace.py --watch-dqk-save-transfer` now watches those
post-QSV consumers with byte validation. The area-18 resume2 baseline reaches `2177:2b46` with
`ca03=0xfef0`, so the signed `jle` skips the `+0x13 -> 1D99:13B9` loader. A separate synthetic
positive-control copy with QSV `@1033..@1034 = 0001` reaches `2177:2b51` and `2177:2b56`, proving the
branch and loading `AX=0x0012` from current-record `+0x13`. See
`dqk-qsv-save-transfer-consumers.md` for commands and log names.

## Next Work

- Find or drive a DQK route with a real top-level `0x24` opcode, then follow that handler into native
  Gen2 combat dispatch.
- Continue searching for a DQK route that reaches `DungCom1` / `WildCom1` setup consumers
  (`28d0:0f25`, `28d0:0f3e`) and the 7x7 render path (`2740:0846`, `2740:172c`), now with
  `--dump-dqk-combat-map` enabled so a hit produces a durable `[bedb]+9` artefact.
- For area-5 traces, prefer watch-only probes first: `--watch-ecl-opcode 0x24`, DGROUP write watches
  on `[b1c7]` and `[b7f9]`, a `[b7f9]` range around `0x91c0..0x91e0`, `--watch-ca03-operands`, and
  byte-validated `--dump-dqk-combat-map`.
- Keep using `journal-answer` for DQK loaded-save traces, and place any `gate-b7f9` token after all
  intervening prompt keys needed before the target stream offset.
- Reconcile the captured operand values against selected `back1` / `8x8d%c%d` / `GEO1` resources and
  native visual output.
