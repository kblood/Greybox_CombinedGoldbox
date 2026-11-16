# Secret opcode 1Dh: original contract and native prerequisites

Task 243 source prerequisite, 2026-10-10. The native implementation is still
incomplete; this document records executed original evidence and a separate
actual asset-framing RED, not a completed native repair.

Prerequisite implementation `a6dc8d49` passes 114 focused checks and the full
corpus: 8,825 passed /14 skipped /84 warnings, actual exit 0 in607.02 seconds.
Native source remains unchanged; its task242 source-bound44/46 gates still apply.

## Complete original DOS execution

Secret's own dispatcher at GAME.OVR file offset `0x458B` maps opcode `1Dh` to
`0x1F87` in descriptor 3. The handler ends at `0x20CB`. Source identity is checked
by the existing original loader: GAME.OVR SHA256
`d4f900391703bbfd5a4f66703871b64782dff2307224cd2560e40e1b60779c80` and complete
loader image SHA256 `4d903edc325ed652889e1159ddb45a967f435097a09f8beb85af8252d65556bd`.

[secret_strength_oracle.py](../../../tools/secret_strength_oracle.py) executes the
complete handler, original operand parser `0x9073`, operand resolver `0x9727`,
memory store `0x9F3A`, and predicate `0x3CBB6`/`0x3CB44`. Only the established
overlay/public-call relocation changes code in emulator memory. No computation,
parser or destination operation is stubbed. The caller explicitly initializes
script/area objects and an acyclic list of complete 439-byte actors; it does not
reconstruct original WHO membership or saved-party state.

The handler fetches **one destination operand**. A declared script
`1D 03 10 4B 00` consumes the little-endian variable address `4B10`, advances the
original virtual cursor from `8000` to `8004`, and stores the computed unsigned
byte as a word. Actor records remain unchanged. For an ordinary area destination,
the only global writes are cursor bytes `67E1..67E2` and operand buffers `8FEA`,
`902A`, `906A`. All other data-segment bytes remain unchanged: this is a
destination calculation, not a script comparison operation.

The original memory helper's destination-specific effects are retained in the
proof: `4BFD`/`4BFE` mark `A4CE`; a changed `4BE6` updates `67E7`/`67E8`. These
are separate from the metric arithmetic and must not be discarded by a port.

## Portable arithmetic

[secret_strength.py](../../../tools/secret_strength.py) calculates from supplied
canonical bodies without executing original instructions or following archived
far pointers. For each body `b`, signed8 interprets a byte as -128..127:

```text
g = 0
if b[107] == 6:
    i = first nonzero byte among b[273..278], or index 6 if all six are zero
    g = b[273+i]                         # seventh-byte fallback is real
q = signed8(g) > signed8(b[239])
first  = (signed8(b[285])*q + signed8(b[278])) modulo 256
second = (signed8(b[280])*q + signed8(b[273])) modulo 256
weighted = b[437] + 5*max(b[427]-60,0) + 5*max(b[426]-39,0)
           + 8*first + 4*second
actor_result = floor(weighted/10) modulo 256
party_result = sum(actor_results) modulo 256
```

The helper tests both comparison operands as signed bytes. In particular a
non-6 gate with a negative byte239 can still produce q=1; q is not an inferred
participation test. Current HP is byte437, established by the existing original
player loader and coefficient model. Controlled HP changes alter the executed
metric. No HP or membership formula was inferred from the opcode's name.

The normal-player adapter installs independently calculated THAC/AC/current-HP
cache bytes before evaluation. Archived THAC/AC caches are not authoritative
after equipment/class setup. It matches the six original loaded heroes; it
does not claim transient spell/aura fidelity.

The focused suite currently has 114 passing checks, including signed crossings,
all gate bytes, seventh-byte fallback, byte/party wrap, random records, null and
multiple-actor lists, poisoned unrelated state, full parser/store execution,
special destination effects, six held loaded heroes and HP mutation. The
archived pre-fix native source at `b17225de` provides a permanent counterfactual:
even a null original list writes zero, while that native handler leaves the
destination sentinel intact and overwrites comparison flags. It is not a test
requiring future native code to retain the defect.

## Actual Secret Amiga default-entry RED

The held WHDLoad DISK2/ECL.GLB is 138,124 bytes, SHA256
`8c247ad1e1acceb02061197ea6745f5e090189a77dd8295f61b30ef90f390d12`. Its initial
entries expose a separate prerequisite: container storage is not an opcode
dialect. Current native CCECL treats GLIB as Gen2 opcode semantics.

Luna ran the unchanged production binary (SHA256
`27449e178945e539fa0dd31dc408ee0cabe1dd615ddfc0a55884c68166ea241c`) against an
exact private archive copy with `/ID4 /T`, without an entry override. Area16
executes LOAD_FILES at offset `0026`, consumes two operands and stops on an
apparent EXIT at `002B`. The actual bytes are `21 00 10 00 02 00 FF 37 ...`:
three operands precede LOAD_PIECES at `002D`. Area3 independently stops at `0025`
instead of reaching the following LOAD_PIECES at `0027`. Both actual runs exit
guest/host 0; their early exit is the behavioral RED, not a process failure.

A conservative CFG census from all five entry roots of 22 area members under
the Secret long-frame hypothesis has no malformed visited offsets and no 1Dh
sites. It is not proof of all computed-jump reachability or original Amiga
executable semantics. Stock asset absence cannot establish how Amiga 1Dh behaves.

## Verified native implementation

CCECL selects Secret-long only for GLIB storage plus `/ID4`. Its enum2 retains
GLIB's20-byte header/index/entry pointers while handlers and conditional skips
use long frames. HLIB and unselected GLIB retain enum1. WHO stays unsupported.
The declared contract is DOS mechanics over compatible Amiga assets, without
claiming original Amiga executable equivalence.

Secret1Dh reads one destination and stores the unsigned byte metric as a word,
preserving comparison state. Explicit diagnostic `/Z` remains frozen16-bit
invocation intent; this opcode stores its low byte. CCPARTY `/V owned.GBP
reply.GSM` derives normal live values from admitted GBPR3/catalog/STF through the
normal player-cache adapter. It neither imports loose actors nor recovers
transactions; pending party transactions reject. Create-new GBSM replies are
16 bytes/version1, including metric/count/roster extent. Hosts require exact
physical extent, full read, successful close, typed fields and child exit 0.

GBBOOT queries current P1 before execution; CCNEXT queries after settlement
for each new producer, including cold retry. Derived values travel through
ephemeral `/Z` without changing frozen GBCX presence/value. Explicit `/Z` bypasses
query IO. Compiled tails reach111 derived/113 explicit bytes, below114.

GSK3/version3 and GBNR/version3 preserve their prior binary extent/context.
Old GSK1/GSK2 authority, including known short prefixes, is rejected/preserved
before mutation. Unknown foreign candidate magic is preserved as well;
165 focused cleanup controls pass. GBRS bit2(value4) marks Secret-long semantics; onlybits0 and2
are admitted. Standalone `/R` and `/P` enforce the profile. CCFLOW preserves
that marker when adding resumable state. Exact source identity cannot alone
identify interpreter semantics.

The integrated focused pass is893 checks, exit 0. All 17 tools build: CCECL
23,614 emitted/65,205 resident/75 free, above its 64-byte floor; GBBOOT
62,106 emitted/2,918 free. Luna's actual areas16/3 now reach LOAD_PIECES at
002D/0027 and combat. The matching area16 without `/ID4` retains the002B
apparent exit. The clean integrated standing pass exits0 in 69.0s: live P0/P1 metrics74/62
agree with this original oracle, authentic cold/reference EFX and P1 match,
combat is not replayed, and repeat recovery is stable with `/Z` absent.
Final clean serial44/44 and46/46 sweeps pass with unchanged source and no
retail file writes. Full corpus passes 9,039 tests /14 skips /84 warnings
in 710.44s, exit 0. Task 243 is verified at3cc0782c (audit/gate recorda585ba15).
Task 244 WHO source/selection proof is selected; the continuous goal stays active.

## Historical implementation plan

Separate explicit title opcode semantics from GLIB storage/header handling,
audit all affected handlers and conditional skips, and preserve other titles.
Carry the same selection through CCFLOW, GBBOOT and CCNEXT. A changed interpreter
must distinguish old GSK2/GBRS authority before interpreting its cursor/flags;
source/context binding alone cannot authenticate its semantic revision. No
implicit migration of an old misdecoded state is justified.

Port the proven destination/flag behavior and derive live metrics from the
admitted current actor image. Keep explicit `/Z` diagnostic intent separate:
task241's frozen override must not freeze an HP-derived value across settlement.
CCECL has 84 free bytes with a retained 64-byte floor; plan a companion/host
calculation rather than weakening ownership or arithmetic to fit.

Evidence and advisory files remain outside source commits under
`C:\temp\GoldBox-task243-20261010`: original-1d-probe, strength-focused logs,
runtime-default-entry, runtime-area3-control, Amiga framing census, metric
dependency review and dialect design review. Task 243 remains active.
