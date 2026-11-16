# C64 Gold Box `SPRITE*` format

Status: **outer container solved; per-field semantics of the small header/trailer block are an
evidenced but unproven hypothesis.** Date: 2026-08-11. Updated 2026-08-11: the previously-open
"disassemble DUNGEON/COMBAT/COMBAT2/CAMP" next step is now done — see §8 — and the result is a
proven RULE-OUT (none of the four contain the GDRIVE01 parameter-block caller), not a solve.
Updated again same day (adversarial verification pass): §8.3's "searched two different ways"
coverage claim for the wider ten-overlay set was overstated for six of those overlays; §8.4
re-ran the actual scanner against them for real, found and disassembled two previously-undocumented
false positives, and pinned all three with tests. The caller is still unlocated either way.
Updated 2026-08-12 (§9): the three named remaining candidates (`SOUNDFX`, `SPR.TP`, `TITLEPG`) plus
`MUSIC`, `CODE00`/`CODE01`/`CODE03` (Death Knights only) and `SECSET64` are now checked and ruled
out too, and the "caller writes GDRIVE01's own self-modified operands directly" alternative
hypothesis was swept corpus-wide against every named PRG file on side 1 of both titles. Still no
caller — every named, extracted file on side 1 of both titles has now been checked under both
hypotheses. Consistent with (does not prove) a sibling agent's resident-kernel-at-$2E00-$3C00
hypothesis.
Updated again 2026-08-12 (adversarial verification pass on §9): the module docstring had a wrong
number (`TITLEPG`'s Death Knights score was written as 34.9%; the real, reproduced value is 42.7%,
matching what §9's own table already said); §9.4's two byte-span arithmetic results were off by
one (`GDRIVE00` `$C000-$CAF6` and `GDRIVE04` `$C000-$C81C` should be `$CAF5`/`$C81B` —
confirmed both by direct arithmetic and by independent agreement in `c64-compic-format.md` and
`c64-wallset-format.md`, which already state `$CAF5` for `GDRIVE00`); the citation for GDRIVE00's
residence pointed at the wrong doc section (disk-format.md §7.5 documents GDRIVE01's residence,
not GDRIVE00's — GDRIVE00's own is in `c64-compic-format.md` §3a); `GDRIVE04`'s "three hits"
prose named an instruction, `DEC $C467`, that is not actually one of the three matched hits (two
are `STA $C466`, one is `LDA $C466` — `$C467` is not even a scanned target); the `TITLEPG` raw hit
was claimed to be the same `STY $C080`-shaped instruction in both titles, but Death Knights'
is actually `ASL $C081`, a different opcode and address; and the ">5×"/"known BIGPIC-family
picture" framing around the illegal-opcode-fraction comparison overstated precision (Death
Knights' own confirmed-code ceiling is 9.0%, not the Champions-derived 8.3% the comparison used,
making the true margin ~4.7× not >5×; and `PIC12`'s own pixel format is itself unsolved per
disk-format.md §7.4, so it is not a "known" reference point). All corrected in place; the
underlying conclusion (the caller remains unlocated, and `TITLEPG`/`SOUNDFX`/etc. are ruled out)
is unchanged by any of these fixes. Full detail in each corrected passage below.
Updated 2026-08-13 (§14): independently of the caller hunt, the 16-byte trailer's field-to-
register mapping was tested directly against decodable body properties with a permutation null.
Two of the four candidate properties the task named (frame count, body length) are degenerate —
constant across every trailer-dialect instance in every title, nothing to correlate against — and
a third (sprite-pointer alignment) is likewise degenerate (every trailer-dialect frame 0 is
64-byte-aligned in real memory, 0/135 exceptions). The fourth (multicolour-vs-hires, via the
existing run-length heuristic) turns up one real, cross-title-replicated correlate: trailer byte 3
(not one of the two bytes §3.1 hypothesized as VIC registers), Fisher-combined p≈6.6e-6 across the
four titles — and a direct test of §3.1's own byte-11/byte-12 register-mask hypothesis against this
same property comes back null everywhere it could be tested. Neither result identifies which VIC-II
register(s) any trailer byte maps to; both are reported as evidenced, falsifiable, but incomplete.
Updated again 2026-08-13 (§15, independent verification pass on the same task): §9's SOUNDFX/
SPR.TP/TITLEPG/LIBRARY sweep and §14's trailer-byte-3 correlation (including the Fisher-combined
p≈6.6e-6) were both independently reproduced from raw bytes on a fresh read of the retail disk
images. One real gap between prose and test coverage was found and closed: `SPR.TP`'s own
`find_param_block_refs`/`find_selfmod_patch_target_refs` results were asserted in §14.1's prose but
had never been pinned by a committed test (only its bare-dialect framing was) — now pinned, with
mutation checks. No new hit, no change to either open conclusion (caller still unlocated; trailer
mapping still not solved).
Updated again 2026-08-13 (§16): the caller hunt is now swept to **all seven C64 titles** instead
of the two it had always run on — 2,662 unique file bodies across 49 sides, versus the 615 files
every earlier round used while stating its negative as a fact about the format. The claim that a
genuine reference exists in one of the five never-swept corpora is **REFUTED**: all 17 raw hits
that survive a code-vs-data gate are false positives of the two mechanisms §8.2/§8.4 already
document, including the named first candidate (Buck Rogers `COMBAT` @2464/@2536) and the
best-looking new lead (Curse of the Azure Bonds `GDRIVE03`'s two well-aligned `JSR $C08A`, which
is address-space aliasing — that file is itself a `$C000`-slot occupant). §16 also corrects the
premise it was given: there are **no** `GDRIVE01` variants — all seven titles ship the identical
2560-byte body (`sha256 274e8f92e0…`), differing only in the 2-byte CBM load word, so the
Champions-derived constants transfer by byte identity and the load word is provably not the
residence. A third search idiom (pointer-build) was added and swept at seven-title scope, also
negative. The trailer field-to-VIC-register mapping stays gated, and is now known not to be
openable by static absolute-reference search at corpus scale.

`docs/engine/research/c64-disk-format.md` §5 listed `SPRITE` (load address `$D800`) among the C64
graphics families still blocking a `?graphics=c64` mode. This note narrows that gap: the pixel
format and container framing are established with corpus-wide, falsifiable evidence; the small
non-bitmap metadata block that four of the six SPRITE-bearing titles carry is measured and
described, but its exact field-to-register mapping could not be pinned to disassembled code in
this pass, and is recorded as UNLOCATED rather than invented.

Decoder: `tools/c64_sprite.py`. Tests: `tools/test_c64_sprite.py`.

```powershell
python tools/c64_sprite.py --disk "D:/.../Champions of Krynn - Side 2.D64" --name SPRITE01 --out a.png
python tools/c64_sprite.py --disk DISK.d64 --all --outdir renders/c64_sprite --mode auto
```

## 1. Inventory

SPRITE files across all seven corpus titles, by unique name (first side wins on duplicates):

| Title | SPRITE files | Body-length clusters | Load address |
| --- | ---: | --- | --- |
| Champions of Krynn | 37 | 850 (848-byte body) only | `$4000` |
| Death Knights of Krynn | 25 | 850 only | `$4000` |
| Buck Rogers — Countdown to Doomsday | 35 | 850 only | `$4000` |
| Curse of the Azure Bonds | 39 | 850 only | `$3000` (37 unique names), `$1000` (1, `SPRITE23`) |
| Secret of the Silver Blades | 56 | 463 (35), 847 (21) | `$4000` |
| Pool of Radiance | 94 | eight clusters: 322, 450, 514, 578, 642, 706, 770, 834 | `$D800` |
| Gateway to the Savage Frontier | **0** | — | — |

Gateway ships no `SPRITE*` files at all across its 8 sides — `test_gateway_ships_no_sprite_files`
pins this so a future corpus change would surface, not silently pass.

## 2. The pixel unit: a standard 64-byte VIC-II sprite block

A real C64 hardware sprite is 24×21 pixels: 21 scanlines × 3 bytes, 63 bytes, conventionally
padded to a 64-byte-aligned block (the VIC-II sprite-pointer register holds `address / 64`, so
sprite data is always stored on a 64-byte boundary; the 64th byte is unused by the hardware).

**Proof it is exactly this, not fitted to a byte count:**

- Pool of Radiance's body lengths (subtracting the 2-byte CBM load word) are **322−2, 450−2,
  514−2, …, 834−2 = 320, 448, 512, 576, 640, 704, 768, 832**, which are **exactly `64×5` through
  `64×13`** with nothing left over. There is no header, no trailer to explain: `64` is the
  **greatest** common factor of all eight clusters (the full set of common divisors, recomputed
  directly from the eight lengths, is `{1, 2, 4, 8, 16, 32, 64}` — 64 is not unique in dividing
  them, it is simply the largest one), and the quotients are all small integers in a plausible
  "number of animation/pose frames" range. `64` specifically is the meaningful unit not because it
  is the only divisor but because it matches real VIC-II hardware: the sprite-pointer register
  holds `address / 64` (see §2), so 64-byte alignment is an independently-motivated block size, not
  an artifact of curve-fitting the byte counts.
- The other five titles' single dominant cluster, body 848, is `64×13 + 16` (see §3).

## 3. Three container dialects

All distinguished by body-length arithmetic alone, then *confirmed* by inspecting the actual extra
bytes rather than trusting the arithmetic fit on its own (the failure mode this project has hit
before — see `docs/engine/research/c64-disk-format.md` §7.4's rejected hypotheses).

| Dialect | Titles | Body length | Extra bytes |
| --- | --- | --- | --- |
| **bare** | Pool of Radiance | `64×N` | none |
| **trailer** | Champions of Krynn, Death Knights of Krynn, Buck Rogers, Curse of the Azure Bonds | `64×13 + 16` | 16 bytes at the END |
| **header** | Secret of the Silver Blades | `13 + 64×N` (N=7 or 13) | 13 bytes at the START |

`tools/c64_sprite.py`'s `framing()` implements exactly this three-way classification and is the
single source of truth for it; `frames()` returns the list of 64-byte blocks regardless of
dialect.

### 3.1 The 16-byte trailer

Body offset 832..847 for every trailer-dialect file. Sampled across Champions of Krynn (37
files), the last 6 bytes are `03 xx yy 00 00 00` **in every file**:

```
SPRITE01   01 01 55 74 00 01 01 06 f8 fa 03 0f 3f 00 00 00
SPRITE08   01 0a 54 7c 00 01 01 07 f2 fb 03 0f 3f 00 00 00
SPRITE23   01 02 53 88 00 00 01 08 fa fe 03 0f 3f 00 00 00
```

That is far too improbable to be sprite pixel data reused as a 14th block — real bitmap content at
that offset would need to coincidentally end in the same 6 bytes across dozens of unrelated
creatures. It is metadata, and `framing()`'s trailer branch requires byte 10 to read `0x03` before
accepting the dialect (`test_trailer_byte_10_is_always_3_by_construction`), which is true in every
sampled file but one (see §5).

**What varies, and the hypothesis it suggests.** Byte 10 (`03`) is constant across every one of
the 136 instances in the table below except the single Death Knights of Krynn `SPRITE62` anomaly
(the `3F 3F 3F` row, 1/25) — the very anomaly `framing()` excludes from the trailer dialect for
exactly this reason (§5). Bytes 11-12 vary too, and not only in Curse of the Azure Bonds — 3 of
Buck Rogers' 35 instances (`03 03 3F` and `03 07 3F`) carry non-default values as well:

| Bytes 10-12 | Champions | Death Knights | Buck Rogers | Curse of the Azure Bonds |
| --- | ---: | ---: | ---: | ---: |
| `03 0F 3F` | 37/37 | 24/25 | 32/35 | 7/39 |
| `03 03 3F` | — | — | 2/35 | 11/39 |
| `03 03 0F` | — | — | — | 5/39 |
| `03 03 1F` | — | — | — | 2/39 |
| `03 07 0F` | — | — | — | 8/39 |
| `03 07 3F` | — | — | 1/35 | 3/39 |
| `03 0F 0F` | — | — | — | 1/39 |
| `03 0F 1F` | — | — | — | 2/39 |
| `3F 3F 3F` | — | 1/25 | — | — |

Every column sums to its own denominator (37/37, 25/25, 35/35, 39/39), so the table is exhaustive
over all 136 850-byte-body `SPRITE*` instances across these four titles — counted per instance,
not per unique name, because several sides carry duplicate copies. Of those 136, 135 are genuine
trailer-dialect files (byte 10 = `03`); the `3F 3F 3F` row is the single DoK SPRITE62 anomaly
(§5), which byte 10 alone is why `framing()` rejects it rather than accepting it as a trailer
dialect.

This pattern — one byte fixed, two bytes varying only across `{03,07,0F}` and `{0F,1F,3F}` — is
consistent with three VIC-II sprite registers: `$D01D` (X-expand mask), `$D015` (sprite-enable
mask) and `$D01C` (multicolour-enable mask), where CoAB's creatures legitimately need different
numbers of hardware sprites (2, 3, or 4 body-part sprites) to build their composite, while the
simpler CoK/DoK/Buck engine mostly uses a fixed 4-sprite composite. **This is a hypothesis, not a
proven fact** — see §4 for why it could not be bound to code.

### 3.2 The 13-byte header (Secret of the Silver Blades)

Body offset 0..12, before the bitmap blocks start. Sample:

```
SPRITE01 (7 frames)   4f 75 00 00 00 00 50 75 00 00 01 08 50
SPRITE03 (13 frames)  50 73 00 00 00 00 50 73 00 00 00 07 5b
SPRITE12 (13 frames)  4f 73 00 00 00 00 4f 73 00 00 01 07 50
```

Structurally similar to the trailer's first two 5-byte groups (a coordinate-like pair, then
zeros, then a second near-equal coordinate pair, then zeros, then a small flag/colour-range
byte) but at the *opposite* end of the file — Secret is one game generation later in the series
and evidently repositioned (and slightly resized, 13 vs 16 bytes) whatever this block is. Checking
the *end* of Secret's files for the CoK-style `03 xx yy 00 00 00` trailer motif found nothing
resembling it, which is why this reads as a header for this title rather than a second instance of
the trailer dialect.

## 4. What blocks a full field-level decode: the caller is unlocated

`GDRIVE01` (Champions of Krynn side 1, stored load word `$4000`, real origin `$C000` — a 25-entry
absolute-`JMP` table exactly `$A00` bytes long, same evidence pattern as
`docs/engine/research/c64-disk-format.md` §7.5) contains the sprite-composite driver. Two call
sites were located and disassembled:

**Entry `$C6BA`** (JMP table slots 19 and 20, i.e. `$C039`/`$C03C` — two slots reach the same routine; slot 18 at `$C036` goes elsewhere, to `$C661`) is the top-level "draw sprite
composite" routine. It saves the caller's A/X/Y, then patches two self-modifying operands from
16-bit variables the routine itself never initialises:

```
C6C6  AD 87 C0   LDA $C087
C6C9  8D 63 C7   STA $C763        ; patches the low byte of "STA $FFFF,X" at $C762
C6CC  AD 88 C0   LDA $C088
C6CF  8D 64 C7   STA $C764        ; patches the high byte
C6D2  AD 8B C0   LDA $C08B
C6D5  8D 6B C7   STA $C76B        ; patches "LDA $FFFF,Y" at $C76A
C6D8  AD 8C C0   LDA $C08C
C6DB  8D 6C C7   STA $C76C
```

**The inner loop at `$C744-C795`** builds the sprite-enable and multicolour-enable masks bit by
bit for 8 hardware sprites (`LDX #$07` downto 0) using self-modifying operand bytes — the `ROL
$C78B` / `ROL $C781` instructions write directly into the immediate-operand byte of the `ORA
#$00` instructions three bytes later, so the accumulated masks feed straight into `$D01C` and
`$D015`:

```
C759  LDA $C099,X       ; per-hardware-sprite slot table, built by an earlier loop
C75C  BMI $C766         ; $FF = this hardware sprite slot unused this frame
C75E  TAY
C75F  ADC $C098         ; base sprite-block number + per-slot index -> A
C762  STA $FFFF,X       ; -> the patched pointer: the VIC sprite-pointer table
...
C76A  LDA $FFFF,Y       ; -> the patched pointer2: a per-frame attribute byte
C76D  BPL $C770
C770  ROL $C781         ; self-modifying: writes the operand byte of "ORA #$00" at $C780
C773  AND #$0F
C775  STA $D027,X       ; per-hardware-sprite individual colour, low nibble of the fetched byte
...
C77B  LDA $D01C
C77E  AND #$03
C780  ORA #$00          ; operand patched by the ROL above -> multicolour-enable mask
C782  STA $D01C
C785  LDA $D015
C788  AND #$03
C78A  ORA #$00          ; operand patched by the $C78B ROL -> sprite-enable mask
C78C  STA $D015
```

This is exactly the mechanism §3.1's hypothesis needs — a per-hardware-sprite colour byte and
accumulated enable/multicolour masks written to `$D027`/`$D01C`/`$D015` — **but `$C087/$C088` and
`$C08B/$C08C` are parameters, written by whichever overlay calls this entry point.** `DUNGEON`,
`COMBAT`, `COMBAT2` and `CAMP` were the leading suspects — **§8 (2026-08-11) disassembles all four,
in both Champions of Krynn and Death Knights of Krynn, and rules every one of them out**: no
genuine reference to the parameter block exists in any of the eight files. The caller is still
unlocated; §8.3 lists everything checked and the concrete next candidates.

## 5. The one anomaly: Death Knights of Krynn `SPRITE62`

One file across the whole 192-file corpus does not classify under any of the three dialects:
`Death Knights of Krynn` side 2, `SPRITE62`, an 850-byte (848-body) file whose would-be trailer is

```
01 04 44 68 01 01 01 0e f7 f8 3f 3f 3f 00 00 00
```

Byte 10 is `3f`, not the `03` each of the other 135 trailer-dialect files carries.
Its CBM directory entry also has a **block count of 0**, unlike every other SPRITE entry (normally
4 for an 850-byte file) — `read_file_checked` does not flag this as a problem only because its
own consistency check is skipped when the directory's block count is zero, so this file has less
assurance behind it than an ordinary "reads clean" entry. This reads as a genuine source-data
oddity (an unusual or lightly corrupted directory record on the original master), not a decoder
bug: forcing the signature check to accept it would be inventing a fourth dialect to explain one
file. `framing()` correctly raises `ValueError` on it, and
`test_every_sprite_file_classifies_except_the_one_known_anomaly` pins this file by name so it
cannot silently start (or stop) being an exception without the test noticing.

## 6. Hires vs multicolour: settled by a falsifiable, corpus-wide measurement

The trailer's multicolour-enable-mask hypothesis (§3.1) initially suggested multicolour was the
right pixel decode. Visual inspection of individual frames disagreed for most of them (see below),
so this was checked quantitatively rather than by eye, following this project's rule to derive
from evidence rather than plausibility.

**Method: run-length coherence.** For every non-blank sprite block, decode it both ways —
1 bit/pixel hires (24 columns) and 2 bits/pixel multicolour (12 undoubled symbol columns, so the
two decodes are compared at the same information rate rather than letting multicolour's doubled
display pixels artificially inflate its run length) — and score each by average same-value run
length per scanline. Real line art has long runs; the wrong bit-grouping for a given byte pattern
produces alternating noise with runs near 1. This is the same falsifiable-structural-test
technique that solved the DAX, DAA and C64-picture (§7.4 of the disk-format doc) codecs.

**Result, frames-won by mode, across every title with SPRITE data:**

| Title | hires wins | multicolour wins |
| --- | ---: | ---: |
| Champions of Krynn | 284 | 28 |
| Death Knights of Krynn | 180 | 14 |
| Buck Rogers — Countdown to Doomsday | 285 | 26 |
| Curse of the Azure Bonds | 453 | 38 |
| Secret of the Silver Blades | 303 | 19 |
| Pool of Radiance | 593 | 45 |

Hires wins by at least 10:1 on every title (10.1:1 to 15.9:1), including Pool of Radiance's
unrelated bare dialect —
strong, consistent, corpus-wide evidence that these are **hires sprites**, not multicolour.
`test_hires_beats_multicolour_on_the_whole_corpus` pins the `>3×` margin;
`test_swapping_the_two_scorers_reverses_the_corpus_verdict` proves the claim is falsifiable by
literally swapping which scorer's output is attributed to which mode and confirming the corpus
verdict flips hard the other way.

**A genuine minority of individual frames render better under multicolour.** Champions of Krynn
`SPRITE01` frame 5, for example, is unstructured vertical-stripe noise under forced hires but a
coherent green-and-red silhouette (plausibly a lower body / boots) under multicolour. Whether mode
selection is truly per-frame (some frames are outline art, others shaded multicolour insets) or
whether these are simply frames the heuristic mis-scores is unresolved — the decoder exposes an
`auto` mode (`--mode auto`) that applies the same per-frame heuristic used for the measurement, but
this is explicitly a best-effort reading, not a proven per-frame mode selector. The plain `hires`
mode (the default) is the corpus-majority interpretation and involves no per-frame guessing.

## 7. Not established

- **Per-frame or per-slot colour and register semantics** (§4) — `DUNGEON`/`COMBAT`/`COMBAT2`/`CAMP`
  are now disassembled and ruled out as the caller (§8); binding `$C087`/`$C08B` to a concrete file
  offset needs a still-unidentified caller, see §8.3 for candidates.
- **Whether hires/multicolour mode is genuinely mixed within one file**, and if so, the real
  per-frame selector (§6) — the `auto` heuristic is a best-effort substitute, not a derived answer.
- **The one Death Knights of Krynn anomaly** (§5) — plausibly a lightly damaged or unusual master
  disk record; not reproduced anywhere else in the corpus.
- Curse of the Azure Bonds' `SPRITE23` loads at `$1000` where every other SPRITE file in the title
  loads at `$3000` (see §1) — body length and dialect are ordinary (850 bytes, trailer), so this is
  purely a load-address anomaly. Not investigated further; it does not affect decoding.

## 8. 2026-08-11: the four named-overlay callers are RULED OUT, not found

§4's concrete next step was to disassemble `DUNGEON`, `COMBAT`, `COMBAT2` and `CAMP` (present as
loose PRG files on the disk set, ~38 blocks each) and look for the code that populates GDRIVE01's
caller-supplied parameter block ($C083/$C084, $C087/$C088, $C08B/$C08C) before it reaches the
sprite-composite entry at `$C6BA`. That disassembly happened this round. **The result is a
proven negative, not a confirmation**: none of the four files — in either Champions of Krynn or
Death Knights of Krynn — contains a genuine reference to that parameter block.

### 8.1 What was searched

`tools/c64_sprite.py:find_param_block_refs` wraps `c64_disasm.find_stores` over the full
`$C080-$C08F` span (not just the two pointer pairs the trailer question turns on — the third pair
at `$C083/$C084` is in scope too, in case it turns out to be relevant). Run directly against the
real disk images (side 1 of each title, `D:\Games\Emulator\C64\Goldbox\<Title>\<Title> - Side
1.D64`), for `DUNGEON`, `COMBAT`, `COMBAT2`, `CAMP` in both Champions of Krynn and Death Knights of
Krynn (8 files total):

```
python3 -c "
import sys; sys.path.insert(0,'tools')
import c64_disk as c64, c64_sprite as S
from pathlib import Path
for title in ['Champions of Krynn','Death Knights of Krynn']:
    img = Path('D:/Games/Emulator/C64/Goldbox')/title/f'{title} - Side 1.D64'
    disk = c64.read_image(img); entries={e.name:e for e in c64.directory(disk)}
    for name in ['DUNGEON','COMBAT','COMBAT2','CAMP']:
        data,_ = c64.read_file_checked(disk, entries[name])
        print(title, name, S.find_param_block_refs(S.body(data)))
"
```

Result: every file returns `[]` **except** each title's own `DUNGEON`, which returns exactly one
raw offset (`6244` for Champions of Krynn, `5731` for Death Knights of Krynn — different absolute
offsets because the two titles' `DUNGEON` files differ in length, 9454 vs 8250 bytes).

A second, complementary search style was also tried: an immediate load of one of the parameter
block's low bytes (`LDA #$83` / `#$87` / `#$8B`, i.e. opcode+operand `A9 83` / `A9 87` / `A9 8B`,
looking for an indirect ("caller builds a zero-page pointer, GDRIVE01 is never touched by
literal address") setup instead of a direct absolute store) across all ten named `$0800`-family
overlays (the four above plus `GEN`, `INIT`, `LIBRARY`, `COM.PREP`/`COMPREP`,
`POST.COM`/`POSTCOM`) and the `GDRIVE00` dispatcher. It surfaced several hits (`COMBAT` alone has
ten), but every one inspected in context feeds an unrelated destination — e.g. Champions of Krynn
`COMBAT` offset 3420 is `LDA #$83` / `JMP $FD86` (loads a BASIC/KERNAL-adjacent routine parameter,
nothing to do with GDRIVE01), and offset 5368 is `LDA #$83` / `JSR $26A3`, where `$26A3` itself
`STA`s the accumulator to `$7D00` — a shared-globals cell documented in the scout handoff, not the
$C08x block. None of these is the caller either.

### 8.2 Why the one DUNGEON hit is a false positive, not a discovery

`test_the_dungeon_false_positive_sits_in_a_desynced_byte_run` pins the proof. Both titles' hit
sits a handful of bytes downstream of the byte value `0xC3` — not a defined NMOS 6502 opcode, so
any linear decode that reaches it has already lost real instruction alignment (this is the same
"illegal opcodes decode as `.byte`, so a wrong entry point degrades into visible noise" signal
`tools/c64_disasm.py` is deliberately built to expose, and the same class of evidence the scout
handoff already used to dismiss DoK `GDRIVE04`'s `JMP $C088` as coincidental). Champions of Krynn's
window, disassembled at its real `$0800` origin:

```
2058  7E AD 4C   ROR $4CAD,X
205B  C0 8D      CPY #$8D
205D  C3           .byte $C3      <- illegal opcode: desync marker
205E  7E AE BF   ROR $BFAE,X
2061  7E BD B5   ROR $B5BD,X
2064  20 8D C0   JSR $C08D        <- the raw find_stores() hit (body offset 6244)
```

`ROR $4CAD,X`, `ROR $BFAE,X`, `ROR $B5BD,X` are nonsense operands for a first-person dungeon
renderer (absolute addresses with no other referent anywhere in this file family) — this stretch
is very likely embedded binary data (a lookup/remap table), not executed code, and `JSR $C08D`
only appears because the byte pair `8D C0` happens to follow an opcode-shaped byte (`0x20`) at
this one coincidental position. Death Knights of Krynn's `DUNGEON` shows the identical structural
pattern at its own (differently-offset) hit — same `$C3` a few bytes upstream, same trailing
`8D C0` pair, different leading opcode byte (`0x1E` → `ASL $C08D,X` instead of `0x20` → `JSR
$C08D`) purely because the two titles' files are shifted relative to each other. Two independent
titles producing the same coincidence in the same relative shape is further evidence this is a
shared data table both games carry, not a call site either one executes.

An earlier scan pass (before this file's official test) also flagged a raw hit in `LIBRARY` (not
one of the four named targets, scanned anyway as a completeness check) at absolute `$0A02` on the
narrower `{$C087,$C088,$C08B,$C08C}` set. Disassembly there is unambiguous and even simpler to
dismiss: the byte the scanner lands on (`0x4C`) is the zero-page operand of the immediately
preceding `STA ($4C),Y` (opcode `0x91`), and the following `0x88 0xC0` it reads as a JMP target is
just the next two real instructions, `DEY` (`0x88`) then the opcode byte of `CPY #$FF` (`0xC0
0xFF`) — three genuine, unrelated instructions the byte-level scanner mis-groups into one
fictitious `JMP $C088`. `LIBRARY` is not part of the pinned test (out of the four named targets)
but the same “disassemble around every hit” discipline applies equally there.

### 8.3 Where this leaves the open question

The caller is not in `DUNGEON`, `COMBAT`, `COMBAT2`, `CAMP`, `GEN`, `INIT`, `LIBRARY`,
`COM.PREP`/`COMPREP`, `POST.COM`/`POSTCOM`, or `GDRIVE00` — all ten named `$0800`-family overlays
plus the graphics-API dispatcher, in both Champions of Krynn and Death Knights of Krynn. **Revised
2026-08-11 (verification pass):** the original version of this sentence said these ten files were
"searched two different ways", but only the four overlays above (§8.1) had ever had the literal
absolute-reference scanner (`find_param_block_refs`) run against them as a pinned, mutation-tested
check — the wider six were checked only with the narrower one-off immediate-load-style scan (which
cannot see a literal `STA $C08x`/`JSR $C08x` the way `find_param_block_refs` can). Running the same
absolute-reference scanner against the wider six for real (now pinned by
`test_no_genuine_param_block_reference_in_the_wider_overlay_set`) surfaced two more raw hits nobody
had disassembled yet: Death Knights of Krynn `GEN` (offset 6323) and Death Knights of Krynn
`LIBRARY` (offset 427) — Champions of Krynn's own `LIBRARY` hit (514) had been shown in prose (§8.2)
but was likewise never a pinned test until now. §8.4 disassembles all three; each is confirmed a
false positive by the same discipline as the `DUNGEON` case, so the "caller not found" conclusion is
unchanged, but the ten-file coverage claim needed correcting to match what was actually run. This
rules out every file this project has so far extracted and named for these two titles. Concrete
next candidates, none yet tried: `SOUNDFX`, `SPR.TP` and
`TITLEPG` (present in the fuller `cok_all`/`dok_all` extracts, flagged as unscanned by the scout
handoff) — a quick check this round found `TITLEPG` does not decode as coherent code at `$0800`
(consistent with it being a title-screen picture, not a code overlay) and `SOUNDFX` decodes
coherently at `$0800` but its JMP-table targets ($B213/$B3FC/$B45C) and only observed absolute
write (`$D418`, `SID_VOL`) point at a sound driver, not the VIC-II sprite parameter block — neither
looks promising on this pass, but neither was disassembled in full. Worth noting as an incidental
find, not pursued further here: `SPR.TP`'s body is exactly `64*7 = 448` bytes with no header or
trailer — structurally a `bare`-dialect SPRITE-family file that simply isn't named `SPRITE*`, so it
was invisible to every corpus scan in §1-§7. A future round chasing the caller should also consider
that GDRIVE01 might be invoked with the parameter block set up entirely in zero page by a routine
this static byte-pattern search cannot see (e.g. copied via a loop with a runtime-computed base
rather than two `LDA #imm` instructions), which would need single-stepping, not another grep.

Mutation checks run this round (see `tools/test_c64_sprite.py`): `find_param_block_refs` forced to
return `[]` unconditionally → `test_find_param_block_refs_detects_a_genuine_injected_reference`
went red (confirms the scanner is exercised, not vacuous); `CallerSearchTests.
KNOWN_FALSE_POSITIVE` temporarily emptied → `test_no_genuine_param_block_reference_in_the_four_
named_overlays` went red on Champions of Krynn's real `DUNGEON` hit (confirms the corpus test
actually inspects real bytes, not a mocked/stubbed body); the expected `$C08D` operand bytes in
`test_the_dungeon_false_positive_sits_in_a_desynced_byte_run` temporarily corrupted → that test
went red too. All three restored and reverified green (`python -m pytest tools/test_c64_sprite.py
-q` → 23 passed).

### 8.4 2026-08-11 (verification pass): the wider six overlays checked for real, two more false
positives found and pinned

Adversarial re-check of §8.3's coverage claim ran `find_param_block_refs` (the literal
absolute-reference scanner, not the ad hoc immediate-load search) against the six overlays that
sentence named but that no committed test had ever pointed the scanner at: `GEN`, `INIT`,
`LIBRARY`, `COM.PREP`/`COMPREP`, `POST.COM`/`POSTCOM`, `GDRIVE00` (both titles). Result, read
straight off the real disk images:

```
Champions of Krynn   GEN [] INIT [] LIBRARY [514] COM.PREP [] POST.COM [] GDRIVE00 []
Death Knights of Krynn  GEN [6323] INIT [] LIBRARY [427] COMPREP [] POSTCOM [] GDRIVE00 []
```

Champions of Krynn's `LIBRARY` hit at 514 is the same one already walked through in §8.2 (the
`STA ($4C),Y` / `DEY` / `CPY #$FF` misread as `JMP $C088`) — it had been shown in prose but was
never a pinned test before this pass. Two more had never been mentioned at all:

**Death Knights of Krynn `LIBRARY`, offset 427** is the identical `STA ($4C),Y` pattern shifted by
a few bytes (this title's `LIBRARY` file is a slightly different length than Champions of Krynn's)
— same routine, same false-positive shape, confirmed by inspection.

**Death Knights of Krynn `GEN`, offset 6323** is a cleaner, more instructive false positive: no
illegal-opcode desync marker anywhere nearby. Disassembled at the real `$0800` origin (`GEN`'s own
directory entry has a block count of 0, the same "less assurance" caveat §5 documents for
`SPRITE62`, but the disassembly below is internally consistent and shows no `.byte`/illegal-opcode
noise, so `$0800` reads as correct for this file too):

```
20A9  BD B1 20   LDA $20B1,X
20AC  20 64 81   JSR $8164
20AF  68         PLA
20B0  AA         TAX
20B1  BD E3 20   LDA $20E3,X      <- real instruction, occupies $20B1-$20B3
20B4  8D C0 20   STA $20C0        <- real instruction, occupies $20B4-$20B6
```

`find_param_block_refs` does a byte-level scan with no notion of instruction boundaries, so it
also considers the LAST byte of `LDA $20E3,X` (the `$20` at `$20B3`, body offset 6323) as a
candidate opcode: byte `$20` is JSR, and the following two bytes — `$8D`/`$C0`, which are really
the opcode and low operand byte of the genuine `STA $20C0` right after it — spell out `$C08D` as a
JSR operand purely by coincidence. Every byte in this window is real, correctly-decoded code; the
scanner just doesn't (and by design can't, without a full decoder) respect where one instruction
ends and the next begins. This is a different false-positive mechanism than `DUNGEON`'s ($C3-desync
case), and a useful reminder that a hit needs its own disassembly, not just "no desync marker
nearby", before being trusted — `test_the_gen_false_positive_is_a_clean_alignment_coincidence_not_
a_desync` pins the exact byte boundaries above so this can't silently regress into being read as a
real reference.

All three hits are pinned in `CallerSearchTests.WIDER_KNOWN_FALSE_POSITIVE` and exercised by
`test_no_genuine_param_block_reference_in_the_wider_overlay_set`, mutation-checked the same way as
the four-overlay test (an entry removed from the expected dict → red on the real hit; restored →
green). Full suite after this pass: `python -m pytest tools/test_c64_sprite.py -q` → **25 passed**
(23 from the earlier 2026-08-11 pass + these 2 new tests). The caller conclusion itself is
unchanged — this closes a coverage gap in how the claim was evidenced, not the claim.

## 9. 2026-08-12: the six named remaining candidates checked, plus the self-modifying-operand
hypothesis swept corpus-wide — still no caller

§8.3's closing paragraph named three concrete next candidates (`SOUNDFX`, `SPR.TP`, `TITLEPG`) and
noted a fourth, untested-statically hypothesis: that the caller sets up GDRIVE01's parameter block
through a path this project's literal byte-pattern scanner cannot see. This section closes all of
that out. `tools/c64_sprite.py` gained two new scan primitives and one classification metric to do
it; `tools/test_c64_sprite.py` pins every claim below with a corpus-run test, and every
substantive one was seen to fail under a deliberate runtime mutation before being trusted (see
§9.5).

### 9.1 The three named candidates

**`SOUNDFX`** — `find_param_block_refs` and the new `find_selfmod_patch_target_refs` (§9.3) both
return `[]` on the real file, in both titles. It is a genuine, self-contained code overlay (not
data): its own three-entry `JMP` table at body offset 0 (`JMP $B213` / `JMP $B3FC` / `JMP $B45C`)
and every other `JSR`/`JMP` target found by a full linear decode (`$B213, $B236, $B2B7, $B311,
$B3E5, $B3F0, $B3FC, $B45C, $B45F`) land inside a single `$B000`-based span if the file's real
origin is `$B000` — `$B45F - $B000 = 0x45F = 1119 < 1238` (the body length), i.e. every jump target
this file's own code executes is self-contained under that origin, the same self-containment
evidence pattern used to settle `GDRIVE01`'s own residence
(`docs/engine/research/c64-disk-format.md` §7.5) and `GDRIVE00`'s (`docs/engine/research/
c64-compic-format.md` §3a — not §7.5 of the disk-format doc, which is about `GDRIVE01`, a
different file). Both titles' 1238-byte `SOUNDFX` bodies produce the *identical* target set,
cross-title agreement on top of self-containment. One caveat this pass did not disclose: a truly
unrestricted linear decode of the WHOLE 1238-byte body (not stopping at `$B45F`) turns up a 10th
absolute `JMP`/`JSR` target, `$0200`, at body offset 1185 — outside the `$B000`-based span. Body
offsets 1119-1237 (post-`$B45F`) score 30.8% on the illegal-opcode-fraction metric (§9.1 below),
consistent with that tail being a note/parameter data table, not code, so a byte-level scan
running into it and misreading a `JMP` opcode is the same "linear decode desyncs into data"
failure mode this project has hit before (§8.2's `DUNGEON` false positive) — but the phrase "every
... target found by a full linear decode" land inside the span is not literally true of a
mechanical whole-body decode; the 9-target list above is the reachable code from the 3 real JMP-
table entries, not literally every byte-0-onward decoded target. This is a genuine, previously-
unstated finding about `SOUNDFX`'s residence (≈`$B000`, a sound-driver slot distinct from the
`$0800` overlay slot and the `$C000` graphics-driver slot already in the established memory map)
— offered here because it fell directly out of ruling `SOUNDFX` in or out as the sprite caller, not
chased further (it is out of this file's scope; a future audio-format pass owns it). `SOUNDFX`'s
only observed absolute *write* remains `$D418` (`SID_VOL`, as §8.3 already noted) — nothing in
`$C080-$C08F` or the self-modifying-target set. Ruled out.

**`SPR.TP`** — confirmed, not just noted: `S.framing(S.body(data))` returns
`Framing('bare', 7, 0, b'')` for the real file in both titles (`test_sprtp_is_bare_dialect_sprite_
family_data_not_code`). Exactly the bare SPRITE dialect (§3), 7 sprite-block frames, no header or
trailer — ordinary SPRITE-family pixel data that simply isn't named `SPRITE*`, so no name-filtered
corpus scan in §1-§8 ever looked at it. Not code, not a caller candidate.

**`TITLEPG`** — §8.3 already noted it "does not decode as coherent code at `$0800`"; this pass
makes that a real, falsifiable, calibrated measurement instead of an eyeballed claim. New function
`illegal_opcode_fraction(body)` walks a linear 6502 decode from body offset 0 and reports what
fraction of decoded "instructions" land on an undefined opcode byte or an operand that runs past
the end of the file — real code should be almost entirely defined opcodes; unrelated binary data
should not be. **This measurement does not depend on org** (instruction *boundaries* only depend
on where the walk starts, byte 0, never on how addresses are printed), so it is exactly as valid
regardless of what `TITLEPG`'s real origin might be, unlike a plain "does it disassemble sensibly
at `$0800`" eyeball check.

Calibrated against four overlays this project has independently confirmed are genuine code (by
their own self-consistent `JMP` tables / call graphs, never by this metric):

| File | illegal-opcode fraction (Champions of Krynn) | Death Knights of Krynn |
| --- | ---: | ---: |
| `COMBAT` | 0.5% | 0.5% |
| `LIBRARY` | 6.0% | 6.6% |
| `DUNGEON` | 7.7% | 9.0% |
| `GDRIVE01` | 8.3% | 8.3% |
| **`TITLEPG`** | **43.9%** | **42.7%** |
| for reference: a `PIC`-family picture (`PIC12`, Champions of Krynn only) | 31.6% | — |

`TITLEPG` scores comfortably more than 4× the highest confirmed-code score in EITHER title, using
that title's OWN confirmed-code files (Death Knights' own ceiling is `DUNGEON`'s 9.0%, not
Champions' 8.3% — the two titles' `LIBRARY`/`DUNGEON` bodies are different lengths and score
slightly differently, so a cross-title "more than 5×" claim against a single title's numbers would
overstate Death Knights' margin: 42.7% / 9.0% ≈ 4.7×, not >5×). `TITLEPG` also lands in the same
range as `PIC12`, a same-corpus C64 `PIC`-family file — but `PIC12`'s own pixel encoding is itself
**unsolved** (`docs/engine/research/c64-disk-format.md` §7.4 explicitly separates the fixed-size,
solved `BIGPIC`-family format, always 2681/2682 bytes, from "ordinary `PIC` files" like `PIC12`
(1049-byte body, inside the documented 717–2358-byte unsolved-format range), which "remain[s]
unsolved"). So `PIC12` is offered only as a second real, measured non-code data point from the same
corpus — not as a "known-good" calibration reference, and not proof it is "pure graphics data" by
any means stronger than its own naming convention. **Verified non-vacuous**: slicing `DUNGEON`'s
own 9452 real code bytes down to `TITLEPG`'s length and scoring that slice gives 11.4%
— still code-like, nowhere near 43.9% — so the metric tracks real byte content, not merely file
length (`python3` one-liner reproduced in §9.5; pinned as a mutation control on the test itself,
not a separate committed test).

`TITLEPG` does still produce one raw `find_param_block_refs` hit per title (body offset 2589 in
Champions of Krynn, a `STY $C080` 3-byte match `8C 80 C0`; body offset 1716 in Death Knights of
Krynn, a *different* instruction and address, `ASL $C081` `0E 81 C0` — not the same "STY $C080"
shape the Champions hit has, just another absolute-mode operand that happens to land inside
`$C080-$C08F`). Disassembling the 12 bytes immediately before each hit finds several
undefined-opcode byte values in both windows:

```
Champions of Krynn   (offset 2589): 84 30 82 3f 10 01 c0 e0 70 38 18 0c
                                          ^^                        ^^
                                     illegal $82, $3F                illegal $0C
Death Knights of Krynn (offset 1716): 03 01 83 00 12 07 0d 01 00 80 e0 38
                                             ^^          ^^       ^^
                                        illegal $83     $12/$07   illegal $80
```

— the same "wrong alignment degrades into visible noise" signal as the `DUNGEON` false positive
(§8.2), reinforcing the illegal-opcode-fraction verdict that this whole file is not an ordinary
code stream starting at byte 0. Pinned in `test_the_titlepg_false_positive_sits_in_an_illegal_
opcode_dense_region`. Ruled out as the caller.

### 9.2 The other named candidates: `MUSIC`, `CODE00`/`CODE01`/`CODE03`, `SECSET64`

Both scanners (`find_param_block_refs` and `find_selfmod_patch_target_refs`, §9.3) return `[]` on
every one of these, in every title that ships them, run straight off the real disk images:

| File | Titles | `find_param_block_refs` | `find_selfmod_patch_target_refs` |
| --- | --- | --- | --- |
| `MUSIC` | Champions of Krynn, Death Knights of Krynn | `[]` | `[]` |
| `CODE00` | Death Knights of Krynn only (Champions ships none) | `[]` | `[]` |
| `CODE01` | Death Knights of Krynn only | `[]` | `[]` |
| `CODE03` | Death Knights of Krynn only | `[]` | `[]` |
| `SECSET64` | Champions of Krynn, Death Knights of Krynn | `[]` | `[]` |

`MUSIC` scores 46.4% (Champions of Krynn) / 31.6% (Death Knights of Krynn) on the illegal-opcode-
fraction metric (§9.1) — both well above the confirmed-code group's 8.3% ceiling, consistent with
sound-pattern/note-table data (as its name suggests) rather than pure code, though the two titles'
own `MUSIC` files clearly differ enough in structure that this is offered as supporting context, not
a proven claim (no test pins either number — only the caller-search scan result is pinned, per this
file's remit). `SECSET64` scores 0.0% — see the honest caveat in §9.6. All five are added to `CallerSearchTests.WIDER_OVERLAYS` and
covered by the existing `test_no_genuine_param_block_reference_in_the_wider_overlay_set` (no entry
needed in `WIDER_KNOWN_FALSE_POSITIVE`, since all five come back clean) and the new
`test_no_selfmod_patch_target_reference_in_any_named_overlay` (§9.3). Ruled out.

### 9.3 The self-modifying-operand hypothesis: three internal GDRIVE01 entry points, swept
corpus-wide, still no external caller

§4's excerpt showed one GDRIVE01 entry point (`$C6BA`) copying `$C087/$C088` and `$C08B/$C08C` into
its own self-modifying operands at `$C763/$C764` and `$C76B/$C76C`. Disassembling further around
GDRIVE01's use of the third parameter pair (`$C083/$C084`) found **two more** such entry points
doing the identical trick with different targets:

```
; entry ~$C449 (Champions of Krynn GDRIVE01, real origin $C000)
C449  AD 85 C0   LDA $C085          ; patches STA $FFFF,X operand -> per-hardware-sprite pointer
C44C  8D 65 C4   STA $C465
C44F  AD 86 C0   LDA $C086
C452  8D 66 C4   STA $C466
C455  AD 83 C0   LDA $C083
C458  8D 62 C4   STA $C462
C45B  AD 84 C0   LDA $C084
C45E  8D 63 C4   STA $C463

; entry ~$C8D3 (part of the same routine excerpted in §4, continuing past C6BA's entry)
C8D3  AD 83 C0   LDA $C083
C8D6  8D EE C8   STA $C8EE          ; patches "LDA $FFFF,Y" at $C8ED (source pointer of a
C8D9  AD 84 C0   LDA $C084          ; byte-copy loop, up to 0x7F/0x3F bytes long)
C8DC  8D EF C8   STA $C8EF
C8DF  AD 8B C0   LDA $C08B
C8E2  8D FF C8   STA $C8FF          ; patches "STA $FFFF,X" at $C8FE (destination pointer of
C8E5  AD 8C C0   LDA $C08C          ; the same copy loop)
C8E8  8D 00 C9   STA $C900
```

(`$C089/$C08A` feed an `ADC`-based destination-pointer computation at the `$C8D3` entry, not a
direct copy, so they are not treated as a patch-target pair.) So the parameter block is richer than
§4 alone showed — at least **five** 16-bit pointer pairs (`$C083/$C084` through `$C08B/$C08C`,
all within the already-swept `$C080-$C08F` span) feed **three** separate self-modifying entry
points inside GDRIVE01, patching six real memory-cell pairs:
`GDRIVE01_SELFMOD_PATCH_TARGETS = ($C462,$C463, $C465,$C466, $C763,$C764, $C76B,$C76C, $C8EE,$C8EF,
$C8FF,$C900)`, now a named constant in `tools/c64_sprite.py`.

This makes the untested §8.3 hypothesis concrete and checkable: **maybe some overlay writes these
six *patched* addresses directly, instead of the untouched `$C080-$C08F` block.** New function
`find_selfmod_patch_target_refs` (same `c64_disasm.find_stores` wrapper as `find_param_block_refs`,
same candidate-not-proof caveat) was run against every named PRG file on side 1 of both titles —
not just the caller-search shortlist, the *entire* directory (82 files, Champions of Krynn; 91,
Death Knights of Krynn):

```
python3 -c "
import sys; sys.path.insert(0,'tools')
import c64_disk as c64, c64_disasm as disasm
from pathlib import Path
targets = {0xC462,0xC463,0xC465,0xC466,0xC763,0xC764,0xC76B,0xC76C,0xC8EE,0xC8EF,0xC8FF,0xC900}
for title in ['Champions of Krynn','Death Knights of Krynn']:
    img = Path('D:/Games/Emulator/C64/Goldbox')/title/f'{title} - Side 1.D64'
    disk = c64.read_image(img); entries={e.name:e for e in c64.directory(disk)}
    for name, e in sorted(entries.items()):
        if e.file_type!='PRG': continue
        data, problem = c64.read_file_checked(disk, e)
        if problem: continue
        hits = disasm.find_stores(data[2:], 0x0800, targets)
        if hits: print(title, name, hits)
"
```

Result: hits in exactly three files, all inside the `$C000` graphics-driver slot itself, never in
any of the ten `$0800`-family overlays or any of the §9.1/§9.2 candidates:

| File | Title(s) | Hits | Verdict |
| --- | --- | --- | --- |
| `GDRIVE01` | both | 16 offsets | expected — this IS the self-patching mechanism being searched for, not a caller |
| `GDRIVE00` | both | 1 offset (body 1348 = `$C544`) | address-space aliasing, not a caller (§9.4) |
| `GDRIVE04` | Death Knights of Krynn only | 3 offsets (body 1101, 1137, 1143) | address-space aliasing, not a caller (§9.4) |

Every other file — all ten named `$0800`-family overlays, `GDRIVE02`, and (Death Knights) `GDRIVE05`
— comes back `[]`. `test_no_selfmod_patch_target_reference_in_any_named_overlay` pins this for the
overlay corpus (`CallerSearchTests.OVERLAYS + WIDER_OVERLAYS`, the same file list the plain
`$C080-$C08F` scan already covers), with GDRIVE00's one expected aliasing hit named explicitly so
the test cannot silently start passing by accident.

### 9.4 Why the `GDRIVE00`/`GDRIVE04` hits are address-space aliasing, not calls

`GDRIVE00`, `GDRIVE01` and (Death Knights) `GDRIVE04` are, per the established memory map,
**mutually-exclusive occupants of the same `$C000` graphics-driver slot** — never resident at the
same time. A byte-pattern scanner cannot know which module's code is actually loaded when; it just
finds a literal absolute reference to (say) `$C8FF`, and different modules can legitimately have
completely unrelated *own* code sitting at that same shared address.

**`GDRIVE00`** (body offset 1348 = `$C544`, real origin `$C000`, 2806-byte body spanning
`$C000-$CAF5` — `$C000 + 2806 - 1`, matching the memory map's own `GDRIVE00` entry): the instruction
there is `JSR $C8FF` (`20 FF C8`), and `$C8FF` is *also* one of
`GDRIVE01`'s own patch targets (§9.3) — but `$C8FF - $C000 = 0x8FF = 2303`, comfortably inside
`GDRIVE00`'s own 2806-byte body, and the byte actually there (in `GDRIVE00`'s own bytes) is `A9 00`
— `LDA #$00`, the clean start of a real subroutine, part of a coherent comparison/swap routine
(`test_gdrive00s_selfmod_hit_is_a_real_call_into_its_own_body` pins both the raw `JSR $C8FF` bytes
and the target's `LDA #$00`). `GDRIVE00` is simply calling its own internal subroutine that happens
to live at the same absolute address as `GDRIVE01`'s unrelated self-modified operand.

**`GDRIVE04`** (Death Knights of Krynn only, body length 2076): its three hits are all references to
`$C466` (`STA $C466` at body offset 1101 — a table-driven initial store, `LDA $C574,X` /
`STA $C466` / `LDA $C575,X` / `STA $C467`, not part of the loop below — then `LDA $C466` at 1137 and
`STA $C466` again at 1143, which ARE the load/store half of a clean, coherent decrement loop,
`LDA $C466 / SEC / SBC #$08 / STA $C466 / BCS ... / DEC $C467`). All three matched hits reference
`$C466` only; `$C467` is not itself a scanned target (it is not in `GDRIVE01_SELFMOD_PATCH_TARGETS`)
and the loop's own `DEC $C467` is real code but not one of the three hits. Either way this is an
ordinary local X/Y-position
variable of `GDRIVE04`'s own, at the same absolute address as `GDRIVE01`'s `$C465/$C466` patch
target from the `~$C449` entry (§9.3). Its own `JSR`/absolute references (`$C4A6`, `$C813-$C815`,
`$C574,X`, `$C52C,X`) are all self-contained under an assumed `$C000` origin too (2076-byte body:
`$C000-$C81B` — `$C000 + 2076 - 1`), the same residence-evidence pattern used throughout this
project — `GDRIVE04` is a
fifth, Death-Knights-specific occupant of the `$C000` slot, not documented before this pass and out
of this file's scope to characterize further (a sibling `$C000`-family investigation would own
that).

Neither hit is a caller writing GDRIVE01's parameter block or its patched operands; both are the
address-space equivalent of two different books sharing the same page number in two different
libraries.

### 9.5 Mutation checks run this round

Every test added or extended in this section was confirmed to go red under a deliberate runtime
mutation and green again on restore (all done by monkeypatching the imported module in a throwaway
interpreter, never by editing a committed file, so no diff needed reverting):

- `find_selfmod_patch_target_refs` forced to return `[]` unconditionally →
  `test_find_selfmod_patch_target_refs_detects_a_genuine_injected_reference` went red.
- `illegal_opcode_fraction` forced to return `0.0` unconditionally →
  `test_illegal_opcode_fraction_counts_undefined_bytes` went red; forced to a flat `0.05` →
  `test_titlepg_scores_far_more_illegal_than_any_confirmed_code_overlay` went red (`0.05 not
  greater than 0.1`, i.e. twice the mocked "known-code" ceiling).
- `S.framing` forced to always return a fabricated `('trailer', 13, ...)` result →
  `test_sprtp_is_bare_dialect_sprite_family_data_not_code` went red.
- `CallerSearchTests.TITLEPG_DESYNC_WINDOW` corrupted (zeroed window bytes) →
  `test_the_titlepg_false_positive_sits_in_an_illegal_opcode_dense_region` went red.
- `find_selfmod_patch_target_refs` forced to return `[999]` unconditionally →
  `test_no_selfmod_patch_target_reference_in_any_named_overlay` went red on the very first file
  checked (Champions of Krynn `DUNGEON`).
- `GDRIVE00`'s expected raw bytes corrupted to `11 22 33` →
  `test_gdrive00s_selfmod_hit_is_a_real_call_into_its_own_body` went red.
- `WIDER_KNOWN_FALSE_POSITIVE`'s two new `TITLEPG` entries removed →
  `test_no_genuine_param_block_reference_in_the_wider_overlay_set` went red on the real
  Champions of Krynn `TITLEPG` hit at offset 2589.

> **CORRECTION (round 9) — "every test added or extended" was 7 of the 9 added.**
> The round (commit `75e951f`) added exactly nine tests. Seven appear in the list above; the
> eighth entry, `test_no_genuine_param_block_reference_in_the_wider_overlay_set`, is an
> *extended* older test from `c79430f`, not one of the nine. The two new tests never mutation-
> checked were both negative controls — precisely the shape most at risk of passing
> vacuously:
>
> - `test_find_selfmod_patch_target_refs_is_empty_on_a_clean_body`
> - `test_illegal_opcode_fraction_is_zero_on_all_nop`
>
> A scanner stubbed to return nothing makes the first pass for the wrong reason, which is the
> standing "a probe is not evidence until it has been seen failing" hazard. **Both have now
> been checked** (round 9, same monkeypatch-in-a-throwaway-interpreter method): forcing
> `find_selfmod_patch_target_refs` to return `[999]` turns the first red, and forcing
> `illegal_opcode_fraction` to return `0.5` turns the second red; both green again on restore.
> So the section's claim is now true as written, rather than being quietly two tests short.

All seven restored and reverified green. Full suite after this pass: `python -m pytest
tools/test_c64_sprite.py -q` → **34 passed** (25 from the 2026-08-11 passes + 9 new tests this
round; two prior tests, `test_no_genuine_param_block_reference_in_the_four_named_overlays` and
`test_no_genuine_param_block_reference_in_the_wider_overlay_set`, now additionally exercise the
six new candidate overlays via the extended `WIDER_OVERLAYS` dict, so their pass count is unchanged
but their coverage grew).

### 9.6 Where this leaves the open question

The caller is still unlocated. Every named, extracted file on side 1 of both Champions of Krynn and
Death Knights of Krynn has now been checked, under both the plain-parameter-block hypothesis (§8)
and the self-modifying-patch-target hypothesis (§9.3), with a single exception this project has not
extracted a standalone copy of: **`GDRIVE05`** (Death Knights only, present in the directory
listings but never pulled into a dedicated disassembly pass in this file — out of scope for this
round, since it was not one of the task's named candidates and the self-modifying-target sweep in
§9.3 already read it directly off the disk and found `[]`, so it is at minimum ruled out under both
scanners even without a dedicated write-up here).

Two honest loose ends from this round, neither strong enough to act on:

- `SECSET64` scores **0.0%** on the illegal-opcode-fraction metric — cleaner even than `COMBAT`'s
  0.5%. This is *not* evidence it is code (no test asserts that): both scanners return `[]` on it
  either way, so it doesn't matter for the caller question, but a 0% score is unusual enough to
  flag rather than silently treat as "obviously data". Not investigated further this round.
- `SOUNDFX`'s `~$B000` residence (§9.1) is a genuine incidental finding with no home in this file's
  scope (this file owns the SPRITE format, not the audio driver) — left here as a pointer for
  whichever future pass does own C64 audio, not acted on further.

The task brief's own fallback reading — "if your sweep comes up empty, saying 'consistent with the
kernel hypothesis' is a legitimate and useful conclusion" — is where this leaves things. This round
does not confirm a resident kernel at `$2E00-$3C00`; it only removes essentially the entire named,
easily-enumerable alternative (every side-1 overlay and code-shaped candidate file in both titles,
under two independent search strategies). Combined with the two GDRIVE00/GDRIVE04 aliasing hits
being fully, mundanely explained rather than mysterious, the absence of a caller anywhere in this
now-much-larger swept set is consistent with — though does not prove — the caller living somewhere
this project has not yet extracted or named as a standalone file, such as a resident kernel loaded
once and never unloaded. Next static step, if picked up again: the exact same two scanners
(`find_param_block_refs`, `find_selfmod_patch_target_refs`) already generalize to any file; running
them against whatever the kernel-hypothesis investigation locates costs one command line, not new
code.

## 10. 2026-08-12: the resident kernel (LIBRARY/LINKER) checked directly — still not the caller,
but the search closes an old ambiguity and finds a new one

§9's closing line named exactly this as the next step: the C1.9a/C1.9b sibling investigation
(`docs/engine/research/c64-resident-kernel.md`, `c64-boot-chain.md`) had by this point solved the
project's long-unplaced "resident kernel" call targets as **LIBRARY**, relocated by the boot
program's own KERNAL `LOAD` call (secondary address 0, ignoring the file's own `$4000` PRG header)
to **`$2DC8`**, and **LINKER**, similarly relocated to **`$2D00`** — both identical across
Champions of Krynn and Death Knights of Krynn. This section runs the same two scanners against
both files for real, using `tools/c64_kernel.py`'s `kernel_body()`/`linker_body()` (which read the
files at their true runtime addresses, not a guessed origin).

### 10.1 Neither hypothesis has a genuine hit in LIBRARY or LINKER

```
find_param_block_refs(LIBRARY, cok)   -> [514]   (already-known false positive, §8.2/§8.4)
find_param_block_refs(LIBRARY, dok)   -> [427]   (already-known false positive, §8.4)
find_param_block_refs(LINKER,  cok)   -> []
find_param_block_refs(LINKER,  dok)   -> []

find_selfmod_patch_target_refs(LIBRARY, cok) -> []
find_selfmod_patch_target_refs(LIBRARY, dok) -> []
find_selfmod_patch_target_refs(LINKER,  cok) -> []
find_selfmod_patch_target_refs(LINKER,  dok) -> []
```

LIBRARY's result is a **re-confirmation** (it was already implicitly covered by §9.3's
corpus-wide selfmod sweep and §8.4's explicit `find_param_block_refs` run, both of which iterate
every named PRG file). **LINKER's result is new**: it was never in either `OVERLAYS` or
`WIDER_OVERLAYS` in any prior round of this file, so this is the first time either hypothesis was
checked against it specifically, rather than assumed clean by omission. It comes back clean under
both. Pinned by `LibraryLinkerCallerSearchTests.test_library_has_no_genuine_param_block_reference`
/ `..._selfmod_patch_target_reference` and the LINKER-named equivalents.

### 10.2 LIBRARY does call into the $C000 driver — but at slot 1, not the sprite entry

A byte-exact scan of LIBRARY's own body for absolute-mode operands anywhere in
`$C000-$C048` (GDRIVE01's own 25-slot table span, `S.GDRIVE01_TABLE_SPAN`) turns up exactly one
hit **at the identical structural position in both titles**:

```
CoK LIBRARY body offset 4725 (real address $403D):
  403D  20 B8 3C   JSR $3CB8
  4040  20 03 C0   JSR $C003
  4043  4C BF 3C   JMP $3CBF

DoK LIBRARY body offset 4534 (real address $3F7E):
  3F7E  20 23 3C   JSR $3C23
  3F81  20 03 C0   JSR $C003
  3F84  4C 2A 3C   JMP $3C2A
```

`$C003` is table slot 1 (`$C000 + 1*3`) — a real, live slot in *either* GDRIVE00 or GDRIVE01's
table, but a *different* slot from the sprite-composite entry (slot 19/20, `$C039`/`$C03C`, both
reaching `$C6BA` in GDRIVE01). Disassembling each driver's own slot-1 target:

```
GDRIVE00 slot 1 -> $C7A9: JSR $C327; JSR $CAB5; LDA #$00; STA $034D; STA $0345; ... JSR $C26E;
                          LDY #$00; LDA ($9E),Y; CMP #$FF; BEQ $C7EA; JSR $C5A0; ...
GDRIVE01 slot 1 -> $C183: LDA #$00; STA $C051; JSR $C01B; LDA $C04D; AND #$03; TAX; STA $C04D;
                          LDA $C04B; STA $C1F6; LDA $C04C; STA $C1FB; ...
```

Neither target reads `$C080-$C08F` (checked the same way as the overlay search: no hit).
GDRIVE01's own `$C183` reads/writes `$C04B-$C04D` — but those addresses are *not* GDRIVE00's
table-slot-25/26 (`$C04B`/`$C04E`); at `org=$C000` they are GDRIVE01's **own local data area**,
sitting immediately after its 25-slot (75-byte) table ends. This is a coincidental address
overlap between two mutually-exclusive $C000-slot occupants, the same phenomenon §9.4 already
documented for GDRIVE00's `$C8FF` and GDRIVE04's `$C466` — not evidence either driver reads a
caller-supplied parameter block at slot 1.

The trampoline's only caller, in both titles, is **DUNGEON** — verified two ways: directly
(`ck.find_callers` against just `{"DUNGEON": ...}`) and by widening to every readable side-1 file
in each title. Death Knights of Krynn's `PIC70` raises one additional raw hit at the same target
address, but it is the same class of false positive as every other `PIC`/`TITLEPG` hit in this
project: body offset 915 decodes as `AND $3F7E,X` purely by byte-alias coincidence inside a run
of picture data dense with undefined opcode bytes (`.byte $7C`, `$0C`, `$EB`, `$7B` all within 12
bytes) — not real code. Pinned in `test_library_c003_trampoline_is_real_and_called_only_from_dungeon`
and `test_dungeon_only_caller_of_library_trampoline_across_whole_side1`.

**Read as intended: this is very likely a graphics-driver init/reset call made once when DUNGEON
starts**, not the per-sprite parameter setup the caller hunt is after — it is parameterless (no
register/memory setup precedes it beyond the routine's own two local `JSR`s) and targets a
different table slot than the sprite entry. It does NOT resolve which driver is resident at that
moment; that remains open.

### 10.3 A previously-ambiguous COMBAT-family lead is now resolved (negatively) using a new
discriminator

The task brief noted a prior round's "COMBAT `$C015` lead" was raised, then refuted because
`$C015` sits inside GDRIVE01's 25-slot table span (`$C000-$C048`), which is a **strict subset** of
GDRIVE00's 35-slot table at the same base address — so a call there is ambiguous between the two
drivers without further evidence. This round independently rediscovered the same shape of lead at
a different address, **`$C03C`** (table slot 20 — the same slot GDRIVE01 uses for its sprite
entry), called directly (not through any table indirection) from `COMBAT`, `COMBAT2`, `ECL64`
(Champions of Krynn) and `CODE03` (Death Knights of Krynn):

```
CoK COMBAT $17EA:   JSR $C03C   (three call sites this file alone: $17EA, $1B4B, $2970)
CoK COMBAT2 $24E8:  JMP $C03C
CoK ECL64 $111E:    JSR $C03C
DoK CODE03 $1122:   JSR $C03C
DoK COMBAT $1617:   JSR $C03C   (three call sites: $1617, $290A, and one more)
DoK COMBAT2 $2579:  JMP $C03C
```

Same ambiguity as `$C015`: GDRIVE00's own slot 20 points at `$C7A9` (unrelated), GDRIVE01's points
at `$C6BA` (the sprite entry) — `test_gdrive00_and_gdrive01_disagree_on_slot20s_target` pins both
targets by raw bytes. **This round adds a genuine discriminator.** GDRIVE01's table is only 25
entries (`$C000-$C048`); GDRIVE00's has 10 more (entries 25-34, `$C04B-$C066`) that simply do not
exist as valid jump-table code in GDRIVE01 at all — at that origin they fall past GDRIVE01's table
into its own local data. `tools/c64_sprite.py` now exposes this as
`GDRIVE00_EXCLUSIVE_TAIL`/`find_gdrive00_exclusive_tail_refs`. Scanning the same four files (both
titles) for absolute-mode references anywhere in `$C04B-$C066` turns up **genuine, alignment-
verified** hits — confirmed real by disassembling from well before each hit and checking the
instruction stream reaches it exactly on a byte boundary (not the "desync into data" pattern
§8.2/§9.1 caught elsewhere), e.g.:

```
CoK COMBAT   ($800+7011=$2363): ... JSR $C012; JSR $15DE; JSR $15D4; JSR $C00F; JMP $C04E; ...
CoK COMBAT   ($800+9142=$2BB6): ... LDA #$80; STA $C3; STA $C4; JSR $C066; ...
CoK COMBAT2  ($800+6255=$206F): ... JSR $90D1; JSR $C04E; JSR $C024; ...
CoK ECL64    ($800+2735=$12AF): ... STA ($9E),Y; JSR $8B46; JMP $C04B; ...
CoK ECL64    ($800+3824=$16F0): ... JSR $8FC7; JSR $C063; LDY #$00; ...
DoK COMBAT   ($800+9004=$2B2C): ... STA $C3; STA $C4; JSR $C066; ...
DoK COMBAT2  ($800+6366=$20DE): ... JSR $90DD; JSR $C04E; JSR $C024; ...
DoK CODE03   ($800+2739=$12B3): ... STA ($9E),Y; JSR $8B4A; JMP $C04B; ...
DoK CODE03   ($800+3822=$16EE): ... JSR $8FC5; JSR $C063; LDY #$00; ...
```

`$C04B`, `$C04E`, `$C063` and `$C066` are all inside `GDRIVE00_EXCLUSIVE_TAIL` — real jump-table
entries **only** in GDRIVE00. These calls sit in ordinary, aligned control flow immediately
alongside each file's own `$C03C` calls, with no visible driver-reload in between (no
`GDRIVE01`/`GDRIVE00` filename string anywhere in any of these four files — checked directly, see
§10.4). The parsimonious reading is that **GDRIVE00, not GDRIVE01, is the driver resident for all
of these files' `$C000`-range calls**, including their `$C03C` calls — meaning this round's
best-supported answer is that `COMBAT`/`COMBAT2`/`ECL64`/`CODE03` are calling GDRIVE00's `$C7A9`,
not GDRIVE01's sprite-composite `$C6BA`. This generalizes and strengthens (with a cleaner,
falsifiable mechanism) the task brief's own note that the `$C015` lead had already been refuted —
**the COMBAT family is not the caller either**, and this file family should not be re-proposed as
a lead without new evidence of a mid-routine driver swap. Pinned in
`test_combat_family_makes_genuine_calls_into_the_gdrive00_exclusive_tail` (each hit's exact bytes)
and `test_combat_family_c03c_call_is_ambiguous_without_the_tail_range_evidence` (the premise the
disambiguation rests on).

Caveat, stated honestly: this is *evidence*, not a dynamic proof — a mid-routine
GDRIVE00→GDRIVE01→GDRIVE00 driver swap between the tail-range calls and the `$C03C` calls cannot
be excluded by static analysis alone (this project cannot run DOSBox-X or any emulator; see the
task's rules of engagement). No such swap call (a `LOAD`-style reference to either driver's
filename) was found in any of the four files, which is the strongest static evidence available
against it, but it is not conclusive.

### 10.4 No file loads GDRIVE01 (or GDRIVE00/02/04/05) by an embedded filename string

A corpus-wide literal-ASCII search for `GDRIVE00`/`GDRIVE01`/`GDRIVE02`/`GDRIVE04`/`GDRIVE05`
across every readable side-1 file in both titles finds the strings only in two places, neither of
which is a real load-by-name call site:

- `ITEMNAMES` (both titles) ends with a table of resource-family "stem" names used by this
  corpus's generic per-area resource loader (`GDRIVE00\0SQRPACI00\0GEO00\0SECSET00\0...MON00\0
  BODY00\0HEAD00\0CHARPIC00\0COMPIC00\0ITEMFILE00\0...`, NUL-separated in Death Knights of Krynn,
  concatenated in Champions of Krynn) — the same stem+trailing-`00` shape as the real,
  directory-visible per-area files this project already knows about (`MON00`..`MON4A`,
  `COMPIC00`..`COMPIC4A`, `PIC3B` etc., where the loader plausibly substitutes a computed 2-digit
  area code for the trailing `00`). Only **`GDRIVE00`** appears in this stem table — `GDRIVE01`,
  `02`, `04`, `05` do **not** — so if this generic loader is how `GDRIVE00` gets selected, the
  other four drivers are evidently chosen some other way this static pass did not locate.
- Death Knights of Krynn's decorative title-banner directory entries (`OF KRYNN (LADER)` /
  `----------------`, split-name padding entries used to make the disk's directory listing read
  nicely) happen to contain a **raw CBM directory sector** as their body content (32-byte records:
  file-type byte `$82`, track/sector, PETSCII name padded with `$A0`) that lists `GDRIVE00`
  through `GDRIVE05` by name, among many other real files. This is filesystem metadata that ended
  up as filler inside an unrelated decorative file (the same general "leftover disk bytes reused
  as padding" phenomenon `c64-boot-chain.md` §6 documents for Death Knights' orphaned BAM blocks),
  not code that loads anything.

Neither finding identifies a name-based GDRIVE01 load mechanism. Not investigated further this
round (out of the sprite-format slice's remit) — flagged as a concrete lead for whoever next
chases how the non-`00` graphics drivers get selected.

### 10.5 GDRIVE05 (Death Knights of Krynn only): a cheap look, not a solve

Per the task's explicit instruction not to let this consume the slice: GDRIVE05's body does
**not** open with a `JMP`-absolute dispatch table the way GDRIVE00/GDRIVE01 do. Its first 8 bytes
disassemble as ordinary sequential code:

```
C000  A9 07      LDA #$07
C002  8D B4 7E   STA $7EB4
C005  20 11 33   JSR $3311
C008  AD 00 7D   LDA $7D00
C00B  F0 08      BEQ $C015
C00D  AD 73 7C   LDA $7C73
C010  F0 03      BEQ $C015
C012  20 1B C0   JSR $C01B
C015  CE B4 7E   DEC $7EB4
C018  10 EB      BPL $C005
```

— a small loop (`$7EB4` counts down from 7, `BPL $C005` loops back), consistent with an
8-frame animation/blit sequencer rather than a general-purpose table-dispatched driver; `$C01B`
cascades into a further sequence of internal `JSR`s (`$C040`, `$C0F9`, `$C2DF`, `$C2F2`, `$C44F`,
`$C483`, `$C4EE`, `$C697`), all landing inside GDRIVE05's own 1729-byte body (`$C000-$C6C0`) —
self-contained, the same residence-evidence pattern used throughout this project. Not
characterized further; pinned by exact opening bytes in
`test_gdrive05_does_not_open_with_a_jmp_dispatch_table` only for its structural shape (no table),
not for what it does.

### 10.6 Where this leaves the open question

**The caller is still unlocated.** This round closes two things: LINKER is now checked (clean)
for the first time under both hypotheses, and the previously-ambiguous COMBAT-family `$C03C`-style
lead is now resolved negatively (with falsifiable, alignment-verified evidence, not just
non-discriminating overlap) rather than left open. It also finds one genuine — but almost
certainly unrelated — LIBRARY-to-`$C000` call (slot 1, driver init, called only from DUNGEON).

What was swept this round, under which predicate, so it is not re-swept:
- **LIBRARY, LINKER** (both titles): literal `$C080-$C08F` absolute-mode references
  (`find_param_block_refs`) and literal references to GDRIVE01's own six self-modifying patch
  targets (`find_selfmod_patch_target_refs`) — both clean (LIBRARY's one hit is the pre-existing
  known false positive).
- **LIBRARY, LINKER** (both titles): absolute-mode references anywhere in GDRIVE01's own
  25-slot table span (`$C000-$C048`) — LIBRARY has exactly one (the slot-1 trampoline, §10.2),
  LINKER has none.
- **COMBAT, COMBAT2, ECL64/CODE03** (both titles): absolute-mode references in the
  GDRIVE00-exclusive tail (`$C04B-$C066`) — all four files hit it, alignment-verified, resolving
  their `$C03C` calls against GDRIVE00 (§10.3).
- **Corpus-wide** (both titles, every readable side-1 PRG): literal ASCII `GDRIVE00`/`01`/`02`/
  `04`/`05` — found only in `ITEMNAMES`'s generic resource-stem table (`GDRIVE00` only) and Death
  Knights' decorative directory-banner filler (all five, as raw directory-sector data, not code)
  (§10.4).
- **GDRIVE05** (Death Knights of Krynn only): opening-bytes structural check only (§10.5) — not
  swept for the caller hypotheses at all, since it is itself a `$C000`-slot occupant (a callee
  candidate, not a caller candidate) and was named in the brief only as an "if it's cheap" aside.

Not swept this round, left for whoever picks this up next: LIBRARY's and LINKER's own bodies were
never searched for zero-page-indirect (`(zp),Y`/`(zp,X)`) writes that could reach `$C080-$C08F`
through a runtime-computed pointer rather than a literal absolute operand — `find_param_block_refs`
only matches `ABS`/`ABX`/`ABY` addressing modes, by design (see `c64_disasm.find_stores`'s own
docstring), so this class of caller would be structurally invisible to every scan run so far,
including this round's. A quick, narrower probe (searching LIBRARY/LINKER for `LDA #$C0` immediate
loads that could be a pointer high-byte setup) found exactly one candidate, in Champions of Krynn
LIBRARY only (no Death Knights of Krynn match, failing the project's cross-title-invariance rule
on its own), and it disassembles as the low byte of an unrelated in-file pointer (`$47C0`), not a
`$C0xx` high-byte setup — ruled out, not pursued further. A real indirect-write sweep (tracking
zero-page pointer values across a whole routine, not just adjacent bytes) was not attempted this
round.

## 11. 2026-08-12: inverting the hunt — who LOADS a graphics driver, not who calls into one

Three rounds (§8-§10) exhaustively swept for the code that *calls into* an already-resident
GDRIVE01 and came up empty. This round asked the other question instead: who *loads* GDRIVE01 (or
GDRIVE02/04/05) in the first place? The unfollowed lead that motivated the question: `ITEMNAMES`
contains a generic per-area resource-stem table (`GDRIVE00\0SQRPACI00\0GEO00\0...MON00\0...`)
where the trailing "00" is visibly a per-request placeholder, and only `GDRIVE00` ever appears
literally — exactly explaining why every literal-string search in §10.4 found nothing for
GDRIVE01/02/04/05. This round traces that mechanism to source, then re-runs the caller question
through it.

### 11.1 The generic per-family/area resource loader

LIBRARY carries **one** shared loader for this whole class of request, parameterized by X (a
resource "family" index) and A (an 8-bit "area code"). Working backward from the KERNAL
LOAD/SETNAM wrappers documented in `c64-resident-kernel.md` (`$31CD`/`$3213`/`$3224` cok /
analogous dok addresses) surfaced it directly. Disassembly, both titles, byte-identical in shape:

```
; cok                                dok
413F  LDA $7F13,X                    4080  LDA $7F13,X       ; cache_check
4142  CMP #$FF                       4083  CMP #$FF
4144  BEQ $4154                      4085  BEQ $4095
4146  AND #$7F                       4087  AND #$7F
4148  CMP #$7F                       4089  CMP #$7F
414A  BEQ $4151                      408B  BEQ $4092
414C  CMP $7F13,X                    408D  CMP $7F13,X
414F  BNE $4156                      4090  BNE $4097
4151  STA $7F13,X                    4092  STA $7F13,X
4154  CLC                            4095  CLC
4155  RTS                            4096  RTS
4156  STA $7F13,X                    4097  STA $7F13,X        ; reload
4159  STX $7E60                      409A  STX $7E60
415C  LDY $4126,X                    409D  LDY $4066,X        ; X-to-Y remap
415F  LDX $9EE6,Y                    40A0  LDX $9EE6,Y        ; FAMILY_TABLE_LOW,Y
4162  STX $4C                        40A3  STX $4C
4164  LDX $9FE6,Y                    40A5  LDX $9FE6,Y        ; FAMILY_TABLE_HIGH,Y
4167  STX $4D                        40A8  STX $4D
4169  LDX $40C7,Y                    40AA  LDX $4002,Y
...   (nibble-split, SETNAM, LOAD follow)
```

`cache_check` re-fetches the family's last-loaded area code and short-circuits if it already
matches; `cache_check_preset` is the same routine 3 bytes in, for callers that already have the
area code in A (this is the entry point almost every real caller uses); `reload` unconditionally
builds the filename and loads it. All three addresses, the X-to-Y remap table, and the family-stem
pointer tables below are pinned in `tools/c64_sprite.py` (`GENERIC_LOADER_ENTRY`,
`GENERIC_LOADER_INDEX_MAP`) and verified against real LIBRARY bytes by
`test_generic_loader_entry_points_are_real_code_in_library` /
`test_generic_loader_index_map_bytes_are_pinned_in_library`.

### 11.2 The family-stem table, and GDRIVE = family index 0

`ITEMNAMES` (loaded at the fixed `$9E00`, `docs/c64-boot-chain.md`) carries a 21-entry pointer
table to its own embedded stem strings. The low-byte half sits at `$9EE6`, the high-byte half
exactly one page higher at `$9FE6` — **identical addresses in both titles**, despite the stem text
itself differing (Champions of Krynn's stems run concatenated with no separator; Death Knights'
are NUL-separated). Decoding the table (`family_stem_table` in `tools/c64_sprite.py`) confirms
index 0 is GDRIVE in both:

| | table address | index-0 resolves to |
|---|---|---|
| Champions of Krynn | `$A767` | `GDRIVE00SQRP...` |
| Death Knights of Krynn | `$A748` | `GDRIVE00\0SQR...` |

`reload` looks up X (0-20) through a 21-byte remap table (`$4126,X` cok / `$4066,X` dok,
byte-identical in both: `00 01 02 03 04 05 06 07 08 09 0A 0D 0E 0F 10 0B 0B 0B 0C 0C 0C`) to get
Y, then indexes the stem-pointer tables by Y. X=0 maps to Y=0 in both titles, i.e. **GDRIVE is
family index 0, unconditionally** — the loader never needs to distinguish "which GDRIVE" any
other way; the driver number is entirely carried in A.

### 11.3 The digit patch: A → two ASCII hex nibbles

`reload` converts A's two nibbles to ASCII hex via an 8-byte helper, byte-identical at `$4809`
(cok) / `$4749` (dok): `18 69 30 C9 3A 90 02 69` = `CLC; ADC #$30; CMP #$3A; BCC +2; ADC #$06;
RTS`. One subtlety nearly produced a wrong port of this into `tools/c64_sprite.py`'s
`hex_digit()`: the `ADC #$06` on the taken path inherits the **carry the preceding `CMP` left
set** (true on every path that reaches it, since `CMP` sets carry exactly when `A >= operand`,
which is precisely the branch-not-taken condition) — so the real effective addend past digit 9 is
**7**, not 6. A first draft of `hex_digit()` used a bare `+= 6` and silently mapped nibble 15 to
`'E'` instead of `'F'`; `test_hex_digit_matches_the_disassembled_routine_including_carry_chaining`
(which checks all 16 nibbles against the literal `'0'..'F'` string) caught it immediately, before
it reached any other test that depended on it. Fixed in the shipped `hex_digit()`, with the
carry-chaining explained in its own docstring so it can't silently regress.

### 11.4 Confirmed real GDRIVE call sites

Sweeping every file in each title's full corpus (`ck.all_bodies()`: **342 files, Champions of
Krynn; 273 files, Death Knights of Krynn**) for a literal `JSR`/`JMP` to one of the three loader
entry addresses, then confirming each hit's local alignment by direct disassembly (not trusting
the raw byte-scan alone — `c64_disasm.find_stores` matches on ABS/ABX/ABY addressing mode only, so
it also matches `JMP absolute`, and it is still a byte-scan, not decode-accurate; see §11.6 for a
false positive this produced and how it was ruled out) found:

| title | file@offset | setup | requests |
|---|---|---|---|
| cok | `COM.PREP`@216 | `LDA #$00; TAX; JSR` | GDRIVE00 |
| cok | `INIT`@2326 | `LDX #$00; LDA #$03; JSR` (then `JMP $C000`) | GDRIVE03 |
| cok | `DUNGEON`@8557 | `PHA; LDX #$00; LDA #$03; JSR` | GDRIVE03 (§11.5's wrapper) |
| dok | `COMPREP`@222 | `LDA #$00; TAX; JSR` | GDRIVE00 |
| dok | `INIT`@2296 | `LDX #$00; LDA #$03; JSR` (then `JMP $C000`) | GDRIVE03 |
| dok | `CAMP`@392 | `LDA #$04; LDX #$00; JSR` | GDRIVE04 |
| dok | `GEN`@1617 | `LDA #$04; LDX #$00; JSR` | GDRIVE04 |
| dok | `CODE01`@619 | `LDA #$05; LDX #$00; JSR` | GDRIVE05 |
| dok | `GEN`@4284 | `LDA #$05; LDX #$00; JSR` | GDRIVE05 |
| dok | `POSTCOM`@16 | `LDX #$00; LDA #$05; JSR` | GDRIVE05, near POSTCOM's own file start |

All **eleven** are pinned by exact bytes in `tools/c64_sprite.py`'s `GDRIVE_CALL_SITES` /
`REAL_GDRIVE_CALL_SITES` and re-verified in `test_real_gdrive_call_sites_are_pinned_and_target_the_loader`.
This directly resolves the caller question for GDRIVE00/03/04/05 — every one of them has a real,
reachable, disassembly-confirmed requester. GDRIVE01 and GDRIVE02 are conspicuously absent from
this table; see §11.7.

### 11.5 GDRIVE03: real code, requesting a file that was never shipped

Both titles' `INIT` carries a tail-jump routine — request GDRIVE03, then jump straight into the
freshly-loaded `$C000` driver slot without returning:

```
cok $1116: A2 00 A9 03 20 42 41 4C 00 C0   ; LDX #$00; LDA #$03; JSR $4142; JMP $C000
dok $10F8: A2 00 A9 03 20 83 40 4C 00 C0   ; LDX #$00; LDA #$03; JSR $4083; JMP $C000
```

**Champions of Krynn's copy is reachable.** `POST.COM` offset 2000 (`JSR $1116`, address `$0FD0`)
is a real, aligned call, confirmed by disassembling POST.COM's own menu-input loop:

```
0FC3  JSR $4813        ; poll input
0FC6  BCC $0FC3         ; loop while not ready
0FC8  BPL $0FCB         ; negative result = abort
0FCA  RTS
0FCB  STX $2C39         ; store the choice
0FCE  BNE $0FD6         ; nonzero choice skips the GDRIVE03 branch entirely
0FD0  JSR $1116         ; choice == 0 falls straight through to here
0FD3  JMP $0FA4          ; loop back to redraw the menu
0FD6  CMP #$04           ; choice 4 -> exit (BEQ $0FCA)
0FDA  CMP #$01           ; choice 1 -> an unrelated menu-scroll routine at $112B
```

So **POST.COM menu choice 0 is a live, reachable trigger for a GDRIVE03 load** — and GDRIVE03
does not exist anywhere in Champions of Krynn's corpus. Re-swept this round across all 7 of its
`.d64` images — the 6 numbered sides plus the Savedisk, `ck.all_side_paths("cok")`
(`test_gdrive03_is_absent_from_every_disk_side_of_both_titles`): zero hits, unchanged from
the prior round's finding. This reframes GDRIVE03 from "possibly-vestigial" to something more
specific and more interesting: **reachable code that requests a file the shipped disk set never
included** — a genuine cut-content trigger or latent bug, contingent only on a player reaching
that specific POST.COM menu choice, not on any code-path ambiguity.

**Death Knights of Krynn's copy is not reachable by any confirmed path.** The raw corpus scan's
one candidate caller (`PIC5E` offset 588, `INC $10F8,X`) is a proven false positive: PIC5E is
picture data, not code (`illegal_opcode_fraction` 37.1%, consistent with this corpus's picture-file
range and well above every confirmed code overlay's score, including POST.COM's own 9.1%), and the
bytes immediately around the "hit" decode to garbage (`BRK`/`.byte` fragments), not sensible code.
Zero confirmed callers of Death Knights' own GDRIVE03 tail-jump.

Separately, **Champions of Krynn's `DUNGEON` carries its own, structurally distinct GDRIVE03
request** — a full save/load-execute/restore wrapper at `$2965` (no Death Knights counterpart
found anywhere in that title's corpus):

```
2965  JSR $1C5E                        ; (unrelated helper)
2968  LDA $7F13 : ORA #$80 : PHA        ; save the currently-loaded driver's area code
296E  LDX #$00 : LDA #$03 : JSR $4142   ; load+select GDRIVE03
2975  JSR $C000                        ; EXECUTE the freshly loaded driver immediately
2978  JSR $1360
297B  PLA : LDX #$00 : JSR $4142        ; restore the saved driver (A is the PLA'd value, not
                                        ; an immediate -- invisible to an immediate-operand scan)
2981  JSR $11B1 : JSR $0D59 : JMP $0A4E
```

Swept for a literal `JSR $2965` across the full 342-file Champions of Krynn corpus: **zero hits**
— an honest negative with a stated predicate (`test_dungeon_gdrive03_wrapper_is_pinned_and_unreachable`),
not an assumption. This routine is present, well-formed, and never reached by any statically
provable path in the shipped game.

### 11.6 A false lead the tightened predicate had to rule out

An early draft of the GDRIVE01/02 sweep (§11.7) checked only for an immediate `LDA #$01`/`#$02`
near a loader-entry call, without also requiring `LDX #$00`. It flagged Death Knights' `CAMP`
offset 2889 as a candidate. Disassembly:

```
1345  LDA #$01
1347  LDX #$19        ; X = 25, not 0
1349  JMP $4083
```

Family index 25, not GDRIVE (0) — an unrelated resource family requesting its own area 1, nothing
to do with GDRIVE01. Requiring `LDX #$00` explicitly (matching the shape every *confirmed* GDRIVE
site in §11.4 actually uses) is what turns this from a false lead into a clean negative. Pinned in
`test_gdrive_family_25_call_in_camp_is_not_a_gdrive01_lead` specifically so this lesson stays
checkable rather than just asserted in prose — a repeat of this project's standing rule that a raw
byte-scan hit needs disassembly-level confirmation before being trusted (§8-§10's own recurring
theme, now reproduced inside this round's own tooling rather than just in the historical record).

### 11.7 Honest negative: GDRIVE01 and GDRIVE02 still have no confirmed caller

Sweeping the same full corpus (cok 342 files / dok 273 files) for a literal `JSR`/`JMP` to a
loader entry point with `LDX #$00` **and** an immediate `LDA #$01` or `LDA #$02` in the same small
preceding byte window: **zero hits, in either title.**
(`test_no_immediate_gdrive01_or_gdrive02_request_exists_in_either_corpus`.)

This does **not** prove GDRIVE01/GDRIVE02 are unreachable. The scan can only see an area code
loaded via an immediate operand directly feeding the call — exactly the pattern DUNGEON's own
*second* GDRIVE03 call (§11.5, the `PLA`-restore) does NOT use, and that pattern is real,
confirmed, reachable code in this very corpus. A caller that computes or loads the area code from
a variable, a table, or a restored register — anything other than a bare `LDA #imm` — is
structurally invisible to this style of scan, in exactly the same way §10.6 already flagged for
the zero-page-indirect write case. GDRIVE01 and GDRIVE02 remain real, structurally distinct,
on-disk files (GDRIVE01's own sprite-composite entry at `$C6BA`; GDRIVE02 a small 407-byte
picture-blit driver) with no caller this project has yet been able to pin down, across four
separate rounds and two entirely different search strategies (call-into-a-resident-driver, §8-§10;
load-the-driver-by-name, §11). The next round, if one is warranted, should target computed/
indirect area-code loads specifically — e.g. tracing every write to `$7F13,X` (the per-family
cache LIBRARY itself uses) rather than every immediate load feeding a JSR.

### 11.8 What was swept this round, so it is not re-swept

- **Corpus-wide** (both titles, `ck.all_bodies()`, cok 342 / dok 273 files): literal `JSR`/`JMP`
  to any of the three `GENERIC_LOADER_ENTRY` addresses, with local-alignment confirmation by
  direct disassembly for every hit reported above. Ten real GDRIVE00/03/04/05 sites found (§11.4);
  zero real GDRIVE01/02 sites under the X=0 + immediate-A=1-or-2 predicate (§11.7).
- **`ITEMNAMES`** (both titles): the 21-entry family-stem pointer table fully decoded and pinned
  (`family_stem_table`); GDRIVE confirmed as index 0 by direct table lookup, not inference.
- **`LIBRARY`** (both titles): the generic loader's three entry points, the X-to-Y remap table,
  and the nibble-to-hex helper all pinned by exact bytes.
- **`INIT`** (both titles): the GDRIVE03 tail-jump routine pinned by exact bytes; reachability
  swept corpus-wide for literal callers (cok: real hit in POST.COM; dok: one candidate, ruled a
  false positive by disassembly + `illegal_opcode_fraction`).
- **`DUNGEON`** (Champions of Krynn): its own separate GDRIVE03 wrapper pinned by exact bytes;
  reachability swept corpus-wide (zero hits).
- **Disk-wide** (both titles, all sides — 6 for Champions of Krynn): re-confirmed GDRIVE03 is
  absent from every side, unchanged from the prior round.

Not swept this round: computed/indirect area-code loads (the concrete next step named in §11.7);
whether GDRIVE01/02 might be selected via a GEO-level or other per-area data field rather than
code at all (the task brief's own hypothesis (b), not reached this round); the CHARPIC/COMPIC/
ITEMFILE[/CODE] families (stem-table indices 17-20), which the X-to-Y remap table in §11.2 cannot
reach and are therefore evidently loaded by some other, uninvestigated routine.

## 12. 2026-08-12 (absent-names slice): GDRIVE03's failure path is FINAL's failure path; the
driver-number selector is now decode-aligned and narrows §11.7's open item; GDRIVE01/02 still have
no confirmed caller

Two independently-discovered anomalies share the shape "referenced by shipped code, present on no
disk": `GDRIVE03` (this file, §11.5) and `FINAL` (a sibling investigation's LINKER dispatch-table
entry, `docs/engine/research/c64-resident-kernel.md` §9.5). This round asks three concrete
questions about `GDRIVE03` with real disassembly, in both titles, then re-derives the driver-number
selector by a strictly stronger method than §11's byte-scan. `tools/c64_sprite.py` gained the
constants/functions this section cites; `tools/test_c64_sprite.py` gained 14 new tests
(`python -m pytest tools/test_c64_sprite.py -q` → **75 passed**, up from 61).

### 12.1 GDRIVE03's failure path does NOT probe first — it IS LINKER's `FINAL` failure path

§11's `reload` routine builds the filename, then falls into a short control-flow spine
(`GENERIC_LOADER_RELOAD_TAIL`, `spine_addr` = `$40B9` cok / `$3FF4` dok, a few instructions past
where §11's own disassembly excerpt stopped):

```
cok  40B9  JSR $31CD   ; the real KERNAL LOAD wrapper (c64-resident-kernel.md §9.4)
     40BC  BEQ $40C4   ; branch taken iff the parsed disk-status code ($03F1) == 0 (success)
     40BE  JSR $4298   ; disk-swap/retry handler -- SAME address LINKER calls for FINAL's failure
     40C1  JMP $4098   ; retry the WHOLE reload (re-fetches X from $7E60, rebuilds the filename)

dok  3FF4  JSR $3186   ; dok's own KERNAL LOAD wrapper (structurally identical to cok's $31CD)
     3FF7  BEQ $3FFF
     3FF9  JSR $41EE   ; dok's own disk-swap/retry handler
     3FFC  JMP $3FD3   ; retry the whole reload
```

Traced both wrapper targets to their own internals (`$31CD`/`$3186` end `JMP` into the disk-status
parser at `$3F28`/`$3E70` — byte-for-byte structurally identical between titles, confirmed by
disassembling both in full; its final `LDA $03F1; RTS` is what sets the `Z` flag the `BEQ` above
tests). **This is the unconditional-attempt path, not a probe-then-skip**: `reload` never calls
the file-existence probe (§12.2) anywhere in this spine or anywhere else in its own body.

The decisive check: does LINKER's own dispatch loop — already proven (§9.5 of the sibling doc) to
call exactly these two numeric addresses for `FINAL`'s own load failure — really call the *same*
addresses `reload`'s spine calls, not merely structurally similar ones at different addresses?
`test_gdrive03_failure_path_reuses_linkers_own_final_failure_addresses` answers yes: sweeping
`c64_kernel.linker_body()` for `JSR` to `{load_wrapper, retry_handler}` finds **exactly one call to
each**, in both titles. **`GDRIVE03` and `FINAL` are not two similar anomalies — they fail through
the literal same two shared kernel routines.** Seen failing: setting `retry_handler` to a
nonexistent address in a throwaway interpreter (not the committed file) drops the LINKER hit count
from 1 to 0 and the test goes red (`0 != 1`); reverted, green again.

Net effect for a player: since `GDRIVE03` exists on none of Champions of Krynn's 7 disk images (§11.5;
`13` would be the two titles' image counts summed together, 7 cok + 6 dok — not a per-title count)
and no confirmed caller reaches Death Knights' own copy, `JMP $4098`/`JMP $3FD3` cannot ever be
satisfied by inserting a different disk — the same "asks for a disk it can never be satisfied by,
loops the retry prompt indefinitely" conclusion §9.5 reached for `FINAL`, now independently
reproduced from LIBRARY's side of the mechanism rather than LINKER's.

### 12.2 The file-existence probe is real, exported, and never called — corroborated with two
NEW false-positive rulings beyond what the code comments already state

`FILE_EXISTENCE_PROBE` (`$322E` cok / `$31E7` dok, byte-identical structure in both:
`SETNAM; SETLFS(SA=15); OPEN; <parse the status channel>; CLOSE; LDA $03F1; RTS`) is well-formed,
correct code — but distinct in structure from `reload`'s spine above (an OPEN/CLOSE pair with no
LOAD, versus `reload`'s real LOAD). In Champions of Krynn it is exported as LIBRARY's own 17th
jump-table slot (slot 16, `$2DF8` → `JMP $322E`), sitting immediately next to the LOAD/SAVE/SETNAM
primitives (slots 17-19) — a legitimate export mechanism this project has already seen used for
other shared routines (e.g. the `$4840`/`$4857` bank-switch pair, reachable both by direct `JSR`
and via table slots). Death Knights' own LIBRARY table has only 3 slots, too short to expose an
equivalent entry at all.

A corpus-wide `c64_kernel.find_callers()` sweep for any absolute-mode reference to either the
probe's own raw address or (in cok) its table-slot vector address `$2DF8`, across every file
`c64_kernel.all_bodies()` returns for each title (cok 342 files, dok 273), finds:

(**Predicate, stated exactly:** `find_callers` matches *any* opcode of ABS/ABX/ABY mode with that
operand -- not only `JSR`/`JMP` -- and does not track instruction alignment. It is therefore a
superset of a JSR/JMP scan, which is why the two extra DoK hits discussed below are `AND $322E`
and `ORA $322E,Y`. The counts survive; the earlier description of the predicate as a "sweep for
`JSR`/`JMP`" did not.)

- **cok**: exactly one reference anywhere — LIBRARY's own jump-table entry itself (`("LIBRARY",
  48)`, i.e. the `JMP $322E` instruction that DEFINES slot 16). Nothing external calls the probe,
  either by raw address or through the slot-16 vector.
- **dok**: zero references anywhere.

This round re-ran that sweep independently (not merely re-reading the pinned constant) and found
**two additional raw byte-scan hits in Death Knights of Krynn** that the existing pinned test does
not enumerate because `c64_disasm.find_stores` matches any ABS-mode opcode+operand, including ones
inside non-code data — the same byte-alias hazard this project has hit repeatedly (§8.2, §9.1).
Both were disassembled and ruled out:

- **`CODE00` body offset 172** (`AND $322E` — opcode `$2D`, ABS mode) sits inside a dense run of
  consecutive illegal/undefined opcode bytes immediately before and after it (`.byte $23`, `$2B`,
  `$33`, `$3A`, `$3C`, then **five** straight `$00` `BRK`s at `$08B7-$08BB`, body offsets 183-187 —
  an earlier version of this bullet said four) that itself decodes as an ascending
  byte sequence (`$21,$22,$23,$24...$42`, a lookup/font-style table), not executed code.
- **`PIC18` body offset 1663** (`ORA $322E,Y` — opcode `$19`, ABX/ABY mode) sits in a region that a
  linear decode from offset 0 renders as noise rather than code: across the `$0E70-$0E92` window,
  **five** bytes come out as `.byte` — `$A3` at `$0E71`, `$63` at `$0E72`, `$72` at `$0E82`,
  `$B3` at `$0E8B`, `$BF` at `$0E8D`. (The `$322E` hit at `$0E7F` is itself on a boundary of that
  same walk.)

  **Corrected twice, 2026-08-12 — record both, because the second correction is the instructive
  one.** The original bullet listed `$33`, `$73`, `$72`, `$B3`, `$BF` "within the same 16-byte
  window": wrong twice over, since the linear walk consumes `$33`/`$73` (body offsets 1657/1658)
  as the operand of `LDY $7333` at `$0E78`, and offsets 1657-1677 span 21 bytes, not 16. The
  *first* correction then replaced that with a three-item list (`$72`, `$B3`, `$BF`) while still
  attributing it to "a linear decode from offset 0" — but that list is what a decode **restarted
  at `$0E70`** produces, which consumes `$A3`/`$63` as `LDY $63A3,X`. The two walks only converge
  from `$0E73`. An enumeration is only as good as the alignment it is quoted against, and both
  wrong versions were quoted against an alignment that did not produce them.

  The conclusion is unaffected, and if anything strengthened: ordinary picture-pixel data,
  consistent with the other `PIC*` false positives this project has documented.

Both false positives disassembled directly off the real disk images (Death Knights of Krynn side 1
for `CODE00`, side 2 for `PIC18`); neither is pinned as a new committed test.

**Corrected 2026-08-12.** An earlier version of this paragraph explained that omission by saying
the committed `test_file_existence_probe_has_no_confirmed_caller_in_either_corpus` uses a
"decode-boundary-respecting `find_callers`" which "does not surface either hit because both land
mid-operand of a real preceding instruction". Every part of that is wrong. Re-derived this round:

- **Both hits are decode-aligned.** `S.decode_all(body, 0x0800)` walked linearly from body offset 0
  reaches `$08AC` (`CODE00`, `AND $322E`, preceded by `$08A9 AND #$2A` / `$08AB .byte $2B`) and
  `$0E7F` (`PIC18`, `ORA $322E,Y`, preceded by `$0E7E TAX`). I checked both addresses for membership
  in the decoded address set; both are present.
- **`find_callers` is not decode-boundary-respecting.** It wraps `c64_disasm.find_stores`, which
  tries every byte offset with no alignment tracking and matches any ABS/ABX/ABY-mode opcode — both
  functions' own docstrings say so. It reports mid-operand aliases and never suppresses one.
- **The committed test misses them because of its target set, not alignment.** It searches the
  Death Knights corpus for Death Knights' own probe address `$31E7`; both hits name `$322E`, which
  is Champions of Krynn's probe address. `ck.find_callers(ck.all_bodies('dok'), [0x322E])` returns
  `[('CODE00', 172), ('PIC18', 1663)]` immediately, and
  `ck.find_callers(ck.all_bodies('dok'), [0x31E7])` returns `[]`.

The two rulings above therefore do not strengthen the Death Knights negative — they rule out byte
aliases of the *other* title's probe address. What the Death Knights sweep for `$31E7` actually
shows is a bare negative: zero ABS/ABX/ABY-mode hits of any kind, alias or otherwise.

**Answer to the task's first named question**: REFUTED, not confirmed. Requesting `GDRIVE03` does
not first probe existence and silently skip a missing family member. The generic loader always
attempts a real KERNAL `LOAD`, and on failure falls into the identical interactive disk-swap retry
loop LINKER's own dispatch loop uses for `FINAL` (§12.1) — a well-formed, callable, but genuinely
dead probe routine exists alongside it, unused by this code path or (per the corpus-wide sweep,
including this round's extra false-positive check) by anything else in either shipped title.

### 12.3 The driver-number selector, re-derived by a decode-aligned scan — narrows §11.7's own
named open item to computed/indirect area codes at every `JSR`-absolute call site the scan reaches

§11's `REAL_GDRIVE_CALL_SITES` table was built from a **raw byte-scan** (`c64_disasm.find_stores`)
manually re-verified for alignment case by case; §11.7 explicitly flagged this method as blind to
"a caller that computes or loads the area code from a variable... anything other than a bare
`LDA #imm`" and left that as the concrete next step. This round replaces it with a **decode-aligned
walk**: `decode_all()` linearly disassembles every file in `all_bodies()` from body offset 0 (org
`$0800`), `scan_generic_loader_call_sites()` keeps every `JSR` reached at genuine instruction
alignment to one of the three `GENERIC_LOADER_ENTRY` addresses, and `_resolve_x`/`_find_setter`
walk backward through the *decoded instruction stream* (not raw bytes) to resolve both X (the
family index) and A (the area/driver-number code) — recognising immediates, `TAX`-relayed
immediates, and non-immediate sources (`PLA`/`TXA`/`TYA`/memory loads) alike, and reporting
`None` rather than guessing when nothing resolves within the lookback window.

**Cross-check, not just a new number**: `test_scan_generic_loader_call_sites_matches_real_gdrive_
call_sites_exactly` confirms the new decode-aligned scan and the old byte-pinned
`REAL_GDRIVE_CALL_SITES` table agree on the *exact same* `(file, JSR-address)` set for X=0 (GDRIVE)
requests, in both titles — two independently-built methods converging is stronger evidence than
either alone. Seen failing: monkeypatching `scan_generic_loader_call_sites` to always return `[]`
drops the agreement to zero and the test reports the real 4 (cok) / 7 (dok) sites now missing;
reverted, green again.

The decode-aligned scan also surfaces raw byte-shaped `JSR $4142`-style hits that a linear decode
from offset 0 genuinely reaches (unlike the earlier byte-scan's alignment-unchecked hits) but that
are still not real calls — a previously-undocumented false-positive class, distinct from the
illegal-opcode-desync pattern (§8.2/§9.1): **decode-clean embedded UI text that happens to spell a
valid instruction.** Three such hits exist in Champions of Krynn (zero in Death Knights): the
three-byte ASCII substring `" BA"` (space-B-A — from `"...CONTINUE BATTLE..."`, `"...GETS BACK
UP..."`, `"...GO BACK..."`) is byte-identical to `JSR $4142`'s own opcode+operand-low bytes
(`20 42 41`). Confirmed by reading the surrounding bytes as ASCII on both sides of each hit
(`COMBAT2` offset `$1E9A`, `ECL65` offset `$15CB`, `POST.COM` offset `$0C05`) and pinned by exact
bytes in `GENERIC_LOADER_DECODE_ALIGNED_FALSE_POSITIVES`.

**Result — the full corpus, both titles, every GDRIVE (X=0) request found by the stronger method**:

| Title | GDRIVE (X=0) requests found | Immediate area code | Non-immediate |
| --- | ---: | ---: | ---: |
| Champions of Krynn | 4 | 3 | 1 (`DUNGEON`, `PLA` at `$297B` feeding the `JSR` at `$297E`) |
| Death Knights of Krynn | 7 | 7 | 0 |

**11 total — the same count §11.4 already found**, now independently re-derived by a method that
does not share §11's blind spot. The single non-immediate case (`DUNGEON`'s second call in its own
GDRIVE03 save/execute/restore wrapper, §11.5) resolves to exactly what §11.5's own prose already
said in English, now confirmed by the decode-aligned resolver rather than read by eye: a `PLA` that
restores a value pushed earlier in the same routine from the **fixed cell `$7F13`**. Two details,
both re-derived by disassembling `DUNGEON`'s real bytes rather than by eye:

- `$2968` is `AD 13 7F` — opcode `$AD`, **`LDA` absolute, UNINDEXED**, not `LDA $7F13,X`. The
  indexed encoding `BD 13 7F` occurs **nowhere** in `DUNGEON`'s 9452-byte body (one `AD 13 7F`,
  zero `BD 13 7F`).
- the `PLA` sits **two** instructions before its `JSR`, not three: `$297B PLA` ; `$297C LDX #$00` ;
  `$297E JSR $4142`.

`$7F13` *is* the base of LIBRARY's per-family "currently cached area code" table — the identical
storage `cache_check`/`reload` read and write, and those two do address it X-indexed
(`BD 13 7F` / `9D 13 7F`, §11.1). But `DUNGEON` reaches the GDRIVE slot (family index 0) by
**hardcoding the base address**, not by setting up a generic per-family index, so this save/restore
is tied to the GDRIVE family by construction rather than by any runtime family selector.
**Not a per-area GEO field, not an arbitrary `$7E00-$7FFF` game-mode
global** — those were the task brief's other two named candidates, and neither is what this code
does. It is a save/restore of the *engine's own bookkeeping of what was already loaded*, and (per
§11.5) not reachable in the shipped game anyway.

Non-immediate area codes DO exist elsewhere in this engine's generic loader — `POST.COM`/`POSTCOM`
requests X=5, 13 and 14 via `LDA abs` (plus X=24 on cok only), and `COM.PREP`/`COMPREP` requests
X=23 via `LDA abs,X` —
so "the selector is sometimes computed" is a real, general engine capability. It is simply never
exercised for the GDRIVE family (X=0) specifically, anywhere either title's corpus reaches.

### 12.4 Does this resolve the GDRIVE01 sprite-composite caller? No — same honest negative, now
on stronger evidence

**It does not fall out.** The decode-aligned scan in §12.3 is a strict superset of §11's method
(every `JSR` to a loader entry is inspected and both X and A resolved, not just ones that already
matched a narrow immediate-operand pattern) and it still finds **zero** GDRIVE requests with area
code 1 or 2, in either title. The one non-immediate mechanism this project has ever found for the
GDRIVE family (`DUNGEON`'s `PLA` restore, §12.3) only ever restores a *previously cached* area
code — and no confirmed **loader call site** requests area 1 or 2 (all 11 target area 0, 3, 4 or 5),
so no traced request writes 1 into the cache.

> **Scope correction (2026-08-12).** This paragraph previously concluded that the cache "cannot
> legitimately hold 1 via any statically-traceable path either." That absolute is not supported,
> and §12.5 of this same document disclaims it: the **write side of `$7F13` was never censused**.
> It is not empty. Disassembling the write sites shows a bulk restore of the whole cache from a
> save area at `$4DC0`, in both titles, covering slot 0:
>
> ```
> cok GEN  $25BC  LDX #$18        dok CODE00  $1433  LDX #$1F
>          $25BE  LDA $4DC0,X                 $1435  LDA $4DC0,X
>          $25C1  STA $7F13,X                 $1438  STA $7F13,X
>          $25C4  DEX                         $143B  DEX
>          $25C5  BPL $25BE                   $143C  BPL $1435
> ```
>
> with matching save loops (`LDA $7F13,X ; ORA #$80 ; STA $4DC0,X`) in cok `CAMP` `$0CEA`, cok
> `GEN` `$2608`, dok `CAMP` `$0CDB` and dok `CODE00` `$146A` — so `$4DC0` is a bit-7-tagged mirror
> of the entire 25/32-slot cache, restored wholesale across a camp/overlay transition. **`$4DC0`'s
> contents were never traced by §12**, so a statically-traceable write path into slot 0 exists that
> this round did not follow. What the sweep establishes is the narrower claim above: no *traced
> loader request* carries area code 1 or 2.

`GDRIVE01` (the sprite-composite driver, `$C6BA`'s entry, §4) and `GDRIVE02` (a small 407-byte
picture-blit driver) remain real, structurally distinct, on-disk files with **no confirmed
caller** across five separate investigative rounds and four independent search strategies (the
count read "three" while listing these four; corrected 2026-08-12):
call-into-a-resident-driver (§8-§10), load-the-driver-by-name literal ASCII search (§10.4),
byte-scanned immediate-operand loader-call search (§11), and now decode-aligned
loader-call search with bounded X/A backward resolution (§12.3). This round does not weaken or
strengthen that conclusion — it extends the negative to computed/indirect area-code loads *at
every call site its own predicate reaches* (a linear decode-aligned scan for `JSR`-absolute to a
loader entry, with a bounded backward instruction walk to resolve X and A) and confirms the
negative survives there. The computed-selector hypothesis — a GDRIVE area code supplied from a
GEO-level or other per-area data field rather than from code near the call — is **still unswept**
(§12.5's own "not swept this round" list).

### 12.5 What was swept this round, so it is not re-swept

- **`reload`'s own control-flow spine** (`GENERIC_LOADER_RELOAD_TAIL`, both titles): disassembled
  in full from the filename-build tail through the LOAD/status-check/retry/loop-back sequence;
  pinned by exact bytes (`GENERIC_LOADER_RELOAD_TAIL_BYTES`).
- **LINKER** (both titles, via `c64_kernel.linker_body()`): swept with `find_callers` for any
  absolute-mode reference to the same two addresses `reload`'s spine calls (both returned hits
  were checked individually and are opcode `$20` `JSR` at decode alignment) — confirmed exactly one call to each, establishing the
  GDRIVE03/FINAL failure-path identity (§12.1).
- **The file-existence probe** (`$322E` cok / `$31E7` dok): pinned by exact bytes; LIBRARY's own
  jump-table slot 16 in cok confirmed to point at it and confirmed to have zero external callers
  through either the raw address or the slot vector; corpus-wide raw-byte-scan re-run this round
  (beyond the committed test) surfaced two more candidate hits (dok `CODE00`@172, dok `PIC18`@1663)
  and disassembled both — both confirmed false positives inside non-code data, not new callers.
- **Every file in `all_bodies()`** (cok 342 / dok 273): decode-aligned linear scan for `JSR` to any
  `GENERIC_LOADER_ENTRY` address, with backward X/A resolution for every hit — reproduces §11's
  11-site GDRIVE (X=0) total exactly, resolves the one non-immediate case to the fixed cell
  `$7F13`, and finds zero GDRIVE01/GDRIVE02 (area code 1 or 2) requests.
  **The scan's predicate, stated so the negative stays scoped to it:** a linear decode-aligned walk
  from body offset 0 (org `$0800`) matching `JSR`-**absolute** only (not `JMP`, not indirect calls),
  with X and A each resolved by a **bounded** backward instruction walk (12 instructions, plus one
  `TAX` hop). A selector computed further back than that window, or read from per-area data rather
  than from code near the call, lies outside the predicate — the computed-selector hypothesis named
  immediately below remains unswept.

Not swept this round: **§11.7's own named concrete next step, "tracing every write to `$7F13,X`"**.
§12.3 resolves computed/indirect area codes only at `JSR`-absolute call sites its predicate reaches;
it never censused the write side. A raw byte-pattern sweep of `all_bodies()` for `9D 13 7F` /
`8D 13 7F` (the only thing checked here — raw candidates, not decode-aligned, not disassembled)
finds 15 sites, 6 of them in `LIBRARY` and 9 outside it: cok `POST.COM`@4474, cok `DUNGEON`@6515
(`8D`, unindexed), cok `INIT`@172, cok `GEN`@7617, dok `POSTCOM`@1651, dok `POSTCOM`@4011, dok
`DUNGEON`@5973 (`8D`, unindexed), dok `INIT`@161, dok `CODE00`@3128. None of the nine was examined
by §12.

Also not swept this round (unchanged from §11.8's own list): whether GDRIVE01/02 might be selected via
a GEO-level or other per-area data field rather than any code path at all — the task brief's own
hypothesis (b), still not reached, since every confirmed loader-call site this project can find
targets a fixed, hard-coded area code (0, 3, 4, or 5) rather than reading one from game-state data;
the CHARPIC/COMPIC/ITEMFILE[/CODE] families (stem-table indices 17-20), still not reachable through
the X-to-Y remap table this section's scan relies on.

## 13. Tracing the `$4DC0` mirror's write side (2026-08-13)

§12.5 explicitly left "tracing every write to `$7F13,X`" and, by extension, `$4DC0`'s own write
side unswept. This section follows that lead directly: what else touches `$4DC0`, what `ORA #$80`
is actually for, and whether any of it opens a path to `GDRIVE01`/`GDRIVE02`. All results below are
from real disassembly of real bytes (`ck.all_bodies()` — cok 342 files, dok 273 files, plus
`LIBRARY`/`LINKER` — read fresh off the retail disk images), not the earlier task brief's context,
which is treated as a starting point, not a given.

### 13.1 What else touches `$4DC0`? A full corpus census, narrowed to the real span

A target-address census (`disasm.find_stores`, candidate-only) over `$4DC0`-`$4DDF` (32 bytes —
covers both cok's 25-slot and dok's 32-slot mirror) across every file in both corpora, plus
`LIBRARY`/`LINKER`, finds the two already-known loop pairs (cok `CAMP`/`GEN`, dok `CAMP`/`CODE00`)
and a handful of raw hits in `PIC*`/`WALLDEF*` files that disassemble to nothing at real alignment
(the standard byte-alias noise this corpus produces in picture/data files — none is a genuine
reference). Beyond that, the census surfaces **two real, previously-uncensused writers** — one in
each title, and they are *not* the same mechanism:

**(a) cok `CAMP` writes `$4DC8` (slot 8) a second time, from a source other than `$7F13,X` — cok
only.** Immediately after cok `CAMP`'s own generic 25-slot save loop (`$0CE8`-`$0CF3`, already
documented), the very next three instructions overwrite slot 8 specifically:

```
$0CF5  LDA $4BF2          ; ad f2 4b
$0CF8  ORA #$80           ; 09 80
$0CFA  STA $4DC8           ; 8d c8 4d
```

`$4DC8` is `$4DC0 + 8`; slot 8 in the family-stem table (`S.family_stem_table`, decoded fresh this
round) is **`ECL`** in both titles (`table[8]` prefix `b'ECL00WALLS00'` cok / `b'ECL00\x00WALLSE'`
dok — `GENERIC_LOADER_INDEX_MAP[8] == 8`, no remap). So this is CAMP deliberately re-tagging the
*ECL* family's mirror slot from `$4BF2`, a completely different memory cell, instead of trusting
the generic loop's own copy of `$7F1B` (`$7F13+8`, the live ECL cache byte). A second, symmetric
instruction three lines earlier in the same `CAMP` routine reads it the other way:

```
$086F  LDA $4BF2          ; ad f2 4b
$0872  LDX #$08           ; a2 08
$0874  JMP $4142           ; 4c 42 41   -- cache_check_preset's own entry address
```

This is a genuine, previously-unswept **computed-area-code loader call** — exactly the class §12.5
named "still unswept" — but for the ECL family (X=8), not GDRIVE (X=0). A corpus-wide search for the
opcode `AD F2 4B` (`LDA $4BF2`, decode-accurate, not alignment-checked) finds it **exactly twice in
cok, both inside `CAMP`, and zero times anywhere in dok's 273-file corpus** (including `LIBRARY`).
Likewise the exact `ORA #$80 ; STA $4DCx` re-tag shape (`09 80 8D` with a destination in
`$4DC0`-`$4DDF`) is found **once in cok (`CAMP`) and zero times in dok**. This is a real, verified
cross-title asymmetry, not an oversight in the search: dok's own `CAMP` save sequence (disassembled
in full, `$0CD1`-`$0CE8`) goes straight from the generic loop into an unrelated call with no
analogous single-slot instruction anywhere.

**(b) `$4BF2` itself is a masked snapshot of the live ECL cache byte, written by `DUNGEON` — present
byte-identically in BOTH titles, but only ever read back in cok.** A corpus-wide search for the
9-byte idiom `LDA $7F1B ; AND #$7F ; STA $4BF2` (`AD 1B 7F 29 7F 8D F2 4B`, then either `60` RTS or
falling into more code) finds it **exactly twice per title, both inside `DUNGEON`, and nowhere
else**:

> **CORRECTION (lead session, 2026-08-13) — "nowhere else" is a census of one idiom, not of the
> variable, and dok has a third write it misses.** Searching for a 9-byte masked-store idiom can
> only ever return masked stores; a claim about *what writes `$4BF2`* has to search for the store
> itself. The general opcode scan — `STA $4BF2` (`8D F2 4B`), every file of both corpora — returns
> **cok 3, dok 4**:
>
> | title | site | stores |
> |---|---|---|
> | cok | `DUNGEON` @4770, @6400 | masked `$7F1B & $7F` (the idiom below) |
> | cok | `INIT` @345 | `#$00` — boot zero-init, shared with `STA $7ED2`/`$7ED3` |
> | dok | `DUNGEON` @4278, @5854 | masked `$7F1B & $7F` |
> | dok | `INIT` @337 | `#$00` — same boot zero-init |
> | **dok** | **`POSTCOM` @4041** | **`#$81`, UNMASKED (bit 7 set)** — dok only |
>
> The `POSTCOM` site sits inside a sequence that is otherwise byte-identical between the titles;
> dok simply inserts one extra `8D F2 4B`:
>
> ```
> cok POST.COM@4499:  a9 81  8d 1b 7f            a9 01  8d 78 7e  a9 00  ...
> dok POSTCOM @4036:  a9 81  8d 1b 7f  8d f2 4b  a9 01  8d 78 7e  a9 00  ...
> ```
>
> So the "masked snapshot" characterisation is right for `DUNGEON` and wrong as a description of
> the variable: dok seeds `$4BF2` at boot with a bit-7-**tagged** value. It changes nothing
> downstream — dok never reads `$4BF2` back (the `LDA $4BF2` scan is still zero-hit there), so this
> is a write to a variable that title never consults, and it targets ECL's slot, not GDRIVE's, so
> the Q3 conclusion in §12.5 is untouched. Pinned by
> `test_general_sta_4bf2_scan_finds_more_than_the_masked_idiom`.

| | offset 1 | offset 2 |
| --- | --- | --- |
| cok `DUNGEON` | `$1A9D` (standalone, ends `60` RTS at `$1AA5`) | `$20FB` (inline, falls into `JSR $1C5E`) |
| dok `DUNGEON` | `$18B1` (standalone, ends `60` RTS) | `$1ED9` (inline, falls into a `JSR`) |

`$7F1B` is `$7F13+8` — the ECL family's *live* LIBRARY cache byte, the same one `CAMP`'s loop
already mirrors generically. `DUNGEON` takes a second, independent, bit-7-stripped snapshot of it
into `$4BF2` (game-boot `INIT` also zeroes `$4BF2` once, at cok `$0959`/dok's analogous `INIT`
zero-fill — pinned in the test file). `$4BF2` is only ever **read** in cok's `CAMP` (§13.1a above);
dok's own corpus (searched by the same decode-accurate opcode scan) never reads it back anywhere.
So both titles maintain the shadow variable; only cok actually consults it. Neither `DUNGEON`
instance's caller was found this round (self-referential decode-aligned JSR/JMP/branch scan of each
title's own `DUNGEON` body: zero hits at either offset, both titles) — recorded as an honest
negative on reachability, not asserted as dead code.

**(c) A candidate whole-mirror zero-fill exists in dok `CODE00` — structurally real, reachability
unconfirmed, and dok-only.** Immediately after `CODE00`'s own restore/save loop pair
(`$1433`/`$146A`, already documented) and one RTS-terminated subroutine later, `CODE00` contains a
58-byte, internally coherent block (`$16F3`-`$172C`) that, if reached, would:

```
$16F3  SEI
$16F4-$1703  four LDA abs/PHA pairs -- save $4BFC, $4CF4, $4C33, $4C34
$1704  LDY #$00 ; TYA ; STA $4BC0,Y ; DEY ; BNE -- zero-fill $4BC0-$4CBF (256 bytes)
$170D  STA $4CC0,Y ; INY ; CPY #$C0 ; BCC -- zero-fill $4CC0-$4D7F (192 bytes)
$1715  LDY #$1F ; STA $4DC0,Y ; DEY ; BPL -- zero-fill $4DC0-$4DDF (32 bytes -- the WHOLE mirror)
$171D-$172C  four PLA/STA abs pairs, mirrored order -- restore the four saved bytes
```

The four preserved bytes (`$4BFC`, `$4C33`, `$4C34`, `$4CF4`) all fall inside the first two
zero-filled regions and are explicitly saved/restored around the fill — real, deliberate code, not
a coincidental decode (see the mutation-checked pin in the test file). Crucially, **none of the four
preserved bytes falls inside `$4DC0`-`$4DDF`**: if this routine runs, it wipes all 32 mirror slots
(including slot 0, GDRIVE) to a plain `$00`, with no exception. This would matter directly for Q3
below — a zeroed mirror slot 0, restored via the generic loop, would leave `$7F13` (GDRIVE's live
cache) at `$00` untagged, i.e. request "GDRIVE00", not 1 or 2.

**Reachability was not established.** A decode-aligned self-referential JSR/JMP/branch scan of
`CODE00`'s own body finds nothing targeting `$16F3`-`$1745`; `LIBRARY` (the one resident callable
from many different `$0800`-loaded overlays) has zero references there either. An earlier pass of
this section claimed "the preceding instruction is an RTS" as its fallthrough argument; corrected
here after a test caught the imprecision: the nearest real RTS is indeed at `$16E8` (the end of an
11-byte table-membership routine, `$16DE`-`$16E8`), but it is not immediately adjacent — a 10-byte
non-instruction gap (`07 12 1A 2F 4D 5B 5C 5F 69 73`, which decodes as illegal/misaligned opcodes,
i.e. data, not code) sits between that RTS and the zero-fill's own `$78` (SEI) at `$16F3`. This
doesn't change the conclusion either way: RTS never falls through to the following byte in real
6502 execution regardless of what's there, so "fallthrough reachability" was never a live
possibility here — the only question that matters is whether any real JSR/JMP/branch targets
`$16F3`, which the scan above already answers (nothing found). A raw
corpus-wide JSR/JMP scan into that address range does turn up ~18 hits across unrelated overlays,
but per this project's established address-space-aliasing hazard (every `$0800`-loaded overlay is a
mutually exclusive occupant of the same memory — see §9/§10), a JSR in some *other* `$0800` overlay
to a numeric address inside `CODE00`'s range is evidence about *that* overlay's own body at the same
address, not a call into `CODE00`. None of these were disassembled to confirm a genuine cross-file
call, because none is architecturally possible for two mutually-exclusive `$0800` residents. This is
recorded as **found, well-formed, corpus-wide-searched, not proven reachable** — the same honest
category several other findings in this document already carry (the GDRIVE01 caller itself,
`DUNGEON`'s own `$2965` GDRIVE03 wrapper, the file-existence probe). **A byte-pattern search for the
same shape in cok's full corpus (the `STA $4DC0,Y` opcode `99 C0 4D`) finds zero occurrences** — cok
has no analogous routine, at least under this exact-opcode predicate.

### 13.2 What is `ORA #$80` for? Solved — it is an invalidation tag consumed by `cache_check`'s own masking, never cleared because it never needs to be

Disassembling `cache_check`/`cache_check_preset` in full (previously only `reload`'s spine had been
fully read) answers this directly. The bytes are byte-identical in both titles (only the absolute
addresses differ):

```
cache_check:         $413F (cok) / $4080 (dok)
  LDA $7F13,X          bd 13 7f
cache_check_preset:   $4142 (cok) / $4083 (dok)  -- entry point, A already holds the requested value
  CMP #$FF             c9 ff
  BEQ  +$0E   --------------------------> $4154/$4095: CLC ; RTS   (requested == $FF: always "loaded")
  AND #$7F             29 7f              ; masked = requested & 0x7F
  CMP #$7F             c9 7f
  BEQ  +$05   --------------------------> STA $7F13,X ; CLC ; RTS  (masked == $7F: always "loaded")
  CMP $7F13,X          dd 13 7f           ; compare MASKED requested against the RAW cached byte
  BNE  +$05   --------------------------> reload's own STA $7F13,X entry (mismatch: force reload)
  STA $7F13,X          9d 13 7f           ; (fall-through, match) re-store the masked value; CLC;RTS
```

The load-bearing line is `CMP $7F13,X`: it compares the **masked** (bit-7-clear) requested value
against the **raw, unmasked** cached byte. This is a pure bit-arithmetic fact, not an empirical one
— for every `v` with bit 7 set, `v & 0x7F != v` (128 of 256 possible byte values; the other 128,
with bit 7 already clear, always satisfy `v & 0x7F == v`; pinned as a standalone, disk-independent
test in the test file, since it needs no corpus at all to be true). So **any slot whose cached byte
carries the `$4DC0`-restore's bit-7 tag can never satisfy this comparison, regardless of what the
low 7 bits say or what area code is being requested** — it is unconditionally treated as a cache
miss, which branches straight into `reload`. `reload` performs a real KERNAL load and its own
`STA $7F13,X` (the same `9d 13 7f` bytes, confirmed in §12.1) writes the **fresh, untagged** value
back. That is the whole mechanism: **bit 7 is never explicitly cleared anywhere in either title's
corpus because `reload`'s own overwrite clears it implicitly, as a side effect of doing a real
reload — the tag's entire purpose is to force exactly one unconditional reload the next time that
resource is asked for**, which is the correct, conservative behaviour after a save/restore
round-trip whose whole point is that the *actual resident driver in memory* may have changed
underneath the cache (the DUNGEON GDRIVE03 wrapper in §12.3 is exactly this scenario: something
else was loaded into the shared `$C000` slot during the excursion, so the cache entry for whatever
was there before cannot be trusted at face value on return).

Two more real sentinel values were found while tracing this, both directly relevant to Q3 below:

- **`$FF`** is a second, independent "not yet verified" marker, checked by `cache_check_preset`'s
  own first instruction (`CMP #$FF`, before any masking). It is written by a **full-table
  re-initialisation loop** (`LDX #$18/#$19/#$1F ; LDA #$FF ; STA $7F13,X ; DEX ; BPL`, covering
  every slot including 0) found in cok `POST.COM`@`$1976` and `INIT`@`$08A8`, and dok
  `POSTCOM`@`$17A7` and `INIT`@`$089D` — four sites, byte-identical shape, one per title in each of
  two different files. This is very likely a boot-time / new-session reset of the whole cache table,
  not something this round traced further.
- **`$7F`** (the same value the masking check special-cases) is written **directly, unindexed** —
  i.e. unambiguously to slot 0, GDRIVE, regardless of any X register — by a 23-byte `DUNGEON`
  routine present byte-identically in both titles (cok `$2168`, dok `$1F4A`):
  `LDA #$7F ; STA $7F15 ; STA $7F16 ; STA $7F1C ; STA $7F13 ; LDX #$05 ; STA $7F22,X ; DEX ; BPL ;
  RTS` — six slots (0, 2, 3, 9, plus 5 more via the indexed loop) forced to the "always succeed"
  sentinel in one shot. A full corpus-wide census of the **unindexed** form `STA $7F13` (opcode
  bytes `8D 13 7F`, unambiguous slot-0 writes, as opposed to the indexed `9D 13 7F` form which
  depends on a runtime X) finds **exactly one occurrence per title, both inside this same `DUNGEON`
  routine, both writing the literal `$7F`** — never `$01` or `$02`. Reachability of this routine was
  not established this round either (zero self-referential callers found in either title's
  `DUNGEON`).

### 13.3 Does this open a path to `GDRIVE01`/`GDRIVE02`? Narrowed further with a mechanism, still an honest negative

**No — and this round adds a mechanistic reason, not just another failed search.** The restore loop
itself (`LDA $4DC0,X ; STA $7F13,X`, both titles) is a **plain, unconditional byte copy** — it does
not call `cache_check`/`cache_check_preset`/`reload` at all, builds no filename, and issues no
KERNAL load. Whatever byte the mirror holds for slot 0 lands straight in `$7F13` with no
interpretation at that moment.

The interpretation only happens the *next* time something calls `cache_check(_preset)` for the
GDRIVE family (X=0) — and by §13.2's own algebra, that call's outcome depends on the **masked
requested value** the caller itself supplies, compared against the raw cache. **The mirror's own
stored byte never supplies the requested area code to `reload`** — `reload`'s filename is built from
the *caller's* A, not from `$7F13`/`$4DC0`'s prior contents. So even in the worst case — the mirror
holding a bit-7-tagged 1 or 2 for slot 0 — the only thing that byte could do is force the *next*
GDRIVE request into `reload`, and `reload` would build the filename from whatever that *next real
request* actually asks for. Per §12.3's exhaustive decode-aligned sweep, every GDRIVE (X=0) loader
call in both corpora requests a literal 0, 3, 4 or 5, except the one non-immediate case (`DUNGEON`'s
own PLA restore, §12.3), which itself traces back to a value pulled from `$7F13` directly (not
`$4DC0`) and, by the same reasoning, ultimately to an earlier literal 0/3/4/5 write.

This still does not *prove* GDRIVE01/GDRIVE02 unreachable — the honest negative's scope is exactly
as stated in §12.5/§12.3: everything checked is a decode-aligned, bounded-lookback, or
corpus-wide-pattern predicate, and a sufficiently indirect mechanism (a self-modifying operand, a
runtime-computed jump, or a caller reading `$4DC0` raw and using its low 7 bits as an area code
through some path this round's scans don't match) remains possible in principle. What changed this
round is that the two concrete candidate mechanisms the task named — "does the mirror ever actually
hold 1 or 2, and can a caller get that value back out as a real request" — are now answered with
real bytes rather than left open by omission: nothing writes 1 or 2 into `$7F13`/`$4DC0` anywhere
this round's census reaches (writers found: the generic loader's own 0/3/4/5, the `$FF` full-table
reset, the `$7F` bulk `DUNGEON` reset, and the `$4DC0`-mirror copy itself, which only ever contains
what `$7F13` already held); and the one place a *restored* value is fed back into a loader call
(`DUNGEON`'s PLA) is proven to read `$7F13` directly, not `$4DC0`, and to be interpreted through the
masking comparison that discards its bit-7 tag and compares only against the caller's own request —
never substituting the cached value in as the request itself.

## 14. 2026-08-13: SOUNDFX/SPR.TP/TITLEPG re-confirmed already swept; the trailer field-to-body
correlation question tested directly, with a permutation null

This round's brief named two independent tasks: (a) sweep `SOUNDFX`, `SPR.TP`, `TITLEPG` (and
`LIBRARY`/other resident code) for the GDRIVE01 parameter-block caller, on the reading that they
had "not been swept"; and (c) test whether any of the 16 trailer bytes correlates with a decodable
property of the sprite body. (a) turned out to already be answered in full by this same document's
own §8-§13, written concurrently by sibling work on the same file — restated here rather than
silently skipped, so the brief's own question has an explicit, current answer:

- **`SOUNDFX`, `SPR.TP`, `TITLEPG`, both titles**: swept under both the plain-parameter-block
  scanner and the self-modifying-patch-target scanner (§9.1) — zero genuine hits in any of the six
  (title × file) combinations. `SPR.TP` additionally turns out to be ordinary bare-dialect SPRITE
  pixel data, not code at all (§9.1). `TITLEPG` produces one raw byte-alias hit per title, both
  disassembled and shown to sit in an illegal-opcode-dense region, i.e. not real code (§9.1,
  `illegal_opcode_fraction` 42.7-43.9%, ~4.7-4.9× the highest confirmed-code score in either title).
- **`LIBRARY`**: explicitly included, not assumed clean by omission — §8.2/§8.4 disassemble its one
  raw hit (a `STA ($4C),Y`/`DEY`/`CPY #$FF` byte-alias) and rule it a false positive in both titles;
  §10.1 re-confirms zero hits under both scanners; §10.2 finds and disassembles the one genuine
  `LIBRARY→$C000` call that exists (table slot 1, a driver-init trampoline reachable only from
  `DUNGEON`, unrelated to the sprite-composite entry).
- **`LINKER`**: checked for the first time this document ever pointed either scanner at it (§10.1)
  — clean under both.
- Corpus-wide, both titles: **every named PRG file on side 1** (82 cok / 91 dok, §9.3) was swept for
  the self-modifying-patch-target hypothesis; the load-by-name question was separately answered by
  tracing the real generic resource loader back to its source in `LIBRARY` (§11-§13) rather than
  left as a byte-pattern guess.

Net effect: the caller for `GDRIVE01`'s sprite-composite entry (and `GDRIVE02`) is still not found,
across five independent rounds and four independent search strategies (§12.4's own tally). This
round adds no new file to that sweep — the ones this task named were already covered — and instead
spends its effort on the independent question, (c), which nothing in §1-§13 had touched.

### 14.1 What "decodable property" even has variance to test

The task named four candidate properties: frame count, body length, multicolour-vs-hires, and
sprite-pointer alignment. `S.trailer_field_properties()` (new in `tools/c64_sprite.py`) computes
all four, per SPRITE instance, for every trailer-dialect file — reusing `framing()`/`frames()`/
`hires_run_score()`/`multicolour_run_score()` rather than re-deriving anything. Applied to the full
per-*instance* population (not deduplicated by name — same convention §3.1 already established:
"counted per instance... because several sides carry duplicate copies") across all four
trailer-dialect titles:

| Title | trailer-dialect instances | frame_count | body_length | blank frames | multicolour-preferred frames |
| --- | ---: | --- | --- | --- | --- |
| Champions of Krynn | 37 | `{13}` | `{848}` | `{0}` | 0-4 (varies) |
| Death Knights of Krynn | 24 | `{13}` | `{848}` | `{0}` | 0-4 (varies) |
| Buck Rogers — Countdown to Doomsday | 35 | `{13}` | `{848}` | `{0}` | 0-5 (varies) |
| Curse of the Azure Bonds | 39 | `{13}` | `{848}` | 0 or 1 (36 vs 3) | 0-3 (varies) |

(135 instances total — matches §3.1's own 135/136 trailer-dialect count exactly, a direct
cross-check that the per-instance re-derivation here agrees with the earlier census.)

**Two of the task's four named properties are degenerate — literally nothing to correlate
against**, not "no correlation found": `frame_count` is `{13}` and `body_length` is `{848}` in
*every* instance of *every* trailer-dialect title, with zero exceptions (already known from
`test_trailer_dialect_titles_always_ship_thirteen_frames`; reconfirmed directly here,
`test_frame_count_and_body_length_are_degenerate_in_every_title_present`). A **third** named
property, sprite-pointer alignment, is degenerate too, for a structural reason: trailer-dialect
files always place frame 0 at body offset 0 (`bitmap_start == 0`), and every observed CBM load
address for a trailer-dialect file (`$4000` for Champions of Krynn/Death Knights of Krynn/Buck
Rogers, `$3000` and `$1000` for Curse of the Azure Bonds — including the already-documented §7
`SPRITE23` load-address anomaly) is itself a multiple of 64. Checked directly, not assumed: real
memory address of frame 0 (`load_address + bitmap_start`) modulo 64 is **0 for all 135 trailer-
dialect instances, 0 exceptions**. Every trailer-dialect sprite is 64-aligned in memory by
construction; there is no per-file variation to test a field against.

That leaves exactly one testable property from the task's own list: **multicolour-vs-hires**,
operationalised as the count of a file's 13 frames the existing run-length-coherence heuristic
scores as multicolour-preferred (`multicolour_run_score(frame) > hires_run_score(frame)`) — the
same heuristic `auto_rgb()` already uses, explicitly documented there as "a data-driven best-effort
render", **not** a proven per-frame mode selector. Every correlation below is therefore a claim
about this heuristic's output, not about a ground-truth VIC-II register value nobody has captured
by tracing hardware.

### 14.2 The null, stated first: a permutation test that reshuffles one series against the other

Per rule 3, the null is fixed *before* any correlation number is reported, and it is chosen to
destroy only the thing being tested. `S.permutation_correlation_p(xs, ys, trials, seed)` (new):
compute the real Pearson `r` between `xs` and `ys`, then repeatedly reshuffle `ys` relative to
`xs` — **holding both real marginal populations fixed** (every value on both sides is used exactly
once per trial, just re-paired) — and report the fraction of reshuffles whose `|r|` is at least as
large as the real `|r|`. This is deliberately *not* a whole-body byte shuffle or a uniform-random
redraw (the wrong nulls this project's own rule 3 warns about): those would also destroy each
series' own shape, testing "is this distribution unusual" rather than "is this *pairing* unusual",
which is the actual question. A degenerate input (either series constant) returns `(0.0, 1.0)`
without spending a single permutation trial — reported as "nothing to correlate", never silently
reinterpreted as "no significant correlation" (which would imply a real, if weak, relationship was
tested and failed to clear a bar).

Combining independent replications (multiple titles) uses Fisher's method (`S.fisher_combined_p`,
new): `-2 * sum(ln(p_i))` is chi-square with `2k` degrees of freedom, which has a closed-form
survival function for even df (no scipy/mpmath available in this project's environment), computed
directly rather than approximated. Both functions and the closed-form identities that verify them
(`fisher_combined_p([p]) == p` exactly, `fisher_combined_p([p1, p2]) == p1*p2*(1 - ln(p1*p2))`
exactly) are pinned in `TrailerFieldStatsTests` in `tools/test_c64_sprite.py`, with no disk image
needed — they always execute.

### 14.3 An honest exploratory scan first, so the headline number is not cherry-picked in secret

Before reporting any single correlation, every non-degenerate `(title, trailer-byte-position,
property)` combination was tested — all 16 byte positions × 2 non-degenerate properties
(`blank_frames`, `multicolour_frames`) × 4 titles, skipping only the cells that are themselves
degenerate in that title (e.g. `blank_frames` is constant `{0}` in three of the four titles, and
several byte positions — byte 10 always, bytes 11-12 in Champions of Krynn/Death Knights of
Krynn/mostly Buck Rogers — carry no variance in a given title). **51 valid, non-degenerate tests
run** (`trials=4000`, `seed=1000+byte_index` per cell, reproduced directly against the shipped
functions, not a separate ad hoc script):

```
total valid tests: 51
p<0.05 hits:        8   (expected by chance at alpha=0.05: 51 * 0.05 = 2.55)

  Champions of Krynn      multicolour_frames  byte 2   r=-0.471  p=0.00375
  Champions of Krynn      multicolour_frames  byte 3   r=-0.584  p=0.0        (<1/4000)
  Champions of Krynn      multicolour_frames  byte 4   r= 0.542  p=0.0025
  Champions of Krynn      multicolour_frames  byte 7   r=-0.430  p=0.009
  Death Knights of Krynn  multicolour_frames  byte 3   r=-0.446  p=0.025
  Death Knights of Krynn  multicolour_frames  byte 9   r= 0.422  p=0.04325
  Curse of the Azure Bonds  blank_frames      byte 7   r=-0.287  p=0.04925
  Curse of the Azure Bonds  multicolour_frames byte 3  r=-0.431  p=0.00425
```

Eight nominal hits against ~2.55 expected by chance is itself only mildly more than the noise floor
— with 51 tests, seeing 8 at `p<0.05` is not automatically damning of the null (a naive Bonferroni
threshold, `0.05/51 ≈ 0.00098`, is cleared by only one cell outright: Champions of Krynn byte 3).
**What distinguishes byte 3 from the other seven hits is not its p-value alone, but that it is the
only byte position whose `multicolour_frames` hit recurs in more than one independently-scanned
title** — bytes 2, 4, 7 and 9 each appear significant in exactly one title and nowhere else, the
single-title-hit pattern this project's own noise-floor arithmetic predicts happens by chance a
few times across 51 tests. Byte 3 clears `p<0.05` in **three of the four** titles (Champions of
Krynn, Death Knights of Krynn, Curse of the Azure Bonds) with the **same negative sign** in all
three (and the same negative sign, non-significant, in the fourth — Buck Rogers, see §14.4).

### 14.4 Trailer byte 3 vs. multicolour-frame-count, confirmed with dedicated per-title tests

A confirmatory pass (larger `trials=6000`, `seed=3`, run once per title rather than swept blind
across 16 positions) reproduces exactly the exploratory numbers above and extends to Buck Rogers,
which the 51-test scan already covered but is worth stating on its own:

| Title | n (trailer-dialect instances) | r | permutation p |
| --- | ---: | ---: | ---: |
| Champions of Krynn | 37 | −0.584 | <1/6000 (0/6000 reshuffles reached it) |
| Death Knights of Krynn | 24 | −0.446 | 0.0278 |
| Buck Rogers — Countdown to Doomsday | 35 | −0.248 | 0.147 (not significant alone) |
| Curse of the Azure Bonds | 39 | −0.431 | 0.0070 |

Same negative sign in **all four** titles, individually significant in three of the four.
Combining all four titles' own p-values (each floored at `1/trials` where the raw count was 0, so
no term is a literal `0.0` — `fisher_combined_p` rejects that as undefined rather than "infinitely
significant") via Fisher's method: **combined p ≈ 6.6×10⁻⁶** — several orders of magnitude past
even a strict Bonferroni-corrected threshold for the 51-test family this was drawn from
(`0.05/51 ≈ 0.00098`). Pinned as `test_trailer_byte3_negatively_correlates_with_multicolour_
frame_count` (asserts the sign in every title present and the combined bound), with the exact
per-title numbers above reproduced directly from the shipped `S.permutation_correlation_p`/
`S.fisher_combined_p`, not copied from a throwaway script.

> **CORRECTED 2026-08-13 — right conclusion, wrong family. The look-elsewhere check has now
> actually been run, and the finding comes out stronger.**
>
> The paragraph above defends a Fisher-combined `p` against `0.05/51`, the Bonferroni threshold
> for the 51-test exploratory scan in §14.3. That is the wrong reference family: those 51 were
> *per-title* correlations, and the number being defended is a statistic combined *across*
> titles. The combined statistic was never one of the 51, so its threshold cannot be derived
> from them — the comparison happened to point the right way, but it was not testing what it
> claimed to test.
>
> The family the headline is actually selected from is "the combined `p` I would have computed
> at every trailer position I could have looked at". Computed for all 16 positions (same
> `trials=6000, seed=3`, same `multicolour_frames` property):
>
> | rank | byte | combined p | clears `0.05/12 ≈ 4.2×10⁻³`? |
> | ---: | ---: | ---: | --- |
> | 1 | **3** | **6.57×10⁻⁶** | yes, by ~630× |
> | 2 | 4 | 1.17×10⁻² | no |
> | 3 | 2 | 5.42×10⁻² | no |
> | 4 | 7 | 7.85×10⁻² | no |
>
> Four positions (10, 13, 14, 15) are degenerate in every title and admit no test at all, so the
> family size is **12**, not 16 — counted rather than assumed. Byte 3 clears the corrected
> threshold by ~630×, and — the part the 51-test framing could not show — **no second position
> comes near it**, so this is not several candidates crowding a threshold with one of them
> winning by luck. Byte 3 is also the only position whose correlation carries the same sign in
> all four titles; on its own that is weak (a given position is unanimous with probability 2/16
> under the null, so ~1.5 unanimous positions are *expected* among 12), which is why it is
> recorded as a distinguishing property rather than as separate evidence.
>
> Pinned by `test_byte3_survives_a_look_elsewhere_sweep_of_every_trailer_position`, which
> re-derives all 12 combined values from `permutation_correlation_p`/`fisher_combined_p` rather
> than reading the table above back, and asserts the runner-up *fails* the threshold as well as
> the winner passing it. Mutation-tested two ways (expect byte 4 as the winner; correlate
> against a synthetic `i % 3` series instead of the real frame counts) — both RED, both
> reverted. Note bytes 2 and 4 flank byte 3 and are the next two strongest; if the trailer's
> first ten bytes are multi-byte fields (§3.1's unresolved "coordinate-ish pairs"), those three
> may not be independent tests. That does not weaken byte 3 — a correlated neighbourhood makes
> the effective family *smaller* than 12, not larger — but it does mean "byte 3 specifically"
> should be read as "the field byte 3 belongs to".

**What this is not.** It is not a decode of what trailer byte 3 physically means. The sample
trailer dump already in §3.1 (`SPRITE01`: `...55 74 00...`; `SPRITE08`: `...54 7c 00...`;
`SPRITE23`: `...53 88 00...`) shows byte 3 taking values like `0x74`/`0x7c`/`0x88` — too large and
too varied to be a small enable-mask bit-pattern the way bytes 11-12 are hypothesized to be (§3.1);
it reads more like part of a coordinate, size, or pointer field among the trailer's first ten
bytes, which §3.1 already flagged as looking like paired coordinate-ish values without further
characterisation. No disassembly ties byte 3 to a specific VIC-II register or GDRIVE01 operand in
this round — that would need the caller itself, which remains unlocated (§4-§13) — or a dynamic
trace, which this project's rules forbid. This is reported as a **real, falsifiable, cross-title-
replicated statistical correlate**, a concrete lead for whoever next gets a disassembly foothold on
whatever writes this trailer (almost certainly the same still-unlocated caller), not as a solved
mapping.

**Confound check.** A plausible alternative explanation is that both byte 3 and the multicolour-
frame-count heuristic simply trend with an unrelated third variable — e.g. the SPRITE file's own
numeric suffix, a proxy for disk/authoring order (earlier, simpler creatures first). Tested
directly in Curse of the Azure Bonds (the title with the cleanest single-title signal and the
largest `n`): the numeric suffix parsed from each file's own name correlates with **neither** byte
3 (`r=0.025, p=0.874`) **nor** `multicolour_frames` (`r=0.116, p=0.483`) in this title — so the
byte-3 finding there is not an artifact of file-ordering (`test_curse_of_azure_bonds_byte3_
finding_is_not_a_filename_ordering_artifact`). This check was **not** run the same way in
Champions of Krynn/Death Knights of Krynn, where a weaker filename-suffix-vs-`multicolour_frames`
correlation does exist (`r≈-0.44/-0.30`, borderline-significant) alongside a filename-suffix-vs-
byte-3 correlation of similar strength — meaning the confound is **not excluded** in those two
titles specifically, and the honest reading is that Curse of the Azure Bonds is the cleanest single
piece of evidence, not that every title's replication is equally confound-free.

### 14.5 A direct, negative test of §3.1's own register-mask hypothesis

§3.1 hypothesized bytes 11/12 as VIC-II sprite-enable/multicolour-enable bitmasks
(`$D015`/`$D01C`), on the strength of their value shapes (nested low-bit-count masks) rather than
any confirmed code reference. If that hypothesis is right, some relationship to how often a
creature's frames read as multicolour under the heuristic is plausible — more hardware sprites (a
bigger mask) could plausibly mean a more elaborate, more often multicolour-favoring composite.
Tested directly, in the two titles where bytes 11/12 actually carry variance at all (Curse of the
Azure Bonds for both bytes; Buck Rogers only for byte 11 — byte 12 is degenerate there, `{0x3F}`
always, and correctly skipped rather than force-tested):

```
Curse of the Azure Bonds   byte 11   r=-0.042   p=0.844
Curse of the Azure Bonds   byte 12   r=-0.036   p=0.868
Buck Rogers                byte 11   r=-0.005   p=1.000
```

**No significant correlation in any of the three testable cases.** This does not refute §3.1's
register-mask reading outright (the hypothesis was never about a relationship to multicolour-frame
*count* specifically — a real per-hardware-sprite enable mask could vary for reasons entirely
unrelated to any one file's own multicolour/hires balance), but it is a real, stated, direct test
of the one falsifiable prediction that hypothesis suggested, and it came back null. Pinned as
`test_hypothesised_enable_mask_bytes_11_and_12_do_not_correlate_where_they_vary`, which also
asserts at least two of the three cases actually ran (guards against a variance-check bug silently
skipping every case and passing vacuously).

### 14.6 Mutation checks run this round

All done by monkeypatching the imported module in a throwaway interpreter (never a committed
file), per this project's own established convention for this kind of check:

- `S.pearson_r` forced to always return `0.0` → the strong-relationship fixture
  (`xs == ys == range(20)`, true `r == 1.0`) now measures `r == 0.0` — confirms
  `test_permutation_correlation_p_detects_a_strong_real_relationship`'s `assertAlmostEqual(r, 1.0)`
  would go red.
- `S.permutation_correlation_p` forced to always return `p=1.0` (real `r` still computed) → the
  real byte-3-vs-`multicolour_frames` Fisher-combined p recomputed under this mutation is `1.0`,
  not `≈6.6e-6` → confirms `test_trailer_byte3_negatively_correlates_with_multicolour_frame_count`'s
  `assertLess(combined, 1e-3)` would go red.
- `S.multicolour_run_score` forced to always return `-1.0` (never beats `hires_run_score`) →
  `multicolour_frames` collapses to the constant `{0}` for real Champions of Krynn data → confirms
  the headline test would go red via the degenerate-input path (`permutation_correlation_p`
  reporting `(0.0, 1.0)` on every title, so the combined bound fails).
- Real Curse of the Azure Bonds byte-11 values paired against **themselves** instead of
  `multicolour_frames` (an artificial perfect relationship injected into the exact code path the
  negative-result test exercises) → `r=1.0, p=0.0` → confirms
  `test_hypothesised_enable_mask_bytes_11_and_12_do_not_correlate_where_they_vary`'s
  `assertGreater(p, 0.05)` would go red on a genuine relationship, i.e. the test is not vacuously
  passing.
- Real Curse of the Azure Bonds filename-suffix values paired against themselves (same technique)
  → `r=1.0, p=0.0` → confirms `test_curse_of_azure_bonds_byte3_finding_is_not_a_filename_ordering_
  artifact`'s two `assertGreater(p, 0.05)` checks would go red on a genuine confound, not pass no
  matter what.

All five restored and reverified against the unmodified module. Full suite after this round:
`python -m pytest tools/test_c64_sprite.py -q` → **106 passed** (92 before this round + 14 new:
9 pure-arithmetic tests in `TrailerFieldStatsTests`, always executing regardless of disk
availability, plus 5 corpus tests in `TrailerFieldCorrelationTests`, confirmed to actually run
— not skip — with `-v` against the real `{external-game-holdings}/Emulator/C64/Goldbox` corpus).

### 14.7 Where this leaves the open question

The trailer's exact field-to-VIC-register mapping is **still not solved** — this round adds one
new, falsifiable, cross-title-replicated statistical lead (trailer byte 3 vs. the multicolour-
frame-count heuristic) and one new falsified prediction (bytes 11/12 do not correlate with that
same property, where they have any variance to test at all), neither of which pins a byte to a
specific register the way §4's disassembly pinned `$C087/$C088`/`$C08B/$C08C` to real GDRIVE01
operands. Two of the task's four named candidate properties (frame count, body length) turned out
to be structurally incapable of correlating with anything — every trailer-dialect instance in the
corpus shares the same value — and a third (sprite-pointer alignment) is degenerate for a related
structural reason (load addresses are always 64-aligned, frame 0 always sits at body offset 0).
Only multicolour-vs-hires had real variance to test, and it is itself a heuristic output, not a
ground-truth mode. The concrete next step, if this is picked up again, is the same one every
open question in this document shares: a disassembly foothold on whatever writes the trailer in
the first place — almost certainly reachable only once the still-unlocated GDRIVE01/GDRIVE02
caller (§4-§13) is found, since that is the code most likely to also build (or consume) this
16-byte block.

## 15. 2026-08-13 (independent verification pass): §9/§14's claims reproduced from raw bytes; one
real prose/test gap found and closed

A second 2026-08-13 pass on the same C1.8 task (sweep `SOUNDFX`/`SPR.TP`/`TITLEPG`/`LIBRARY` for the
GDRIVE01 caller, and test the trailer field-to-body correlation with a stated null) found §9 and
§14 already covered both questions in full, written concurrently by sibling work on this same file.
Rather than duplicate that work, this pass independently re-derived the two central numeric claims
directly from the retail disk images, found and closed one real gap between what the doc's prose
asserted and what a committed test actually pinned, and ran fresh mutation checks against the
result.

**Independent reproduction, §9's SOUNDFX/SPR.TP/TITLEPG/LIBRARY sweep.** Re-ran
`find_param_block_refs`/`find_selfmod_patch_target_refs` directly against the four named files, both
titles, read straight off `{external-game-holdings}/Emulator/C64/Goldbox/<title>/<title> - Side 1.D64`:

```
Champions of Krynn      SOUNDFX  param_block=[]     selfmod=[]
Champions of Krynn      SPR.TP   param_block=[]     selfmod=[]
Champions of Krynn      TITLEPG  param_block=[2589] selfmod=[]
Champions of Krynn      LIBRARY  param_block=[514]  selfmod=[]
Death Knights of Krynn  SOUNDFX  param_block=[]     selfmod=[]
Death Knights of Krynn  SPR.TP   param_block=[]     selfmod=[]
Death Knights of Krynn  TITLEPG  param_block=[1716] selfmod=[]
Death Knights of Krynn  LIBRARY  param_block=[427]  selfmod=[]
```

Matches §9.1/§9.3's reported numbers exactly, including the two known-false-positive `TITLEPG`/
`LIBRARY` offsets. No new hit found.

**Independent reproduction, §14's trailer-byte-3 correlation.** Re-ran
`trailer_field_properties`/`permutation_correlation_p`/`fisher_combined_p` against a fresh
per-instance census built directly from the disk images (all four trailer-dialect titles,
`trials=6000, seed=3`, matching §14.4's own parameters):

```
Champions of Krynn       n=37  r=-0.584  p=0.00000
Death Knights of Krynn   n=24  r=-0.446  p=0.02783
Buck Rogers              n=35  r=-0.248  p=0.14717
Curse of the Azure Bonds n=39  r=-0.431  p=0.00700
Fisher-combined: 6.57e-06
```

Matches §14.4's table and combined-p to the reported precision. Confirms the doc's headline claim
is reproducible, not a transcription artifact.

**The one real gap found: `SPR.TP`'s two scanner results were asserted in prose but never pinned by
a committed test.** §14.1 states "`SOUNDFX`, `SPR.TP`, `TITLEPG`, both titles: swept under both the
plain-parameter-block scanner and the self-modifying-patch-target scanner (§9.1) — zero genuine
hits in any of the six (title × file) combinations." True (reproduced above) — but
`test_sprtp_is_bare_dialect_sprite_family_data_not_code` (the only committed test that touches
`SPR.TP` at all) previously asserted only `framing()`'s `('bare', 7)` result; `SPR.TP` was never
added to `CallerSearchTests.WIDER_OVERLAYS` (correctly, since it isn't a code overlay and that dict
drives a code-oriented false-positive-tracking test) and so never had `find_param_block_refs`/
`find_selfmod_patch_target_refs` asserted against it anywhere durable. A bare-dialect pixel file
could in principle still byte-alias a scanner hit the same way `PIC*` files do elsewhere in this
corpus (§8.2, §12.2), so "confirmed bare-dialect" does not by itself imply "confirmed scanner-clean"
— the two claims needed separate pins. Closed by extending the existing test with two more
assertions (`tools/test_c64_sprite.py`, same test function, no new test method added), since the
existing test already reads the right bytes.

**Mutation checks (this pass), monkeypatched in a throwaway interpreter, never a committed file:**
- `S.permutation_correlation_p` forced to always return `p=1.0` (real `r` untouched) →
  `test_trailer_byte3_negatively_correlates_with_multicolour_frame_count`'s
  `assertLess(combined, 1e-3)` went red (`1.0 not less than 0.001`). Reverted, green.
- `S.find_param_block_refs` forced to return `[999]` unconditionally →
  `test_no_genuine_param_block_reference_in_the_wider_overlay_set` went red on the very first
  overlay checked (`AssertionError: Lists differ: [999] != []`, e.g. Champions of Krynn `GEN`,
  which is expected clean). Reverted, green.
- The newly-added `SPR.TP` assertions in `test_sprtp_is_bare_dialect_sprite_family_data_not_code`:
  `S.find_param_block_refs` forced to return `[999]` → went red (`[999] != []`); separately,
  `S.find_selfmod_patch_target_refs` forced to return `[42]` → went red (`[42] != []`). Both
  reverted, green. Full committed suite after the addition: `python -m pytest
  tools/test_c64_sprite.py -q` → **106 passed** (unchanged count — an existing test gained two
  assertions, no new test method was added), and `-v` confirms every test in the file executes
  (none reported as skipped).

**Net effect on the open C1.8 questions: unchanged.** The GDRIVE01/GDRIVE02 sprite-composite
caller is still unlocated (six independent search strategies across §8-§13, all negative, all
reconfirmed here); the trailer's field-to-VIC-register mapping is still not solved (trailer byte 3
remains a real, cross-title-replicated statistical correlate with `multicolour_frames`, not a
disassembly-confirmed register binding). This pass's contribution is narrow and stated as such:
independent reproduction of the two central numbers from raw bytes, plus one small, real
prose/test gap identified and closed.

## 16. 2026-08-13: the caller hunt swept to all SEVEN titles — REFUTED, and the honest negative
finally has the scope it was being asserted with

Every previous round of this hunt (§8 through §13, six search strategies) ran on **Champions of
Krynn and Death Knights of Krynn only** — 615 files — yet each reported its negative as a fact
about the format, and §13's conclusion ("only a live trace will find it") inherited that scope
silently. Standing rule 5 says sweep all seven C64 titles unless the question is inherently
title-specific. It is not: `GDRIVE01` is shared middleware. This section runs the sweep.

**Result: REFUTED.** The claim under test was that a genuine, decode-aligned, illegal-opcode-clean
reference to `GDRIVE01`'s caller-supplied parameter block exists in at least one of the five
never-swept corpora, with Buck Rogers `COMBAT` @2464/@2536 named as the first candidate. Both
Buck Rogers hits are the §8.4 operand-tail mechanism, exactly. So are all four other new
candidates the sweep turned up. The negative widens from **2 titles / 615 files** to **7 titles /
2,662 unique file bodies**, and the "only a live trace" verdict now has the coverage it needs.

### 16.1 A correction to the sweep's own premise: there are no GDRIVE01 "variants"

The task this section answers assumed three GDRIVE01 variants needing per-title re-derivation of
the `$C08x` block, because the whole-file sha256 comes in three flavours and the PRG load words
differ (`$4000` / `$3000` / `$1388`). The bytes refute that. Strip the 2-byte CBM load word and
**all seven titles ship the identical 2560-byte body**:

```
sha256(body) = 274e8f92e03bd63d818bf9afa1954c37a845a53bc3974b6511ddd5474019f269
```

on all **46** of the corpus's 49 sides that carry a `GDRIVE01`. The three that do not are named,
not glossed: Champions of Krynn's `Savedisk`, Pool of Radiance's `Boot`, and Pool of Radiance
`Side 9` — none of which is a content side. Only the load word differs: `$4000` (Champions of Krynn, Death
Knights of Krynn, Buck Rogers, Secret of the Silver Blades), `$3000` (Curse of the Azure Bonds,
Gateway to the Savage Frontier), `$1388` (Pool of Radiance). That is three different addresses in
front of one identical driver, which is direct, corpus-internal proof that **the stored load word
is a staging-buffer address, not the residence** — the same conclusion `c64-disk-format.md` §7.5
reached for Champions of Krynn alone, now generalised.

So `GDRIVE01_PARAM_BLOCK` and `GDRIVE01_SELFMOD_PATCH_TARGETS`, both derived by disassembling
Champions of Krynn's copy, transfer to all six other titles with **no** re-derivation — not
because the residence was assumed, but because the operands those constants name are literal
bytes inside a body that is provably the same file. Pinned by
`test_gdrive01_body_is_byte_identical_in_all_seven_titles` (checks every side, asserts the
per-side count is 46, and asserts the load-word set is exactly `{$4000, $3000, $1388}`).

The residence was still re-derived per title rather than assumed, via a new census-scored origin
sweep (`origin_census`, `leading_jmp_table`): every title's `GDRIVE01` opens with the same
25-entry absolute-`JMP` table, and **$C000 is the unique best origin in all seven** (25/25 targets
land inside the body; the runner-up scores strictly worse).
`test_origin_census_pins_gdrive01_to_c000_in_every_title`.

### 16.2 The sweep

Both existing scanners (`find_param_block_refs` over `$C080-$C08F`,
`find_selfmod_patch_target_refs` over the twelve patched operand cells) run over **every readable
PRG on every side of all seven titles**, deduplicated by `(name, sha256(body))`:

| Title | Sides | PRG directory entries | Unique bodies scanned |
| --- | ---: | ---: | ---: |
| Champions of Krynn | 7 | 578 | 342 |
| Death Knights of Krynn | 6 | 502 | 273 |
| Buck Rogers — Countdown to Doomsday | 6 | 406 | 267 |
| Curse of the Azure Bonds | 6 | 557 | 411 |
| Secret of the Silver Blades | 6 | 574 | 352 |
| Pool of Radiance | 10 | 984 | 597 |
| Gateway to the Savage Frontier | 8 | 825 | 420 |
| **total** | **49** | **4,426** | **2,662** |

One entry could not be read and was skipped, not silently counted: Champions of Krynn side 1
`.FRANK` (`chain loops back to sector 1/1`). Reproduce with `scratchpad/gd01_full.py`, or as the
committed test `test_no_genuine_caller_reference_in_any_of_the_seven_title_corpora`, which asserts
the 2,662 figure so a shrinking sweep cannot read as a pass.

**417 raw hits** in **98 distinct title/file pairs**: 294 inside `GDRIVE01` itself (its own known
self-patching, §9.3), 106 in data-like files, **17** in code-like files other than `GDRIVE01`.

### 16.3 Adjudicating 417 hits mechanically instead of by eye

§8 and §9 adjudicated a handful of hits by hand-reading disassembly. That does not scale to 417,
and hand-reading is exactly how §8.3's and §14's overstated coverage claims happened. New function
`alignment_vote(body, off)`: decode from each of the 24 byte positions before a hit and count how
many treat the hit offset as an instruction **boundary** rather than stepping over it as an
operand byte. 6502 code re-synchronises fast, so a genuine instruction attracts nearly every
start; §8.4's "hit is the tail byte of the previous operand" false positive is stepped over.

Calibration — and standing rule 2 bit here. A first draft used four hand-picked real references
and reported a floor of 0.83. Picking four is itself a filter. Scored against the **full**
population (all 42 raw hits inside `GDRIVE01`'s own body) the real floor is **0.667**, at body
offsets 702, 708 and 1115 — all three disassembled, all three genuine (`LDA $C080` at `$C2BE`,
`LDA $C081` at `$C2C4`, `LDA $C084` at `$C45B`, each inside a self-patching sequence).

> **CORRECTED 2026-08-13 — rule 2 bit here TWICE, and the paragraph above only caught it once.**
>
> This continued: "The five hand-settled false positives (§8.2/§8.4) top out at **0.458**. Counts
> immediately outside both edges of the (0.458, 0.667) gap are **zero from both populations** — no
> real reference below 0.667, no known false positive above 0.458."
>
> The real population was correctly widened from four cherry-picked references to all 42. The
> false-positive population was not: it stayed at the five cases inherited from §8.2/§8.4, a set
> assembled for a different question (a two-title, by-eye adjudication). Fixing one side of a
> comparison and leaving the other frozen manufactures the gap — the same rule-2 error the
> sentence immediately before it congratulates itself for catching, committed on the null side in
> the same breath. **And §16.5's own table, two paragraphs below, already contradicted it**:
> `GDRIVE00` votes 0.96 and `POST.COM` votes 1.00, both adjudicated false positives.
>
> Scored against this round's own complete adjudicated false-positive set — the 17 code-like hits
> §16.5 tabulates, every one disassembled and ruled not-a-reference:
>
> | vote | sites |
> | ---: | --- |
> | 1.000 | Pool of Radiance `POST.COM` @7156 |
> | 0.958 | `GDRIVE00` @1348 × 6 titles (one shared body) |
> | 0.458 | Death Knights `DUNGEON` @5731 |
> | 0.417 | CoK `DUNGEON` @6244, Secret `DUNGEON` @6251 |
> | 0.125 | Buck Rogers `COMBAT` @2464, @2536 |
> | 0.000 | CoK/DK/Secret `LIBRARY`, CoAB/Secret `ECL64` |
>
> Range **0.000–1.000**, with **seven at or above the real floor of 0.667**. There is no
> separating threshold. A LOW vote remains informative — 0.00 is strong evidence of an
> operand-tail misread, and that is how the `LIBRARY`/`ECL64` cases were settled — but a HIGH vote
> means nothing on its own. Every adjudication in §16 was made by reading the disassembly, so the
> section's REFUTED verdict does not depend on this and is unaffected.
>
> `test_alignment_vote_does_not_separate_real_references_from_false_positives` now pins the real
> floor, its three offsets, the full 17-member false-positive population and the seven-site
> overlap, and asserts `max(fake) > min(real)` so a separating gap re-appearing fails loudly.
> Mutation-tested two ways (expect a 6-site overlap; expect the old 0.458 ceiling) — both RED.

**The vote is necessary, not sufficient, and this section reports it failing.** It fires at a
perfect 1.00 on **47 of the 106** raw hits in data-like files, because a byte run of 1-byte-
decoding values makes every start converge trivially. It also fires at 1.00 inside a *code-like*
file when the hit lands in embedded text: Pool of Radiance's `POST.COM` (8.8% illegal opcodes,
comfortably code) votes 1.00 at a hit that is the trailing space of the literal string
`"GIVE HOW MUCH "`. So the adjudication is a three-stage gate — `illegal_opcode_fraction` first,
then the vote, then read the disassembly — and for any `$C000`-range hit, `origin_census` to
separate a call from address-space aliasing.
`test_alignment_vote_alone_is_not_sufficient_it_scores_data_at_1_00` pins both failure modes so
nobody later uses the vote standalone.

#### 16.3a (round 9) The null this statistic never had — and it is ~0.5, not ~0

Everything above compares votes to votes. Nobody ever asked the prior question, which is the
one the standing "the null decides the finding" rule demands: **what does `alignment_vote`
score at an arbitrary offset?** Measured over every decodable offset in three real bodies:

| body | offsets | fraction ≥ 0.667 (the "real" floor) | fraction == 1.000 | mean vote |
|---|---:|---:|---:|---:|
| Champions of Krynn `GDRIVE01` | 2512 | **0.468** | 0.306 | 0.492 |
| Champions of Krynn `LIBRARY` | 7387 | **0.455** | 0.283 | 0.461 |
| Champions of Krynn `TITLEPG` | 4442 | **0.698** | 0.590 | 0.695 |

**Roughly half of all arbitrary offsets already clear the real population's floor**, and in
picture data (`TITLEPG`) 59% score a *perfect* 1.000. So "this hit votes ≥ 0.667" conveys
almost no information on its own — which is the mechanism behind the already-recorded finding
that the real and false-positive populations do not separate. The gap was not merely unlucky;
a statistic whose null sits near 0.5 could not have produced one. This makes the three-stage
gate above mandatory rather than merely advisable, and it is the reason the vote is never
quoted in this document without a disassembly beside it.
Pinned by `test_alignment_vote_has_a_null_near_one_half_at_arbitrary_offsets`.

#### 16.3b (round 9) The parameter block is referenced *less* than its neighbours

The sweep counts raw hits against `$C080-$C08F` and finds no caller. That count was never
compared against anything. Running the identical scanner over the four adjacent 16-byte
address windows, across the same 439 code-like files in all seven titles:

| window | raw hits |
|---|---:|
| `$C060-$C06F` | 40 |
| `$C070-$C07F` | 47 |
| **`$C080-$C08F`** (the parameter block) | **10** |
| `$C090-$C09F` | 7 |
| `$C0A0-$C0AF` | 20 |

The parameter block draws **fewer** raw hits than three of its four neighbours, in a corpus
where none of those neighbours is a parameter block anybody is looking for. The 10 hits are
therefore ordinary operand-byte background — exactly what §16.5 concluded one disassembly at
a time, now shown in one number without adjudicating anything. **This independently
strengthens the REFUTED verdict**: not only is every individual hit explicable, the hit
*rate* is unremarkable. Pinned by
`test_the_param_block_hit_count_is_not_elevated_above_neighbouring_address_windows`.

### 16.4 The code/data gate, and what sits just outside its edge

Stage one uses §9.1's `illegal_opcode_fraction` with the ceiling that section's own
confirmed-code group establishes: **10%** (Death Knights of Krynn `DUNGEON`, 9.0%, is the highest
independently-confirmed code file). Standing rule 1 — the counts immediately outside both edges,
over the 98 hit-bearing files:

- **23 files below 10%**, the highest being Death Knights of Krynn `DUNGEON` at **9.01%**.
- **75 files at or above**, the lowest being Gateway to the Savage Frontier `COM.PREP` (side 8) at
  **10.21%**, then Death Knights of Krynn `GDRIVE04` at **10.54%**.

The two files closest above the edge were adjudicated anyway rather than excluded on the number:
Gateway `COM.PREP` produces **zero** hits under either scanner on side 1 (`10.06%` for that
copy), and its side-8 copy's single hit at offset 32 is the `4C` high operand byte of a real
`LDA $4CFE` followed by the opcode and low byte of a real `STA $4BC0` — the §8.4 mechanism, vote
0.00. `GDRIVE04` is handled in §16.6. Nothing sitting at the edge changes the verdict.

The 106 data-like hits are ruled out **as families**, not individually: they sit in `ECL*`,
`PIC*`, `WALLDEF*`, `WALLSET*`, `SPRITE*`, `BODY*`, `GEO*`, `COMPIC*`, `HEAD*` and `TITLEPG` —
resource families whose containers this project has separately characterised, scoring
17.3%-52.8% illegal opcodes, i.e. 2x to 6x the confirmed-code ceiling.

> **CORRECTION (round 9) — that sentence covers 97 of the 106, not all of them.**
> Re-deriving the sweep: **97** hits fall in the named families, and those do score
> **17.32%-52.82%**. The remaining **9** are not in any listed family and score
> **10.21%-17.89%** — barely over the 10% code-like ceiling, i.e. exactly the borderline
> where "ruled out for being data-like" is at its weakest. The full range across all 106 is
> **10.21%-52.82%**.
>
> | file | hits | titles | illegal |
> |---|---:|---|---:|
> | `GDRIVE04` | 5 | Death Knights | 10.54% |
> | `GDRIVE03` | 2 | Curse of the Azure Bonds | 17.89% |
> | `COM.PREP` | 1 | Gateway | 10.21% |
> | `GEN` | 1 | Death Knights | 17.71% |
>
> This is a **reporting** defect, not a hole in the verdict: all four files are adjudicated
> *individually* elsewhere in this document — `GDRIVE04` in §9.4 and §16.6, `GDRIVE03` at the
> §0 lead note, `GEN` by the §8.4 operand-tail mechanism — so none of the nine ever actually
> rested on the family argument. The defect was letting a family sentence appear to carry
> nine files it does not name. Pinned, counts and range together, by
> `test_the_data_like_hit_population_splits_into_named_families_and_nine_others`.

### 16.5 The 17 code-like hits, every one adjudicated

| Title(s) | File | Kind | Offset(s) | Vote | Verdict |
| --- | --- | --- | ---: | ---: | --- |
| six titles (not Pool of Radiance) | `GDRIVE00` | selfmod | 1348 | 0.96 | **aliasing** — `JSR $C8FF` into its own body, §9.4; now confirmed in six titles, not two |
| Champions of Krynn / Death Knights / **Secret** | `DUNGEON` | param | 6244 / 5731 / **6251** | 0.42-0.46 | **desync**, §8.2 — the same shared non-code table, now in a third title |
| Champions of Krynn / Death Knights / **Secret** | `LIBRARY` | param | 514 / 427 / **3054** | 0.00 | **operand-tail**, §8.2 — `STA ($4C),Y; DEY; CPY #$FF` misread as `JMP $C088`, now in a third title |
| **Buck Rogers** | `COMBAT` | param | **2464, 2536** | 0.12 | **operand-tail** — the task's named first candidate; see below |
| **Curse of the Azure Bonds / Secret** | `ECL64` | param | **432 / 447** | 0.00 | **operand-tail** — low operand byte of a real `JSR $820E`/`JSR $821D` |
| **Pool of Radiance** | `POST.COM` | selfmod | **7156** | 1.00 | **ASCII string** — the trailing space of `"GIVE HOW MUCH "` |

**Buck Rogers `COMBAT` @2464 and @2536** — the named first candidate, and a genuinely different
file from Champions of Krynn's `COMBAT`, so this was not the known `DUNGEON`@6244 alias. It is
still not a reference. The real instruction stream at both offsets is

```
        AD 75 BE   LDA $BE75
        8D C0 BD   STA $BDC0
```

and the scanner lands on the `LDA`'s trailing operand byte `$BE`, reads it as an `LDX abs,Y`
opcode, and takes the `STA`'s own opcode and low operand byte (`8D C0`) as its address — spelling
`$C08D`. Every byte in the window is real, correctly-decoded code; §8.4's `GEN` mechanism exactly.
Both offsets are the same idiom repeated in the file (the surrounding code differs only in an
`LDX #$08` vs `LDX #$09`), which is why there are two hits and not one.
`test_the_buck_rogers_combat_hits_are_operand_tail_coincidences` pins the six bytes and the 0.125
vote.

**Secret of the Silver Blades `DUNGEON` @6251** reproduces Champions of Krynn's and Death Knights'
famous false positive byte-for-byte: `7E AE BF 7E BD` before the hit and `20 8D C0 7E` at it, with
the illegal `$C3` desync marker a few bytes upstream, differing in exactly one byte (`B5` in
Champions of Krynn, `A0` in Secret). Three independent titles carrying the same non-code table is
much stronger evidence for the §8.2 reading than two were.

> **CORRECTION (round 9) — the "one byte" figure is against Champions of Krynn only; Death
> Knights differs in two.** The three 12-byte windows, re-read from the disks:
>
> ```
> CoK    @6244:  7E AE BF 7E BD  B5  20 8D C0 7E  20 DC
> DoK    @5731:  7E AE BF 7E BD  93  1E 8D C0 7E  20 BA
> Secret @6251:  7E AE BF 7E BD  A0  20 8D C0 7E  20 C7
> ```
>
> Over the span this section quotes, Secret differs from Champions of Krynn in **one** byte
> (`B5`/`A0`) as stated — but from Death Knights in **two**, because Death Knights has `1E`
> where the other two have `20`. So Death Knights does not carry the quoted `20 8D C0 7E`
> string at all, and "reproduces … Death Knights' … byte-for-byte" is not accurate.
>
> The finding is unaffected and arguably sharpened: the invariant prefix `7E AE BF 7E BD` and
> the `8D C0 7E` tail are identical in all three titles, which is what makes it one shared
> non-code table; the bytes that vary (offsets 5, 6 and 11) are exactly the ones the §8.2
> desync reading expects to be title-specific data. Pinned per-title-pair by
> `test_the_secret_dungeon_hit_is_the_same_shared_table_as_champions_and_death_knights`.
`test_the_secret_dungeon_hit_is_the_same_shared_table_as_champions_and_death_knights`.

**`ECL64` (Curse of the Azure Bonds, Secret of the Silver Blades)** was worth a second look
because it scores **2.76% / 2.32%** illegal opcodes — the *lowest* of any hit-bearing file in the
corpus, below every confirmed code overlay. It is indeed real 6502 code despite the `ECL` name,
and its own `origin_census` puts it near **$8000** (55% / 51% of its absolute branch targets
self-contained there, best of any candidate origin), not in the `$C000` graphics-driver slot. The
hit is the low operand byte of a genuine `JSR $820E` (Curse) / `JSR $821D` (Secret), with the
following `82 C0` being that operand's high byte plus the next instruction's `CPY #$05` opcode.
Vote 0.00. Recorded here as an incidental, unpursued finding about `ECL64`'s residence, offered
because it fell out of ruling the file in or out — not chased further.

### 16.6 The best-looking new lead, and why it is also aliasing: `GDRIVE03`

The task's bonus observation is confirmed: **Curse of the Azure Bonds and Gateway to the Savage
Frontier do ship `GDRIVE03`** — the driver Champions of Krynn's and Death Knights' `INIT` and
`POST.COM` menu-choice-0 path request but that exists on no Champions/Death Knights disk (§12).
They are, however, **not the same file**: Curse's is a 999-byte body loading at `$3000`, Gateway's
is a 1281-byte body loading at `$0000`.

Curse's copy produced the single best-looking candidate in the whole sweep: two well-aligned
`JSR $C08A` at body offsets 897 and 902, votes **1.00** and **0.88** — inside the parameter block,
decode-aligned, no desync marker anywhere near. It is still not the caller. `GDRIVE03` has no
dispatch table at offset 0, so its residence was re-derived from its own branch targets:
`origin_census` ranks **$C000 first** (its head reads `JSR $C197; JSR $C175; JSR $41F0; LDA #$02;
STA $C3C9; JSR $C1E3`, all `$C0xx-$C3xx` targets inside its own 999 bytes, plus outward calls into
LIBRARY's `$4xxx` region). It is a `$C000`-slot occupant, so `$C08A` is **its own** internal
subroutine — and the bytes there confirm it: `BD 61 C1 / 85 07 / BD 6B C1 / 85 08` (`LDA $C161,X;
STA $07; LDA $C16B,X; STA $08`), a coherent zero-page pointer setup. Address-space aliasing,
§9.4's mechanism, in a new file.

Death Knights' `GDRIVE04` behaves identically: `origin_census` puts it at `$C000`, and its
`JMP $C088` at offset 176 targets its own `LDX #$DF; LDY #$C0; LDA $C81B` routine. Gateway's
`GDRIVE03` is the honest contrast — its origin census does **not** put it at `$C000` (best origins
cluster at `$1C00-$2000`), and it produces zero hits under either scanner. All pinned by
`test_gdrive03_and_gdrive04_hits_are_calls_into_their_own_c000_bodies`.

The recoverable-behaviour half of the bonus lead stands and is **not** taken up here: Curse's and
Gateway's `GDRIVE03` are readable copies of a driver Champions of Krynn and Death Knights only
reference, so §12's absent-name question is answerable by reading a sibling title's file. That is
a `GDRIVE03`/`FINAL` question, not a sprite-trailer one, and is left for whoever owns §12.

### 16.7 A third search idiom, swept at seven-title scope

Standing rule 4: search every idiom that can perform the operation. §8.1 tried one alternative
(immediate loads of the block's low bytes) on Champions of Krynn and Death Knights of Krynn only,
as a one-off session command with no committed test. New function `find_pointer_build_sites`
generalises it — a caller building a zero-page pointer *to* the block (`LDA #$83; STA $fb;
LDA #$C0; STA $fc`) emits no literal `$C083` operand and is invisible to both existing scanners,
but must load `#$C0` near an immediate in `#$80-$8F`. Swept over all 2,662 bodies:

**4 files carry the idiom at all; only 2 are code-like**, and both are ruled out by disassembly:

```
0.53%  Death Knights of Krynn       COMBAT   @5692
0.65%  Secret of the Silver Blades  COMBAT   @6983
```

In both, the two immediates feed unrelated destinations — `LDA #$C0; STA $A85F` (a flag store,
13 bytes earlier) and then `LDA #$83; LDX #$2E; JSR ...`, which is this engine's A=index/X=index
message call, not a pointer high/low pair.
`test_the_pointer_build_idiom_is_absent_from_every_code_like_file_in_all_seven_titles` pins the
two-file result and the exact bytes.

### 16.8 What this does and does not close

**Closed:** the caller is not a literal absolute reference to `$C080-$C08F`, and not a literal
absolute reference to any of `GDRIVE01`'s twelve self-modified operand cells, in **any** file on
**any** side of **any** of the seven C64 Gold Box titles — 2,662 unique bodies, 4,426 directory
entries, 49 sides. It is also not the immediate-pointer-build idiom in any code-like file in that
same corpus. Six search strategies over two titles are now three search strategies over seven.

**Not closed, and stated plainly as gaps:**

- A caller that reaches the block through a **runtime-computed** pointer — a base address in zero
  page written by a loop, an index arithmetic chain, or a pointer copied from a table — leaves no
  static signature any of the three idioms can see. This is the same limitation §8.3 named; the
  sweep widens the scope of the negative, it does not remove the limitation. Only a live trace
  settles that case, and standing rule 9 forbade emulation this round.
- The 106 data-like hits were ruled out **as families**, by container type and by an
  illegal-opcode fraction 2-6x the confirmed-code ceiling, not by disassembling each one. If the
  engine ever executes code out of an `ECL`/`PIC` container, that assumption fails.
- Whether the sweep's `(name, sha256(body))` deduplication could hide a caller was not tested by
  re-running without it; it can only merge byte-identical bodies, so it cannot drop a distinct
  file, but the 4,426-vs-2,662 gap is duplicates by construction, not by measurement of each pair.
- Nothing here touches the trailer's field-to-VIC-register mapping, which §14 records as gated on
  finding this caller. That gate is **not** opened; it is now known not to be openable by static
  absolute-reference search at corpus scale.

No multiple-comparisons correction applies to any number in this section: nothing was selected
from a search as a "best" result with an associated p-value. The 417 hits are a complete
enumeration and every one of the 17 that survived the code/data gate is reported and adjudicated,
not just the strongest.

### 16.9 Mutation checks run this round

Every new assertion was seen to fail under a deliberate mutation before being trusted, then the
mutation reverted and the suite re-verified green.

| Mutation | Expected to break | Result |
| --- | --- | --- |
| `GDRIVE01_BODY_SHA256` last hex digit `9` → `0` | body-identity test | RED, reverted |
| `origin_census` sort key `-s[0]` → `s[0]` (worst origin first) | both origin tests | RED (2 tests), reverted |
| `alignment_vote` returns a constant `(1.0, 24, 0)` | calibration + Buck Rogers tests | RED (2 tests), reverted |
| `find_pointer_build_sites` returns `[]` | third-idiom test | RED, reverted |
| `find_selfmod_patch_target_refs` returns `[]` | calibration (42-hit population) + sweep | RED (2 tests), reverted |
| `leading_jmp_table` truncated to 9 entries | origin-census test | RED, reverted |
| `ADJUDICATED` entry for Buck Rogers `COMBAT` @2464 deleted | corpus sweep | RED, naming the real hit, reverted |
| `CODE_LIKE_CEILING` 0.10 → 1.00 (gate disabled) | corpus sweep + third-idiom test | RED (2 tests), reverted |
| expected Buck Rogers `COMBAT` byte `$BD` → `$BE` | Buck Rogers byte pin | RED, reverted |
| expected Secret `DUNGEON` differing byte `$A0` → `$B5` | shared-table test | RED, reverted |
| expected Curse `GDRIVE03` subroutine byte `$08` → `$09` | `GDRIVE03` test | RED, reverted |
| expected `POST.COM` string `"...MUCH "` → `"...MUCX "` | vote-insufficiency test | RED, reverted |
| `_sides()` truncated to side 1 only | seven of the nine new tests | RED (7 tests), reverted |

Full suite after this section:
`PYTHONIOENCODING=utf-8 python -m pytest tools/test_c64_sprite.py -q` → **116 passed**
(107 before, + 9 new in `SevenTitleCallerSweepTests`).
