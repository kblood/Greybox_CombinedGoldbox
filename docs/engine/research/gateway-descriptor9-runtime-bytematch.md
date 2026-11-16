# Gateway descriptor-9 runtime byte-match

Promotes `docs/engine/research/gateway-ecl-runtime-candidates.json`'s seven strict file-offset
candidates from "structural similarity only" to "runtime-confirmed identical bytes" for the six
candidates that live inside descriptor 9 (`operand_parser`, `ecl_loader`, `memory_type_candidate`,
`memory_set_candidate`, `memory_get_candidate`, `command_parser`). This is a hand-written sibling
doc, not a regeneration of `gateway-ecl-runtime-candidates.generated.md` — that file is produced
by `tools/map_gateway_ecl_runtime_candidates.py` from static file offsets only and explicitly says
"do not edit by hand"; runtime segment identity is orthogonal evidence layered on top of it.

## Result

**Confirmed.** Gateway's `GAME.OVR` descriptor 9 (file offset `0x9471`, code size `0x24A7` /
9383 bytes) loads into runtime segment **`1B37`** during ordinary silent startup — no save file,
no menu navigation, no keypress required. All six named offsets inside that descriptor byte-match
the retail `GAME.OVR` file exactly (128/128 bytes each) at their expected relative offsets within
the loaded segment.

| Role | File offset | Relative offset | Runtime address | Bytes compared | Exact match |
| --- | ---: | ---: | --- | ---: | :---: |
| `operand_parser` (parser) | `0x9471` | `+0x0000` | `1B37:0000` | 128 | yes |
| `ecl_loader` (loader) | `0x9800` | `+0x038F` | `1B37:038F` | 128 | yes |
| `memory_type_candidate` | `0x9C1E` | `+0x07AD` | `1B37:07AD` | 128 | yes |
| `memory_set_candidate` (setter) | `0xA2CF` | `+0x0E5E` | `1B37:0E5E` | 128 | yes |
| `memory_get_candidate` (getter) | `0xA46D` | `+0x0FFC` | `1B37:0FFC` | 128 | yes |
| `command_parser` | `0xB578` | `+0x2107` | `1B37:2107` | 128 | yes |

Reproduced twice independently (`build/dosbox-x-gateway-d9-bytematch-20260716` — first pass,
16-byte-per-role check; `build/dosbox-x-gateway-d9-bytematch-20260716-r2` — second pass, full
128-byte-per-role check). Both runs observed the identical destination segment `1B37` and
identical byte content. Evidence JSON: `build/dosbox-x-gateway-d9-bytematch-20260716-r2/gateway-descriptor9-bytematch.json`.

## Method

New tool: `tools/trace_gateway_descriptor9_bytematch.ps1`. It extends the existing
`tools/trace_gateway_descriptor9.ps1` VROOMM-seek capture (which had already proven, on
2026-07-15, that descriptor 9's `INT 21h/AH=42h` seek fires during ordinary silent startup — see
`build/dosbox-x-gateway-descriptor9-20260715-183407/debugger_console_12.txt`, snapshot index 12,
seek offset `0x9471`, `es:[0010]=1B37`) with the post-read breakpoint technique already proven for
Pool (`tools/trace_pool_ecl18_route.ps1`'s `Invoke-CombatEntryProbe`: the loader's read-completion
address is a fixed `CS:(EIP_at_seek + 0x12)` offset from the `INT 21h/AH=42h` seek instruction,
because the seek and the following `INT 21h/AH=3Fh` read are two instructions apart in the same
basic block of the shared FBOV/VROOMM overlay-loader stub).

Steps, all inside one owned DOSBox-X 2026.07.02 DEBUGBOX process (`build/tools/dosbox-x-2026.07.02`)
against the hash-locked base stage `build/runtime-gateway-base-clean-20260715`
(`GAME.EXE 0222834b...5c00`, `GAME.OVR c2e64df2...f5cd`):

1. `BPINT 21 42` (breaks on every `INT 21h` with `AH=42h`), then `RUN`.
2. Poll snapshots; parse `EAX/EBX/ECX/EDX/CS/EIP`. Confirm every stop is really `AH=42h`
   (`(EAX>>8)&0xFF == 0x42`); reject the run otherwise. Reconstruct the 32-bit seek offset as
   `((ECX&0xFFFF)<<16) | (EDX&0xFFFF)`.
3. Gateway's loader sequentially seeks and preloads all 51 `GAME.OVR` descriptors during silent
   startup, each into the same shared overlay buffer segment (observed `1B37` for every descriptor
   in this run, including descriptor 9 at seek index 10 and descriptor 10 immediately after with a
   different code size `0x13F4` — same destination segment, different size, which is exactly the
   expected shape for a single reused physical overlay buffer, not a coincidence of two unrelated
   loads landing on the same segment). Continue `RUN`-ing until the seek offset equals descriptor
   9's static file offset `0x9471` (handle `5` = `GAME.OVR`).
4. At that stop, the debugger's own disassembly annotation for the loader's next two instructions
   already exposes the destination segment and code size without any extra command:
   `mov ds,es:[0010]  es:[0010]=1B37` and `mov cx,es:[0008]  es:[0008]=24A7`. `0x24A7` matches
   descriptor 9's expected code size exactly (cross-check, not the claim itself).
5. Compute the post-read breakpoint as `CS:(EIP+0x12)` from the *current* stop's own `CS:EIP`
   (observed `0AF3:028F` in both runs, not hardcoded), set `BP 0AF3:02A1`, `RUN`, and confirm the
   next stop's `CS:EIP` is exactly that address (i.e. we are now past the `INT 21h/AH=3Fh` read
   that actually populates segment `1B37` with descriptor 9's bytes, and before the loop advances
   to seek descriptor 10 and overwrite the same buffer).
6. For each of the six named relative offsets, issue `D 1B37:<offset>` and collect every hex line
   the debugger prints (128 bytes), then compare byte-for-byte against `GAME.OVR` read directly
   from the hash-locked stage at `0x9471 + <offset>`. All six compared exact.
7. Terminate the owned process (`Stop-Process`); no leftover `dosbox-x.exe` processes after either
   run.

## Why this segment counts as "the actual runtime segment," not a startup-only artifact

The destination is a **fixed, shared overlay buffer**, not a segment allocated fresh per call: the
same segment `1B37` was observed for descriptor 9 (`0x24A7` bytes) and, immediately following it in
the same sequential preload pass, for descriptor 10 (`0x13F4` bytes) — a different code size loaded
to the identical segment. That is the standard Borland/FBOV VROOMM shape already documented for
Pool and Secret in this project (one physical overlay-code buffer reused for whichever routine is
currently active); the descriptor-9 code that will actually execute later, whenever the game calls
into descriptor 9 for real (not just this startup preload/verification pass), loads into the same
`1B37` buffer through the same loader stub at `0AF3:028F`. There is no separate "real" segment to
find — the loader always reuses this one buffer.

## What remains open (unchanged from BUILD-QUEUE.md)

This doc proves runtime segment identity and byte content only. It does **not** prove:
- Gateway's own DGROUP/DS-relative data segment (a different, data-only segment — likely `0CEB`,
  observed as `DS` in the register overview at the seek stop, but that is `DS` at the *loader's*
  call site, not proven yet to be the operand parser's own DGROUP once code in `1B37` actually
  executes).
- The archive/member selector, ECL cursor address, body far pointer, virtual-address conversion,
  or Area1 base (BUILD-QUEUE.md line 455 — still open, still requires reaching and single-stepping
  the operand parser itself, not just observing its resident bytes).
- Nothing here required or used a Gateway save file, consistent with
  `docs/engine/research/gateway-save-acquisition.md` and `docs/engine/HANDOFF.md`'s note that
  static Gateway runtime preparation can proceed without one.

## Reproduction

```powershell
pwsh tools/trace_gateway_descriptor9_bytematch.ps1 -OutDir build/dosbox-x-gateway-d9-bytematch-<label>
```

Requires the hash-locked stage at `build/runtime-gateway-base-clean-20260715` (regenerate with
`python tools/stage_gateway_runtime.py --strict --output build/runtime-gateway-base-clean-<label>`
if missing) and the local DOSBox-X 2026.07.02 DEBUGBOX build under
`build/tools/dosbox-x-2026.07.02`.
