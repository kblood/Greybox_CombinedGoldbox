# Original CoK main return and menu/demo continuation

Astra static planning pass, 12 October 2026. The accepted loading implementation is e5944fac, merged and pushed as f229480e. Runtime observations for this continuation are recorded separately; this plan does not establish main-return or gameplay execution.

Continue the accepted guest from **unexecuted `0061` body `06CA`, work 317135**, through resource setup, actual `RETF → 0000:0140`, original intro/menu, and source-selected demo execution. Preserve its heap, live frames, handles and overlay generations.

I read the project instructions, current README/plan, public lifter/oracle/platform sources, and statically disassembled held bytes with Capstone. No edits, builds, runtime execution or agents. The accepted execution evidence remains the supplied Luna baseline; findings below are static, not new execution claims.

1. **Sol first obtains original behavior in ignored `staging/main-return`.**

   Extend the original-only oracle before implementing the production continuation. Establish successive original checkpoints, recording the first unsupported instruction/service without bypassing it.

   Newly byte-checked continuation:

   | Original call site | Required source execution and checkpoint |
   |---|---|
   | `0061:06D0/06DB` | `01C3:0025 → body0050`: request members `CA/CB`, destination slots `4/0`. Constructs `8x8d` plus the source disk number. Checkpoint `06E0`. |
   | `0708/072A` | `011F:0034 → body01D0`: thirteen COMSPR calls: members `0..0B` into slots `0D..18`, then member/slot `19`. Checkpoint `072F`. |
   | `0754/0777/079A` | Resident `027F:0111`: SKY `FA/FB/FC`, destination pointers `DS:6D96/6D9A/6D9E`. Checkpoint `079F`. |
   | `07BD` | Same loader: CURSOR member `1`, destination `DS:8965`. **This load occurs even with mouse absent.** Checkpoint `07C2`. |
   | `07EC..0830` | Open ITEMS through `069C:02A7`; original RTL opens/seeks/reads/closes. Checkpoint `0835`. |
   | `0835` | `00BA:0052 → body58ED..5EEC`, original callback installation. |
   | `083A` | `0065:0025 → body38EA..3E9E`, original callback installation. Checkpoint `083F`. |
   | `0842` | Execute `RETF`; checkpoint resident `0000:0140`, including surviving resident frame. |

   COMSPR’s exact-match branch loads **both member `n` and `n+80h`**, into pointer pairs beginning at `6172 + slot*8`. Thus thirteen calls mean **26 resource lookups**, not thirteen. Held COMSPR has precisely those 26 members, each decoding to `0131h` bytes.

   Held resource bytes additionally confirm:

   - `8X8D1` members `CA/CB`: decoded sizes `04D1h/05B1h`.
   - SKY `FA/FB/FC`: `02D1h/0131h/0851h`.
   - CURSOR `1`: `0031h`.
   - ITEMS: length `0802h`; seek `2`, request `0810h` into `DS:5886`, actual-count destination `DS:6126`. Require successful `0800h` short read, cursor `0802h`, and **no padding writes into the remaining sixteen destination bytes**.

   Resident `027F:0111` reaches existing `069C:088E`, parses the original graphics header, allocates through `1C2F`, converts through `02A5`, frees the temporary decoded resource, and calls `0614:045C`. That last routine **drains keyboard input**. Sol must establish all actual filenames and allocation lifetimes from execution rather than infer success from available TOC members.

2. **Sol expands source coverage and admission mechanically, then implements complete main return.**

   Keep `loader.rs` fixture substitutions disabled. No host allocator, decoded-resource injection, callback-table synthesis or returned-menu substitute.

   Generalize `lift.py`’s existing far-call closure traversal beyond its current special treatment of `0A46`. Resolve immediate calls across resident segment identities and genuine descriptor stubs; recursively collect near closures and explicit callback targets. Emit a deterministic manifest of source offsets, relocation words, decoded instruction bytes, unresolved indirect transfers and unsupported forms. Split generated C by module if necessary.

   **Catalog correction from this static pass:** the complete restored image yielded **35 valid descriptors, 506 procedure entries and 257,951 overlay code bytes**, all represented in the startup-derived descriptor set. The older partial-image chain contains only 34 descriptors and treats `0038` as its sentinel. Therefore, do not report newly discovered descriptors merely because new procedures are reached. Nevertheless, replace startup-table-only discovery and hard-coded `35` assumptions in `lift.py`/`startup_observer.rs` with validated descriptor inventory and extensible admission. Additional true descriptors must be admissible when proven; initializer membership must not be the criterion.

   Separate **known descriptor identity**, **compiled procedure coverage**, and **currently admitted loaded generation**. Installing a callback pointer does not require prematurely executing its target, but later invocation must resolve through the original stub/manager.

   Concrete initial procedure budget: `01C3:0050`, `011F:01D0`, the `027F:0111` resource/conversion closure, ITEMS RTL closure, and the two callback installers. The installers alone occupy `0600h` and `05B5h` bytes. Measure the larger closure before approving its implementation budget; do not claim a bounded byte count from entry points alone. Retain explicit unsupported boundaries rather than decoding entire segments as instructions.

3. **Sol establishes input/time/device behavior before enabling the menu closure.**

   Newly checked input dependencies:

   - `0962:02FD`, `0306 INT16/AH=1`: peek, return availability through ZF, **do not consume**.
   - `0962:030F`, `031D INT16/AH=0`: consume one BIOS ASCII/scan pair; empty input must wait/yield without inventing a character.
   - Original code stores extended-key scan bytes at `DS:8A55` and returns them on the following call.
   - `0614:03C2/025B` implement source input handling; `045C` drains pending keys. Schedule menu input after the relevant drains, through platform services only.

   The declared work clock suffices for reproducible DOS-time polling and conditional timeout comparisons. `0521:09BA → 09C4:00A2` obtains DOS time and converts it to hundredths. **It does not by itself implement IRQ-driven sound.**

   Held-source sound initialization `07E8:00DA` selects `12C5` unless `[577A]=5`. Byte-checked dependencies include:

   - DOS get/set vector `08h`, saved at `07E8:12C1`, handler `1333`.
   - Literal writes: `B6 → port43`, then `B1,13 → port40`. Preserve these unusual operands; do not “correct” them into conventional PIT programming.
   - Handler calls `13C0/1435`; dependent code accesses `42h`, reads/writes `61h`, and writes `C0h`.
   - Handler decrements its source counter, reloads `0Dh`, chains through the saved vector at `13B1`, or sends PIC EOI through port `20h` and executes `IRET`.
   - Cleanup `12FA` restores vector `08h` and changes timer/sound ports.

   First repair the oracle’s immediate-port decoding: its public OUT hook currently routes using DX; the production non-EGA boundary also requires the supplied port to equal DX. Add real operand/width transport.

   Then define pending IRQ delivery, IF/interrupt-shadow behavior, architectural frames, PIC in-service/EOI state, saved BIOS-vector behavior and clock ownership. Avoid double-counting BDA ticks through both host updates and chained BIOS handling. Compare source sound state and device events even if audible output is deferred. A declared sound-disabled configuration is a separate conditional route, not evidence that the held sound route works.

   Mouse-absent and current EGA compatibility remain useful declared profiles. Present-mouse calls, unimplemented video modes/registers, diagnostic ROM-font reads and unsupported audio operations remain explicit boundaries. None of this establishes physical IBM EGA/PIT fidelity.

4. **Sol follows the original intro/menu into an actual demo checkpoint.**

   Newly checked roots:

   - Resident `014A/0154` uses `0A46:1675/0BC9` to compare argument one with `"Woof"`; the normal path calls `003B:0025 → body063C`.
   - Intro loads TITLE members `1..4`, uses `027F:10E7` drawing and `1CF6` release, and polls time/input in body `0000`. It also calls `0105:002F → body0537` and resident `0661` sound routines.
   - Resident `0194` calls `00FD:002A → body03E2`; timeout globals are `6E11:6E13=0BB8h`, default character `6E15='D'`. Menu closure includes `0105:0025 → body000A`, keyboard wrappers, and `0116:006B → body0C43`.
   - Observe the real return at `0199`. Only source then sets `[4B4B]=1`, `[5782]=2`, `[4B38]=9` for demo.
   - Continue through `00A4:0034 → body0000`, then the demo branch toward resident `0277`, `010B:0048 → body0000`, map setup, `003E:002A → body0000` and `003E:0025 → body3C28`.

   `"Woof"` is a legitimate separate argument test, not the acceptance route for intro support. Use existing demo/ECL helpers as locators, verifying CoK operands; do not import another title’s demo constants. The next demo acceptance point must include an original script/resource transition and resulting game state—not merely the `'D'` flag.

5. **Luna owns fresh acceptance after Sol freezes each candidate.**

   Compare original/C-Rust checkpoints for registers/defined FLAGS, complete RAM changes, live frames, allocation/free lifetimes, resource bytes, independent file cursors, callback pointers, overlay generations, EGA planes/latches and ordered device/input/IRQ events.

   Required discriminating controls:

   - COMSPR high-member absence; SKY/CURSOR corruption; ITEMS short-read count and untouched tail.
   - Allocation pressure and overlay relocation with a live main frame; stale callback-generation rejection.
   - Repeated peek, single consume, extended key, source drain and delayed input.
   - No-input timeout versus explicit demo input; frozen/varied clock and midnight crossing.
   - IRQ pending while IF clear, handler return/chaining, EOI and vector restoration.
   - Uninterrupted/chunked equivalence and budget interruption inside resource conversion and IRQ handling.
   - Complete event evidence: the current 8,192-event trace cap cannot silently become a successful comparison of prefixes.

   Preserve the accepted regression baseline. Serialize shared runtime testing; any DOSBox-X corroboration must use focusless GameLink.

The largest full-game blockers are broad procedure/indirect-dispatch coverage, interrupt/device scheduling, sustained graphics and resource lifetimes, and original campaign/ECL/combat/save flows. A validated cross-module closure generator plus procedure-level coverage manifests offers a feasible expansion path. Repeated one-root rebuilds and output-only screenshots will not close those gaps.

## Executed original continuation

The private original-only oracle now reaches the actual `0061:0842` RETF at
work 3976364 and resident `0000:0140` at 3976365. Root inspected the compact
`held-items-return-summary.json` under ignored
`build/cok-recomp/staging/main-return/`. At return CS=1000, IP=0140,
SP=3EFE and BP=3FFE: the surviving resident frame is retained.

| Source checkpoint | Observed diagnostic work |
|---|---:|
| 06E0: additional fonts returned | 1102531 |
| 072F: COMSPR requests completed | 3041311 |
| 079F: SKY requests completed | 3956468 |
| 07C2: CURSOR request completed | 3971016 |
| 0835: ITEMS completed | 3971845 |
| 083F: callback installers returned | 3976362 |
| 0140: actual main return | 3976365 |

The declared BIOS keyboard ring is initialized before any game instruction.
Forty-seven nondestructive empty peeks and zero consumes were observed.
Its interface follows the keyboard listing in the
[IBM 5150 April 1984 technical reference, printed page 5-53](https://www.minuszerodegrees.net/manuals/IBM/IBM_5150_Technical_Reference_6322507_APR84.pdf):
head/tail determine status, the head word is returned, and peek preserves the
queue. This is a versioned interface model, not IRQ1 or physical BIOS execution.

Initial probes stopped honestly at unsupported keyboard status. An ensuing
return still had two ITEMS open errors because the copied font-only mode2
policy denied that file; that error-route result is preserved and not accepted.
The corrected virtual filesystem admits original ITEMS mode2 reads, retains
immutable host files and leaves writes unsupported. The positive run reads
2048 bytes from offset 2 for a request of 2064, reaches cursor 2050 and leaves
the sixteen-byte tail untouched. All CA/CB fonts, 26 COMSPR lookups, SKY FA/FB/FC
and CURSOR1 succeed without file errors.

Held sound code at 577A is 2, so the upcoming resident sound route requires
actual PIT/IRQ modeling. The original menu continuation is being probed with
corrected immediate-port operand transport and explicit unknown-device
boundaries. Compiled menu/demo execution is not yet established.

## First fresh compiled main-return comparison

The development candidate
`39346fe9ce05b0fd760d9af3406cba98dcfb134bfd1b94466157dfe7c1108e00`
returns to resident 0140 at the same work 3976365 and frame SP=3EFE/BP=3FFE.
Its 96 debug unit tests pass. The first fresh default native/C comparison
passes all 71 complete snapshots, including the actual pre-RETF source state,
known FLAGS, conventional RAM, source allocation/free observations, converted
resources, callback tables, independent file cursors, ITEMS tail and full
keyboard state/events. All 3355 logical EGA events and 4758 byte effects match.

The initial strict run exposed observer aggregation: native keyboard events
were stored separately while C also included them in chronological BIOS events.
The failed artifact is retained. Native now appends that same observed event
to both evidence views; no guest state, clock or comparisons were changed.
Retained-artifact normalization was diagnosis only; the accepted development
default comparison then reran the corrected producer fresh with raw/JSON
invariance and before/after helper/executable pin checks.

Eight mutations passed through the actual comparison function are rejected:
converted COMSPR data, ITEMS tail, callback table, resource pointer, keyboard
ring, missing keyboard event, known FLAGS and a forged full ITEMS read.
The two existing ordered EGA byte-event controls also reject altered evidence.
These are comparator controls, not isolated compiled gameplay mutants.

Ignored proof: `staging/main-return/corrected-default-verification.json` under
`build/cok-recomp/`. The fresh chunk7 comparison also passes all 71 snapshots at
work 3976365, with 3355 logical EGA events, 4758 byte effects and both ordered
EGA negative controls. Its receipt is `corrected-chunk7-verification.json` in
the same directory; the executable and four helper hashes match the corrected
default run. The eight return-evidence mutations were measured in the default
run and were not rerun in chunk7. The fresh stop-budget receipt also records
PASS for all 71 snapshots at work 3976364, before the actual RETF, with the
same complete EGA counts, two ordered-event controls and helper/executable
hashes (`corrected-budget3976364-verification.json`). The runtime owner confirmed
terminal exit0 for session58055: the original RETF at 0842 remains pending and
resident 0140 has not been reached in this negative-budget run. Public-helper
smoke and actual independent Luna acceptance remain pending.
Original menu execution still
stops at the real PIT/audio boundary; compiled menu/demo/gameplay are not
established.

During the stop-budget run, root independently rehashed the 49 production,
support, generated and original-asset files recorded in
`build/cok-recomp/main-return-source-provenance.json`: zero mismatches. The
release executable still matched `39346fe9…`. This is an input-immutability
check during that run, not its terminal verdict or independent acceptance.

The oracle, platform, compact evidence and strict comparator are now published
as `verify_startup_main_return_original.py`, `startup_main_return_platform.py`,
`startup_main_return_evidence.py` and `verify_startup_main_return.py` in
`rust/cok-recomp/`. Default comparison requires fresh native execution and
writes no report unless explicitly requested. Public
`verify_startup_keyboard.py` passes five pure interface controls; these test
the independent platform model, alongside the compiled keyboard guards in the
96-unit suite. AH2 remains a diagnostic oracle service outside current compiled
AH0/AH1 admission. The fresh public default smoke receipt records PASS for all
71 snapshots at work 3976365 and all eight return-evidence plus two EGA event
controls (`build/cok-recomp/main-return-public-smoke.json`). Public helper names
and imports have new hashes; this is a fresh run, not reuse of private artifacts.
This development run preceded the actual Luna results below.

The actual `gpt-6-luna` acceptance process completed (root session5744),
using the public fresh default/chunk7/budget comparisons and frozen debug,
decoder, legacy-regression, admission, all49, keyboard, seek and EGA suites.
`build/cok-recomp/main-return-verification-provenance.json` records the 49 core
inputs, five public helpers and three binaries. Tests are serialized and do not
rebuild or edit inputs. Main-return tests pass; the separate standalone timer
differential stopped at DLL loading as recorded below.

Observed raw Luna outputs so far: initial 85 pinned files have zero mismatches;
96 debug tests pass; decoder controls reject 82 forms and emit 75 supported
forms; the legacy suite passes 8851 original/compiled comparisons, 31 negative
controls and 512 text cells, with release hash unchanged and 24 watched inputs
unchanged. All three admission controls pass atomically (statuses 5, 5 and 4).
The pure all49 matrix subsequently passes all 18 cases: six positive, three
conditional-clock and nine diagnostic cases, on the same release hash. Luna's
fresh public default main-return comparison then passes all 71 snapshots at
work 3976365, 3355 logical EGA events, 4758 byte effects and all eight return
evidence plus two EGA event controls. Four public helper hashes and the release
hash match before/after that run. Luna's fresh chunk7 run also passes all 71
snapshots at work 3976365, the same complete EGA counts and two ordered-event
controls, on the same helper/release hashes. The eight return-evidence mutations
were measured in default, not repeated in chunk7. Luna's fresh negative-budget
run also passes all 71 snapshots at work 3976364, with complete EGA counts and
two ordered-event controls on the same helper/release hashes. Five public
keyboard controls, 14 seek controls and 539 EGA device cases subsequently pass.
All main-return and legacy functional checks in this run therefore pass.

The independently authored PIT/PIC reference's nine unit tests pass. Its C
differential exits1 before any model comparison because the DLL lacks `pc_read8`:
the staged export-name matcher excluded digits. This is a measured load/ABI
failure; no timer-transcript equivalence was established. Main-return does not
use that staged DLL. The primary run is not an overall timer/IRQ acceptance.

Luna's initial 85 expected file hashes match; its final 87 checks match,
including two additional compiler receipts. Its 19 imported local Python
dependencies were captured only afterward, so Luna alone supplies no paired
pre/post proof for those extra files. Root's separate 554-Python-file snapshot
at 01:04:21Z was taken during regression, before all49/main-return/device tests,
and all 554 raw hashes still match after terminal completion. This supplements
those later phases; it does not predate the debug/decoder/regression start.
Primary raw log and memo remain in `C:/temp/goldbox-cok-luna-main-return-20261012-0102.*`.

The focused export-only rebuild preserves failed artifacts and device C/header
semantics. The fresh actual Luna timer supplement completed in root session89782:
reference nine tests pass, but differential collection fails on the first vector.
Its ctypes serializer mistakes scalar `PcEvent.channel` for array
`PcSnapshot.channel`; no valid event-transcript verdict follows. A focused
collector correction is underway, retaining both failures and unchanged model
expectations. Timer/IRQ integration, original intro/menu and gameplay remain
unfinished.

The standalone device follow-up eventually passes in actual Luna session50214:
28 named cases, 228 steps (222 DLL and six host-only), with all 638 before/after
raw hashes unchanged. Collector and metadata repairs preserve the device
algorithm, expected vectors and DLL. See the PIT/IRQ plan for the retained
failures and policy limits. This does not change the main-return executable or
establish original intro/menu execution.
