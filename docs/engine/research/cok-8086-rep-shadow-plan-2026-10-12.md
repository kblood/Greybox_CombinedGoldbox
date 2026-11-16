# CoK REP under an interrupt shadow: bounded implementation plan

Astra source-only planning, 2026-10-12. No build, module import, model test,
oracle execution or game execution was performed. This slice is intended to remove the actual
compiled intro boundary without reducing the full original-game recompilation
goal. The recommendation below is an explicitly declared virtual CPU policy;
the shadow/REP interaction has not been calibrated on an original 8086.

## Evidence and uncertainty

The supplied historical compiled result is status9 at work104679,
guest CS:IP `19F0:04C7`, source `09F0:04C7`. Static reading of the existing complete
resident image finds at `09F0:04C0`:
`FE 1E 06 8E DA 8E C0 F3 A5 07 1F 26 80 3E 20`.
In particular `04C5:8E C0` loads ES and `04C7:F3 A5` is REP MOVSW;
fallthrough is `04C9:07` (POP ES). This is not an SS-only issue.
The historical JSON's final checkpoint independently reads CX2262,
SI=DI4522, DS20076, ES20342, FLAGS0606h (DF1 and IF1), known-maskFFEFh.
The actual blocked copy therefore runs backwards; DF1 is a real-route requirement.

Primary specification: Intel, *The 8086 Family User's Manual*, October1979,
printed p2-24 footnote and p2-25 string discussion. The footnote says
"no interrupt is recognized until after the following instruction" for MOV/POP
segment-register loads. It separately permits recognition after completed REP
primitives. REP with initial CX0 accesses no element; MOVS updates SI/DI by the
element width and direction, preserves flags, and repeated execution is
restartable. The manual does **not explicitly resolve the intersection** of
these two rules. [Intel manual scan](https://www.inf.pucrs.br/~calazans/undergrad/orgcomp_EC/mat_microproc/intel-8086_family_Users_Manual.pdf).

Independent original silicon research provides useful additional evidence:
Ken Shirriff's published MOVS microcode tests INT before its CX-zero loop test;
RPTI commits decremented CX and rewinds IP by two. Thus a REP restart with CX0
is possible at a primitive interrupt point; final-CX0 must not automatically
mean a fallthrough return address. This research does not establish whether
the INT condition incorporates the segment-load inhibit signal. Its compare
microcode also terminates on the comparison condition before the interrupt
test. Do not transfer a MOVS termination assumption to CMPS/SCAS.
[Original die/microcode analysis](https://www.righto.com/2023/04/8086-microcode-string-operations.html).

Modern Unicorn behavior can calibrate hook granularity and the declared work
profile. It cannot prove original8086 interrupt inhibition. Neither modern
SS-only rules nor 186+ shift-count masking may be imported as8086 authority.
The current decoder rejects multiple REP/segment prefixes; keep that boundary
because the8086 restart-prefix limitation is not modeled by this slice.

## Existing source contract

`rust/cok-recomp/csrc/irq_cpu.c` prevalidates admission, charges one work unit
before effects, retires after effects and polls only completed tickets. STI and
MOV/POP ES/DS/SS set `shadow_until=next+1`. Protected REP is explicitly rejected
before charging. Simply deleting this check would expire a shadow after the
first charged primitive: that is a policy change, not a proof.

`rust/cok-recomp/lift.py` emits one primitive per dispatch. MOVS/STOS leave IP on
REP when CX becomes0, then take a further charged CX0 dispatch to fallthrough.
CMPS/SCAS already leave immediately when the comparison condition ends the
repeat; count exhaustion with continuing condition currently follows the extra
dispatch shape. Preserve this distinction while independently measuring the
actual original hook sequence. Do not enshrine an extra charged dispatch merely
because the C generator currently has it, or remove it merely because REP is
one architectural instruction. Hardware microsteps and oracle work hooks differ.

The independent original path is
`build/cok-recomp/staging/intro-irq/{original_intro,irq_platform}.py`.
It also rejects protected REP, retires each previous hook, and declares
`8086-STI-MOV-POP-segment-next-instruction`. It owns a separately authored
PC reference and must retain that independence. Both rejection sites must be
replaced through a reviewed common **specification**, not shared implementation.

## Proposed explicit policy and implementation

Use a new versioned identity, for example
`pit-irq0-sourcework65536-2000-phase0-bios08-owner-rep-shadow-v2`, with the field
`rep_shadow_policy=whole-repeat-until-fallthrough-provisional`.
This is the literal whole-following-instruction interpretation, not a claim of
measured silicon behavior. Keep a discriminating first-primitive hypothesis
vector and record the unresolved hardware calibration. If stronger8086 evidence
contradicts this choice, change/version the policy before claiming hardware
fidelity; agreement between two implementations alone cannot settle that issue.

1. Separate work retirement from architectural shadow retirement. Record the
   protected repeated instruction's original CS:IP, byte identity and live
   owner/generation, plus an active/protected state. All primitive dispatches
   still preflight, charge devices, perform their original effects and retire
   exactly once. The shadow remains active while this repeat continues, across
   budget returns and host chunks. No host bulk copy or zero-time repeat loop.
2. Clear that protection only on the committed fallthrough transition. Initial
   CX0 performs no string memory access and changes neither SI/DI nor flags;
   after its calibrated work and fallthrough the pending request is eligible.
   A terminating CMPS/SCAS iteration is a fallthrough transition too. No IRQ may
   occur between word-byte writes or before completed CX/SI/DI/FLAGS effects.
3. Preserve the existing unprotected REP primitive boundary. During continuation
   its IRQ frame resumes at the REP prefix with remaining CX and updated SI/DI.
   At the final primitive distinguish the supported profile's restart point
   from its later fallthrough transition; do not choose the frame IP solely from
   CX. For protected REP the earliest eligible frame is after fallthrough.
4. Keep IF-knownness validation at a legally eligible boundary. Pending IRQ plus
   unknown IF must reject there without ACK/frame writes; while protection
   blocks recognition it must not spuriously reject unknown IF. Known IF0 blocks
   delivery while PIT work and IRR continue. MOVS/STOS preserve complete known
   flags; compares define their arithmetic flags. IRQ/IRET preserve saved mask
   and source-owned registers by existing frame rules.
5. Keep IRR/ISR/IMR, edge coalescing and EOI semantics unchanged. Several timer
   edges during protection can leave one IRR bit, not a software queue. ACK only
   after target/resume/stack/generation preflight. Re-poll after source EOI and
   at fallthrough; never use an earlier blocked poll as a permanent veto.
6. If choosing an explicit repeat record for unprotected execution too, suspend
   it per interrupt frame so a handler's own REP cannot overwrite the parent's
   continuation. Simpler protected-only state needs no suspended active record
   under this policy because no IRQ enters it. Consecutive segment loads renew
   the existing profile shadow; this slice must document that inherited policy.
7. Serialize the repeat/shadow identity in diagnostic state and comparisons.
   Validate prepared-ticket arithmetic before any work; retain overflow and
   charged/unretired rejection. Never reset PIT fraction, BIOS tick ownership,
   driver/overlay generations or work counters on a chunk/budget resume.

Scope: IRQ CPU/header, runtime snapshot plumbing, generator metadata if needed,
profile identity and independently authored oracle hooks. Existing device
algorithms and guest instruction bytes need no change. This is a host C/Rust
executable, not a DOS COM-size task; no native64KiB headroom is consumed.
Measure generated/binary size delta during the later build; no byte-size or
performance claim is made in this source-only pass.

## Sol/Luna acceptance gates, in order

Freeze old sources, binary, result and asset hashes first. Luna owns serialized
execution; any DOSBox-X work must use focusless GameLink, never host key/focus
APIs. Preserve the actual old rejection as OLD RED.

| Gate | Required evidence |
|---|---|
| Original instruction/hook calibration | Native CODE-hook trace of F3A5, F3A4, F3AB, F3AA, F3A6 and F2AE with CX0/1/2; work, pre/post CS:IP,CX,SI,DI,FLAGS and mask at each hook; compare early termination versus count exhaustion. Execute original bytes, not a Python REP replacement. |
| Protected whole-repeat vs first-primitive | Pending IRQ after MOV ES/DS/SS, POP ES/DS/SS and STI; CX2 or more. Whole policy must complete all elements before entry. The deliberately first-primitive alternative must produce a different frame/work/memory observation. |
| Pending edge timing | Edges before load, during first/middle/final primitive and on fallthrough. Final frame address and work must be explicit. Initial CX0 must never touch deliberately invalid source/destination. |
| Unprotected interruption | Pending edge after a completed primitive, genuine handler/IRET and resumed original REP; no duplicated/skipped word, exact CX/SI/DI and prefix restart. Include final-CX0 and comparison-condition termination. |
| Flags and PIC | IF0, IF1, unknown IF; preserved MOVS flags/mask, compare-defined flags; multiple edges coalesce; pending during ISR survives until source EOI; no ACK or memory writes on rejected entry. |
| Direction and memory | DF0/1, byte/word, admitted segment/offset wrap cases, source/destination overlap and guarded code identity. Execute the same byte accesses in original and C paths. |
| Host interruption | Chunk/budget cuts before admission, after load, every primitive and immediately before/after fallthrough; resumes equal uninterrupted registers, RAM, work, fractional PIT phase, complete PC state, IRQ frames/leases and ordered events. |
| Discriminating mutations | Clear protection after first primitive; never clear it; advance IP early; duplicate/drop terminal work; reset fraction on resume; drop/coalesce incorrectly; alter saved prefix IP/CX/known mask. Comparison must reject each. |
| Real route | Original and compiled execution both cross actual09F0:04C7 from restored entry, with complete checkpoint/device/frame comparisons and original source handlers enabled. Report the next genuine unsupported boundary; continue fixing it toward intro/menu/full game. |

Do not change the original oracle's expected outcome to match a candidate.
Calibrate hook/work details first, freeze them, then implement and compare the
declared CPU policy independently. Run existing accepted main-return and IRQ
regressions against the candidate after focused gates. An intro boundary fix is
not evidence of playable campaign, combat or save/load; those remain required.

## Measured native hook calibration

Actual Luna executes the independent53-case opcode fixture with Python3.13.7
and installed Unicorn2.1.4. Exit0, empty stderr and a JSON roundtrip are
confirmed. Root independently inspects the results and rechecks all48 before/
after raw input hashes, with zero mismatches. That pin scope covers the script,
README, complete source image, Python launcher/config and Unicorn package
Python/cache/DLL files; it does not cover all Python standard-library files.

| Observed case | REP-prefix CODE hooks | Fallthrough observation |
|---|---:|---|
| Any of the six forms, CX0 | 1 | One hook at the following instruction |
| MOVS/STOS or continuing CMPS/SCAS, CX1 exhausted | 2 | Includes one terminal CX0 prefix hook |
| Same, CX2 exhausted | 3 | Includes one terminal CX0 prefix hook |
| CMPS/SCAS condition ends on first primitive, CX2 | 1 | CX1 remains; no empty prefix hook |
| Condition ends on second primitive, CX2 | 2 | CX0; no empty prefix hook |
| Source-bound MOVSW, CX2262, DF1 | 2263 | Prefix ends with CX0/SI=DI=FFFE, then19F0:04C9 |

Both directions are measured. The large case records2262 word writes and final
FLAGS0606h. Its code and selected register values are bound to the actual source
site, but its RAM is synthetic; it is not an original full-game checkpoint.
The12 initial-CX0 cases have no observed writes or RAM changes. No memory-read
trace is collected, so this run alone does not prove absence of reads from
deliberately invalid data memory. That remains a separate guard-control gate.

The report is retained at ignored
`build/cok-recomp/staging/rep-calibration/measured.json`, SHA256
`602ef02d0c93832b6543f6de05e025eeef8c9955c2533b839c4ece788064f98e`.
The complete source-image hash is
`1bd9c6700b6ce55445649cf25a1991010896d1cfb044f2fb57c9cc90faf6a7e5`.
Existing lifter exhaustion/condition-termination dispatch shapes agree with
these measured hooks and should be retained. This settles the virtual work
granularity gate; the provisional whole-repeat shadow policy still requires
focused kernel and original-versus-compiled execution checks, and remains
unproven as a physical8086 inhibition rule.

The separate selective-map guard gate then passes24 actual Luna cases: six
forms in both directions, each with CX0 and CX1. Only the code page is mapped;
the declared DS/ES data addresses are unmapped. All12 CX0 cases reach the
fallthrough sentinel with key registers/FLAGS preserved and no invalid data
access. Each of12 CX1 controls produces the expected unmapped read or write
fault at20100h or40100h without reaching the sentinel. This positive fault
control verifies the memory guard; no regular MEM_READ hook is installed.
Root independently checks the results and all50 before/after input hashes.

The guard report is `staging/rep-calibration/zero-cx-measured.json`, SHA256
`ca77f007222819aa52ffa8b6b0b8248297a5c54aaa37ee729f88575cc543446a`.
This closes the zero-count data-access gate for the selected Unicorn fixture,
without making an original-game, physical8086 or A20 hardware claim. Production
v2 kernel controls and the original intro differential remain outstanding.
