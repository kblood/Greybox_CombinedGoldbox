# The ECL skip path has no opcode bound, and retail data reaches it

**Status: defect CONFIRMED, reachable, FIXED and runtime-validated (2026-09-10).**

**The header below stood for about an hour and is retracted, not deleted**, because
this document's own subject is a claim that outlived its measurement: it read
"Fix in progress, not yet validated. Measured 2026-09-10. Static analysis only --
**no emulator session stands behind any number in this document.**" That was true
when written. Everything above the "Runtime confirmation" section is still the
static analysis and still carries no emulator behind it; that section, and the
severity correction it forced, are measured in DOSBox.

## Summary

`vm_run_resume` bounds opcodes at `KNOWN_OP_MAX = 0x40` before dispatching.
`skip_one_instruction` -- the path taken when an `IF_*` comparison is FALSE and the
guarded instruction must be stepped over -- does **not**. It tests seven escape
values and then indexes `optab` with whatever byte it was given.

The result is that **the two branches of a single `IF` disagree about whether
`0x41` is an opcode at all**: the taken branch halts loudly with
`HALT_BAD_OPCODE`, while the not-taken branch silently mis-skips by an amount read
from **uninitialised memory past the end of the image**. Measured at five real retail
coordinates: pre-fix 5/5 disagree, post-fix 5/5 agree.

## The source reading (verified twice, independently)

Against `284b233:native/src/ccecl.asm`:

| claim | evidence |
|---|---|
| `KNOWN_OP_MAX equ 0x40` is referenced at **exactly one** site | defined `:166`, used only at `:1752` (`vm_run_resume`) |
| `skip_one_instruction` has **no** bound test | `:4924`; its only `cmp al,*` are the seven escapes at `:4931-4944`, then it falls through to `skip_operands_generic` at `:4949` |
| its **only** caller is `op_if` | one `call` in `ccecl.asm` and all 12 `.inc` files, at `:2094`, on the not-taken branch |
| `get_operand_meta` indexes without a range test | `:5033-5038`, `movzx bx,al` / `add bx,bx` / `mov dl,[optab+bx]` / `mov dh,[optab+bx+1]` |

The other callers of `get_operand_meta` (`:4554, :4617, :4715, :4984`) all pass
`[cur_op]`, which `vm_run_resume` has already bounded, and `exec_one` dispatches
all seven escapes to real handlers before `op_default`. **`skip_one_instruction`
is the sole unguarded entry to `optab`.**

## What `AL = 0x41` actually reads

`optab` (`:6786`) is 65 rows x 2 = 130 bytes and is the **last initialised data in
the image**: the assembled `ccecl.com` is 22,843 bytes and ends at `optab+130`.
Confirmed two ways -- by locating the table in the existing build at file offset
22713 / VA `0x59B9` (one occurrence, nothing after it), and by a scratchpad
assemble of a *copy* producing a byte-identical image.

For `AL = 0x41`, `BX = 0x82`:

- `DL` (wordSet) = the `alignb 2` **pad byte at VA `0x5A3B`** -- past end of file,
  never written by NASM, by the DOS `.COM` loader, or by the program.
- `DH` (countAt) = **the low byte of `CS`** (`our_seg`, via `mov ax,cs` at `:315`).

Note the correction that matters here: the naive reading "`optab+130` is `our_seg`"
is **wrong by one byte**. `our_seg` is at `optab + 131`, because the odd next-free
address forces `alignb 2` to insert a pad byte. That was recovered by three control
builds inserting +16/+2/+5 bytes before `section .bss`, consistent at both parities;
the NASM listing's `.bss` column restarts at 0, so a probe was required to see it.

There is no `rep stosb` over `.bss` anywhere in the file, so the surrounding arrays
hold leftover DOS arena content rather than zeros.

## Reachability from retail data -- 18 sites, denominator 27,521

CFG walk from each block's header entries, reusing the corpus walkers already in
`tools/` rather than a fresh decoder. For every reachable `0x16..0x1B` site the
**raw** guarded byte is recorded -- deliberately not requiring it to decode, since
the existing host-call census drops undecodable-guarded sites, which is precisely
the population at issue. A byte is native-OOB iff `> 0x40` and not one of the seven
escapes.

| title | reachable IF sites | native-OOB guarded |
|---|---|---|
| pool-of-radiance | 1,932 | 0 |
| curse-of-the-azure-bonds | 1,633 | 0 |
| secret-of-the-silver-blades | 1,976 | **3** |
| champions-of-krynn | 1,568 | **3** |
| death-knights-of-krynn | 1,992 | **2** |
| gateway-to-the-savage-frontier | 1,825 | 0 |
| treasures-of-the-savage-frontier | 2,505 | 0 |
| pools-of-darkness | 4,548 | **7** |
| neverwinter-nights-dos | 2,044 | 0 |
| buck-rogers-countdown-to-doomsday | 1,903 | 0 |
| dark-queen-of-krynn (Gen2) | 5,595 | **3** |
| **total** | **27,521** | **18** |

All 18 guard the byte `0x41`. **14 of the 15 Gen1 sites have the false branch live.**

Quote it as a **range, never as a bare 18**: `18 <= N <= 195`, the upper bound being
raw byte-pair candidates the CFG walk does not reach as instruction starts.

Five of the Krynn sites reproduce **byte-exactly** coordinates already published in
`docs/engine/BUILD-QUEUE.md`, and the CoK+DoK IF denominator (1568 + 1992 = 3,560)
matches that document's published 3,560 exactly. **The new content is the widening**
-- Secret +3, Pools of Darkness +7, DQK +3, three titles that item does not mention.

## The null

The probe's discriminator is the escape set, exactly as native's is. Same walker,
same corpus, three arms:

| escape set | Gen1 OOB sites | what it establishes |
|---|---|---|
| native `{42,43,45,46,4b,4c,a1}` | **15** (all `0x41`) | the real answer |
| relaxed, native + `{0x41}` | **0** across all ten titles | the probe **stops** firing when the byte is escaped -- the 15 are driven by the escape test, not a counting bug |
| empty `{}` | **67** -- Buck's 50x`0x42` + 2x`0x4C` reappear, plus the same 15 | the probe **can** find non-`0x41` OOB bytes; it did not report Buck's 52 because native genuinely escapes them |

So a title reporting 0 is a real zero. The probe was seen firing, seen **not**
firing, and seen firing on a **different byte value**.

## Severity -- silent divergence, and environment-dependent

- `read_opp` (`:1425`), `skip_operands_generic` and `skip_extra_operands` have **no
  bound test against `[blklen]`**; `[blklen]` is tested only on `pc`.
- `mov al,[blk+si]` is a 16-bit EA. In real mode it wraps mod 64K, so a runaway walk
  reads garbage from `compbuf`/`daxtoc`/the PSP/the program's own code. It does
  **not** fault -- this is a `.COM`. `read_opp` writes only fixed globals, so there is
  no memory corruption; the damage is the resulting `[pc]`.
- The 65535-iteration extras loop fires only when `DH < DL` -- for `0x41`, only when
  `CS_low < pad_byte`. If `DH == 0xFF` the extras path is disabled outright.
- Outcome: `[pc]` lands at an arbitrary offset. Overshoot `blklen` and the script
  **silently truncates** (`vmstat=0`). Or `opp` wraps mod 65536 back *below*
  `blklen` and execution resumes at a wrong offset -- garbage execution inside a real
  script. **Neither outcome reports anything.**

Neither `DL` nor `DH` is statically determinable: one is leftover arena content, the
other depends on load address, environment-block size and loaded TSRs.

**CORRECTED 2026-09-10 by measurement, and the correction matters because the
obvious control comes back NEGATIVE.** This section originally led with the load
segment, and a reader would reasonably design the experiment that way. Moving the
load segment alone (`CS=0192` -> `CS=5314`) leaves every pre-fix transcript
**byte-identical**, because with `ws_n = 0` the `count_at` byte (`DH` = `CS_low`) is
never consulted. The live variable in the SHIPPED layout is the other one: the
`alignb 2` pad byte at `optab+130`, i.e. **arena residue**. Same CS, same binary,
same input, varying only that byte:

| pad byte | pre-fix outcome |
|---|---|
| `0x00` (clean DOSBox boot) | skip 1 byte, `PC=0252 OP=00`, silent clean exit `status=0000` |
| `0xFF` | skip 255 words, halt at pc `0A7B` |
| `0x03` | **silently executes a fabricated script** -- GOSUB, then four `SAVE`s writing `MEM[4CCA]`, `MEM[4C97]`, `MEM[4C8C]`, `MEM[7F12]`, then chains to area `0x0010` |

That third row is the real severity: not a crash and not a truncation, but
**corrupted game state derived from uninitialised memory**. Corroboration that the
read is genuinely uninitialised rather than reliably zero: one configuration's
effect-record padding held nonzero garbage where another's held zeros.

The load segment **does** matter -- at a different image parity. In the mutant build
(+5 bytes) `optab+130` lands on `our_seg` itself, and there CS alone decides:
`CS=0192` -> quiet `status=0000` at pc `6D1D`; `CS=5314` -> `status=0004`,
`GBHD reason=0001 pc=02B3 op=0056`, a halt on a fabricated opcode at a
non-instruction boundary. **Both hazard sources are live; which one a given build
hits depends on its byte-count parity.** The shipped pre-fix layout happens to land
on the pad byte, which DOSBox zeroes on a clean boot -- which is precisely why the
naive CS-only control reads as a negative and would have been mistaken for
"stable, therefore not a real bug".

## The cross-track disagreement

`packages/engine/src/ecl/opcodes.ts:157` defines
`0x41: { wordSet: 2, mnemonic: 'GEN1_AWARD_XP', uncertain: true }` with
`ECL_OPCODE_MAX = 0x41`, in **every** dialect. Native has no `cmp al, 0x41`
anywhere. The two tracks do not agree that `0x41` is an opcode.
`tools/test_ecl_gen2_dialect_drift.py` carries this as a dated exemption.

## What is NOT established

- **No runtime observation of any kind.** No DOSBox session produced any figure here.
- Whether a real playthrough ever takes the false branch at any of the 18 sites.
  `false_branch_live` is a property of the static walk, not of play.
- The runtime value of the pad byte or of `CS_low`, hence the actual mis-skip length.
- Whether native's treatment of `0x42` as zero-operand is right for Buck, which has
  **50** reachable IF -> `0x42` adjacencies while `treasures` defines `0x42` as
  `LOAD_AREA_PIECES` wordSet 4. Adjacent question, not investigated.
- Per that BUILD-QUEUE item's own instruction: **do not upgrade "triggerable" to
  "crashes"** on the strength of this document.

## The fix, and how it must be validated

Minimal and correct-by-construction -- in `skip_one_instruction`, after the seven
escape tests:

```nasm
        cmp     al, KNOWN_OP_MAX
        ja      .unknown_op
```

with `.unknown_op` being literally `ret` (`[pc]` still points AT the unknown byte, so
the next `vm_run_resume` iteration applies its own `KNOWN_OP_MAX` test and produces
exactly the `.badop` outcome the TRUE branch would have produced). Cost: 4 bytes.

This deliberately does **not** teach native `0x41`. It makes native fail
*consistently* instead of failing silently in one direction, which is the right first
move while `0x41`'s framing is still a live question. Teaching it the opcode is a
separate change that should rest on each title's own `GAME.OVR` handler, **not** on
the TypeScript entry -- a sibling implementation is not a witness.

### Runtime confirmation (2026-09-10, after the fix landed)

Applied as specified. Two notes where the plan above was wrong, kept visible:

- **`.end` is at `:4977`, not `:4974`** -- `:4974` is `mov ax,[opp]` inside `.ext_two`.
- **The byte budget is 5, not 4: 22,843 -> 22,848.** The prediction counted
  `cmp al,imm8` (2 B) + `ja rel8` (2 B) and forgot the landing pad's own `ret` (1 B).
  Aliasing `.unknown_op` onto `.end`'s existing `ret` would be exactly 4 and
  behaviourally identical -- both are a bare `ret` leaving `[pc]` untouched -- but the
  self-documenting label was kept. `ja` target arithmetic checked: `0x27FF + 0x4A =
  0x2849`.

**Per-site, at the five real retail coordinates.** Driven by `/@ <vaddr>` on
`New-RetailStage` mirrors; the halt is invisible in the `.TRC`, so this needs `/E` +
`CCEFX`. "TRUE branch" is direct entry at the `0x41` offset.

| site | pre-fix FALSE branch | post-fix FALSE branch | TRUE branch |
|---|---|---|---|
| CoK `ECL2.DAX` blk 66 @592 | `status=0000`, no halt | `GBHD reason=0001 area=0042 pc=0251 op=0041` | identical |
| CoK blk 50 @5529 | `status=0000`, no halt | `... pc=159A op=0041` | identical |
| CoK blk 67 @7166 | `status=0000`, no halt | `... pc=1BFF op=0041` | identical |
| DoK `ECL3.DAX` blk 83 @4721 | `status=0000`, no halt | `... pc=1272 op=0041` | identical |
| DoK blk 99 @2514 | `status=0000`, no halt | `... pc=09D3 op=0041` | identical |

**Pre-fix 5/5 DISAGREE; post-fix 5/5 AGREE**, the halt pc landing exactly on the
`0x41` offset. Post-fix output is byte-identical across all four configurations
(`CS` `0192`/`5314` x arena `0x00`/`0x03`/`0xFF`) -- i.e. the fix removes the
environment dependence, which is the property that mattered.

**Mutation test.** `ja .unknown_op` -> two `nop`s (same 2 bytes): all five sites lose
the halt record, `status=0000`, no `GBHD`, branch agreement returns to DISAGREE.
Restored byte-exactly, SHA-256 re-verified. The guard has been seen failing.

**Regression.** `ccecl-dok-combat-gap-test` 0 · `ccecl-dok-thief-matrix-test` 0 ·
`cokyield-test` 0 · `ccecl-dqk-vmrun-test` 0 · `ccecl-dqk-combat-test` 0.

**One unrelated red found, and it is NOT caused by this change.**
`ccecl-effects-test.ps1` -- which owns the `BADOP`/`BADBRG` `0x41` fixtures and both
`.badop` arms, and sits in `native/test.ps1`'s `$scripts` rather than the
`$flowScripts` sweep, so `flow-status.json` records no verdict for it -- fails at
`:1428`, `CCECL script-effect smoke failed: event 2 header mismatch`. One-variable
control: the pre-fix source was restored byte-exactly (hash verified) and it fails
**identically, same line, same needle**, then the fix was restored. Pre-existing on
HEAD, and unowned.

**Still not measured.** Whether any of the five sites is reached via the false branch
in actual gameplay -- `/@` direct entry was used, as the static census did, so
`false_branch_live` remains a property of the static walk. Also not exhibited at a
retail coordinate: the `.badop_clean` quiet arm with `FX_HAVE_FILES`/`FX_HAVE_SCRIPT`
already latched. The fix routes both branches through the same gate so they agree
whichever arm fires, but that specific arm was not shown.

### The validation plan as written beforehand

1. Byte budget closes: 22,843 -> 22,847 exactly. **(Wrong: it is 22,848; see above.)**
2. **Mutation-test the guard**: `nop` out the `ja` and confirm the new evidence goes
   red. A guard never seen failing is not evidence.
3. Per-site transcript at real coordinates (e.g. CoK `ECL2.DAX` blk 66 @592, DoK
   `ECL3.DAX` blk 99 @2514), driven to the FALSE branch, before and after.
4. **The discriminating control, and the one most likely to be skipped:** pre-fix
   behaviour depends on `CS_low` and an uninitialised byte, so run the same input
   under two DOS memory configurations that move the load segment. **Pre-fix the two
   transcripts should DIFFER; post-fix they must be identical.** That is what
   separates "this is the bug" from "this is a stable-but-wrong constant". If they do
   not differ, that is a real result that weakens the severity claim and must be
   reported, not buried.

   **This control came back NEGATIVE as specified, and was reported rather than
   buried -- then the right experiment was found.** Moving the load segment alone
   changes nothing pre-fix, because `ws_n = 0` means `CS_low` is never read. Varying
   the *arena residue byte* instead splits the outcome three ways, including a silent
   fabricated-script execution. **The prescribed control was aimed at the wrong one of
   the two hazard bytes**, which is worth keeping as a caution: a null that comes back
   negative can mean the hypothesis is wrong, or it can mean the knob was wrong, and
   only looking at the mechanism tells you which.
5. Any pin added for this should ride `pnpm test:corpus` (as `tools/test_cok_native_*.py`
   do) rather than the `$flowScripts` sweep, which is outside every standing gate.
