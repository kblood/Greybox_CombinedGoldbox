# CoK Task 155 — source the AEC9 setup-helper pointer

## Scope

Trace the caller arguments and stack assumptions for the bounded-copy helper
call at `GAME.OVR:0x3BC5E` on the `0xAEC9 -> FDF2 -> 3CEBC` setup path. Identify
where both far-pointer arguments come from, how `SS` is established or
preserved, and whether the null second pointer observed by the synthetic probe
follows from the zeroed `DS:6DA2` graphics-resource table or from a separate
missing producer. Stop at the first unsourced indirect input.

## Starting evidence

The headless direct-entry probe marks the held party as synthetic, leaves
`DS:4B28/4B2C` untouched, reproduces the source-backed startup clear of
`DS:[6DA2,6DE4)`, and stops at an uncovered read before `F1C3/F273/F991`.
The separate stack-segment sensitivity trace reaches `GAME.OVR:0x3BC45`,
where code reads `SS:[DI+0x1E]`; its altered-segment path later reaches
`START.EXE:0xAF43`. There the START helper reads source and destination far
pointers from its stack frame. For that synthetic continuation, the first call
uses source `5000:6DA2`; a later caller at `GAME.OVR:0x3BC63` returns to
`0521:0B0A` with a 0x28-byte limit, destination `5000:EEAF`, and source
`0000:0000`. Its enclosing synthetic frame contains `5000:6DA2` at
`BP+6/+8` and `0000:0000` at `BP+0xA/+0xC`.

These values locate the fixture's null but do not identify the retail
producer, production `SS`, runtime `DS:6DA2` contents, or a natural invocation.
Task 118's captured menu state is not to be spliced into this direct entry.
No DOSBox or GUI is used.

## Caller and argument trace — 2026-09-28

The helper call in the disassembled routine is `GAME.OVR:0x3BC5E`; `0x3BC63`
is its return instruction address. However, the claimed path
`0x3CEBC -> 0x27F:0x1CF6 -> 0x3BB63` is retracted. Existing Task 128 work maps
`0x27F:0x1CF6` to the resident free routine at `START.EXE:0x44E6`, and the
call at `0x3CEF7` returns to `0x3CEFC`, not `0x3BC63`. `0x3CEBC` does walk
FDF2's optional-resource entries and invokes that free routine on each
selected buffer, but this does not source the observed `0x3BB63` frame.

FDF2 contains a separate call to `0x521:0x353` at `0xFE59`, returning to
`0xFE5E`. The synthetic probe's BP-chain snapshot instead reports a helper
return at `0x3BC63`, with the next saved frame return mapped to `0xFE07`.
That snapshot alone does not prove how execution reached `0x3BB63`, and it
does not match the direct `0xFE59` return site. The route/frame attribution
must be resolved before assigning the optional-resource record at `0x3CEBC`
as the source of the `0x3BB63` arguments.

At `0x3BC5E`, the caller pushes a literal zero at `0x3BC56..0x3BC58`, the
byte read from `SS:[DI+0x22]` at `0x3BC4E..0x3BC55`, the local byte at
`[BP-9]`, the byte from `SS:[DI+0x1E]`, then the selected `ES:DI` at
`[BP-4]`. Separately, the START helper at `0xAF43` interprets its stack as
limit at `+4`, destination far pointer at `+6/+8`, and source far pointer at
`+0xA/+0xC`. The instrumented synthetic frame at that helper observes limit
`0x28`, destination `5000:EEAF`, and source `0000:0000`.

Those two views do not currently reconcile: reading the direct caller's push
sequence as an ordinary far-call frame does not yield the observed START
helper arguments. The `0x27F:0x1CF6` dispatch is VROOMM-mediated, so the
missing bridge may be in thunk/dispatcher stack handling or in the attribution
of the observed helper frame. Do not identify the `+0x22` byte as the actual
source segment until that bridge is traced. The observed null remains a
synthetic helper-frame value only.

The first unresolved boundary is the call/frame attribution between the
`0x3BC5E` caller, the `0xAF43` helper frame, and FDF2's separate `0xFE59`
call. The optional-resource table at `DS:0x6DA2` is a distinct path through
`0x3CEBC`; its successful producer and runtime SS identity remain open. No
source evidence ties the observed synthetic null to the table clear, and no
natural invocation or production stack value is proved.

This closes the bounded inspection of the `0x3BC5E` instruction sequence but
leaves the helper call/frame attribution unresolved under Task 150. Task 156
must establish which call site produced the captured `0xAF43` frame and trace
its ABI before assigning source-pointer provenance. The successful table
writer, its caller/condition, and segment identity at FDF2 also remain open;
do not use the synthetic zero as a retail value.

## Task 156 result — selector binding boundary

The far calls at `0x3BC5E` and `0xFE59` both encode selector/offset
`0x521:0x353`. The repository's earlier live trace records that same selector
and offset resolving to runtime `0D45:0353`, a text-formatting routine. That
trace is from a separate runtime point; VROOMM selector `0x521` is dynamically
reassigned, so it cannot establish the target at the AEC9 setup call. The
generic static resolver also leaves `0x521` outside validated stub geometry.

The focusless probe reaches bytes labelled `START.EXE:0xAF43`, whose code has
a bounded-copy-shaped ABI, and its saved BP chain reports `0x3BC63` then
`0xFE07`. However, without the selector's route-local binding, those bytes
cannot be attributed to the encoded call as retail control flow; nor does the
BP chain prove the omitted `0x3CEBC` free call was the parent. Thus the
captured `limit=0x28`, destination `5000:EEAF`, and source `0000:0000` remain
fixture observations, not sourced arguments to either CoK call site.

Task 156 closes bounded at the route-local selector binding. Task 157 now
traces the descriptor/fixup or resident-dispatch state that assigns the
`0x521:0x353` target at this route. Do not reuse the separate `0D45:0353`
live binding or the synthetic `AF43` target as the AEC9 target without that
join.

## Task 157 result — both call operands are relocatable

The call at `0x3BC5E` is in the descriptor whose OVR code range is
`0x3AE3F..0x3C737`. Its segment word is at descriptor-relative fixup offset
`0x0E22`, and that offset is present in the parsed relocation table. FDF2's
call at `0xFE59` is in the descriptor range `0xE19A..0x10004`; its segment
word is at relative offset `0x1CC2`, also present in that descriptor's fixup
table. Both encoded `0x521` words are therefore relocation inputs, not
statically established runtime selector assignments.

The verified VROOMM report classifies selectors outside inferred public-stub
geometry as `unresolved_relocated_segment`; `0x521` is outside that geometry.
An exact inventory finds 207 `LCALL 0x521:0x353` fixup sites across 20 CoK
descriptors, and all 207 remain `unresolved_relocated_segment` in the report;
the two setup-path sites are among them. This shared call shape supports
treating `0x521:0x353` as a dynamically routed helper family, but does not
establish the target for this route. The descriptor fixups alone do not
identify the target segment or the code at `0x353`. Task 157 closes bounded
here; Task 158 traces that manager assignment without importing the separate
`0D45:0353` runtime observation into this route.

## Task 158 result — probe leaves the external fixup unresolved

`tools/probe_cok_combat_setup.py::relocated_code()` rewrites only segment words
equal to the current descriptor's own segment. Its comment explicitly says
external VROOMM selectors are preserved for dispatch through the original
stub. The `0x521` words at the two setup-path calls are external relocation
entries, so this probe does not apply a route-local target to either call.
Consequently, the probe's later `START:0xAF43` stop is not evidence that
retail `0x521:0x353` targets that helper or receives the observed
`0000:0000` source pointer.

Task 158 closes bounded at this emulator limitation. Task 159 should make the
probe classify unresolved relocated calls explicitly and stop before treating
the raw selector as a resolved target, unless a source-backed mapping is
provided. No target mapping or retail null provenance is claimed.

## Acceptance

- Record the direct push sequence at `0x3BC5E` and its return at `0x3BC63`.
- Identify the mismatch between that sequence and the observed helper frame,
  and stop before assigning source-pointer provenance.
- Keep the synthetic stack state distinct from retail `SS`/`DS` state and
  from the optional-resource table producer.
- Update Task 150/155 without claiming FDF2 completion or effect-7 output.

## Task 159 result — stop before unresolved `0x521` calls

The probe now scans each loaded descriptor's relocation entries for `LCALL`
words whose selector is `0x521`. Before executing a matching call, its code
hook stops and reports the OVR callsite, selector/offset, CS:IP, SS:SP, and
the top eight stack words. The first reached call is
`GAME.OVR:0x3BC5E -> 0x521:0x353`; the run no longer enters the raw target or
reports the synthetic `START:0xAF43` uninitialized read. This is a safer
fixture boundary, not a resolved retail route.

The focused probe/overlay/EXEPACK set passes 54 tests. The reviewed native
no-launch manifest passes 89 tests in 16.55s. Unicorn still emits the known
Windows `mem_map` access-violation diagnostic during fixture construction;
the process exits 0 and the tests pass. No DOSBox or GUI was launched.

## Task 160 result — classify external relocated calls by installed target

The probe's classifier now treats a far call as resolved only when its target
is a public stub offset for an overlay that the fixture actually loaded and
patched, or when the selector/offset pair has an explicit source-backed
resident mapping. Self-segment fixups remain local. Every other relocation-backed
far call is installed in the pre-execution stop map.

The regression builds the loaded-stub map from the actual descriptors. It
confirms `0x105:0x4D` is a patched stub and remains executable, while
`0x128:0x7E6` and `0x521:0x353` are unresolved; the mapped resident
`0x27F:0x1CF6` route remains allowed. The full probe still first reaches
`GAME.OVR:0x3BC5E -> 0x521:0x353`; the classifier's static detection of
`0x3BB9A -> 0x128:0x7E6` does not mean that site was reached in the probe.
Its stop report preserves CS:IP, SS:SP, and eight stack words, and both
uninitialized-read fields remain null.

The focused probe/overlay/EXEPACK set passes 55 tests. The reviewed native
no-launch manifest passes 89 tests in 14.62s. Unicorn still emits the known
Windows `mem_map` access-violation diagnostic during fixture construction;
the process exits 0 and the tests pass. No DOSBox or GUI was launched.
The documentation claims/prose gate passes 37 tests in 75.69s.

Task 160 closes bounded at the exact-target classifier.

## Task 161 result — static evidence does not bind the AEC9 target

An initial scan of the unpacked retail `START.EXE` finds four direct far calls
whose encoded selector is `0x0521`: two call `0x00B7`, one calls `0x0071`, and
one calls `0x00A0`. None encodes offset `0x0353`, and the scan does not expose
the runtime assignment for the AEC9 call. These calls establish that START
also uses selector `0x0521` for several entry offsets; they do not establish
that those offsets share a module or that any one is the AEC9 target. The
current static/headless evidence therefore still ends before the route-local
binding. The fixture itself confirms why:
`tools/probe_cok_combat_setup.py::run()` bypasses startup, maps the caller
directly, loads selected descriptors itself, places the first at `0x8200` and
dependencies at synthetic sequential segments beginning at `0x8400`, then
patches their public stubs. It does not execute the retail VROOMM manager or
capture its selector table. Task 161 closes bounded at that fixture boundary,
without claiming the selector target was found.

Task 162's separate synthetic manager harness is deferred and folded into
Task 148: if its original loader/dispatcher run reaches `GAME.OVR:0x3BC5E`, it
will capture the route-local `0x521:0x353` mapping before changing the
unresolved-call guard. The updated documentation claims/prose gate passes 37
tests in 76.54s. No DOSBox or GUI.

## Task 192 correction — loader-backed helper binding

The unresolved target statement above is superseded for the static binding:
the original loader at START image `0xA168..0xA1D8` adds resident START's load
segment (`DI`, initialized from `DS:0x43A8`) to every overlay fixup word.
Both `0x3BC5E` and `0xFE59` carry those fixups, so `0x521:0x353` maps to
START image `0x5563`, whose six-word frame matches the direct `0x3BC5E`
caller. The target's nested `A46:0x0ADE` call returns through
`0521:0x036E`, matching the first synthetic `AF43` helper observation
(`limit=0xFF`, source `5000:0x6DA2`). The null-source observation returns
through `0521:0x0B0A`, a different caller; it is not evidence of the direct
call's retail source argument. Both observations remain synthetic and do not
prove natural reachability, held-party continuity, or retail pointer values.
Task 193 now owns the original loader/dispatcher runtime join; keep the
probe's unresolved-call guard until that route is captured. Full byte and
argument evidence: `cok-task192-relocated-setup-helper-2026-09-28.md`.
