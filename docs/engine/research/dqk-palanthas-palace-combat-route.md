# DQK Palanthas Palace Route And False COMBAT Correction

This note records the deterministic Unicorn route that drives the loaded DQK save from the Palanthas
city menu into the Palace branch. Earlier revisions of this note claimed the route reached a
script-level `COMBAT` opcode at `0x8439`. That was wrong: a live filtered DGROUP trace proves `0x8439`
is the inline-string length byte of a `PRINTCLEAR` instruction, not a top-level `COMBAT`.

## Route

The route starts from the fixed-memory `--load-seg 0x1000` baseline, uses the title `P` key, loads slot
`A`, begins adventuring, answers the live journal prompt with `journal-answer`, steps through three
intermediate Return prompts, gates on the Palanthas menu stream offset, then chooses `PALACE`:

```powershell
python tools\unicorn_dqk_trace.py --run --load-seg 0x1000 --fake-video --fake-keyboard `
  --fake-key-rearm-after 20 --fake-timer --trace-keys `
  --fake-keys "esc,wait:2500000,space,space,gate:0x0bdb:0x1e3d:title-form-streq,0x1950,gate:0x25a4:0x33c3:party-menu-input-call,l,t,a,enter,b,gate:0x26f8:0x012f:journal-answer-staged,journal-answer,enter,enter,enter,gate-b7f9:0x82d0:palanthas-menu,0x1950" `
  --max-instr 36000000 `
  --watch-ca03-operands --watch-dqk-route --watch-exec-repeat --watch-exec-repeat-limit 30 `
  --watch-exec 0x28d0:0x0f25:dungcom-consume `
  --watch-exec 0x28d0:0x0f3e:wildcom-consume `
  --watch-exec 0x2740:0x0846:viewport7x7 `
  --watch-exec 0x2740:0x172c:combat-cell-render `
  --watch-output build\dqk-ca03-watch-load1000-palanthas-palace3.csv `
  --log build\dqk-load1000-palanthas-palace3.log
```

Important route detail: `gate-b7f9` now reads `B7F9` from the canonical DQK DGROUP segment, not from
the current `DS`. The current `DS` can be transient while the code hook runs. Also, `gate-b7f9` blocks
later fake keys until the target stream offset is reached, so intervening `enter` tokens must appear
before the gate. Earlier Palace attempts that gated immediately after `journal-answer` stalled before
the Palanthas menu because those Return prompts were never released.

## Evidence

`build\dqk-ca03-watch-load1000-palanthas-palace3.csv` contains six `25a4:1d47` CA03 setter rows:

| Instruction | `b7f9` | Operand 1 | Operand 2 | Pre-write `ca03` | Wrapped stream |
|---:|---:|---:|---:|---:|---:|
| `17690822` | `0x8277` | `0xba` | `0x03` | `0x0004` | `0x05b957` |
| `17960803` | `0x8295` | `0xba` | `0x07` | `0x0004` | `0x05b975` |
| `18490138` | `0x82d0` | `0xba` | `0x07` | `0x0004` | `0x05b9b0` |
| `19329789` | `0x83ae` | `0xba` | `0x07` | `0x0004` | `0x05ba8e` |
| `20938420` | `0x8498` | `0xba` | `0x07` | `0x0004` | `0x05bb78` |
| `22796120` | `0x82d0` | `0xba` | `0x07` | `0x0004` | `0x05b9b0` |

Decoding the CSV with:

```powershell
python tools\dqk_ca03_stream_decode.py build\dqk-ca03-watch-load1000-palanthas-palace3.csv --max-instructions 32
```

originally appeared to prove the city menu and Palace branch plus `COMBAT`:

```text
82d0: HORIZONTAL_MENU 0x00bf, #7, "PALACE", "TEMPLE", "HALL", "SHOP", "INN", "BAR", "LEAVE"
82fe: ON_GOTO 0x00bf, #7, 0x8319, 0x860f, 0x8648, 0x8655, 0x85d6, 0x8689, 0x87cb
8319: SAVE #0, 0x0039
831f: PRINTCLEAR "YOU ENTER THE PALACE AND ARE QUICKLY ESCORTED TO GENERAL LAURANA'S CHAMBERS. "
835c: PICTURE #149
835f: ON_GOTO 0x009a, #3, 0x836e, 0x8519, 0x856e
83b5: PRINTCLEAR "'AH, MY CHAMPIONS, I AM HONORED BY YOUR PRESENCE..."
8436: PARTYSTRENGTH c12:128
8439: COMBAT
```

That decode used the Gen1 one-operand frame for `PARTYSTRENGTH` (`0x1d`). The live DQK interpreter does
not use that frame here. With the corrected DQK Gen2 zero-operand `0x1d` frame, the same rows decode as:

```text
83ae: PARTYSTRENGTH
83af: SAVE #14, 0x0039
83b5: PRINTCLEAR "'AH, MY CHAMPIONS, I AM HONORED BY YOUR PRESENCE..."
8436: PARTYSTRENGTH
8437: PRINTCLEAR "'ONCE AGAIN, OUR BELOVED KRYNN NEEDS YOUR AID.' "
845e: SAVE #0, 0x0039
8464: PRINT "THE GENER..."

8498: PARTYSTRENGTH
8499: UNKNOWN_1F #54, flag:0
849e: PICTURE 0x0039
84a2: PRINTCLEAR "'MY FRIENDS, YOUR MISSION IS URGENT..."
850e: PARTYSTRENGTH
850f: SAVE #1, 0x009a
8515: GOTO 0x8296
```

The driven path therefore enters and returns from Palace narrative/menu script flow. It does not prove
an ECL `COMBAT` handoff.

## Negative Result

The same run watched the known native terrain/render anchors:

- `28d0:0f25` / `dungcom-consume`
- `28d0:0f3e` / `wildcom-consume`
- `2740:0846` / `viewport7x7`
- `2740:172c` / `combat-cell-render`

None of those watches fired before the 36M instruction cap. With the corrected DQK frame this is no
longer surprising: the route never reached a combat opcode. The next source-recovery step is to find a
different DQK script path with a real top-level `0x24` dispatch, or use a known area/descriptor already
documented as reaching COMBAT.

## Dispatch Follow-up

A follow-up 22M-instruction trace added watches for the new static dispatch candidate documented in
`decompile-dqk-ecl-dispatch.md`:

- `25a4:1275` / `ecl-dispatch` maps to `DQK.EXE:file 0x041645`, the routine that reads
  `[ae5c:ae5e]+[b7f9]`, stores the current byte in `[b1c7]`, indexes `opcode - 1`, and jumps through
  `cs:[bx+0x13aa]`.
- `25a4:14ce` / `ecl-zero-op-advance` is the tentative shared zero-operand/advance landing for opcode
  `0x24 COMBAT` under the current provisional table-base interpretation.
- `25a4:1d47` / `ca03-write-exec` remains the already-proven CA03 setter anchor.

The trace command was the same route as above with these additional execution watches and a shorter
cap:

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
  --watch-output build\dqk-ca03-watch-load1000-palanthas-palace-dispatch.csv `
  --log build\dqk-load1000-palanthas-palace-dispatch.log
```

Result: the proven CA03 writer still fired near the Palace branch (`b7f9=0x83ae`) and later Palace
continuation (`b7f9=0x8498`). A follow-up run with ECL stream-state logging wrote
`build\dqk-ca03-watch-load1000-palanthas-palace-eclstate.csv` and
`build\dqk-load1000-palanthas-palace-eclstate.log`; in that run `ecl-zero-op-advance` did fire twice,
but only much earlier (`b7f9=0x802b` with `ecl=b1c7:0x3d cur:0x3d`, then `b7f9=0x803d` with
`ecl=b1c7:0x00 cur:0x00`). The candidate `ecl-dispatch` watch at `25a4:1275` still did not appear.
The terrain/render watches also remained negative.

The confirming filtered DGROUP run is:

```powershell
python tools\unicorn_dqk_trace.py --run --load-seg 0x1000 --fake-video --fake-keyboard `
  --fake-key-rearm-after 20 --fake-timer --trace-keys `
  --fake-keys "esc,wait:2500000,space,space,gate:0x0bdb:0x1e3d:title-form-streq,0x1950,gate:0x25a4:0x33c3:party-menu-input-call,l,t,a,enter,b,gate:0x26f8:0x012f:journal-answer-staged,journal-answer,enter,enter,enter,gate-b7f9:0x82d0:palanthas-menu,0x1950" `
  --max-instr 22000000 `
  --watch-ca03-operands --watch-dqk-route --watch-exec-repeat --watch-exec-repeat-limit 20 `
  --watch-exec 0x2033:0x0f46:ecl2033-loop-entry `
  --watch-exec 0x2033:0x0f76:ecl2033-b1c7-write `
  --watch-exec 0x2033:0x0d1e:ecl2033-dispatch `
  --watch-exec 0x2033:0x0e7f:ecl2033-combat-stub `
  --watch-exec 0x2033:0x081b:ecl2033-combat-handler `
  --watch-exec 0x25a4:0x0b17:palace-combat-cursor-inc `
  --watch-dgroup-write 0xb1c7:ecl-last-opcode `
  --watch-dgroup-write 0xb7f9:ecl-cursor `
  --watch-dgroup-write-limit 400 `
  --watch-dgroup-write-b7f9-range 0x8430:0x8440 `
  --watch-output build\dqk-ca03-watch-load1000-palanthas-2033-combat.csv `
  --log build\dqk-load1000-palanthas-2033-combat.log
```

Key live rows:

- At `b7f9=0x8436`, `[b1c7]` is set to `0x1d` by `3033:0f76`; `3033:1389` advances the cursor to
  `0x8437`.
- At `b7f9=0x8437`, `[b1c7]` is set to `0x12` by `3033:0f76`; `3033:0047` advances the cursor to
  `0x8439`.
- At `b7f9=0x8439`, current byte `0x24` is consumed by `35a4:0b17` while `b1c7` is still `0x12`.
  This byte is the `PRINTCLEAR` string length.
- The `2033:0e7f` COMBAT stub and `2033:081b` COMBAT handler watches did not fire on this route.

This makes the static `0x041645` cluster useful but still provisional. Either the canonical/live
mapping for that routine is wrong, the active dispatch path is elsewhere, or the Palace route is simply
not a combat route. The next trace should target a known real top-level `0x24` path and keep the
filtered DGROUP watch active around that stream offset.
