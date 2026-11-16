# Dark Queen of Krynn DOS Combat Flow

This note records the native DOS/ASM DQK combat-flow proof. It is separate from the DQK overlay-12
tile-bank/table note because this proof is about runtime handoff and resume: host state enters DQK
`vmRun1`, queues monsters, enters tactical combat, writes combat sidecars, and resumes exploration.

## Verified Native Flow

`native/gbdqk-combat-flow-test.ps1 -Headless` now proves two DQK GBBOOT combat paths:

1. A slot-3 direct ECL path that queues combat and resumes.
2. A natural-step area-5 path that starts from persisted exploration pose `(0,1)` facing north, steps
   to `(0,0)`, derives the area-5 host rows, reaches the dragon encounter, enters tactical combat,
   writes raw combat/result sidecars, and resumes script/exploration state.

`native/ccecl-dqk-combat-test.ps1 -Headless` independently proves the direct CCECL -> CCCOMBAT ->
CCECL `/R` chain for the same area-5 encounter and now pins the continuation PCs. The fresh
verification commands passed on 2026-07-13:

```powershell
native\gbdqk-combat-flow-test.ps1 -Headless
native\ccecl-dqk-combat-test.ps1 -Headless
```

Result:

```text
RESULT: GBBOOT DQK /E slot-3 and natural-step combat/resume flows PASS
RESULT: CCECL+CCCOMBAT DQK area-5 queued and natural-E5 encounter combat/resume PASS
```

## CORRECTION 2026-09-05 (round 37 R4) — every `count=0002` below is a STALE LEAK, not retail behaviour

**Read this before trusting any monster-count figure in this note.** The `count=0002` pinned twice
below was **never obtainable from retail DQK data**. Area 5's dragon count is ECL word `0x00C2`,
which the retail script computes with `RANDOM #3` followed by `ADD #3` — so the only values the
original game can produce are **{3, 4, 5}**. Two is outside that set entirely.

Where the 2 came from is documented on this very page: `derive_dqk_handler_state` in
`native/src/ccecl.asm` (see "Native Bridge Labels") explicitly sets `[0x00C1]=3` and `[0x00C2]=2` as
**CCECL's own host seed** for the direct `/@` handler-mode entry. Before commit `e3ce79f`, a
long-`PARLAY` framing desync let that host seed survive into the natural-step path and be read back
as the encounter's monster count. The measurement was reading the harness's own input.

`e3ce79f` made `0x22` zero-operand in area 5, which fixed the desync. The natural route now runs the
real `RANDOM`/`ADD` and the flow tests observe **`count=0004`**, which is in range.

**Two sentences that stood here earlier today were wrong, and both are corrected below rather than
deleted, because what they got wrong is more useful than what they were trying to say.**

*First error — the guard's coverage was overstated.* The original text said
`native/gbdqk-playable-flow-test.ps1`, `native/gbdqk-create-test.ps1` **and**
`native/gbdqk-multistep-flow-test.ps1` "now carry" the range guard. That was true of exactly one of
the three when it was written: round 37's R4 added the guard to `native/gbdqk-create-test.ps1` (the
`foreach ($w in @(@('00C1', 5, 9), @('00C2', 3, 5)))` block) and nowhere else.
`native/gbdqk-playable-flow-test.ps1` had only *comments* mentioning those two ECL words, and
`native/gbdqk-multistep-flow-test.ps1` had no occurrence of either word at all. The accurate
statement, as of 2026-09-05:

- **`native/gbdqk-create-test.ps1` — carries the guard** (R4, this round).
- **`native/gbdqk-playable-flow-test.ps1` — carries the guard**, ported from create-test in the same
  round, immediately after `$naturalCombat = Get-Content ... DQKPC.TXT` and ahead of the
  `foreach ($needle ...)` block holding the literal. Both files also cross-check the emitted dragon
  count against the ECL word `0x00C2` it is read from, so the count is tied to a derived value
  rather than only to a literal.
- **`native/gbdqk-multistep-flow-test.ps1` — carries no guard, and correctly so, but not for the
  reason first given here.** The sentence originally written in this bullet claimed it "does not
  read an effect dump at all". **That is false and was checked afterwards rather than before:** it
  reads several, with `MEM key=` needles for `0011`, `001B`, `0111`, `0112`, `0034`, `0035`, `0097`,
  `009C` and `00CA`, and it runs area 5 twice (`GBBOOT /E /T 1 /A 5` and `/E /T 3 /A 5`). The
  correct reason is narrower and is what actually decides the question: it has **zero `MONSTER`
  needles** and no `count=` monster literal anywhere, because its route through area 5 is the
  ship-gate/fisherman path (`MEM key=00CA value=000D` / `000C`), not the dragon encounter. There is
  no literal for a guard to backstop, so the guard would have no subject.

  Stated as a limit rather than a conclusion: **whether that route executes the dragon branch's
  `RANDOM`/`ADD` pair at all was not measured for this correction** — nobody has run multistep and
  looked for `MEM key=00C1` in its dumps. Adding the range guard there without that measurement
  would risk a check that fails because the words were never set, which is a different failure from
  the framing regression the guard exists to catch. **It is not missing a guard; it is out of scope
  for one, and confirming that costs one run nobody has spent.**
- `native/ccecl-dqk-vmrun-test.ps1` is still unguarded and still wrong — see the paragraph below,
  which leaves it to round 38 deliberately.

*Second error — `count=0004` was called "RNG-dependent", implying the literal is flaky and that the
range guard exists to tolerate that. It is not, and it does not.* `native/src/ccecl.asm:1443`
(`vm_reset_all`) seeds `rng_state` with a hardcoded `0x00001234`, and the only other two writers of
`rng_state` (`apply_persistent_state`, `apply_resume_state`) restore it from a persisted `GBRS`
word that itself descends from that same seed. The draw is therefore **deterministic per build** —
corroborated by `native/gbdqk-playable-flow-test.ps1` pinning the exact post-combat state
`rng=1DE921E7`, which no nondeterministic RNG could support.

So the guard's real value is not tolerance of randomness — it is that it **catches a framing
regression**. `[0x00C1]` and `[0x00C2]` are checked against the ranges the retail script's own
`RANDOM`/`ADD` pairs can produce, and CCECL's host seeds (`3` and `2`) fall outside both. Any future
desync that lets a host seed leak into the dump fails the guard *even if the literal count happens
to still match*, and `0x00C1` is pinned by nothing else in either file, so it is a live check on the
operand stream reaching those pairs at all. That is a strictly stronger argument than "the value
might vary", and it is the one to make.

The derivation was re-verified against the retail bytes for this correction. In
`The Dark Queen of Krynn\DISK3\ECL.GLB` (block offsets; add `0x5860` for file offsets; operand
encoding `00 <byte>` = immediate, `01 <lo> <hi>` = address):

```text
1167: 08 00 05 01 c1 00              RANDOM  #5, [0x00C1]
116D: 04 00 05 01 c1 00 01 c1 00     ADD     #5, [0x00C1], [0x00C1]
1176: 08 00 03 01 c2 00              RANDOM  #3, [0x00C2]
117C: 04 00 03 01 c2 00 01 c2 00     ADD     #3, [0x00C2], [0x00C2]
119B: 0b 00 2e 01 c2 00 00 2e        LOAD_MONSTER #0x2E, [0x00C2], #0x2E
```

`op_random` (`native/src/ccecl.asm:2139`) computes `rng % range`, i.e. `{0..n-1}`, giving
`[0x00C1] in {5..9}` and `[0x00C2] in {3,4,5}`; the dragon group's count operand is `[0x00C2]`
itself. A live run on 2026-09-05 observed `[0x00C1]=0x0006`, `[0x00C2]=0x0004` and
`count=0004` — in range, and matching.

**Closed 2026-09-12.** `native/ccecl-dqk-vmrun-test.ps1` was re-derived from the
same retail member. Its current natural slot-3 route observes `C1=6`, `C2=4`,
and the two matching group counts. It now locks the retail RANDOM/ADD byte
sequence above, requires `C1 in 5..9` and `C2 in 3..5`, and checks each emitted
monster record against its source quantity. The exact 6/4 observation is
deterministic for this engine build, but it is inside the retail-generatable
sets and is not a surviving direct-entry seed.

There is a second, independent and still-unverified suspicion against
`native/ccecl-dqk-combat-test.ps1`: it pins `id=0025 count=0004` together with `GBEC groups=0001` and
`TEXT=DRAGONS`, yet `0x25` is the UNDEAD branch, which loads two groups. The suspected mechanism is
that `op_partystrength` calls `set_cmp_flags` and clobbers the `COMPARE` that selects the branch
text — i.e. area 5 may print DRAGONS while spawning undead. **Suspicion only; nobody has run it.**

## Area-5 Natural-Step Anchors

The natural proof is in `native/gbdqk-combat-flow-test.ps1`:

- `GBBOOT /E /T 1 /A 5` launches DQK area 5 through the native `/E` path.
- The test seeds the session pose as `(x=0, y=1, facing=north)` with `Set-Session 0 1 0 10 10`.
- The generated `_GBSTEP.BIN` must show a north step into `(0,0)`.
- The `vmRun1` dump must include host/runtime values:
  - `MEM key=0023 value=0003`
  - `MEM key=0111 value=001E`
  - `MEM key=0112 value=0003`
  - `MEM key=00CB value=0005`
  - `MEM key=00CA value=000E`
  - `MEM key=00CC value=00E5`
- The combat dump must include:
  - `GBEF v0009 flags=0069 status=0003 geo=0002 chain=FFFF`
  - `GBLF operands=0002 0000 0000`
  - `GBEC groups=0001`
  - `@00 MONSTER id=002E count=0002 pic=002E` — **STALE: `0002` is the leaked host
    seed, not a retail count. See the CORRECTION above.**
  - `GBRS flags=0001 area=0005 pc=11D0`
  - `#00 OP=12 PRINTCLEAR ARGC=01 ARGS= 0006 TEXT=DRAGONS`
  - `#01 OP=11 PRINT ARGC=01 ARGS= 0006 TEXT= ATTACK!`
  - `MEM key=00CC value=00E5`
- The native combat bridge must write `_GBCOMB.RAW`, `_GBCOMB.TRC`, `_GBCOMB.OUT`, `_GBCR.BIN`, and a
  compact `_GBECL.WGR` Greybox CCGEO/CCCOMBAT bridge wall-grid sidecar. This WGRD sidecar is a native
  preview bridge, not evidence that this route executed DQK's original `DungCom1` / `WildCom1` 50x25
  combat-map setup.
- The tactical trace must include the persisted QSV party state, including `MAIGUREIGNE` at the
  expected damaged HP state.
- The outcome sidecar must be `party`.
- The resume dump must include:
  - `GBEF v0009 flags=0000 status=0000 geo=FFFF`
  - `GBRS flags=0000 area=0005 pc=11DC rng=1DE921E7 callsp=0000`
  - `MEM key=0011 value=0000`
  - `GBSX count=0000`

The direct CCECL dump confirms the same continuation boundary without the GBBOOT movement wrapper:

```text
GBEF v0009 flags=0069 status=0003 geo=0002 chain=FFFF
GBEC groups=0001
@00 MONSTER id=002E count=0002 pic=002E   ; STALE leaked host seed - see CORRECTION
GBRS flags=0001 area=0005 pc=11D0 rng=1DE921E7 callsp=0000
#00 OP=12 PRINTCLEAR ... TEXT=DRAGONS
#01 OP=11 PRINT ... TEXT= ATTACK!
#02 OP=1D PARTYSTRENGTH ... metric:00F0 threshold:0000
#03 OP=23 SURPRISE ... result:0002
#04 OP=27 TREASURE ...
```

Then `CCECL /R` resumes from the saved continuation and exits at:

```text
GBRS flags=0000 area=0005 pc=11DC rng=1DE921E7 callsp=0000
```

`native/src/ccecl.asm` writes these `GBRS` fields in `write_effects`: when `vmstat == 3` it sets
`fx_resume_flags=1`, copies the current `[area_id]`, and stores the interpreter `[pc]` into
`fx_resume_pc`. So `pc=11D0` is the native interpreter's post-`COMBAT` continuation point for the
handoff, and `pc=11DC` is the post-resolution resume point after the outcome sidecar is applied.

## Native Bridge Labels

The current clean-room/native proof is not a decompile of `DQK.EXE`, but it does pin the Greybox
runtime bridge points that reproduce the original area-5 handoff:

- `native/src/gbboot.asm` `prepare_dqk_step_host_state` maps the natural area-5 step into
  host-owned CCECL sparse-memory rows: `[0x0023]=3`, `[0x0111]=0x1e`, and `[0x0112]=3` for the north
  step into `(0,0)`.
- `native/src/gbboot.asm` `detect_dqk_natural_handler3` recognizes the vmRun result by requiring area
  `5` plus CCECL sparse rows `[0x00ca]=0x000e`, `[0x00cb]=0x0005`, and `[0x00cc]=0x00e5`.
- `native/src/ccecl.asm` `derive_dqk_handler_state` turns those rows into the slot-3 encounter state:
  `[0x0112]=0x0010`, `[0x00c1]=0x0003`, and `[0x00c2]=0x0002`. **Still true of the code as of
  2026-09-05** (verified by reading `native/src/ccecl.asm:1607-1637`), and it is the source of the
  stale `count=0002` recorded above — these are host seeds for the direct `/@` handler-mode entry,
  and this note says so itself: "These keys are not original DQK.EXE DGROUP offsets."
- `native/src/ccecl.asm` `op_combat` sets `vmstat=3`, stops execution, and leaves `[pc]` at the
  post-`COMBAT` continuation that `write_effects` records as `GBRS pc=11D0`.

The static retail ECL anchor remains `area 5 COMBAT vaddr 0x91cf`; the native bridge currently exposes
the runtime continuation PC (`11D0`/`11DC`) rather than a direct original-stream opcode field. Do not
claim that this path hits DQK `DungCom1` / `WildCom1`; those consumers remain separate runtime anchors
tracked in `decompile-dqk-ecl-dispatch.md`.

## What This Proves

- DQK has a local, headless, natural-step non-empty monster combat proof. The path is not only a forced
  descriptor or direct subroutine harness.
- GBBOOT can seed DQK area-5 exploration state, run the native `vmRun1` host path, queue a real
  encounter roster, enter CCCOMBAT, write a nonblank RAW combat snapshot, emit GBCR combat-result data,
  and resume native script state.
- The concrete roster for this fixture is monster `0x002E x2` with picture `0x002E`, announced by the
  shipped `DRAGONS ATTACK!` text.
- The native ECL continuation is now pinned: combat yield stores `GBRS pc=11D0`; post-combat resume
  exits at `GBRS pc=11DC`.
- This supersedes older broad statements that DQK lacks any natural non-empty combat/resume proof.

## What This Does Not Yet Prove

- It does not prove the web DQK walking path can naturally reach the same fixture; this is a native
  GBBOOT/CCECL/CCCOMBAT proof.
- It does not identify the full DQK combat-map population routine or the code that loads
  `DungCom1`/`WildCom1`; that remains tracked in `dqk-overlay12-combat-setup-cluster.md`.
- A staged original-`DQK.EXE` area-5 loaded-save trace is now useful as a negative guard: the old
  physical `28d0:0000` hook produced apparent `cell-writer-entry-file-02bcf0` hits, but byte validation
  showed those were overlay-memory aliases into party-menu code at live `389c:0340`. The validated hook
  writes zero dump rows for that run, so this native proof still must not be cited as original
  `[bedb]+9` surface recovery.
- A later original-`DQK.EXE` area-5 loaded-save trace does prove the QSV/current-record transfer layer:
  `SAVGAMA.QSV` writes `rec+13=0x05`, `rec+24=0x00`, `rec+25=0x00`, `rec+26=0x00`, and active
  pose-like globals `c9f0=0x07`, `c9f1=0x0d`, `c9f2=0x00`. That is still only a negative guard for
  original tactical setup: it reaches the Palanthas/menu `[ca03]` context, not a top-level `0x24`,
  `DungCom1`/`WildCom1`, or an accepted `[bedb]+9` combat-map dump.
- The native `MEM[0023]`, `MEM[0111]`, `MEM[0112]`, `MEM[00ca]`, `MEM[00cb]`, and `MEM[00cc]`
  values are CCECL logical sparse-memory keys, not original DQK DGROUP offsets. They are good
  clean-room/native host-state labels, but poking those offsets into original `DQK.EXE` DGROUP would
  create synthetic state rather than source proof.
- It does not resolve area 23's missing GEO map/source or the special empty-roster temple/service
  dispatches in areas 18/58.
- It does not prove binary equivalence between DQK's Gen2 combat setup and CoAB's
  `SetupDungeonFloor()` / `SetupWildernessFloor()`.

## Follow-Up

- Promote this native proof into the broader DQK/web source map without claiming browser parity.
- Use the area-5 host values as clean-room/native labels when searching for original DQK runtime
  equivalents. Watch confirmed original globals first: `[ae5c:ae5e]`, `[b7f9]`, `[b1c7]`,
  `[bedb:bedd]`, `[ca03]`, and byte-validated setup/render anchors.
- Continue DQK overlay-12 xref work to tie `DungCom1`/`WildCom1` and the carved `BackGroundTiles` runs
  to the map-population routine.
