# DQK QSV Save-Transfer Consumers

This note narrows the post-`SAVGAMA.QSV` load gap. The QSV reader itself is already
byte-checked: `DQK.EXE:0x035a58` reads `0x400` bytes into `[b20f:b211]+1`, then reads
flat offsets `1024..1036` into `c9f0..c9f4`, `ae67`, `ae57`, `ca03`, and `ca05`.
`build\dqk-qsv-state-resume2-2177.log` proves the patched area-18/cell `(11,5)` test
values reached those runtime destinations.

> CORRECTION (R4, round 29): `(11,5)` is the pre-`dc12cd1` `(width, height)` reading of the GEO
> area-18 cell this fixture targeted (intended: the unique descriptor-157/raw-byte-157 cell). Under
> the corrected `(height, width)` decoder area 18 is h=16 w=11, and that cell is `(3,8)`, not
> `(11,5)`. This paragraph's own claim -- that the patched values reached the runtime destinations
> -- is unaffected (it is about register/memory plumbing, not which GEO cell was chosen), but any
> reader relying on `(11,5)` as "the descriptor-157 cell" elsewhere in this build log should use
> `(3,8)`. See `docs/engine/research/dqk-geo-shape-audit.md`.

The remaining question is which later routines consume those loaded values and whether
they copy them into the active map/ECL/combat state. Current evidence splits the fields
into four groups.

## Record `+0x13` / QSV `@18`

Flat QSV `@18` lands at `[b20f]+1+18`, i.e. current-record byte `+0x13`. The selected-QSV
loader immediately reuses that byte when saved `[ca03]` is positive:

```asm
035ca6  cmp   word ptr [0xca03], 0
035cad  les   bx, [0xb20f]
035cb1  mov   al, es:[bx+0x13]
035cb6  lcall 0x1d99,0x13b9
```

This mirrors the live `0x0420ac` context setter path documented in
`dqk-2033-accessor-patterns.md`: operand 1 is written to current-record `+0x13` and then
passed to `1D99:13B9`, whose downstream overlay-11 path loads through `back1`,
`8x8d%c%d`, and `GEO1` resource strings. So QSV `@18` is not just an inert header
mirror; in this route it is the saved resource/context byte handed to the same loader
used by the live context setter. The exact editor/gameplay label remains open.

## Record `+0x16` / QSV `@21`

Flat QSV `@21` lands at current-record byte `+0x16`. The loaded-save route consumes
that byte as the ECL member selector:

```asm
032e25  cmp  byte es:[bx+16],0
032e33  mov  byte [ae63],7      ; fallback path
032e3a  mov  byte [ae63],4      ; fallback path
032e54  mov  al,es:[bx+16]
032e58  mov  [ae63],al
032e6c  push word [ae63]
032e70  lcall 1d99:137d
```

`1d99:137d` loads overlay 6 and jumps to canonical `25a4:0118`, which maps to
`DQK.EXE:0x0403d8` on the loaded-save route. That loader reads the active stream
buffer pointer from `[ae5e:ae5c]`, biases the destination offset by `0x8000`, and
passes the caller member id to `1fc4:0130` with DS:`773e` (`"ECL1"`).

Two paired runtime traces prove the selector role:

- `build\dqk-area58-selector-ecl-loader-0118-15m.log` used the old area-58 fixture
  with `@21=0x04`. It reaches `1d99:137d` and `1d99:1373` with `rec+16=0x04`,
  `[ae63]=0x04`, and later resumes member 4 in the `5b6e:8000` stream.
- `build\dqk-area58-eclmember58-ecl-loader-0118-15m.log` patches both QSV copies
  to `@21=0x3a`. The same route reaches `1d99:137d` and `1d99:1373` with
  `rec+16=0x3a`, `[ae63]=0x3a`, and `cx=0x003a` at the `1d99:1373` watch.

The stream pointer does not retarget; it remains `5b6e:8000`. The member id controls
which `ECL1` member is loaded into that buffer. This corrects the earlier resume-save
recipe that treated QSV `@21=4` as a generic initiated flag.

Runtime follow-up: `tools/unicorn_dqk_trace.py --watch-dqk-save-transfer` now watches this
post-load branch with byte validation, because several `25a4:*` overlay addresses alias in
physical memory when a different overlay is resident. The area-18 resume2 baseline trace:

```powershell
python tools\unicorn_dqk_trace.py --run `
  --exe build\dqk-area18-cell115-resume2-save-trace\DQK.EXE `
  --load-seg 0x1000 --fake-video --fake-keyboard --fake-key-rearm-after 20 `
  --fake-timer --trace-keys `
  --fake-keys "esc,wait:2500000,space,space,gate:0x0bdb:0x1e3d:title-form-streq,0x1950,gate:0x25a4:0x33c3:party-menu-input-call,l,t,a,enter,b" `
  --max-instr 16000000 --watch-dqk-route --watch-dqk-save-transfer `
  --watch-ca03-operands --watch-exec-repeat --watch-exec-repeat-limit 20 `
  --watch-output build\dqk-ca03-watch-area18-save-transfer-validated.csv `
  --log build\dqk-area18-save-transfer-validated.log
```

hits the QSV reader and post-load gate, but does **not** call the `+0x13` loader:

```text
2177:29a2 qsv-state-reader-ca03 ... hdr@18=0x12 @36=0x0b @37=0x05
  res@1024..1028=0x0b,0x05,0x02,0x00,0x00 ae67=0x0004 ae57=0x0002

2177:2b46 qsv-post-load-ca03-gate ... rec+13=0x12 +25=0x0b +26=0x05
  c9f0=0x0b c9f1=0x05 c9f2=0x02 ae57=0x0002 ca03=0xfef0 ca05=0xfef0
```

The static branch at `0x035ca6` is `cmp word ptr [ca03],0` / `jle`, so the
fixture's `0xfef0` value is signed-negative and skips `2177:2b51` / `2177:2b56`.

A deliberately separate synthetic copy,
`build\dqk-area18-cell115-resume2-ca03pos-save-trace`, patches both QSV copies at
`@1033..@1034` to `0001` while leaving the area/cell bytes intact. The short 12M
trace:

```powershell
python tools\unicorn_dqk_trace.py --run `
  --exe build\dqk-area18-cell115-resume2-ca03pos-save-trace\DQK.EXE `
  --load-seg 0x1000 --fake-video --fake-keyboard --fake-key-rearm-after 20 `
  --fake-timer --trace-keys `
  --fake-keys "esc,wait:2500000,space,space,gate:0x0bdb:0x1e3d:title-form-streq,0x1950,gate:0x25a4:0x33c3:party-menu-input-call,l,t,a,enter,b" `
  --max-instr 12000000 --watch-dqk-route --watch-dqk-save-transfer `
  --watch-ca03-operands --watch-exec-repeat --watch-exec-repeat-limit 20 `
  --watch-output build\dqk-ca03-watch-area18-save-transfer-ca03pos2.csv `
  --log build\dqk-area18-save-transfer-ca03pos2.log
```

then hits the full branch:

```text
2177:2b46 qsv-post-load-ca03-gate ... ca03=0x0001 rec+13=0x12
2177:2b51 qsv-post-load-record13-read ... ca03=0x0001 rec+13=0x12
2177:2b56 qsv-post-load-record13-loader ... ax=0x0012 ca03=0x0001 rec+13=0x12
```

This proves the selected-QSV loader's `+0x13 -> 1D99:13B9` call is gated by signed
`[ca03] > 0`. It does **not** prove combat setup; the positive-`ca03` run was a
branch-control experiment and reached neither `DungCom1` / `WildCom1` consumers nor a
top-level Gen2 `0x24` COMBAT dispatch within its short cap.

Area-5 follow-up: `tools/unicorn_dqk_trace.py` now also has
`--watch-current-record-write OFFSET[:LABEL]`, which watches writes overlapping the
current `[b20f:b211]` record and reports both CPU writes and INT 21h file-read writes.
The 16M trace:

```powershell
python tools\unicorn_dqk_trace.py --run `
  --exe build\dqk-area5-save-trace\DQK.EXE `
  --load-seg 0x1000 --fake-video --fake-keyboard --fake-key-rearm-after 20 `
  --fake-timer --trace-keys `
  --fake-keys "esc,wait:2500000,space,space,gate:0x0bdb:0x1e3d:title-form-streq,0x1950,gate:0x25a4:0x33c3:party-menu-input-call,l,t,a,enter,b,gate:0x26f8:0x012f:journal-answer-staged,journal-answer,enter,enter,enter,gate-b7f9:0x91cf:area5-combat" `
  --max-instr 16000000 --watch-dqk-route --watch-dqk-save-transfer `
  --watch-ca03-operands `
  --watch-current-record-write 0x13:rec-module `
  --watch-current-record-write 0x24:rec-modeflag `
  --watch-current-record-write 0x25:rec-x `
  --watch-current-record-write 0x26:rec-y `
  --watch-current-record-write-limit 120 `
  --watch-output build\dqk-ca03-watch-area5-record-transfer-16m.csv `
  --watch-exec-repeat --watch-exec-repeat-limit 80 `
  --log build\dqk-area5-record-transfer-16m.log
```

proves the area-5 QSV data is being copied into the live current record:

```text
CURRENT-RECORD-WRITE #5 source=int21/3f-read:SAVGAMA.QSV@0x0 ...
  rec-module@rec+0x0013 ... value=file-bytes:rec-module=05 00 00 04 ...
  rec-modeflag=00 00 00 03 ...
  rec-x=00 00 03 ...
  rec-y=00 03 ...

2177:29a2 qsv-state-reader-ca03 ... hdr@18=0x05 @21=0x04 @31=0x06 @33=0x01
  @36=0x00 @37=0x00 res@1024..1028=0x07,0x0d,0x00,0x00,0x00
  ae67=0x0004 ae57=0x0002 ca03=0x0000

2177:2b46 qsv-post-load-ca03-gate ... rec+13=0x05 +24=0x00 +25=0x00 +26=0x00
  c9f0=0x07 c9f1=0x0d c9f2=0x00 ae67=0x0004 ae57=0x0002 ca03=0xfef0
```

This removes another failure mode: the area-5 loaded-save fixture is not missing the QSV
copy into the current record. Its record-local coordinate bytes are zero in this fixture,
while the active pose-like globals are still `c9f0=7`, `c9f1=13`, `c9f2=0`.

One watchpoint needed an overlay correction. Runtime segment `25a4` is reused by multiple
overlays, so `25a4:3756` can correspond to overlay-6 file `DQK.EXE:0x043b26` or overlay-7
file `DQK.EXE:0x047f06`. The 16M area-5 run hits the overlay-7 body:

```text
pose-step-or-resident-mode-loop-file-043b26-or-047f06 hit=1
  canonical=25a4:3756 live=389c:07d6 phys=0x039196
  save-transfer ... rec+13=0x05 +24=0x00 +25=0x00 +26=0x00
  c9f0=0x07 c9f1=0x0d c9f2=0x00 ae57=0x0004 ca03=0xfef0
```

This is evidence for the overlay-7 resident/mode loop consuming the loaded mode state, not
evidence for the overlay-6 pose-step body or DQK tactical map setup. The same run later
reaches the journal compare (`typed: 'FROM'`), logs one Palanthas/menu `[ca03]` row at
`b7f9=0x82d0`, and only then reaches the `gate-b7f9:0x91cf` wait. So the remaining gap is
the original-runtime target area/ECL stream selector into the real area-5 combat stream, not
QSV read, current-record copy, journal answering, or the generic post-load mode rebuild.

## Record `+0x25/+0x26` / QSV `@36/@37`

Flat QSV `@36/@37` lands at current-record `+0x25/+0x26`. The clearest consumer is
`DQK.EXE:0x043c07`, which snapshots those bytes to `+0x17/+0x18`, applies step deltas
from the current facing byte `c9f2`, clamps them to `x=0..0x25` and `y=0..0x0e`, and
writes the clamped values back to `+0x25/+0x26`:

```asm
043c16  mov al, es:[bx+0x25]
043c1a  mov es:[bx+0x17], al
043c1e  mov al, es:[bx+0x26]
043c22  mov es:[bx+0x18], al
043c26  mov al, es:[bx+0x25]
043c32  add al, [0x6189 + c9f2]
043c3d  mov al, es:[bx+0x26]
043c49  add al, [0x6192 + c9f2]
043c7f  mov es:[bx+0x25], al
043c86  mov es:[bx+0x26], al
```

Renderer/helper code later consumes the same fields as draw coordinates:

```asm
04422a  mov al, es:[bx+0x25]
044239  mov al, es:[bx+0x26]
044248  lcall 0x09a4,0x09eb
04425b  mov al, es:[bx+0x25]
04426a  mov al, es:[bx+0x26]
044279  lcall 0x169b,0x0bd0
```

This is strong evidence that saved `@36/@37` are record-local cursor/screen/grid
coordinates. They are not yet proven to be the active overland/dungeon party pose by
themselves; they are consumed through current-record UI/draw movement code.

## `c9f0..c9f4` / QSV `@1024..@1028`

The five flat bytes read after the first 0x400-byte QSV block are active map-pose/cache
globals:

```asm
043a70  mov al, [0xc9f0]      ; x-like byte
043a77  mov al, [0xc9f1]      ; y-like byte
043a7e  mov al, [0xc9f2]      ; facing/direction-like byte
043a96  lcall 0x1d99,0x10fd   ; validate/lookup
043ad5  mov es:[bx+0x21], 1   ; out-of-bounds/change flag
```

Movement/update code applies facing deltas, wraps/clamps against the loaded map dimensions
at `[ca08]`, then refreshes cache bytes:

```asm
043b3a  mov al, [0xc9f2]
043b45  add [0xc9f0], al      ; via delta table 0x6189
043b54  add [0xc9f1], al      ; via delta table 0x6192
043bb0  push [0xc9f2]; push [0xc9f1]; push [0xc9f0]
043bbc  lcall 0x1d99,0x10f3
043bc4  mov [0xc9f3], al
043bc7  push [0xc9f1]; push [0xc9f0]
043bcf  lcall 0x1d99,0x1387
043bd6  mov [0xc9f4], al
```

The mode-specific input loop at `DQK.EXE:0x043dc5` also uses these globals for view/aim
updates. For example its mode-4 branch pushes `c9f2/c9f1/c9f0` to `1D99:1111`, and turn
commands mutate `c9f2` then refresh through `1D99:10F3` and `1D99:1111`.

Conclusion: `c9f0/c9f1/c9f2` are the best currently pinned active pose triplet. The
negative area-18 QSV route means loading those bytes is not sufficient to enter the
desired active area/combat route; the missing link is a later mode/script transfer that
selects the right stream/map context before these globals are acted on.

## `ae67/ae57`

`ae57` is a current mode word and `ae67` is its saved/previous companion. The live setter
around `DQK.EXE:0x040a92` preserves the old mode before switching to `3` or `4`:

```asm
040a92  mov ax, [0xae57]
040a95  mov [0xae67], ax
040a9e  mov word ptr [0xae57], 3
040aa6  mov word ptr [0xae57], 4
```

The post-load/re-entry loop around `DQK.EXE:0x031b9e` restores `ae57` from QSV-backed
`ae67`, calls setup helpers, and dispatches based on both `ae57` and current-record
`+0x24`:

```asm
031b9e  mov ax, [0xae67]
031ba1  mov [0xae57], ax
031bad  lcall 0x1023,0x0006
031bb7  lcall 0x1d99,0x1175
031bc0  cmp word ptr [0xae57], 3
031bc7  les bx, [0xb20f]
031bcb  cmp byte ptr es:[bx+0x24], 1
031bd2  lcall 0x10b2,0x02d3
031bd9  lcall 0x10b2,0x00e4
031bde  lcall 0x1f4e,0x023b
031bed  lcall 0x1f4e,0x03f8
```

This is the strongest current post-load mode-transfer candidate. It is not a combat-map
population routine: it does not touch `[bedb]+9`, `DungCom1`, `WildCom1`, or the
byte-validated overlay-12 setup/render anchors. It should be traced next with repeat
execution watches when testing patched QSV routes, because it explains how saved mode
can override the loaded `ae57` value.

### 2026-07-13 area-58 mode/ECL handoff trace

The follow-up area-58 staged-save trace narrows the failure past QSV copying and into
post-load mode/ECL stream selection. The validating run is:

```text
log:      build\dqk-area58-mode-selection-15m-r2.log
ca03 csv: build\dqk-ca03-watch-area58-mode-selection-15m-r2.csv
```

It uses `build\dqk-area58-desc162-save-trace\DQK.EXE` and the loaded-save/journal route,
with `--watch-dqk-route`, `--watch-dqk-save-transfer`, and `--watch-ca03-operands`.
The staged QSV data is accepted exactly as intended:

```text
qsv-state-reader-ca03 ... hdr@18=0x3a @36=0x11 @37=0x0f
  res@1024..1028=0x11,0x0f,0x03,0x00,0x00 ae67=0x0004 ae57=0x0002
qsv-post-load-ca03-gate ... rec+13=0x3a +24=0x00 +25=0x11 +26=0x0f
  c9f0=0x11 c9f1=0x0f c9f2=0x03 ae67=0x0004 ae57=0x0002 ca03=0xfef0
```

The later handoff then overrides the loaded current-mode/script state:

```text
2177:319d post-qsv-mode-current-clear-file-0362fd ... ae57=0x0002
25a4:3722 overlay7-mode4-set-file-047ed2 live=389c:07a2 ... ae57=0x0000
25a4:3756 pose-step-or-resident-mode-loop-file-043b26-or-047f06 ... ae57=0x0004
25a4:0024 post-load-ecl-pc-reset-file-038075-or-03825a-or-0402e4 ... b7f9=0x8000
```

The `25a4:3722` watch is important: the live instruction is `389c:07a2`, but DQK's
runtime segment reuse means the tracer's canonical watch address must be `25a4:3722`,
not `25a4:07a2`. File `0x047ed2` is the byte-validated overlay-7 body. The ECL-PC reset
is likewise not at the initially guessed overlay-6/7 offsets; the matching
`mov word ptr [b7f9],0x8000` bodies are at `DQK.EXE:0x038075`, `0x03825a`, and
`0x0402e4`.

The first subsequent `[ca03]` write remains on the Palanthas/menu stream, not the
area-58 stream:

```text
instr=14835201 ca03-write op1=0xba op2=0x07 ca03=0xfef0
  b7f9=0x82d0 stream=0x5b6e:0x8000
```

This proves the area-58 staged QSV bytes are not being lost. They survive through the
reader and post-load gate, but the resident post-load path clears `ae57`, re-enters
mode 4, resets the ECL PC to `0x8000`, and advances in the current Palanthas/menu
stream instead of installing area 58's `0x9967` script position.

### 2026-07-13 selector follow-up: stream pointer is not retargeted

The next selector trace used the same staged area-58 fixture, plus DGROUP watches for
`[ae5c:ae5e]`, `[b7f9]`, `[a627]`, `[a317]`, `[ae42]`, `[ae43]`, `[ad67:ad69]`,
`[c6e5:c6e7]`, explicit `10b2:00e4` / `10b2:02d3` watches, and a stack-word probe for
`09a4:01dc` HLIB opens:

```text
log:      build\dqk-area58-selector-15m.log
ca03 csv: build\dqk-ca03-watch-area58-selector-15m.csv
```

The watched stream-pointer writes install the startup/current ECL buffer only:

```text
35de:0074 -> [ae5e] = 0x5b6e
35de:0078 -> [ae5c] = 0x0000
35de:0083 -> [ae5c] = 0x8000
```

No later watched write changes `[ae5c:ae5e]` away from `5b6e:8000` before the first
`ca03` handler row. The post-`2177:319d` HLIB open is likewise not a target-area ECL
install: `09a4:01dc` opens `gen` (`arg0:422e:58cd 'gen'`) with `a627=0x001b` and
`ae57=0`. After the later `b7f9=0x8000` reset, `09a4:01dc` opens `PICB1`
(`arg0:422e:a7c4 'PICB1'`) and `a627` becomes `0x0096`; the next `ca03` row is still
the Palanthas/menu stream:

```text
instr=14835201 ca03-write op1=0xba op2=0x07 ca03=0xfef0
  b7f9=0x82d0 stream=0x5b6e:0x8000
```

The `10b2:02d3` branch was watched and did not fire on this route. The route takes
`10b2:00e4`, so the `ae57==3 && current-record+0x24==1` helper is not the missing
area-58 selector for this fixture.

Runtime follow-up now confirms the ECL member loader cluster. `DQK.EXE:0x032ded` /
canonical `1f4e:1ebd` derives `[ae63]` from current-record `+0x16` or from fallback
values `4` / `7`, then calls `1d99:137d` and `1d99:1373`. Those are single-callsite
helpers in the current static scan. The overlay-6 loader at `DQK.EXE:0x0403d8` then
reads `[ae5e:ae5c]`, adds `0x8000` to the offset, pushes the caller's member id, and
calls `1fc4:0130` with DS:`773e`. The string at that DGROUP offset maps to
`DQK.EXE:0x06b15e` and bytes `45 43 4c 31 00` (`"ECL1\0"`). Static overlay-table
arithmetic gives `25a4:0008`, but the loaded-save trace actually loads file
`0x0402c0` at live `35a4:0000`, so the runtime watch address for `DQK.EXE:0x0403d8`
in this route is canonical `25a4:0118`.

The `build\dqk-area58-selector-ecl-loader-0118-15m.log` rerun confirms the chain:
`[ae63]` is set to `0x04` from current-record `+0x16`, `1d99:137d` runs with
`rec+16=0x04`, `rec+22=0x01`, `rec+24=0x00`, and `stream=5b6e:8000`, then jumps to
live `35a4:0118`, which calls `1fc4:0088` and `1fc4:0130`. `1d99:1373` subsequently
runs with the same selector state, then jumps to live `35a4:0001` and the known
`b7f9=0x8000` reset body at `35a4:0024`. The active stream still remains
`5b6e:8000`, and the later CA03 row is unchanged.

The paired `build\dqk-area58-eclmember58-ecl-loader-0118-15m.log` run patches QSV
`@21` to `0x3a` and reaches the same chain with `rec+16=0x3a` and `[ae63]=0x3a`.
It writes no CA03 rows before the 15M cap, which is a useful behavioral difference
from the member-4 fixture. Keep `1d99:13b9` separate: its known callsites
(`0x035cb6`, `0x0420e1`) feed the GEO/resource-loader path, not this ECL member
loader.

`tools/unicorn_dqk_trace.py` now emits an `ecl-selector=...` extra state block for the
selector watch addresses, including record `+0x16/+0x22/+0x24`, `[ae63]`,
`[ae57/ae67]`, `[ae5e:ae5c]`, `[b7f9]`, `[b1c7]`, and stack words.

## `ca03/ca05`

`ca03` remains the pinned combat terrain/context selector. It is saved/loaded adjacent to
`ca05`, set by the live `0x0420ac` handler, and consumed by the `DungCom1` / `WildCom1`
setup wrappers at `DQK.EXE:0x02cc15` and `0x02cc2e`.

`ca05` is serialized next to `ca03` (`0x035b27` read, `0x0363d5` write), but this pass did
not find a convincing later active-map or combat consumer. Treat it as an open adjacent
save field, not as a route-control key.

## Current Interpretation

The patched area-18 QSV bytes are correctly loaded. The failed route is therefore not a
file-format or QSV-reader problem. The best current model is:

- `+0x13` / QSV `@18` feeds the same resource/context loader used by the live setter.
- `+0x16` / QSV `@21` is the loaded-save ECL member selector that feeds `[ae63]` and
  the `ECL1` HLIB member load. For same-numbered area/member fixtures it should match
  the target member; leaving it at `0x04` forces member 4.
- `+0x25/+0x26` / QSV `@36/@37` are record-local coordinate/cursor fields.
- `c9f0/c9f1/c9f2` are active x/y/facing-like globals, with `c9f3/c9f4` as refreshed lookup
  caches.
- `ae67/ae57` decide the runtime mode that determines which input/update loop consumes those
  fields, but the area-58 trace proves post-load resident code can clear/rebuild the
  current mode after QSV has loaded the saved value.
- `ca03` selects combat terrain/art context when, and only when, execution reaches the
  DungCom/WildCom setup path.

The next original-runtime trace should move upstream from QSV copying into the routine
that chooses the active area/ECL stream after `2177:319d`, `25a4:3722`, `25a4:3756`, and
`25a4:0024`. A positive combat proof still requires a real top-level Gen2 `0x24`
dispatch at the target area stream followed by byte-validated `28d0:*` or `2740:*` hits
and an accepted `[bedb]+9` dump.
