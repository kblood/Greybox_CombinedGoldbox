# Gateway operand-parser execution probe

Sibling doc to `gateway-descriptor9-runtime-bytematch.md`, which proved that Gateway's
`GAME.OVR` descriptor 9 (`operand_parser`/`ecl_loader`/`memory_type`/`memory_set`/
`memory_get`/`command_parser`) loads byte-identically into runtime segment `1B37` during
silent startup. That doc explicitly left open (`docs/engine/BUILD-QUEUE.md` line 474):

> At the reached operand parser, derive Gateway's own DGROUP, archive/member selector, ECL
> cursor address, body far pointer, virtual-address conversion, and Area1 base. Add a
> retained-RAM validator and reject every inherited Secret offset or segment alias.

This doc reports a real, bounded attempt at that item and its result.

## Result

**Partially resolved, not confirmed.** Segment `1B37` is genuinely *executed* (a real `CS:IP`
fetch, not merely data-copied into) during ordinary silent startup with **zero synthetic
keypresses** -- this is new evidence beyond the earlier byte-match doc, which only observed data
loads. But every observed execution at `1B37:0000` during silent startup is a **different,
unidentified routine**, not the operand parser: its resident bytes do not match any of the six
named descriptor-9 roles (`operand_parser`/`ecl_loader`/`memory_type_candidate`/
`memory_set_candidate`/`memory_get_candidate`/`command_parser`) at their respective
`GAME.OVR` file offsets. Gateway's own DGROUP, archive/member selector, ECL cursor address,
body far pointer, virtual-address conversion, and Area1 base remain **UNLOCATED**.

| Field | Status |
| --- | --- |
| Execution reaches `1B37:0000` without any keypress | **Confirmed** (30/30 hits over ~75s of continuous polling) |
| That execution is the byte-matched operand parser | **Disproven** -- 0/30 hits matched |
| That execution is any of the other 5 named descriptor-9 roles | **Disproven** -- checked all 6, longest shared prefix is 8 bytes (a generic prologue shape shared by ~250 places in `GAME.OVR`), not a real match |
| Gateway's own DGROUP | UNLOCATED |
| Archive/member selector | UNLOCATED |
| ECL cursor address | UNLOCATED |
| Body far pointer | UNLOCATED |
| Virtual-address conversion constant | UNLOCATED |
| Area1 base | UNLOCATED |

## Method

New tool: `tools/trace_gateway_operand_parser_execution.ps1`. One owned DOSBox-X 2026.07.02
DEBUGBOX process against the hash-locked `build/runtime-gateway-base-clean-20260715` stage
(same hashes as the byte-match doc), with **no `BPINT`, no keys, no save file**:

1. Arm an *execution* breakpoint `BP 1B37:0000` before the process starts, then `RUN`.
2. Poll (`SnapshotOnly`, no command) every 500 ms. `(Running)` means still executing; a
   non-`(Running)` snapshot with a `CS:EIP` means the breakpoint fired.
3. First run (`build/dosbox-x-gateway-execprobe-20260716`, single-hit version): the breakpoint
   fired after 123 polls (~61.5 s) of pure silent boot. `hit-console.txt` shows
   `CS=1B37 EIP=00000000 DS=0CEB`, disassembling to
   `push bp; mov bp,sp; xor ax,ax; call far 0B67:04DF; mov al,[8500]; push ax; ...`. A `D
   1B37:0000` dump (128 bytes) compared byte-for-byte against `GAME.OVR+0x9471` (the retail
   operand parser) and did **not** match.
4. Second run (`build/dosbox-x-gateway-execloop-20260716b`, looped version, this doc's primary
   evidence): after each non-matching hit, issue `RUN` again (never a key) and repeat, capped at
   30 hits / 480 s global budget. All 30 hits landed at `1B37:0000` with `DS=0CEB`, roughly one
   per emulated frame (poll counts 110-139, i.e. every ~1 s once the loop started), and all 30
   had **identical** resident bytes -- the same routine being called in a tight, real loop (most
   likely a per-frame title-screen/input-wait helper), not different overlays cycling through
   the shared buffer.
5. Static cross-check (no DOSBox-X needed): searched `GAME.OVR` for the observed 128-byte
   sequence -- **zero** exact matches anywhere in the file (fixups change more than just a
   relocated segment word, so exact search across the whole resident body is not meaningful),
   then compared the observed bytes directly against the six known role offsets. Only
   `command_parser` (`GAME.OVR+0xB578`) shares the first 8 bytes (`55 89 E5 31 C0 9A DF 04`,
   i.e. `push bp; mov bp,sp; xor ax,ax; call far ...,0x04DF`) with the observed routine, then
   diverges completely from byte 9 onward. A search for just that 8-byte prefix found ~250
   occurrences across `GAME.OVR`: `push bp; mov bp,sp; <load a small AX tag>; call far <target
   with low word 0x04DF>` is evidently a ubiquitous Borland-overlay call-convention shared by a
   large fraction of all exported overlay functions, not something specific to descriptor 9. It
   is not a useful discriminator on its own; only full retail-byte comparison at a specific file
   offset is (as the byte-match doc already established for the six named roles).
6. Terminated the owned process after each run (`Stop-Process`); confirmed no leftover
   `dosbox-x.exe` processes.

New validator: `tools/validate_gateway_runtime_execution.py` (+ `tools/
test_validate_gateway_runtime_execution.py`, 6 passing unit tests). It consumes a probe JSON
of this shape and:
- rejects any claimed-match hit whose `CS` or `DS` segment equals one of Secret of the Silver
  Blades' own runtime-alias segments (`407F`/`4674`/`1E48`/`54DC`/`411B`/`41B7`/`4465`/`250A`,
  taken from `docs/engine/research/secret-startup-input-trace.md`);
- rejects any confirmed Gateway selector/cursor/DGROUP offset that collides with one of
  Secret's own DGROUP-relative offsets (`0x49E3`/`0x49ED`/`0x49D2`/`0x01E4`/`0x5376`/`0x8000`/
  `0x4CCD`/`0x4CD0`/`0x6A00`/`0x67D2`/`0x38A2`/`0x0800`/`0x7420`/`0xA4C2`);
- reports `operand_parser_execution_confirmed` only when at least one hit's resident bytes
  exactly match the retail parser, otherwise `operand_parser_execution_not_confirmed`;
- leaves Gateway's own DGROUP/selector/cursor/body-pointer/Area1-base fields as an explicit
  `"UNLOCATED"` placeholder object until a future probe supplies real values, so the same
  script (unchanged) will reject a future accidental Secret-value copy-paste.

Run against the real captured probe
(`build/dosbox-x-gateway-execloop-20260716b/gateway-operand-parser-execution-probe.json`):
`clean: true`, `verdict: "operand_parser_execution_not_confirmed"`, zero rejections (no Secret
alias present, because nothing Gateway-specific has been confirmed yet to compare) --
consistent with the honest state of the evidence.

## Why this counts as a real, non-guessed-key experiment

`docs/engine/HANDOFF.md` (Secret-of-the-Silver-Blades continuation notes) explicitly warns:
"Do not return to host input, inspect screenshots directly, or expand an unbounded guessed-key
search." Gateway has no save file (`gateway-save-inventory.json`: `save_bundle_present=false`,
`route_ready=false`) and no statically-mapped front-end dispatcher (unlike Secret's
`ovr019`/`cmp al,0x4C` "Static Party-Menu Dispatch" section), so a scripted key sequence into
character creation would be exactly that kind of guessed-key search. This probe instead used a
**deterministic, zero-input, bounded experiment**: does execution ever reach the confirmed
byte-matched segment without any operator action, and if so, is it really the operand parser?
Both questions have real, reproducible answers (yes / no) that do not depend on guessing menu
navigation.

## What remains open

- **Gateway's own DGROUP, archive/member selector, ECL cursor address, body far pointer,
  virtual-address conversion, and Area1 base are still UNLOCATED.** No progress beyond the
  earlier byte-match doc's speculative `DS=0CEB` note (now independently reconfirmed as *a*
  live DS value at a `1B37:0000` execution stop, but not tied to the operand parser -- it may
  just be Gateway's single global DGROUP used by many unrelated routines, which would still be
  useful once the real parser stop is caught, but is not itself proof of anything ECL-specific).
- **The operand parser itself has not been proven to execute.** ECL evaluation is inherently a
  gameplay-time event (`search_location`, `initial_entry`, etc. per the shared Gen1 ECL header
  shape documented for Pool/Secret) -- it cannot fire during the title/front-end sequence, which
  is all silent startup ever reaches. Reaching it requires either (a) a real Gateway save
  positioned in a playable area (`gateway-save-acquisition.md`: none currently available), or
  (b) a statically-mapped, non-guessed front-end/character-creation input sequence analogous to
  Secret's `ovr019` dispatcher mapping -- not yet done for Gateway.
- **Rejected attempt (2026-07-16):** looping the `1B37:0000` execution breakpoint through 30
  hits of pure silent startup never produced the operand parser or any other named descriptor-9
  role; the routine resident there during silent startup is stable (identical bytes every hit)
  and unidentified, most likely a per-frame title/input-wait helper unrelated to ECL. Continuing
  to wait longer would not change this outcome (the same bytes, the same `DS`, every hit),
  so further silent-only polling is not a productive next step. The next real avenue is either
  acquiring a save (per `gateway-save-acquisition.md`) or performing Gateway's own static
  front-end dispatcher mapping (the same technique as Secret's "Static Party-Menu Dispatch"
  section) before attempting any scripted key sequence -- not attempted here to stay within this
  session's bounded, non-guessed-key scope.
- Nothing here required or used a Gateway save file, consistent with `gateway-save-acquisition.md`.

## Reproduction

```powershell
pwsh tools/trace_gateway_operand_parser_execution.ps1 `
  -OutDir build/dosbox-x-gateway-execloop-<label> -SilentWindowSeconds 90 `
  -GlobalTimeoutSeconds 480 -MaxHits 30

python tools/validate_gateway_runtime_execution.py `
  --probe-json build/dosbox-x-gateway-execloop-<label>/gateway-operand-parser-execution-probe.json `
  --output build/dosbox-x-gateway-execloop-<label>/gateway-runtime-execution-validation.json

python -m unittest tools.test_validate_gateway_runtime_execution
```

Requires the hash-locked stage at `build/runtime-gateway-base-clean-20260715` (regenerate with
`python tools/stage_gateway_runtime.py --strict --output build/runtime-gateway-base-clean-<label>`
if missing) and the local DOSBox-X 2026.07.02 DEBUGBOX build under
`build/tools/dosbox-x-2026.07.02`.
