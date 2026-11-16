# Champions of Krynn: original Create → Pick Race

## Accepted starting point

The menu-source checkpoint is `0db2968f`: 18,564 original instructions / 46,624 bytes, 122 passing Rust tests, and a finite original startup/Play/Create run with complete input receipts. The run stops before original Create at runtime `4A14:06DD`, work16,009,305, fault0. Its final catalog proves source descriptor `00A4`, generation5, body_identity=true; all196 input pins were unchanged. See [menu evidence](cok-module46-menu-lift-plan-2026-10-14.md). The tested binary remains the frozen isolated candidate; the production-path binary was not rebuilt.

The next phase's source is approved and original-derived generation has passed. Compilation and runtime remain pending; it is **not implemented or tested in production**. It advances the full playable-game goal to the first character choice; it does not complete character creation.

## Exact admission

Add a separate `create_race` phase after the unchanged `module46` phase. Admit only descriptorA4/module46 window **[06DD,0884)**: **164 instructions / 423 bytes**, reaching all bytes from root06DD. New total: **18,728 / 47,047**. Preserve the entire preceding instruction array, all earlier preparers/fixtures and historical stop provenance.

Original GAME.OVR SHA256 is `c3f448c391ea860f97dec99ce88b0b8b0a4a7e807cf3b1f5a8f1515e2a7a0529`. Module46 starts at file offset131,593; the proposed window is file[133350,133773), SHA256 `25ed7a2c602b0151c24d8f1435caeaf2b76a256f879464e4ed8431a8289c4fbf`. Its descriptor has 26,568 code bytes, initializer67C3 and461 relocation words.

All twelve far calls reuse admitted bodies: resident0A46 entries023F,1661,1179,0ADE,0AC4,0B51 and FD entries000F,17EE,1368. No additional callee, indirect dispatch, interrupt or near-call root is needed. No CPU/device/ABI change is planned.

The twelve module-relative relocation intersections are exactly decimal:

```text
1771,1794,1925,1956,1983,2009,2031,2052,2066,2112,2127,2178
```

Each is the segment word at far-call IP+3: nine raw0A46 and three raw00FD; no new resident MZ intersections. The effective stop ledger retains19 entries, replacing only A4:06DD with **A4:0884**. Keep the earlier `module46_menu.stop_ledger` unchanged as historical provenance. Do not admit nearby Pascal data064E–06DC, FD167A, or instruction0884.

## Original behavior

Create06DD saves BP and reserves its original0258-byte stack frame, allocates/clears its0199-byte character record through existing original helpers, initializes fields and constructs the race menu. A4:064E supplies the original Pascal “Pick Race” title. Seven original16-byte Pascal fields at DS:1140 supply Silvanesti Elf, Qualinesti Elf, Half-elf, Mountain Dwarf, Hill Dwarf, Kender and Human. Labels, rendering and selection remain original-code behavior.

A4:087F calls already admitted FD:1368, the shared menu helper observed rendering the preceding menu. Stop at0884 immediately after its return, before storing AL to the local selection result or applying race-specific record changes. Gender/class and downstream character creation remain separate tasks.

## Source and test gates

Sol prepares a portable independent original-derived fixture/helper and a fresh source freeze. Generation must compare every baseline/new tuple, exact source/window hash, descriptor/stub identity, twelve fixups and the current/historical stop distinction. Focused mutations must reject changed bytes, duplicate/midpoint/missing tuples, wrong identity/fixups, old-entry changes, data/code confusion and admitting0884. Normal generation must not read historical staging inventories.

Retain the122 tests, changing only the final-runtime06DD exclusion to a positive owner assertion plus0884 exclusion. Three proposed new tests give125, **not yet executed**: original prologue budgets1/2/3, actual LES06F3 SS-local success/released-second-word atomicity, and new-root code/stub/relocation/generation guards at load bases0 and1000. Static review corrected the budget-two expected IP to06E0: PUSH at06DD ends06DE, MOV89E5 ends06E0, SUB81EC5802 ends06E4. A cleared descriptor cell is an explicit transport fixture, not proof of an actual DOS free operation.

Luna owns generation, compilation and test/runtime execution after source review and a bounded lease. Preserve the existing three-key startup cohort `[[14500121,7181],[15000000,6480],[16000000,7181]]`. Capture the actual Pick Race screen and current owner mapping; then use a selection supported by the observed prompt. If necessary, derive a fourth scheduled Enter from that first observation. Require both queue admission and actual BIOS consumption, final current-ownerA4:0884/status1/fault0, complete outputs and unchanged pre/post input pins. Do not let unattended polling fill the BIOS output cap. The chosen race has not been applied at0884.

## Plan provenance

Astra's read-only source plan is local `build/cok-recomp/staging/intro-compare/module46-create-race-astra-plan-20261015.md`, SHA256 `6e8c96fffe15c130c683e24cd3d9296ba8826c929be14229893282e2552c9d66`. Actual acceptance, generated totals and new test counts must be updated from execution evidence before promoting this next phase.

## Observed generation — 2026-10-15

The separate frozen core `create-race-admission-sol/source-freeze.json` (`39fb96e732dd550523c9a9c34834c6b92b9cff2f32debf48983a2a262bb84d81`) and corrected Rust test v2 (`84eb5eaa1d7341189f5d3b6279a53cb3a9a761de1dea48a4596aa53acef4a2cc`) passed Astra's source review. The only fixture correction was the prologue budget-two IP06E0 described above; superseded v1 remains preserved. No CPU/device/emitter behavior changed.

Actual run `build/cok-recomp/staging/intro-compare/create-race-admission-20261015-01/` exits zero in **62.2732 seconds** under its private2GiB/900s job. Assignment/resume succeeded; all35 owned processes are finished, active0, with peak job committed memory275,980,288 bytes. All100 input pins and the configuration remain unchanged. Its **25 passing cases comprise22 regular controls and3 assessor inversions**. Generation produces exactly22 files and the planned **18,728 instructions /47,047 bytes**, retaining the full18,564/46,624 baseline and historical module46 proof. Root independently compares every prior instruction record, including assembly text, confirms the22 artifact names and both literal GEO output/payload bindings, and records acceptance as generation-only.

Evidence hashes: terminal `243a6a3fc5e209481a75f3f7f87116ee553fb9e2a320bf7a0ae898494504c835`; controls `e6ee6bc794c255cc867a44372bc97ba3f968e88648af07dcc364b2221d1b3cbc`; manifest `45db308023e644126fd7f19c309888358f4d8a8aa026586fa1cfa8427534925a`; Luna's22-file/GEO audit `824415dab231fdf9b5d1fdb87604584fbc12c2b1d0006c33018d9859de9d8f32`. Root's `create-race-root-acceptance-20261015/root-generated-admission.json` is `6c972f35a209331f9bec7ca0b86fca40429a0861902d549ee668c08e57d2b837` and explicitly sets runtime_verified=false.

The separate candidate `rust/cok-recomp-create-race-candidate-20261015-a` contains136 own-source files assembled from132 tracked sources and the approved additions/overlays. Its initial build-input freeze is `create-race-root-acceptance-20261015/root-build-inputs.json`, SHA256 `e4c971ab7f938da0f3f005c88b08379461912d95bf8bc71f024519f1628eea43`. The specialized build harness is source-reviewed, but **no CreateRace build,125-test result or Pick Race runtime result exists yet**. Require the finite outer build lease, actual compiler/test exits and exact measured=0 result inspection before accepting compilation. Production remains the verified module46 checkpoint.

## First compile attempt: preserved MSVC failure

The fresh `/O2` build in `create-race-build-run-20261015-a/` fails with Cargo exit101 before any Rust tests run. Exact MSVC19.39.33523 reports C1002, “compiler is out of heap space in pass2”, at generated lifted.c line28. That line begins the large protected-range function. Astra confirms this function is unchanged from the successfully compiled predecessor; the164 new instructions alone are not an established cause. Failed-build receipt SHA256 is `c3881ffc74c56325d5443a79f3988ee333c97bbb445d960b3560bd454e839380`, compiler log `c85eab9e926de45db9deb4f872d4710c110b682e7d74606dc2ecc2989fe5ba18`. The inner worker records its candidate/freeze/generated postchecks. The outer private Job remains separately pending while a residual process may be alive; no complete outer accounting or new test pass is claimed.

The next approved source-only experiment changes build.rs, compiling generated lifted.c separately with explicit MSVC `/Od`, while retaining release optimization for handwritten guest/device C. All22 generated files,125-test sources, ISA, state/device behavior and guards stay unchanged. It requires a fresh candidate/target, actual compiler-command evidence,125 passing tests and a finite runtime performance/behavior pass; `/Od` is not assumed to preserve acceptable interactive performance. A separate narrow Job lifecycle plan will detect worker exit independently of residual members, record owned Job PIDs/peaks, and allow bounded cleanup only on the existing private handle after verified final postchecks. The current live Job and failure history remain unchanged.

The first outer Job has now terminated at its900-second deadline: worker exit101, outer launcher exit1, timed_out=true, error “private job deadline”, elapsed900.0442s. All468 outer pins still match. Peak Job memory and final Job accounting are unavailable on this terminal path and must not be inferred from a process sample. Terminal SHA256 is `1dbb6acb6d0fa57b7837d60b649e57aa07884156b8d22d9223a9c2de139862bd`. All previously observed worker/compiler/wrapper/helper PIDs are gone; the helper's actual Job membership was not directly captured.

Fresh candidate-b contains136 files and differs from candidate-a only in build.rs, SHA256 `cac9c596273c060769630366ff1a5bea00daa4d3cde72689b0712aa4beb55483`. Its separate input freeze `create-race-od-root-acceptance-20261015/root-build-inputs.json` is `f720906a9d0da30eaa90006b364c4c296e28cc0d32071eb84ecc3395bd200a53`; all seven declared compiler flag environment variables are absent/null. Astra approves this source-only experiment in review `ddbc78942d77ec1c09fc5f91ddfce8f0bf596f4ccf3a4e8bf74c6bf175b3f7b1`. A new build remains pending the reviewed lifecycle adapter and explicit execution lease; the failed candidate, generated bytes and failure evidence stay immutable.

## Actual compiler recovery and 125 tests

The separately reviewed proven-wrapper specialization executes exactly one fresh experiment in `create-race-build-od-proven-run-20261015-b/`. The release build exits **0**, taking approximately65 seconds. Saved actual compiler commands show generated lifted.c with explicit `/Od` and no later optimization override, while handwritten release guest/device helpers retain `/O2`. Cargo test exits **0** with **125 passed, 0 failed, 0 ignored, 0 measured, 0 filtered**. This establishes compilation, linking and the declared test scope; it does not establish the Pick Race runtime or acceptable interactive speed.

The finalized inner build receipt is SHA256 `ea8c55d8606d3af8a296315fe12e76051583d5e00d674f36838c39a1ebabcdb6`. Release stdout/stderr are `d9d2f878f6ec47c20b391a6a2e967293a9f9d89356749dfa6159f1ce953d3be3` / `eff19e62df32dbce61418d8b20cbafab22be80cf3f50f3f811eb27c624cc09ab`; test stdout/stderr are `22872c1f566362620cb6472f49079d24ac792e4723215206e0a8c86d0c38949e` / `ed36bca4473bdb05c0ab94f5e1129a7ac1b32bb41334a775a4250e7f5ec94e6e`. The actual isolated executable `target/release/cok-recomp.exe` is SHA256 **`a949d83e8aa26445db98dce88fe6dd3b643aae576917aa926a5a07eb635782ea`**. Luna independently audits all455 unique pre/post input pins, unchanged generated22/source inventories, actual command flags and test counters in `create-race-build-od-inner-audit-20261015-b.json`, SHA256 `310741513ce27bc123ae2b52db38f0b2b4e12f973c8400c8d0f6424726dc82b7`.

The outer wrapper remains separately pending at this observation. Its known residual-helper limitation is retained, with the original900-second deadline; no clean Job accounting is claimed. An exact `pwsh -File <analyzer>` process scan finds no remaining build worker, and no matching compiler/Cargo/rustc remains. A prior substring-only process scan matched the diagnostic shell itself and was corrected; it is not worker-liveness evidence. Astra explicitly allows an independent runtime lease from another process tree after immutable inner evidence is verified, without changing the eventual outer verdict.

The finite GUI run `create-race-gui-run-20261015-od-b/` has now started from that separate process tree, with all512 configuration pins verified and the original20M/chunk256/three-key cohort retained. Configuration SHA256 is `07c6cb48e21a5fe873befe1c0ab792ee4acc1aafa5f310eb8f959373f42e60bf`. Race rendering, the observed fourth Enter, current-ownerA4:0884, complete output and performance remain **pending**. The frontend currently records audio evidence and can render offline WAV; live audio playback/latency is not established. Production source remains the earlier verified module46 checkpoint.
