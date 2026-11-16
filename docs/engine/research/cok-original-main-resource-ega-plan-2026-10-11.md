# Original CoK main, resource and EGA continuation plan

Astra planning pass, 2026-10-11. Root independently checked the restored main entry bytes, descriptor 0061 procedure mapping and body hash, original font TOC sizes/payload offset, ITEMS file length and DOS time seed call. The numbered plan records that static pass; the executed original/C-Rust results and actual Luna acceptance are recorded below it.

**Current continuation, 2026-10-12: finish original main initialization and reach the original boot/demo menu.** The compiled font/loading slice through overlay `0061` body checkpoint `06CA` is accepted below. Continue that same process toward its actual return at resident `0000:0140` and the original menu/demo route.

This pass used read-only source inspection and disassembly. No edits, builds, runtime tests, installations, DOSBox, or report writes. Findings below are **byte-verified static control flow**, not newly observed execution or hardware fidelity. All addresses are unrelocated; “body” distinguishes executable overlay offsets from descriptor stubs.

1. **Enter the actual main call without reconstructing its state.**

   Resident bytes:

   ```text
   0000:0134  55              PUSH BP
   0000:0135  89 E5           MOV BP,SP
   0000:0137  81 EC 00 01     SUB SP,0100
   0000:013B  9A 25 00 61 00  CALL FAR 0061:0025
   ```

   Descriptor `0061` resolves stub `0025` to **body `005B`**, not body `0025`:

   ```text
   GAME.OVR file offset 00010098
   code bytes          0AB0
   relocation bytes    00A0 = 80 fixups
   procedure offsets   0AAB,005B,0843,0000
   body SHA-256        198d691cb40aed27938910a7fe652ce5ad939bb04ed4670aabefe4a2706ae6d5
   ```

   Preserve all49’s real stack, heap, loaded descriptors and generations. Dispatch through its original patched stub/manager; do not preload another copy.

2. **First new platform dependencies are time and mouse detection.**

   Body `005B` creates a `0116h`-byte frame. At `0071/007C` it reads/writes physical `0417h`, setting bit `20h`.

   `0080 → 0A46:1200` executes:

   ```text
   B4 2C CD 21              DOS get time
   89 0E AE 43             RandSeed low word = CX
   89 16 B0 43             RandSeed high word = DX
   ```

   Declare DOS hours/minutes/seconds/hundredths explicitly and connect subsequent time requests to the same clock profile.

   Held CFG sets `[8986]=1`, so `0099 → 0743:0000` requests mouse reset through **`09C4:000B`’s IVT far-transfer mechanism**, vector `33h`. Source accepts AX=`FFFF` as present; otherwise it clears `[8986]`.

   A declared **mouse-absent response AX=0** is a useful first executable profile: source skips cursor installation/query calls, retaining keyboard operation. This is a conditional platform choice. A present profile additionally needs functions `9`, `4`, `3`, `1`, and `2`, with coordinate and cursor effects.

3. **Execute the original allocator and its callback; retire the temporary resource closures.**

   Body `0153..01B3` requests seven allocations totaling **`44ACh` bytes**. Calls to `027F:1C2F` allocate six graphics objects; with held EGA configuration their requested total is **`662Ah` bytes**. Combined: **43,734 requested bytes**, before allocator rounding, temporary resources and later loads.

   Lift `0A46:023F → 0308`, free `0254 → 03D3`, and their near closure. Allocation invokes:

   ```text
   0A46:03B7  FF 1E 9A 43   CALL FAR [439A]
   0A46:03C3  FF 1E 9A 43   CALL FAR [439A]
   ```

   That pointer installed by all49 names descriptor `0038:0025`, resolving to body `0042`. The zero-request arm reaches `00A9`; it returns a stack-derived AX whose value must not be “cleaned up” by a host replacement. Positive requests enter original failure/recovery UI.

   Existing `rust/cok-recomp/src/loader.rs` (the Rust lifted-code track is omitted from this draft; see [SHARE-REVIEW.md](../../../SHARE-REVIEW.md)). substitutes lookup at `069C:088E` and release at `0A46:0254`, including a fixed `7800:0000` allocation. **Those are fixture boundaries to replace on the main route.**

   The original pipeline is:

   ```text
   069C:088E
     → 0780: construct/open streams, read TOC size, seek data stream
     → scan 9-byte entries using original reads
     → 09E1 → 0A46:023F: allocate selected raw size
     → 0A06 → 0A46:151C: seek selected payload
     → 0A1C → 069C:06C4: existing original DAX decoder/read path
     → 0873: close streams
   ```

   `0780` opens the same archive twice. DOS services therefore need **independent cursors for two handles to one file**, alongside the still-open overlay stream. Resource lookup also calls `07E8:0020`; trace and lift its reached sound/control closure rather than treating it as a no-op.

4. **The first resource and first useful graphics checkpoint are precise.**

   At body `069F`, call `0521:017C`. Its CS literals at `0171/0177` are Pascal `"8X8d1"` and `".dax"`; `01A0` supplies member **`C9h`**.

   Held `8X8D1.DAX` verifies:

   ```text
   TOC entry at file 0002: id=C9, relative offset=0
   decoded size=0588 (1416), compressed size=053D (1341)
   compressed payload begins at file 004A
   ```

   Source copies the decoded font to `[6128:612A]`, then calls original free. **Checkpoint body `06A4` proves real allocation, archive selection, decoding, copy and release.**

   Continue:

   ```text
   06A4 → descriptor 00FD:002F → body 0C7B → 0521:030A
   06C5 → 0521:0353: draw Pascal "Loading...Please Wait"
   checkpoint 06CA
   ```

   Required graphics closure includes `0521:01DF`, which copies eight glyph bytes from the loaded font into `[612C]`. Held `[4B76]=1` selects near routine **`0521:0DBD`**.

   Exact hardware-sensitive instructions include:

   ```text
   0DC2  B8 00 A0       video segment A000
   0DD4  BA CE 03       graphics-controller index port
   0DDA  EF             OUT DX,AX, AX=0A05
   0DEF/0DFA EF         bit-mask register writes
   0DF3/0DFE 26 20 05   AND ES:[DI],AL
   ```

   Implement indexed word-port writes and **four-plane EGA memory, read latches, read/write modes, bit masks and map masks**. These read/modify/write accesses cannot use ordinary flat RAM. Compare plane bytes and decoded pixels independently. The font here comes from original DAX data; do not substitute a host font. Retain the existing diagnostic-ROM-font read rejection for any separate BIOS-font path.

5. **Follow with complete setup and the real boot/demo route.**

   Remaining body `0061` work includes:

   - `06D0/06DB`: `01C3:0025 → body0050`, resource/UI setup.
   - `0708/072A`: `011F:0034 → body01D0`, `COMSPR` requests.
   - `0754/0777/079A`: `027F:0111`, `SKY` members `FA/FB/FC`.
   - `07BD`: same loader, `CURSOR` member `1`.
   - `07EC..0830`: open `ITEMS`, seek `2`, request `0810h` bytes, close. Held file length is `0802h`; **only `0800h` bytes remain**, so preserve successful short-read semantics.
   - `0835/083A`: install original callback tables through `00BA:0052` and `0065:0025`.
   - `0842`: actual `RETF` to resident `0000:0140`.

   Resident main then checks argument `"Woof"` (`014A..015B`) before optional `003B:0025` intro execution. At `0194`, `00FD:002A → body03E2` receives the original title and `"Play Demo"` strings. A returned `'D'` sets `[4B4B]=1` at `01B0`; subsequent source branches select demo state. This is the concrete route toward original demo execution, not evidence that demo execution already works.

6. **Input and timer support must survive beyond setup.**

   Keyboard roots are `0962:02FD` (`0306: CD16`, AH=1) and `0962:030F` (`031D: CD16`, AH=0), reached through `0614:03C2/025B`. Preserve peek versus consume, ZF, ASCII/scan codes and the extended-key byte at `[8A55]`. Feed queued keys through these services, not menu-result overrides.

   `0521:09BA → 09C4:00A2` obtains DOS time and converts it to hundredths. Resident main sets a `0BB8h` timeout and default `'D'` before the menu.

   Held sound selection also reaches `07E8:00DA → 12C5`: saves/replaces vector `08h`, performs port writes, and installs handler `1333`. The handler chains through `CS:[12C1]` at `13B1`, or emits PIC EOI at `13B8` and executes `IRET` at `13BF`. **BDA ticking alone cannot exercise this handler.** Preserve literal port programming; do not normalize unusual writes into an assumed timer configuration. Hardware validation remains future hidden, focusless GameLink work.

7. **Acceptance for the next bounded implementation.**

   Extend the independent original/Rust startup differentials with checkpoints at body `0085`, `014F`, `069F`, `06A4`, and **`06CA`**. Compare registers/defined flags, live stack, allocator lists, allocation lifetimes, font bytes, file identities/cursors, overlay generations, device events and EGA planes. Require uninterrupted/chunked equivalence across allocation callbacks, decoding and video read/modify/write operations.

   Negative controls: missing/member-missing/truncated font archive; concurrent archive cursors; allocation pressure while `0061` has a live frame; stale/moved overlay admission; changed font payload; changed graphics-register response; frozen/varied time; absent/present mouse; keyboard peek without consumption.

   Bound instruction and work budgets with explicit unsupported-boundary results. Do not admit whole resident segments merely to increase reach. **`06CA` is the next executable milestone; complete `0061` return and original menu/demo execution remain required continuation work.**
## Primary EGA hardware reference

The original [IBM Enhanced Graphics Adapter technical reference, 2 August 1984](https://www.minuszerodegrees.net/oa/OA%20-%20IBM%20Enhanced%20Graphics%20Adapter.pdf)
was retrieved locally under ignored `build/cok-recomp/reference/`:
4,242,750 bytes, SHA256
`d2411a689d762e9c6915fd3b15a92f760beada41a4cd1b0020fd29814db151bd`.

Printed pages 49–54 (PDF pages 53–58) specify the data-rotate/function,
read-map, mode, memory-map, color-compare and bit-mask controls. Mode register
index 05 bits 0–1 select write modes 0, 1 or 2; value 3 is invalid for this
EGA reference. Bit 3 selects the read mode. In write mode 2, each of the
four low CPU-data bits expands across its corresponding plane; logical
operations and the bit mask still apply. Reads load the latches used by
subsequent writes. Thus source `OUT DX,AX` with AX=`0A05` selects write mode 2
and color-comparison reads, not ordinary flat memory.

**Resolve the color-don't-care polarity before implementing it:** printed
page 54 explicitly describes a set bit as ignoring its plane. Do not silently
import VGA assumptions. Compare the declared adapter profile, an independent
reference implementation, original source register programming, and future
focusless GameLink observations. This document establishes specification
inputs, not implemented or validated EGA behavior.

The declared comparison profile and concrete device acceptance vectors are now
specified in [CoK EGA device semantics](cok-ega-device-semantics-plan-2026-10-11.md).
That follow-up resolves the implementation choice while retaining the absence
of a measured physical IBM EGA result.

## Executed original-main loading draw

The staged original-only oracle now continues the same restored guest beyond
0134 and reaches all five main checkpoints under the declared platform:

| Overlay 0061 body checkpoint | Diagnostic instruction work |
|---|---:|
| 0085: time initialized | 204207 |
| 014F: mouse-absent route returned | 204316 |
| 069F: before original font lookup | 257753 |
| 06A4: original font pipeline returned | 304548 |
| 06CA: original loading draw returned | 317135 |

Root independently inspected `original-main-mode2-reads.json` and confirmed
the actual 1416-byte font SHA256
`fca3a918bd20e24456f579d20341278a21d3b5f5b4e205384fadeb551ce091c1`.
Original allocation/callback/lookup/decoder/copy/free code ran; the copied
font pointer is 53B1:0000. Archive handles 6/7 use mode2 and independent
cursors; 677 reads consumed 1341 compressed bytes plus 11 TOC bytes. The
loading draw performed 2806 port writes, 976 reads and 976 writes across
320 touched video addresses in the independent pixel model.

Initial attempts honestly failed because the oracle restricted FindFirst to
GOVR/CFG and denied DOS3D02 archive access. The staged filesystem was corrected
to find held assets and admit read/write-mode handles for reading; host assets
remain immutable and writes remain explicit boundaries. BIOS error UI was
not replaced with a no-op to hide those failures.

A diagnostic image reconstructed from the original guest's touched pixels,
using a declared standard RGBI palette, visibly contains the original loading
text. It is model evidence, not a physical screenshot or C/Rust result.
## First compiled C/Rust loading draw

The first compiled continuation also reached body 06CA at instruction work
317135. All five checkpoint counts match the table above. The candidate
executable SHA256 is
`b43e50057207b485f8b6ef78ef79dc2ab470845e17cd54f88b89a62320e3b222`.
Root independently parsed its saved `main-first.json`: 976 device reads,
976 writes and 1403 logical word OUTs were recorded, with a complete
3355-event trace. Expanding each word OUT into its ordered index/data bytes
gives the original oracle's 2806 port writes.

All four complete plane hashes match the original pixel oracle: planes 0/2
are `de2f256064a0af797747c2b97505dc0b9f3df0de4f489eac731c23ae9ca9cc31`;
planes 1/3 are
`b2125640cb9fdd6ed41db645084db4fbd307c0fad7e03a4d0f8968eb62afe18d`.
The compiled font checkpoint closes handles 6/7 at cursors 1415/11.
Root reconstructed and inspected `compiled-loading-diagnostic.png` directly
from the compiled device's plane bytes; it contains the original loading text.
The image uses a declared RGBI palette and is diagnostic model evidence.

The subsequent strict developmental comparison passed all 63 checkpoints:
registers and known FLAGS, complete conventional RAM changes, font/global/glyph
state, original allocator entry/return observations, device planes/latches/
registers and exact timed event order. It matched 3355 logical device events and
4758 byte effects. Two controls invoking the comparison itself rejected reversed
and missing port bytes. The ignored evidence is
`staging/main-probe/main-comparison.json` under `build/cok-recomp/`.

The chunk-7 comparison also passed all 63 checkpoints and exact device events,
with 45305 administrative yields. The native harness was corrected to observe
new main checkpoints after the yield check, matching the declared C scheduler;
that correction charges no guest work. Uninterrupted and chunked original runs
have identical checkpoint states and memory/device traces.

## Final developmental gates, 12 October 2026

The developmental candidate SHA256 is
`715d012fb3d0ef4b1837ac9573a776d4f55d0012f2b534d43f2cddcc97c8a2d4`.
Its default and chunk-7 main comparisons pass all 63 complete snapshots.
The budget-317134 control stops before source `0521:03DF` (`RETF 14`) at
SP=3DD2, with status 2 and complete partial-device evidence. It has reached
the font checkpoint and has not reached body 06CA. The earlier omission of
EGA state in failure snapshots was corrected before this gate passed.

That candidate also passes 89 warning-free unit tests, 8851 baseline positive
comparisons, 512 text cells, 31 baseline negatives, three source-admission
controls and all 18 all-initializer matrix cases. Decoder checks reject 46
forms and emit 75 admitted forms; this is decoder coverage, not execution of
every service form. All 20 watched inputs remain unchanged. Fourteen pure
seek controls pass; this bounded compatibility profile accepts positions
0..file length and rejects negative or out-of-extent seeks without moving the
cursor. It does not assert unrestricted historical DOS seek behavior.

The reusable original oracle, independent pixel platform, compact evidence
and strict comparison now live under `rust/cok-recomp/` as
`verify_startup_main_original.py`, `startup_main_platform.py`,
`startup_main_evidence.py` and `verify_startup_main.py`. Their default entry
points print evidence without writing reports; explicit output goes under the
ignored build directory in the documented commands.

The subsequent decoder guard rejects memory SHL/SHR/ROL/ROR/RCL/RCR until
their device access order and zero-count behavior are implemented. None occur
in the current generated C, whose SHA256 remains
`84334438ead9041714e78cfec05e0687f67f1838c172b0a4f9d75c01a7923df4`.
The rebuilt executable is
`4734582e76e0b2fe6be12349b832d6eb0ebe1024ed135e52318d8f16be2e12a5`;
binary identity is not inferred from identical generated C. This candidate
passes the public default/chunk/budget comparisons and 89 unit tests. Decoder
controls now reject 82 forms and emit 75 forms. Scoped Git attributes preserve
LF bytes for the hard-pinned EGA C/header files across Windows checkouts.

## Actual independent Luna acceptance

The primary actual Luna pass exercised the frozen executable, debug runner,
fresh standalone EGA DLL and public verification sources. It passed 89 unit
tests, 82 rejected/75 emitted decoder forms, 539 named EGA cases, 14 synthetic
seek controls, 8851 regression positives, 512 text cells, 31 regression negatives,
three admission diagnostics and all 18 initializer-matrix cases. All 20 watched
inputs remained unchanged, and all 34 current pin checks matched before/after.

Its fresh default/chunk/budget main invocations exposed an evidence-type bug:
the original oracle returns tuples for font pointer, allocator stack words and
callback pointer, while the comparator reads JSON lists. Cached reference JSON
had normalized these tuples and passed. The fresh CLI comparisons currently
failed at the font-pointer equality. After that run finished, SOL normalized
only these three evidence producer fields and added a raw-evidence/JSON-roundtrip
invariant. Internal frame tuples and strict value/order comparisons were kept.

The actual supplemental Luna pass then executed all three fresh original/C-Rust
comparisons with no cached native input. Each exited 0 with 63 complete states,
3355 logical device events, 4758 byte effects and two comparator controls.
Default/chunk ended at work 317135; the budget control stopped at 317134 with
complete partial EGA evidence. All 34 updated current pins matched before/after.
Two verifier sources changed between the passes; all 19 production inputs and
the executable/debug/DLL remained unchanged. The supplemental memo's sentence
saying all 34 pins were identical to the primary pass is incorrect and is not
used as evidence.

Local actual memos/logs are `C:/temp/goldbox-cok-luna-main-final-20261012.*`
and `C:/temp/goldbox-cok-luna-main-supplement-20261012.*`; ignored
`build/cok-recomp/main-verification-provenance.json` pins both and the candidate.
After acceptance, three helper files had only extra EOF line breaks removed.
Their body bytes and parsed ASTs are unchanged; the provenance separately
records tested old hashes and new raw hashes, rather than claiming a fresh
runtime test of those cosmetic edits.
Remaining allocation-lifetime controls, actual hardware video/timer/input
behavior, complete main return and playable gameplay remain unverified.
