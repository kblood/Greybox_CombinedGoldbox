# Champions of Krynn: combined module-46 startup/menu lift

Status: Astra's source plan approved by the coordinator on 2026-10-14. Independent inventory and private candidate generation are reproduced. A pre-build emitter correction is in progress; compilation, Rust test execution and menu runtime acceptance remain outstanding. Existing keyboard/PIT evidence stays accepted; the separate 36 raw RAM differences remain open.

Phase1 inventory is now independently reproduced by Luna: **1,967 new instructions / 5,170 bytes / 90 far calls**, aggregate **2,278 / 6,112**, all 19 stop roots retained, no unresolved entries inside the bounded inventory. All **21 controls** pass. The private 128 MiB job exits zero in 0.561 seconds, peak committed memory 50,286,592 bytes, assigned/resumed with zero active descendants and unchanged pins. Evidence root is `build/cok-recomp/staging/intro-compare/module46-menu-phase1-baseline-20261014-01/`; inventory SHA256 `56799c3389ba97c36743d274d10324415ebf026f1158bcb9c6af5722ea63aafb`, terminal SHA256 `4a2d7a6a4be867d5af3e838e07a995d312cb2861fc9f0d09e0affd38d91413fd`. Controls SHA256 is `b9f2d1290d99a088f635657e405aa38b407eaa30fd64812cdf1f02e4e2638eb7`. Portable generation/admission is the next implementation stage; these counts have not yet been added to the running Rust candidate.

### Private generation reproduced; pre-build LES fault guard pending

The actual `module46-menu-admission-20261015-v4-01/` job passes **33 controls**, using two portable bootstrap layouts, actual generation, complete agreement with independent phase1 ancestry, all 19 stops and all ten resident fixups. It exits zero in 62.68 seconds under the private 2 GiB job, peak committed memory 212,951,040 bytes, assigned/resumed with zero active descendants and all **88 pins unchanged**. Root independently rechecks every one of the **16,286 prior tuples** and **2,278 added tuples** against the generated manifest: **18,564 instructions / 46,624 bytes**, 22 generated artifacts. Manifest SHA256 is `3aab6050ac2868a2c500ab4a8bdbadd69bb8b3d27c4590a0745ad880c58b482e`; generated C SHA256 is `8ad935fc0bbde1a1ff87924d5ad2f3d6feb36ca2d9692528fad157b42090d07e`. Terminal SHA256 is `eae3920ba5655767799cf6b82dff898e5f228e776b478228db507079aca1dd15`; controls SHA256 is `bff52d3f94e137bfa9fab3c93771ace21facb544457faf1097a28eafcdad7da5`.

The earlier preserved v3 run fails on its synthetic frame's `C9 LEAVE`, which occurs in none of the 18,564 admitted original instructions. The corrected fixture uses the original-supported `MOV SP,BP; POP BP` sequence and adjusts its near-call displacement to preserve the same callee entry. No CPU instruction was added to satisfy that fabricated fixture.

Astra's separate Rust-test review then identifies a genuine source-level failure-path issue: LES/LDS emission calls `load_far_pointer` but advances IP without first returning its fault. The proposed released-second-word LES test correctly demands unchanged registers and IP. Its assertion is retained; a bounded emitter guard is being prepared before building. This finding is static, not an observed compiled test failure. The f002 generation and all old runs remain immutable; the corrected generator needs fresh generation/control evidence and new build input pins. Production sources remain unchanged. Source controls and emitted-form text are not substitutes for the pending 122 Rust tests or an observed menu/input run.

Recommend **one combined startup/menu batch: 1,967 newly inventoried instructions / 5,170 original bytes**, followed by mechanical C admission and a bounded Rust runtime pass. This closes all seven remaining original declarations and covers the menu dispatcher, while retaining explicit stops at unlifted choice handlers.

I read `CLAUDE.md`, the current analyzer, plan/HANDOFF, accepted ancestry/catalog, and generation/runtime sources. This memo uses read-only static decoding; no originals, models, Rust applications, builds, or tests were executed. Nothing was edited.

For paths below, `P` means exactly `build/cok-recomp/staging/intro-compare`.

**Evidence and identity**

The current result is `P/module46-second-call-baseline-878b7d86a88e464eacbb1f0ab7defd67/inventory.json`, SHA-256 `16dd281c71f9a00ecc87043452895893998d2a2c902b11677b362713830cbc08`. It records local `INVENTORIED`, **47/160/27**, aggregate **311 instructions / 942 bytes**. Its nested instruction sets contain 311 distinct identities. The existing 20 control records were read, not rerun.

Authoritative starting sources:

- `P/module46-second-call-inventory-sol/{inventory.py,HANDOFF.md,config.json}`
- `P/module46-second-call-inventory-plan.md`
- `P/resident-0199-inventory-sol/v4/inventory.py`
- Accepted `manifest.json`, `startup-catalog.json`, and `resident-complete.bin` under `P/continuation-v2-luna-42ffb773e48b4f0985886658d92598a7/generator-output/positive/generated/`.

Rehashed source identities:

| File | SHA-256 |
|---|---|
| `Champions of Krynn/START.EXE` | `e51d88ecef07cffe4a14036de3dbdc6ce7e7ff0db7482f3771d6f99eb7bbb956` |
| `Champions of Krynn/GAME.OVR` | `c3f448c391ea860f97dec99ce88b0b8b0a4a7e807cf3b1f5a8f1515e2a7a0529` |
| Accepted `resident-complete.bin` above | `1bd9c6700b6ce55445649cf25a1991010896d1cfb044f2fb57c9cc90faf6a7e5` |
| Accepted `manifest.json` above | `43ba7e2adb065b220bb03b243dc58028002181180e6c2e51e9143756281e4fda` |

**Exact bounded batch**

Addresses below are original, unrelocated source coordinates; offsets are decimal. Windows are hexadecimal, half-open.

| Order | Original caller → raw target → body | Body file offset | New instructions / bytes |
|---|---|---:|---:|
| 1 | A4:0021 → 009E:0057 → module47:0000 | GAME.OVR 120539 | 9 / 30 |
| 2 | A4:002B → 0116:0084 → module35:0000 | GAME.OVR 258832 | 6 / 15 |
| 3 | A4:01E5 → resident0128:0000, module17 | resident 4736 | 123 / 304 |
| 4 | A4:01FB → 00E6:002A → module40:07BA | GAME.OVR 224608 | 398 / 985 |
| 5 | A4:02B1 → 00FD:003E → module38:17EE | GAME.OVR 247341 | 58 / 179 |
| 6 | A4:0364 → 00FD:0034 → module38:1368 | GAME.OVR 246183 | 1,108 / 2,909 |
| 7 | A4:0381 → 00FD:0043 → module38:18A1 | GAME.OVR 247520 | 29 / 82 |
| 8 | module46 dispatcher roots A4:03B4,03C2,0647 | GAME.OVR 132541,132555,133200 | 236 / 666 |

Use these exact review windows, following reachable instructions and reusing accepted entries:

| Source | Windows |
|---|---|
| 009E/module47 | `[0000,001E)` |
| 0116/module35 | `[0000,000F)` |
| resident0128/module17 | `[0000,0130)` |
| 00E6/module40 | `[07BA,0982)`, `[0984,0A0B)`, `[0A0D,0AD2)`, `[11C7,1203)`, `[199D,1A26)` |
| 00FD/module38 | `[000F,00BA)`, `[0C91,1356)`, `[1368,167A)`, `[167D,1758)`, `[17EE,18F3)` |
| 00A4/module46 | `[03B4,064E)` |

The recursive near-call roots include E6:`0984,0A0D,11C7,199D` and FD:`000F,0076,0C91,0D24,0E9C,0EE8,0F2E,0FD0,10D1,1201,1293`. FD:`03E2` and resident0128:`07E6` are reuse.

**Static facts:** the seven-declaration closure totals **1,731/4,504**, with no unresolved recursive dependency beyond accepted/inventoried entries. Adding the dispatcher gives **1,967/5,170**, containing 90 immediate far calls and 43 direct near calls. No new indirect dispatch or interrupt instruction appears.

Full descriptor/header, code hash, relocation table, and stub checks matched original bytes for the affected overlay identities. Crucially, body zero remains distinct from initializers: module47=`2817`, module35=`1359`, module40=`37AF`, module38=`18F3`, module46=`67C3`.

**Dependency closure and retained limits**

The mandatory closure reuses these exact entries:

- Inventoried bodies: `00DB:0000`, `00E6:0000`, `00F7:0000`, `011F:0000`, `0124:0000`.
- Accepted entries: `00FD:03E2`, `0128:07E6`, overlay `01C3:01AB`/module32, `0521:01DF,0353`, `0743:0030,0051`, and resident `0A46:023F,0254,0AC4,0ADE,0B10,0B51,131F,1661`.

Preserve their original allocation, overlay loading, relocation, stub publication, ownership and release paths.

The dispatcher resolves old external entries A4:`03B4,03C2,0647`. It exposes these **16 additional stop roots**, whose bodies are outside this batch:

```text
009E:0BED,1B34,22DE
00A4:2668,28FA,37A2,3B0A,4D9E,5812,5CC7
00A8:0D74,36CC
00E6:1827
00FD:177F
0128:0242,0344
```

Retain old stops `00A4:06DD` and resident `0000:0277`. Also retain **resident `0000:01FD`**: the ancestor analyzer explicitly stops there, but does not include it in its five-entry unresolved list. Thus the complete boundary ledger contains **19 distinct stops**. Overall gameplay closure remains incomplete.

**Concrete Sol changes**

1. Create proposed `P/module46-menu-closure-sol/inventory.py` from the current analyzer. Replace the body-zero-only resolver with validated descriptor/stub resolution plus the explicit windows and stop ledger above. Preserve ancestry verbatim; compute closure resolutions separately. Cap new inventory at **2,000 instructions / 8 KiB**.
2. Extend `rust/cok-recomp/lift.py` with a separate module46 admission phase after `continuation()`. Preserve the existing 16,286-entry phase and its checks. Admit the prior 311 instructions plus this batch: **2,278 instructions / 6,112 bytes**, yielding **18,564 / 46,624**. This admission exceeds the illustrative 2,000 limit because it includes already-inventoried work; use an explicit **2,300 / 8 KiB admission ceiling**.
3. Add a portable original-derived fixture preparer, proposed `rust/cok-recomp/prepare_module46.py`, following `prepare_continuation.py`; extend `reference-source.json` and bootstrap documentation. Generation must reproduce exact tuples from originals, without depending on staging inventories.
4. Preserve relocation semantics. All new overlay intersections inspected are far-call segment words at IP+3. The complete admission’s resident MZ cells are decimal **475,480,492,507,4745,4877,4957,4984,5021,5032**.

**Inference:** no new CPU/device implementation should be necessary. `lift.py` already emits the observed forms. Particularly test FD:`1697,16A4` `IDIV CX`, bare `98/99`, nested `PUSH BP; PUSH CS; CALL` frames, `LES`, and `RETF` cleanup—including `RETF 28h`. Existing `build.rs` compiles generated C for Rust FFI; no ABI change is indicated.

**Luna acceptance and earliest runtime gate**

- Independently reproduce exact new and retained tuples, edges, exclusions and relocation cells. Mutations must reject wrong stub/body/initializer, missing fixups, midpoint targets, duplicated admissions, and accidental inclusion of FD:`167A` or any named stop.
- Exercise emitted instruction forms and nested frame cleanup; retain stale-owner/generation and corrupted-relocation rejection controls.
- Generate and compile the full candidate, then run a finite **Rust → generated C** continuation crossing resident `0199`, module46 body zero, and menu body `01B4`. The first useful execution gate is original menu rendering and input handling through FD:`1368`, whose `15CF` calls already-admitted FD:`03E2`.
- Capture framebuffer, actual PC, retired-work endpoint, overlay ownership and input receipts. Test navigation and, when the original menu enables Create, selection reaching the explicit `A4:06DD` boundary. A no-fault run alone is insufficient.
- Existing `guest.c::machine_input_wait` recognizes BIOS sites `0962:0158/031D`; actual arrival there must be observed. Any original DOSBox comparison uses focusless GameLink.

These are proposed tests, not observed outcomes. Do not wait for Whole22 or reopen accepted PIT/keyboard proof. Keep the separately diagnosed **36 raw differences** visible; this batch establishes source coverage and bounded runner progress, not original equivalence.

## Observed generation and compiled acceptance — 2026-10-15

The portable module46 admission has now run successfully from the original inputs. The current frozen source is `P/module46-menu-admission-sol-v2/source-freeze.json` (SHA-256 `2913399df3f8a47da0e0ae32cf501f1caa0dbbc75799370c1ae65e75e8148a0c`). Actual run `P/module46-menu-admission-20261015-corev2-01/` exits zero in 62.37 seconds under the private 2 GiB job, with zero active descendants and all 99 pins unchanged. All 33 controls pass, covering ten emitted forms. The complete instruction array remains exactly equal to the independently audited predecessor: **18,564 instructions / 46,624 original bytes**, including this batch's **2,278 / 6,112**, with all 19 explicit stops and ten resident relocation cells retained.

Astra's compiled-guard review exposed a real emitter defect: failed LES/LDS pointer loads set a fault, but the generated tail still advanced IP. Sol added an immediate fault return before that tail. The new tests preserve the fault assertion and cover the actual LES site, IDIV, CBW/CWD, controlled nested frame cleanup and owner/relocation rejection at both load bases 0 and 1000. No ABI or device implementation changed.

Luna built the isolated candidate `rust/cok-recomp-module46-candidate-20261015-b` using the accepted compiler and offline Cargo inputs. The release build exits zero, and the actual Rust test process exits zero with **122 passed, zero failed/ignored/measured/filtered**, in 49.70 seconds. All five new module46 tests appear individually as successful in stdout. The release binary is 12,156,416 bytes, SHA-256 `941f12e0c68759be90a752382104a7968ece366b3d6ea9d58e784b5dfc183e40`.

The surrounding harness failed **after** the successful test process while summing ordered-dictionary result rows with `Measure-Object -Property passed`. Its failure is preserved; the harness itself is not claimed to have exited successfully. Root independently finalized the actual logs and postchecks without rebuilding or rerunning tests: 132 candidate files, 20 staged files, 244 source inputs, all 22 generated files and both GEO bindings remain unchanged. Acceptance is `P/module46-menu-build-run-20261015-corev2-a/root-independent-finalization.json`, SHA-256 `1509c18235882e3f95d011ad210a70d6824acb841367cb70e5468e2312c77e12`.

**Runtime acceptance remains pending.** These results prove portable generation, compilation and the stated test cases. They do not prove original menu rendering, navigation, Create, exploration, combat or save/load. The first new GUI discovery will use a 20,000,000-instruction ceiling and the existing single scheduled Enter at work 14,500,121. The discovery launcher must retain input waits for observed navigation and must not retain the old 15-million-work or resident-0199 exclusion guards. Production runtime sources have not yet been replaced by this isolated candidate.

### First actual GUI continuation: original Demo branch

The unchanged accepted candidate ran with the original single Enter schedule under a 20M ceiling in `P/module46-menu-gui-run-20261015-corev2-a/`. It reached the explicit resident `1000:0277` boundary at **15,751,618 charged work / 15,751,617 retired**, with an instruction prepared, no pending boundary and fault zero. The owned process exited zero after orderly close and output drain in 126.9296 seconds; all 186 configuration pins remained unchanged. Terminal SHA-256 is `7ab92df7063812bf99860adcc30173cee510980e80846d9105368f08bef958a8`; endpoint SHA-256 is `fbc5167ce0e2cfec11163ea1ac6680d53c533bf8b8be842d78b821db1513c711`. IRQ evidence is complete at 4,968,819 records and OPL at 19,138. EGA history remains truncated; this is not an original-equivalence result.

Root inspected the actual final screenshot: the original CHAMPIONS OF KRYNN V1.2 / PLAY-DEMO title remains visible, with no main menu. Final screenshot SHA-256 is `64ab8cb79333f07ca524959e313593b8c0f463feff78fa907f41c830b94bf204`; final ordinary RAM SHA-256 is `ccc058bfb2cdc4f2e5ef79ec94194cd77e02a19b79083d256e1d870142aca427`. The sole Enter ingress at work 14,500,121 was accepted. Although the keyboard summary retains only 16 callbacks, the separate complete BIOS ledger contains all 13,499 BIOS events: AH01 observes Enter at works 14,500,122 and 14,500,276; AH00 consumes it at 14,500,289 and advances the ring head from 30 to 32.

Astra's original-code and endpoint inspection explains the route: `DS:43B4=44h` ('D') and `DS:4B4B=1`. Resident `0199` stores the returned selection; `01A9` recognizes D, and the branch at `01F5` goes to `0277`, bypassing the call at `01F8` to the main menu body. Thus this run establishes a genuine Demo-path boundary, **not a failed rendering proof for the unvisited main menu**. Do not admit `0277` merely to claim menu progress.

The next bounded experiment retains Enter and adds uppercase P (`1950h`, decimal 6480) at work **15,000,000**. The complete existing BIOS ledger shows empty AH01 polling at 14,999,951 and 15,000,163; original FD:03E2 selects from “Play Demo” and otherwise times out to D. The experiment must prove P ingress and consumption, the original selection state and actual menu traversal/rendering, stopping at the first retained source boundary. It uses the same compiled binary and requires no reopening of the accepted native keyboard/PIT comparison.

### Play experiment: original main menu rendered

The same binary with Enter at 14,500,121 and P at 15,000,000 renders the original character menu in `P/module46-menu-gui-run-20261015-corev2-b/`. Root inspected `post-key-16.png` (title work 15,611,072; SHA-256 `23b3eb51298f9c9f4768810b943b55341a82eee1749eaad5519291e8af7dd842`): CREATE NEW CHARACTER is selected in white, with ADD CHARACTER TO PARTY, LOAD SAVED GAME, INITIALIZE MOUSE/JOYSTICK and EXIT TO DOS in green. Luna's later independent capture `observe-after-P.png` confirms the menu at approximately 19.37M work (SHA-256 `0dfc1c6e0bdc56b795c24953ca08ecd52d59a590669b7d2e5ba604f271559092`). Title and pixel capture times differ slightly because original execution continues during capture.

The P ingress is accepted and the subsequent observation has AX=6480 and ring head=tail=34. Final original RAM has `DS:43B4=50h` ('P'), `DS:4B4B=0`; Astra also verifies the Create-enabled byte `DS:08A1=1` and the original selected-record dispatch to A4:06DD. These source/state/framebuffer facts distinguish this route from the preceding Demo run. They do not establish character creation.

The process reaches its finite 20M host ceiling with guest fault zero, status19, charged=retired=20M and no prepared instruction. It then closes orderly with all 191 input pins unchanged. **Outer exit is 1:** stderr explicitly reports `ERROR: BIOS ledger output cap`, and the separate full BIOS sidecar was not produced. The endpoint counts 93,741 keyboard callbacks. Preserve this as incomplete BIOS evidence, not a completely successful runtime proof. The final cap screenshot is black; it does not replace the two earlier observed menu captures. No additional Enter was posted after a fresh observation found the cap already reached.

Astra approves a separate bounded Create-selection experiment with the same binary and three exact scheduled words: `[[14500121,7181],[15000000,6480],[16000000,7181]]`. The last Enter lies within the observed menu phase and should take the original enabled Create branch to its retained stop. Require actual consumption, state/owner/PC evidence, complete output and post-pins before integration. No source stop, output limit or original behavior is relaxed for this experiment.

### Create-selection gate completed with complete receipts

Run `P/module46-menu-gui-run-20261015-corev2-c/` uses exactly the approved three-key schedule and stops at runtime **4A14:06DD**, the retained module46 Create entry, at **16,009,305 charged / 16,009,304 retired**. AX is `43h` ('C'), fault is zero, a boundary instruction is prepared and no boundary is pending. Root viewed the actual final menu framebuffer; the Create body has not executed. The process exits zero after orderly close and full output drain in 131.0256 seconds, with no forced termination. All **196** input pins were rehashed unchanged before source promotion; the owned process is gone.

The separate BIOS ledger is **complete**, containing **21,521 BIOS events / 13,576 keyboard callbacks**. Root independently inspected its AH00 receipts: Enter7181 is consumed at work **14,500,289**, advancing head30→32; P6480 at **15,000,247**, head32→34; and Enter7181 at **16,000,085**, head34→36. Thus all three admissions are matched by actual guest consumption. Only the compact summary retains 16 callbacks; the full ledger supplies the complete evidence. IRQ evidence contains 4,999,376 records and OPL contains 19,138, both complete; historical EGA event coverage and the separately retained 36 raw RAM differences remain outside this gate.

Evidence SHA-256 values: postflight `fa3b0d83e584738f4b08076dc74907642362df69075266c0dbed1b44ffe0d0e5`; terminal `1ae93c234a2f7a9ef72e4dfd160e48638abc11c4fe1c2069239e323808c20bc6`; endpoint `ff75be5f65521d9e8c571b4f6d3b2f683c760ba8448b8afa2b79744735b05ac9`; full BIOS ledger `a35b239c0cddda1f39495256eae36a3d9bd6199c07616b0e43fc5800837ff5b1`; final screenshot `9890026885a744b2a0bf3a5597982306372922d273a733b042c647eb7e204e80`; final RAM `bc89a6d4e0cfdea5083a5795ffa73f9fb63fe4e4dd1dc3bf78c7f45f5a4e14fe`.

This closes the bounded **original menu rendering and enabled Create-selection boundary** gate for the frozen candidate binary `941f12e0…`. Its reviewed own-source files can now be integrated, preserving exact accepted bytes and adding the four ignored original-derived fixture/image paths. This source checkpoint does not rebuild or update the production-path executable, transfer the candidate binary's identity to another path, implement character creation, or complete the playable-game objective. The next bounded original-code task starts at A4:06DD and aims for the Pick Race prompt.

The final report's `unsupported-boundary` checkpoint independently binds source descriptor `00A4` to runtime segment `4A14`, **generation 5**, with `body_identity=true`, 26,568 code bytes at original file offset 131,593 and 461 relocations. Its last move-complete event at work 15,023,672 publishes that segment before the endpoint at 16,009,305; the relocated stub for body01B4 also targets `4A14`. This proves the physical overlay mapping rather than inferring it from IP06DD alone. The read-only projection is `P/module46-menu-gui-run-20261015-corev2-c/owner-mapping-addendum.json`, SHA-256 `bc88b269299a3fe13bd5c6349242520a4a2214a0262435fa51fdabc76270b772`; the underlying full report SHA-256 is `e31a9adc2430e60377b7c3c2bfe580312db9ed8f74a839cfb089b4b66d0cab91`.

The own-source checkpoint was committed and pushed as `0db2968f`. All seven promoted source files match the accepted frozen hashes. Raw-byte Git attributes preserve these identities across checkouts; the four original-derived fixture/image paths remain ignored. The separate result-parser correction also passes seven metadata cases and three assessor inversions (`P/module46-menu-parser-controls-20261015-c/control-receipt.json`, SHA-256 `a4c3e4bdb54d7bf9f6e6da808565d6559dff7e1c98c9e051a5e4ddb7dc8119e8`). This does not change the preserved original harness finalization failure or rerun the 122 compiled tests.
