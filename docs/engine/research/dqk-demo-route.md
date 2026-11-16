# DQK Title-Screen "Demo" Route

**Scope:** what does `DQK.EXE` do when the front title form's `Play Demo Quit` prompt
receives the `Demo` selection, and which `ECL.GLB` / `GEO.GLB` HLIB members does that
route load? Companion to `docs/engine/research/dqk-start-load-route-anchors.md`
(`Play` route, resolved 2026-07-13) and `docs/engine/research/gen1-demo-entry-generalized.md`
/ `docs/engine/research/cok-demo-decompile.md` (CoK's Gen1/DAX equivalent, `ECL2.DAX`
block 57).

**Headline result: RESOLVED.** Selecting `Demo` (uppercase-`D` BIOS key `0x2044`,
mirroring the proven `Play` = `0x1950` case-sensitivity) makes DQK skip the entire
`SAVE\*.*` findfirst / QSV-load / party-menu path that `Play` uses, and load
**`ECL.GLB` member id `7`** (file offset `0x86c2`, 2020 bytes) paired with **`GEO.GLB`
member id `26`** (file offset `0x3056`, 1944 bytes) directly. `ECL.GLB` id 7 is a
complete, self-contained villain-monologue attract script — narration text, portrait
`PICTURE` calls, and a terminal `COMBAT` opcode — and its own `LOAD_FILES #26, #1`
instruction (byte offset `0x803e`) is the in-script source of the GEO id 26 the dynamic
trace independently observed. Static (file-level HLIB/ECL decode) and dynamic
(Unicorn instruction trace) evidence agree exactly.

---

## 1. Method

Same technique as the `Play` route (`docs/engine/research/dqk-start-load-route-anchors.md`
"2026-07-13 Title/Form Route Resolution"): `tools/unicorn_dqk_trace.py --fake-keyboard
--fake-keys` injects a raw BIOS `INT 16h` AX word (`scanCode<<8 | ascii`) directly into
the emulated keyboard buffer, gated on execution reaching the title form's
string-equality check (`gate:0x0bdb:0x1e3d:title-form-streq`) so the key is not consumed
too early by an unrelated prompt.

Key encoding, from `tools/unicorn_dqk_trace.py` `parse_fake_key_token` /
`KEY_SCAN_CODES`:

```python
KEY_SCAN_CODES = {..., "d": 0x20, ...}
```

A raw hex token `0x2044` == `(0x20 << 8) | ord('D')` == scan code `D` (`0x20`) + ASCII
uppercase `D` (`0x44`) — the exact analogue of the proven `Play` word `0x1950` ==
`(0x19 << 8) | ord('P')`. This was tried **first, per the task brief's prediction, and
it worked on the first attempt** — no lowercase/alternate-encoding fallback was needed
(unlike the historical `Play` investigation, which first tried lowercase `p`/`0x1970`
and failed before finding `0x1950`).

### 1a. Tool change: `--trace-asset-reads`

`tools/unicorn_dqk_trace.py`'s `INT 21h/AH=3F` (read) and `AH=42` (lseek) handlers only
ever logged I/O against the `DQK.EXE`-backed handle (used for the overlay-loader
diagnostics elsewhere in the tracer); reads/lseeks against other opened files (assets
like `ECL.GLB`, `GEO.GLB`, tile libraries) were silently unlogged. This research pass
added an additive, opt-in `--trace-asset-reads NAME1,NAME2,...` flag (matched
case-insensitively against the `INT21/3D` open basename) that logs the same
`INT21/3F read(asset) name=... handle=... cx=... -> ...` / `INT21/42 lseek(asset)
name=...` detail for named files, with no change to default (flag-less) behaviour. This
was the only code change made; no other tool or doc besides this file and the tracer
were touched.

### 1b. Commands run

First pass — confirm the route diverges and run it out to see where it settles
(mirrors the `Play`-route command shape from the anchors doc, `--max-instr` raised from
the historical `8,050,000` cap to `20,000,000` per the task brief's guidance):

```powershell
python tools\unicorn_dqk_trace.py --run --load-seg 0x1000 --fake-video --fake-keyboard `
  --fake-key-rearm-after 20 --fake-timer --trace-keys `
  --fake-keys "esc,wait:2500000,space,space,gate:0x0bdb:0x1e3d:title-form-streq,0x2044" `
  --max-instr 20000000 --watch-dqk-route --watch-ca03-operands `
  --watch-output build\dqk-ca03-watch-load1000-title-D.csv `
  --hot-spots 20 --hot-output build\dqk-hot-load1000-title-D.csv `
  --log build\dqk-load1000-title-D.log
```

Result: ran cleanly to the `20000000`-instruction cap (no crash, no file-drift), all
`6/6` fake-key tokens consumed. Log: `build\dqk-load1000-title-D.log` (466,907 lines).

Second pass — same route, capped at `9,000,000` instructions (enough to pass both the
`ECL.GLB` and `GEO.GLB` opens) with `--trace-asset-reads` enabled to recover the exact
member/offset each file read:

```powershell
python tools\unicorn_dqk_trace.py --run --load-seg 0x1000 --fake-video --fake-keyboard `
  --fake-key-rearm-after 20 --fake-timer --trace-keys `
  --fake-keys "esc,wait:2500000,space,space,gate:0x0bdb:0x1e3d:title-form-streq,0x2044" `
  --max-instr 9000000 --watch-dqk-route --watch-ca03-operands `
  --trace-asset-reads "ECL.glb,GEO.glb,frame.TLB,8x8db.tlb,8x8dc.tlb,back.tlb" `
  --watch-output build\dqk-ca03-watch-load1000-title-D-assetio.csv `
  --log build\dqk-load1000-title-D-assetio.log
```

Log: `build\dqk-load1000-title-D-assetio.log`.

---

## 2. Dynamic evidence: the key is consumed by the title widget, not a fallback

```text
KEY gate-release target=title-form-streq canonical=0bdb:1e3d live=1bdb:1e3d at 1bdb:1e3d instr=7923088 idx=5/6 pending=True stack=422e:ff64[4ed4 422e 425f 422e 6f69 206e 2e31 2031 2020 2020 2020 4a20]
...
*** EXEC WATCH widget-input-loop-poll-file-01e563 hit=1 canonical=1aa6:1703 live=2aa6:1703 ... instr=8029105
*** EXEC WATCH widget-input-loop-read-dispatch-file-01e56f hit=1 canonical=1aa6:170f live=2aa6:170f ... instr=8029125
KEY int16-read key=0x2044 ascii=0x44 AH=0x00 at 10d7:006e instr=8029157 idx=6/6 pending=False stack=422e:ff04[ff22 00f8 251e 0000 0004 005e 2c4c 1714 2aa6 db60 000e dbe8]
*** EXEC WATCH widget-input-loop-key-return-file-01e574 hit=1 canonical=1aa6:1714 live=2aa6:1714 ... instr=8029491
```

This is byte-for-byte the same generic list-widget stack shape (`2c4c:1714 -> 2aa6:...`)
that the `Play` route used to consume `0x1950` (canonical `1aa6:1703/170f/1714`, see
`dqk-start-load-route-anchors.md`). Both `Play` and `Demo` are read by the same
title-menu widget; only the resulting code path differs.

Immediately after the key return, the trace shows a real VGA palette-load / redraw
sequence (`OUT 0x3ce, N` / `OUT 0x3cf, value` pairs — VGA `Graphics Controller Index`/
`Data` port writes), proving the route is actually drawing a new screen, not stalling:

```text
CALLF far 269b:0bd0  (executed at 1bdb:00de, instr 8030416)
...
OUT 0x3ce, 0x4 (unmodeled port) at instr 8031031
OUT 0x3cf, 0x0 (unmodeled port) at instr 8031036
OUT 0x3ce, 0x1 (unmodeled port) at instr 8031054
OUT 0x3cf, 0x0 (unmodeled port) at instr 8031059
OUT 0x3ce, 0x5 (unmodeled port) at instr 8031074
OUT 0x3cf, 0x40 (unmodeled port) at instr 8031081
```

No `--watch-dqk-route` anchor beyond the widget-poll/read/return trio ever fires in this
route (`party-menu-*`, `journal-*`, `qsv-*`, `load-source-*`, `slot-picker-*`,
`vault-*`, `ca03-*` all stay silent for the full 20M-instruction run) — the CA03 CSV
(`build\dqk-ca03-watch-load1000-title-D.csv`) contains only its header row. `Demo`
never touches the overlay-7 party/load form at all.

---

## 3. File-open comparison: Demo skips the entire save-load path

`Play` (from the pre-existing `build\dqk-load1000-title-P-findfirst.log`, historical
2026-07-13 trace) opens, in order, after the shared boot/title sequence:

```text
DISK3\frame.TLB
DISK3\gen.TLB
INT21/4E findfirst 'SAVE\*.*' -> SAVGAMA.QSV
INT21/4F findnext -> VAULTA.DAT
INT21/4F findnext -> no more files
SAVE\SavGamA.qsv                     <- save-game load
DISK3\CBODY.tlb  (x5)                <- character body art
DISK3\ECL.glb
DISK3\GEO.glb
DISK2\8x8dc.tlb / 8x8db.tlb / back.tlb / PICB.tlb ...
```

`Demo` (this trace, `build\dqk-load1000-title-D.log`) opens, after the same shared
boot/title sequence:

```text
DISK3\frame.TLB
DISK3\ECL.glb                        <- no findfirst, no QSV, no CBODY
DISK3\GEO.glb
DISK2\8x8db.tlb / 8x8dc.tlb / back.tlb
DISK2\PICC.tlb / PICA.tlb / PICB.tlb  (repeating, many times)
```

There is **no `INT21/4E`/`4F` (findfirst/findnext) call anywhere in the Demo-route
log**, and no `gen.TLB` or `CBODY.tlb` open. This is the clearest single piece of
evidence that `Demo` is a hardcoded, save-independent content load, not "the same load
path with an empty/default profile."

---

## 4. Exact HLIB members loaded

`--trace-asset-reads` recovered the precise file offsets read from each handle
(`build\dqk-load1000-title-D-assetio.log`):

```text
INT21/3D open b'DISK3\ECL.glb' -> handle 24 (456526 bytes)
... (16-byte header, then 8-byte ptr[0..1] read, then a 6-entry linear scan of the
     set-id table at file offset 0xd4, then a second pass reading ptr[6]/ptr[7]) ...
INT21/42 lseek(asset) name=ECL.GLB handle=24 mode=0 off=34498  pos 48(0x30) -> 34498(0x86c2) at instr 8057361
INT21/3F read(asset) name=ECL.GLB handle=24 cx=2020 -> got 2020 bytes, file[0x86c2:0x8ea6] into buf 5b6e:0000 at instr 8057405

INT21/3D open b'DISK3\GEO.glb' -> handle 25 (48114 bytes)
... (same header/id-table-scan/second-pass shape) ...
INT21/42 lseek(asset) name=GEO.GLB handle=25 mode=0 off=12374  pos 56(0x38) -> 12374(0x3056) at instr 8064841
INT21/3F read(asset) name=GEO.GLB handle=25 cx=1944 -> got 1944 bytes, file[0x3056:0x37ee] into buf 67aa:0000 at instr 8064885
```

The live target segment for the `ECL.GLB` read, `5b6e:0000`, is the same segment the
existing `--watch-ca03-operands` CA03 stream decode in
`docs/engine/research/dqk-palanthas-palace-combat-route.md` uses (`stream=5b6e:8000`
etc.) — this is DQK's one resident "current ECL stream" buffer, confirming the Demo
script is loaded through the normal ECL-execution path, not a special-cased demo-only
renderer.

Direct HLIB parse of both files (`HLIB`/`DATA` master containers, `magic=1` id table,
same layout documented in `docs/hlib-format.md` §1b/1c) confirms the id-table lookup:

```text
=== ECL.glb ===  (49 pointer entries, 47 area/id entries)
id=7 (0x7) -> ptr#6 -> off=34498(0x86c2) size=2020        <-- Demo's ECL member

=== GEO.glb === (20 area/id entries)
id=26 (0x1a) -> ptr#8 -> off=12374(0x3056) size=1944       <-- Demo's GEO member
```

Both offsets are exact matches for what the dynamic trace read. (For contrast: the
existing `Begin Adventuring`/fresh-game path documented in
`docs/engine/research/dqk-newgame-entry.md` loads **`ECL.GLB` id 1** — a 9,340-byte
member at file offset `0x192` — confirming `Demo` really is a distinct, separately
numbered area from the normal new-game start.)

---

## 5. Full decode of `ECL.GLB` id 7 — the attract-mode script

`ECL.GLB` id 7's 20-byte Gen2 header gives `eclInitialEntry = 0x8014` (byte 20, same
convention documented in `dqk-newgame-entry.md` §3). Decoding from there with the same
opcode table `tools/dqk_ca03_stream_decode.py` already uses for CA03 stream windows
(reused directly against the raw file bytes for this pass — no new decoder needed)
gives a **complete, coherent script**:

```text
8014: SAVE #1, 0x001a
801a: SAVE #1, 0x001d
8020: SAVE #1, 0x001e
8026: SAVE #9, 0x0012
802c: SAVE #0, 0x002e
8032: SAVE #100, 0x001b
8038: SAVE #55, 0x0016
803e: LOAD_FILES #26, #1              <-- loads GEO.GLB area 26 (matches §4 exactly)
8043: SAVE #1, 0x003a
8049: SAVE #0, 0x00bf
804f: SAVE #16, 0x00c0
8055: CLEAR_BOX
8056: PARLAY #36, 0xe401, c86:9, #0
8060: GOTO cbf:0
8063: SAVE #4, 0x00c0
8069: GOSUB 0x86e4
806d: SAVE #0, 0x0039
8073: PRINTCLEAR "A WOMAN'S VOICE WHISPERS THROUGH THE TREES."
809d: PRINTCLEAR "HER WORDS WEAVE A MESMERIZING WEB."
80c0: PICTURE #239
80c3: PICTURE #91
80c6: PRINTCLEAR "COLD REPTILIAN EYES TURN ALOFT TO A CONSTELLATION LOOMING IN THE NIGHT SKY."
810e: PRINTCLEAR "'LISTEN, MY CHILDREN; OUR TIME HAS COME."
8135: PRINTCLEAR "'OUR FINAL VICTORY IS AT HAND!"
8155: PRINTCLEAR "'IN PAST BATTLES OUR ENEMIES HAVE TRIUMPHED."
817f: PRINTCLEAR "'THESE SO-CALLED CHAMPIONS HAVE FOILED OUR PLANS."
81ad: PICTURE #239
81b0: PICTURE #170
81b3: PRINTCLEAR "'PETTY HUMANS..."
81c8: PICTURE #239
81cb: PICTURE #171
81ce: PRINTCLEAR "'SCORNED HALF-BREEDS..."
81e9: PICTURE #239
81ec: PICTURE #149
81ef: PRINTCLEAR "'DESPISED ELVES..."
8206: PICTURE #239
8209: PICTURE #115
820c: PRINTCLEAR "'EVEN THE INFANTILE KENDER HAVE CAUSED US GRIEF."
8239: PICTURE #239
823c: PICTURE #172
823f: PRINTCLEAR "'WE HAVE NOT FOUGHT OUR BATTLES ALONE."
8265: PRINTCLEAR "'OUR ALLIES HAVE BEEN MANY."
8283: PICTURE #239
8286: PICTURE #173
8289: PRINTCLEAR "'THEIR DEEDS WERE NOBLE, BUT THESE LEADERS ALL HAVE ONE THING IN COMMON:"
82c8: PRINTCLEAR "'THEY HAVE ALL FAILED!"
82e2: PICTURE #239
82e5: PICTURE #90
82e8: PRINTCLEAR "'WE WILL NOT REPEAT THE MISTAKES OF OUR PAST."
8313: PRINTCLEAR "'MY BROOD, YOU WILL NO LONGER BE FORCED TO OBEY THESE INFERIORS."
834c: PARLAY #37, c12:128, c0f:156, c98:23
8355: COMBAT
8356: BAD 0xc3   <-- end of member (byte 0x356 = member offset 0x342 = last usable byte; not a real bug, just end-of-data)
```

(`DELAY` opcodes between each narration line are omitted above for readability — each
beat is followed by 5-6 `DELAY`s, which is why picture/text draws are spaced out during
live rendering, and why the dynamic trace's `PICC.tlb`/`PICA.tlb`/`PICB.tlb` re-opens
are spread roughly every 200K-1.5M instructions rather than back-to-back.)

This is unambiguously **DQK's own attract-mode villain monologue** — a dragon/draconian
antagonist ("MY BROOD") addressing its followers about past defeats by "so-called
champions", ending in a scripted `COMBAT`. It is the direct Gen2/HLIB analogue of CoK's
Gen1/DAX demo (`ECL2.DAX` block 57, see `docs/engine/research/cok-demo-decompile.md`):
narration beats + portraits + a scripted fight, just authored against the newer engine's
opcode dialect and HLIB containers instead of DAX.

The `LOAD_FILES #26, #1` instruction at byte offset `0x803e` is the closing piece of
cross-evidence: it is the in-script reason the dynamic trace independently observed a
`GEO.GLB` id-26 read (§4) — static decode and dynamic trace agree on the exact area
number without either being derived from the other.

Picture IDs referenced (`239, 91, 170, 171, 149, 115, 172, 173, 90`) are draconian/
villain portrait frames, consistent with the dynamic trace's repeated `PICA.tlb` /
`PICB.tlb` / `PICC.tlb` re-opens (portrait art is split across those three libraries by
ID range, so a script that cycles through many different portrait IDs will legitimately
reopen all three).

---

## 6. What is still open

- **`PICTURE` id -> HLIB slot mapping: SOLVED (2026-07-21).** Every `PICTURE` id this
  script references (`239, 91, 170, 171, 149, 115, 172, 173, 90`) now resolves to a real,
  decoded 88x88 portrait in `PICA.TLB`/`PICB.TLB`/`PICC.TLB` via each container's own
  documented set-id table (`docs/hlib-format.md` §1c) — the exact same
  `{WORD count; count x {WORD id, WORD ptrIndex}}` table this doc's own §4 asset-io trace
  already showed DQK's *own* loader linear-scanning when it opened `ECL.glb`/`GEO.glb`
  ("a 6-entry linear scan of the set-id table at file offset 0xd4"). No new dynamic trace
  was needed — the mechanism was already captured in this file, just not yet applied to
  picture ids. See `docs/engine/research/dqk-picture-id-mapping.md` for the full
  id-by-id table and rendered-PNG evidence, `parseHlibSetIdTable`/`dqkPictureSlot` in
  `packages/engine/src/loaders/hlib.ts`, and `packages/engine/test/dqkPictureIdMapping.test.ts`.
  Id `239` (always the first `PICTURE` of each beat pair) decodes to solid black — a real
  fade-to-black transition frame, not missing data.
- **`GEO.GLB` id 26's own map layout: decodes cleanly, NOT a blocker.** The existing
  Gen2 `decodeGen2GeoArchive` (already used elsewhere in the engine) parses id 26 without
  any changes: a 22x22 map. An earlier version of the demo player's own gap note wrongly
  attributed the unknown combat roster to "no Gen2 map decoder" for this area — that claim
  was false and has been corrected (see `packages/engine/test/dqkDemoCombatRoster.test.ts`,
  which pins the map decoding cleanly as its own regression).
- **`COMBAT` roster: narrower gap identified, still genuinely unresolved.** A live run of
  `ECL.GLB` id 7 through the real `EclVm` (Gen2 dialect) proves the `8355: COMBAT` opcode
  fires with a genuinely **empty** ECL-level roster — no `LOAD_MONSTER` opcode is
  reachable anywhere in the block. Immediately after the script's first `PARLAY` choice
  (`8056`), it hits `8060: GOTO cbf:0` — a **nonlocal** goto (target `cbf:0` is outside
  this block, so the block-scoped VM correctly cannot follow it) — and, in the reachable
  continuation, fires **five identical native `CALL 0x0001` (`setupDuelAttack`)**
  host-routine dispatches. This is DQK's own "duel" combat-setup mechanic, implemented in
  `DQK.EXE` native x86 code rather than ECL `LOAD_MONSTER` data — the same `CALL 0x0001`
  routine also appears in `ECL.GLB` blocks 16/36/39/42 (not unique to the demo). Pinning
  what that native routine actually loads is a materially different, and historically
  harder, problem than the ordinary LOAD_MONSTER case — `docs/engine/research/decompile-dqk-ecl-dispatch.md`
  documents this project's prior rounds failing to pin DQK's native `COMBAT` dispatch even
  for the *simpler* LOAD_MONSTER-driven case across many dynamic-trace attempts. Per this
  project's "UNLOCATED beats invention" ethic, the demo player leaves this roster
  genuinely absent (an explicit in-UI note) rather than fabricate one. Full evidence:
  `docs/engine/research/dqk-picture-id-mapping.md` §"Gap 1" and
  `packages/engine/test/dqkDemoCombatRoster.test.ts`.
- **No real-world name/location is attached to area id 26.** Nothing in the repo's
  existing docs maps DQK `GEO.GLB` ids to in-fiction location names beyond the
  fresh-game start (id 2 = "First dungeon (Caergoth surroundings)" in
  `dqk-newgame-entry.md`). Whether id 26 corresponds to a specific named location in the
  shipped campaign is **UNKNOWN**.
- **The exact static "item selected -> dispatch" comparison address is not pinned**
  (no address analogous to `25a4:33ef party-menu-dispatch-loop-entry` for `Play`). This
  is expected, not a gap in the same sense: `Demo` (and `Quit`) never leave the generic
  resident list-widget/form code (`0bdb:*`) the way `Play` leaves it for the overlay-7
  party form, so there is no separate overlay entry point to anchor. The per-item
  callback is presumably one of the four widget-record far pointers built at title-form
  setup (`dac7`-relative, see `dqk-start-load-route-anchors.md` "DGROUP Form-State Write
  Trace"); resolving exactly which callback and how it branches on the pressed letter
  was not attempted this pass (lower value than the ECL/GEO artifact identification that
  was the actual ask).
- Only the uppercase `0x2044` encoding was tried. It worked immediately, so lowercase
  `0x2064` / other variants were not tested (no evidence they're needed, consistent with
  `Play`'s proven uppercase-only behavior).

---

## 7. Next Work

1. **Done (2026-07-21):** a live-rendered Demo playback (`apps/web/src/ui/dqkDemo.ts`,
   `?demo=dqk`) was built from the §5 script transcript, confirming no further tracing was
   needed to *build* a Gen2 demo player. It plays the real narration beats and (per §6)
   the real portraits for all 9 picture ids; the terminal `COMBAT` correctly shows an
   explicit "roster unknown" note rather than an invented fight, per §6's `COMBAT` finding.
2. To close the `COMBAT`/`DungCom1`/`WildCom1` gap dynamically: rerun this file's §1b
   second command with `--max-instr` raised to roughly 35-50M and add
   `--watch-exec 0x28d0:0x0f14:...` / the other `DQK_CA03_WATCHPOINTS` combat-consumer
   anchors already defined in `tools/unicorn_dqk_trace.py` (`dungcom-consume`,
   `wildcom-consume`), or simply gate a later fake key on the `8355: COMBAT` byte
   pattern once a stream-position watch is added for area id 7's own stream base
   (analogous to the existing `b7f9` CA03 stream tracking, but seeded to this script).
3. If GEO.GLB's Gen2 layout is needed for the content-port goal, id 26 (1944 bytes, raw
   header quoted in §6) is a good small, self-contained test fixture to reverse next to
   a documented `dqk-geo-format.md`.
