# Original AH06 diagnostic output: bounded source plan (2026-10-15)

## Decision and scope

This is a later faithful-error task, not a demonstrated blocker in normal creation/name entry. Source inspection proves the Borland runtime diagnostic output helper at resident source `0A46:01E7`; it does not prove an AH06 keyboard dependency in the normal creation/name workflow. The next runtime priority remains the observed original menus. No application or test was executed for this plan, and no production code was changed.

Implement only a reviewed diagnostic output profile after its console effects are pinned. Do not enable all AH06 modes, redirect stdout, add an input queue, or turn an unsupported call into successful logging. Original guest-byte budget: **zero**; retain accepted lifted tuples, relocations and guards.

## Original evidence

Read-only decompression of `Champions of Krynn/START.EXE` with the existing `unpack_complete_load_image` produced bytes identical to `build/cok-recomp/generated/resident-complete.bin`:

- START.EXE SHA256: `e51d88ecef07cffe4a14036de3dbdc6ce7e7ff0db7482f3771d6f99eb7bbb956`.
- Complete resident image SHA256: `1bd9c6700b6ce55445649cf25a1991010896d1cfb044f2fb57c9cc90faf6a7e5` (this is the complete resident blob, not a combined generated-image identity).
- `0A46:01E7`: `8A D0 B4 06 CD 21 C3`: `MOV DL,AL; MOV AH,06; INT 21; RET`.
- `0201`: `Runtime error ` followed by NUL; `0210`: ` at ` followed by NUL; `0215`: `2E 0D 0A 00` (period, CR, LF, terminator).

The accepted generated manifest's module 0 records the original sequence at `016C..01ED`. `016C..0173` skips the diagnostic when both saved address words at DS:43A4/43A6 are zero. Otherwise `0175..019B` prints the literal, decimal DS:43A2, separator, hexadecimal DS:43A6, colon, hexadecimal DS:43A4, and period/CR/LF. `019E..01A3` then loads the error code, selects AH4C and terminates. For a byte-sized error code this is 33 output bytes; this is not a bound on arbitrary repeated helper calls.

`prepare_creation_closure.py` explicitly lists `0A46:01EB` as a returning interrupt and `01A3` as nonreturning. The refined inventory `creation-closure-inventory-returning-20261015-a.json` identity `d941c409754d9f3148372f7d8bcbc8895b084b1ee60307a5cae67cfd42dec13c` and `cok-creation-closure-partition-plan-2026-10-15.md` already classify AH06 here as diagnostic character output. CFG continuation admission does not implement its DOS service.

## Contract and exact caller dependencies

| Item | Source-supported requirement / limit |
| --- | --- |
| DL | The helper copies AL into DL. Literal bytes, decimal digits, uppercase hexadecimal digits and colon are the demonstrated callers; none emits FF. DH is untouched by the helper. |
| AL | Return the emitted character for the selected DOS profile. The helper already enters with AL=DL. Its callers do not need a different return value. |
| ZF / CF | No reviewed caller branches on flags returned by INT21. String iteration executes INC BX then reloads/tests AL with OR before its conditional jump. Decimal/hex formatting saves AX where needed and computes new flags before the next conditional branch. Do not use the file-service helper that clears CF and do not fabricate input ZF semantics for output. Exact output flag preservation/defined-mask policy must be pinned against the chosen DOS reference before calling it an exact service contract. Preserving incoming flags/mask is the conservative proposed host profile, not an observation of DOS internals. |
| Stack | `01ED` is an ordinary near RET. `01A5` string output uses near CALL and leaves its own caller frame intact. Decimal helper `01C5..01C9` and hex helpers `01CD..01DC` save/restore AX. Host service must not push an INT frame or pop a RET frame; `guest_interrupt` uses a synchronous callback and the original lifted instructions own stack changes. |
| Other state | Preserve AH, BX, CX, DX, SI, DI, BP, segments and stack across the service unless reference evidence establishes a required effect. In particular BX is the string pointer and CL is the divisor/shift count. No diagnostic branch justifies keyboard consumption or guest memory writes outside an admitted console effect. |
| Ctrl-C | Do not dispatch INT23 as part of AH06 output. Its separately retained original call remains unresolved. |

[Ralf Brown's observed output contract](https://www.delorie.com/djgpp/doc/rbinter/id/69/25.html) identifies DL other than FF as output, AL as the emitted byte on DOS 2.1–7.0, no Ctrl-C checking, and possible DOS 2+ stdout redirection. It does not establish a flags result; absence of documentation is not evidence of exact preservation.

### Explicitly deferred input alternative

[The distinct DL=FF input contract](https://www.delorie.com/djgpp/doc/rbinter/id/70/25.html) reports AL=0/ZF=1 when empty and AL=character/ZF=0 when available; an extended key returns zero followed by its extended byte on a later call. CF is not specified there. None of these behaviors is authorized for implementation by the reviewed original diagnostic callers. DL=FF must remain unsupported with no ring or prefix-state mutation. No pending extended-key state is added in this task.

Existing `guest.c::bios_keyboard` owns the admitted INT16 behavior: BDA start/end must be 001E/003E; head/tail must be even and in 001E..003C. AH00 consumes exactly one word, wrapping head at 003E; empty input returns existing status 28. AH01 has its existing IBM profile flags/AX behavior. These functions must not be repurposed as DOS AH06 input: they neither implement DOS's split extended-byte result nor its empty-result contract. Output must leave the ring and input receipt sequence unchanged, including when ring metadata is malformed.

## Host seam and missing console evidence

`startup::service` delegates unmatched INT21 functions to `Extended::dos`; `dos_legacy` currently has no AH06 branch. The AX4400/BX1 path only returns configured `stdout_device` metadata (normally 80D3); this is not a stdout writer. `Extended::video` likewise supplies no general BIOS teletype AH0E implementation. A byte appended to `events` is evidence of a request, not faithful console output.

Before Sol implements success, Luna should pin the actual original diagnostic helper's output under the selected DOS/console profile, including printable characters and CR/LF, resulting screen/cursor state, and returned registers/flags. Use the required focusless DOSBox-X GameLink procedure and original bytes. Do not infer the active video mode from the normal creation screen: this error path performs cleanup through earlier calls. If the observed console effects require additional video semantics, present that exact small dependency for source review before widening this task. A transcript-only diagnostic transport can only be labelled as such, never as exact DOS CON rendering.

Future source ownership after that gate: `src/startup_platform.rs` for the narrow dispatch/state; a focused `src/dos_diagnostic_tests.rs` plus its module registration for controls. Touch `startup.rs` or endpoint serialization only if needed to expose the approved bounded console outcome. No changes to `guest.c`, lifter, original helper bytes, input transport, durable saves or BIOS journal codec are presently justified. Reconcile with the current journal source lease before any edit.

Use bounded host ownership: proposed diagnostic byte transcript maximum 4096 bytes, explicit count and complete/incomplete status, no repeated cumulative transcript in checkpoints. Reserve its retention before committing a byte. If full or the actual sink fails, stop truthfully using the established host stop/error mechanism; do not drop output then return ordinary success or synthesize DOS CF errors absent an AH06 error contract. Exact sink transaction ordering is part of the console implementation review, not an invitation to introduce a new diagnostics framework.

## Required later Luna controls

1. Execute accepted original `01E7..01ED` with a valid near return frame through the production INT21 callback. Compare emitted byte, register/flags/defined-mask state, SS:SP and return endpoint to the pinned reference. Exercise printable digits/letters, colon, CR and LF.
2. Execute original `01A5..01B2` against each actual CS literal; then original decimal `01B3` and hex `01CD` helpers. Check exact byte order, AX save/restore, BX progression, stack balance and real native instruction execution. Do not substitute host formatting routines or test only direct Rust calls.
3. Both initially set/clear CF and ZF; compare the selected profile and demonstrate that actual callers recompute any subsequently used flags. Include native guard rejection for changed source byte / invalid owner rather than accepting a synthetic guest helper.
4. DL=FF, unsupported console profile, missing sink, sink failure and transcript cap: explicit unsupported/incomplete result; no invented success, no unintended register/stack/ring mutation. Output with malformed BDA ring still performs no keyboard validation or read. Preserve existing genuine faults.
5. Under the pinned console profile, compare actual output/cursor/RAM effects, not transcript alone. Confirm no changes to accepted INT16/keyboard receipts or durable file operations.
6. A helper test may stop at the pre-existing AH4C unsupported boundary. Label that result diagnostic-helper acceptance, not normal creation or process-exit acceptance. Do not force a full game error solely to manufacture normal-path coverage.

## Separate follow-ups

AH4C at original `0A46:01A3` needs a separate nonreturning process-exit contract with AL exit code and truthful host session termination. It must not fall through to `01A5`, forge a guest fault, or report game completion merely because the process terminated. Its cleanup and final evidence publication must be reviewed against the runtime stop priorities. INT23 at `0962:0169` remains an unresolved exceptional Ctrl-Break boundary; AH06's no-Ctrl-C behavior supplies no return contract for that site.

This plan admits no additional guest execution and proves no newly reached GUI boundary. M1–M7 remain open.
