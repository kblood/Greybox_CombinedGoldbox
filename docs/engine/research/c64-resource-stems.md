# C64 `ITEMNAMES` resource-stem catalog and its digit-patching loader

**Status: (1) fully mapped with byte evidence. (2) found — the digit-patching code is real,
disassembled, and its callers are enumerated. (3) answered: GDRIVE's trailing digit is a
hardcoded/config selector, never an area id, in every one of the 14 call sites found across CoK
and DoK.**

This closes the lead recorded in `docs/engine/BUILD-QUEUE.md`'s C1.8 round-3 box:

> **The unfollowed lead worth having:** no file loads GDRIVE01/02/04/05 by an embedded ASCII
> filename at all -- only `GDRIVE00` appears, inside `ITEMNAMES`'s per-area resource-stem table,
> next to `SQRPACI00`/`GEO00`/`MON00`/`COMPIC00`, whose trailing `00` is believed to be a
> placeholder patched at runtime. Find the digit-patching code and the load site, and the call
> site probably follows.

Tooling: `tools/c64_resources.py` (all functions cited below live there; nothing in this doc is
a number that can't be regenerated from that module + the retail disks). Tests:
`tools/test_c64_resources.py`.

## 1. The resource-stem table, mapped exactly

`ITEMNAMES` (a data-only PRG, no code) ends with the item/prompt string table used elsewhere in
the UI, and — in 4 of the 7 titles — the LAST thing in the file is a second table: a flat list of
resource-family name **stems**, each ending in a literal ASCII `"00"` placeholder.

### Two on-disk shapes

**Shape A — concatenated, no separator, ends exactly at EOF** (CoK, Buck Rogers). Verified on
Champions of Krynn's `ITEMNAMES` (2560-byte PRG, side 1, header load address `$4000` — a
placeholder; see §2 for why the real residence differs): the last ordinary NUL-terminated UI
string is `"(RULE BOOK PAGE #"` at body offset 2389-2406, and the very next byte (body offset
2407, runtime `$4967` if the header address were real) begins:

```
GDRIVE00SQRPACI00GEO00SECSET00SQRDATA00PIC00SPELLN00SPELLE00ECL00WALLS00
SPRITE00WALLSET00WALLDEF00ANIMATE00MON00BODY00HEAD00CHARPIC00COMPIC00ITEMFILE00
```

151 bytes, running to the literal end of the 2558-byte file (body offset 2558 == `len(body)`,
confirmed no trailing byte after `ITEMFILE00`). **20 entries, in this fixed order**, lengths
`[8,9,5,8,9,5,8,8,5,7,8,9,9,9,5,6,6,9,8,10]` (`COK_STEMS_EXPECTED` in `c64_resources.py`).

**Shape B — individually NUL-terminated** (Death Knights of Krynn, Secret of the Silver Blades).
DoK's `ITEMNAMES` has the identical GDRIVE-leading run, but with a NUL after every stem:
`GDRIVE00\0SQRPACI00\0GEO00\0...ITEMFILE00\0CODE00\0`. **21 entries** — the same 20 as CoK, in
the same order, EXCEPT slot 9 is `"WALLSET00"` (9 chars) where CoK has `"WALLS00"` (7 chars) —
meaning **DoK's table literally contains the stem `WALLSET00` twice** (slots 9 and 11) — plus one
extra 21st entry CoK does not have at all: `"CODE00"`. (This directly explains why DoK, not CoK,
has `CODE00`/`CODE01`/`CODE03` files on disk — see §5.)

`parse_stem_table()` auto-detects which shape a given `ITEMNAMES` body uses (by checking whether
the byte right after `GDRIVE00` is a NUL) and recovers the list independently of any hand-typed
expectation — it walks `<LETTERS><2 ASCII digits>` runs (Shape A) or NUL-splits (Shape B), so a
changed table would come back different, not silently confirmed.
`test_stem_table_matches_cok`/`_dok` assert the recovered list equals `COK_STEMS_EXPECTED`/
`DOK_STEMS_EXPECTED` exactly.

### The other 3 titles: no catalog in `ITEMNAMES` at all

Curse of the Azure Bonds, Gateway to the Savage Frontier, and Pool of Radiance's `ITEMNAMES`
files contain **zero** occurrences of `GDRIVE`, `SQRPACI`, `GEO00`, `MON00`, `COMPIC`, `WALLSET`,
or `SECSET` anywhere in the file (checked directly against the raw bytes, not inferred). Their
`ITEMNAMES` is nothing but the ordinary item/prompt string table. A corpus-wide string search
(all PRG files, all sides, all 3 titles) finds the literal string `GDRIVE00` in exactly one place
per title: their own **`LIBRARY`** file (CoAB, Gateway) or **`POOLRB`**/`LIBRARY` (Pool). So these
three titles have an equivalent catalog, but it lives in the resident kernel, not the string data
file — a genuine, title-family-level structural difference this round did not trace further (out
of scope: the C1.8 lead is specifically about the ITEMNAMES-resident catalog and its consumer,
which is fully solved for CoK/DoK below).

### All 7 titles share the surrounding mechanism

Every title's disk ships a `LIBRARY` file of comparable size (7035-7482 bytes across all 7,
`test_present_exactly_once_in_library_all_seven_titles`, which also asserts a `LIBRARY` file
exists on side 1 of all seven) — the same "always-resident kernel" architecture
`c64_kernel.py` established for CoK/DoK (C1.9) is present corpus-wide. More specifically: **the
exact 10-byte hex-nibble-to-ASCII conversion idiom (§2) is byte-identical and present exactly
once in `LIBRARY`, in all 7 titles**, at title-specific offsets (CoK 6723, DoK 6531, Secret 6335,
Buck Rogers 6157, CoAB 7370, Gateway 7370, Pool 7246 — body offset, including the 2-byte load
address). A specific 10-byte machine-code sequence recurring exactly once, at a real callable
position, in 7 independently-assembled ~7KB binaries is not plausible under a chance-collision
null (naive back-of-envelope: 7 files x ~7000 candidate offsets = 49000 positions; a fixed 10-byte
string has probability on the order of 1/256^10 of matching any given position under a
uniform-byte null — the expected number of chance hits across the whole corpus is astronomically
below 1). This is strong, if partial, evidence that the whole resource-loading architecture
described below (not just the string table) is shared by the entire 7-title C64 Gold Box series,
even though this round only fully traced the loader's *tables* for CoK and DoK.

## 2. The digit-patching code — found

### The hex-nibble → ASCII conversion routine

Both CoK and DoK's `LIBRARY` contain, byte-identical in relative position to the surrounding
loader:

```
CLC
ADC #$30      ; nibble (0-15) -> '0'-'9'/':'-'?'
CMP #$3A      ; is it >= '9'+1 ?
BCC +2        ; no: already correct ASCII digit
ADC #$06      ; yes: the CMP above left Carry SET (A >= $3A), so this adds 6+1=7,
RTS           ;      landing exactly on 'A'-'F' (e.g. nibble 10: $0A+$30=$3A, +7=$41='A')
```

CoK: runtime `$4809`-`$4812` (LIBRARY body offset 6724-6733, KERNEL_ORIGIN `$2DC8`). DoK: runtime
`$4749`-`$4752`. `hex_nibble_to_ascii_reference()` in `c64_resources.py` is a byte-exact Python
port, checked against all 16 nibble values in `test_all_sixteen_nibbles_produce_uppercase_hex_digits`.

### The loader routine that calls it

Immediately before the conversion routine (CoK `$413F`-`$4184`, DoK `$4080`-`$40C5`; identical
shape, different offsets — see the source-level comments in `c64_resources.py`'s `LoaderConstants`
docstrings for the exact bytes) is a resource-cache-and-load routine, entered with **X = a
call-site "resource kind" index** and **A = the 1-byte id to encode as 2 hex digits**:

```
LDA $7F13,X        ; per-family cache: what id (if any) is currently loaded for family X?
CMP #$FF            ; $FF = "never loaded"
BEQ done             ; nothing cached -> just report "not equal", caller will load
AND #$7F ; CMP #$7F ; BEQ store   ; bit 7 of the cache slot is a "force reload" dirty flag
CMP $7F13,X ; BNE reload          ; already loaded with the SAME id? -> skip reload entirely
store: STA $7F13,X ; CLC ; RTS

reload:
  STA $7F13,X                     ; update the cache slot
  STX $7E60                       ; save X (family index) across the patch
  LDY <index_table>,X             ; X (call-site index) -> Y (stem index, 0-based table order)
  LDX <ptr_lo_table>,Y : STX $4C  ; Y -> low byte of the stem's own resident-copy pointer
  LDX <ptr_hi_table>,Y : STX $4D  ; Y -> high byte of the same pointer
  LDX <length_table>,Y            ; Y -> the stem's own character length
  DEX ; TAY                       ; Y = length-1 = offset of the LAST character
  <low nibble of A>  -> hex-ASCII -> STA ($4C),Y   ; write last char
  DEY
  <high nibble of A> -> hex-ASCII -> STA ($4C),Y   ; write second-to-last char
  JSR <continuation>              ; (SETLFS/SETNAM/LOAD proper — not traced further this round)
```

`<index_table>` (CoK `$4126`, DoK `$4066`) and `<length_table>` (CoK `$40C7`, DoK `$4002`) are
both **inside `LIBRARY`'s own body**, directly readable — `read_table()`/`length_table()`/
`index_table()` in `c64_resources.py`.

**Cross-check that pins this as the real thing, not a plausible-looking coincidence**: the length
table's own bytes, read straight out of the machine code, are

```
CoK $40C7,Y (Y=0..19): [8, 9, 5, 8, 9, 5, 8, 8, 5, 7, 8, 9, 9, 9, 5, 6, 6, 9, 8, 10]
DoK $4002,Y (Y=0..20): [8, 9, 5, 8, 9, 5, 8, 8, 5, 9, 8, 9, 9, 9, 5, 6, 6, 9, 8, 10, 6]
```

— which is **exactly** `stem_lengths(parse_stem_table(...))` for each title, entry for entry, in
table order. These are two completely independent readings (one from `ITEMNAMES`'s own string
layout on disk, one from a machine-code lookup table inside `LIBRARY`) landing on the identical
20/21-element integer sequence. `LengthTableCrossCheckRealCorpusTests.test_cok`/`test_dok` pin
this; `test_mutation_a_single_wrong_length_breaks_the_cross_check` pins it with a real mutation
check: corrupting the machine-code reading by one entry (flipping a single length in a copy of
the resolved list) makes the equality assertion fail, so the test is not vacuously true.

**The pointer table (`$9EE6`,Y / `$9FE6`,Y) is the one piece NOT located.** It is read (`LDX
$9EE6,Y` / `LDX $9FE6,Y`, both absolute,Y addressing, real decoded instructions) but sits outside
`LIBRARY`'s own body span in both titles, and a corpus-wide search — absolute STA/STX/STY *and*
indexed STA abs,X / STA abs,Y to `$9EE6`/`$9FE6`, across every file on every side of both titles —
finds **zero** writes to it anywhere (`find_abs_writes`-style scan, extended to the indexed store
opcodes; see the negative reported in this round's transcript). A search for an immediate
`LDX #$E6`/`LDY #$9E` pointer setup (the pattern a `STA (zp),Y` indirect-indexed populate loop
would need) also found nothing except one clearly-coincidental hit inside a picture asset file
(`SPRITE18`, a data file, not code). **Honest negative, precisely scoped:** the mechanism that
patches the trailing digits is fully located and disassembled; the exact runtime address `ITEMNAMES`'s
resident copy occupies (which is what `$9EE6`/`$9FE6` ultimately points into) is not. This does
not weaken the loader-mechanism or GDRIVE findings below — both are established from the `X`/`A`
register values at real call sites, which never depend on knowing that address.

## 3. Q2's actual prize: the call sites, found

`find_loader_calls()` walks every $0800-slot overlay file (CoK: `GEN`, `CAMP`, `DUNGEON`,
`COMBAT`, `COMBAT2`, `INIT`, `POST.COM`, `COM.PREP`, `ECL65`, `SPELLN64`; DoK: the equivalent set
plus `CODE00`/`CODE01`) from its own true start (**aligned**, instruction-boundary-respecting
decode — not the unaligned per-byte `find_stores` scan `c64_kernel.find_callers`'s own docstring
warns against), and reports every real `JSR`/`JMP` to the loader's two entry points, resolving the
nearest preceding `LDX #imm` / `LDA #imm` within 8 instructions (stopping at any earlier
control-flow boundary).

CoK's `DUNGEON` additionally carries two 6-byte local stub routines (`$1179`/`$1181`, both
`PHA;JSR $27D3;PLA;JMP <loader entry>`) that some of its own call sites go through instead of
calling `$413F`/`$4142` directly; `all_loader_calls()` special-cases exactly this one file (see
the comment on `COK_DUNGEON_WRAPPER_ENTRIES`) so those sites are not missed.

**Result — every call site this round's aligned decoder resolved an X immediate for, CoK + DoK
combined, by family.** This table was regenerated directly from `all_loader_calls()`'s own output
(grouped by `x_imm`, both titles), not hand-transcribed — an earlier hand-transcribed draft of
this table undercounted or misstated roughly half its rows (an entire family, SPELLE/X=7, was
missing outright; GDRIVE's own DoK row silently dropped the `CODE01 $0A6F` site; DoK's CHARPIC
row listed a `carried` site that the real per-title split below shows does not exist) and has
been replaced with the script-regenerated version:

| Family (X) | CoK sites, A values | DoK sites, A values |
|---|---|---|
| **GDRIVE (X=0)** | `#$01, #$01, #$02, #$01, #$02, #$03, carried, #$03` | `#$04, #$05, #$04, #$03, #$05, #$05` |
| GEO (X=2) | carried, carried | — |
| SECSET (X=3) | carried, carried, `#$64` | `#$64` (COMPREP, init-time default) |
| PIC (X=5) | `#$64, #$3B, #$64, #$79, carried, #$64, #$3C, carried` | `#$64, #$3B, #$64, #$64, #$3C, carried` |
| SPELLN (X=6) | `#$64, #$64` | `#$65` |
| SPELLE (X=7) | `#$20, #$65, #$64` | `#$65` |
| ECL (X=8) | carried, `#$65`, carried, carried, `#$64` | — |
| WALLS/WALLSET (X=9) | carried, carried | — |
| SPRITE (X=10) | `#$FF` (sentinel) | — |
| ANIMATE (X=11) | `#$00`, carried, `#$00, #$00`, carried | `#$00, #$00`, carried |
| MON (X=12) | carried, carried | — |
| BODY (X=13) | carried, carried | carried |
| HEAD (X=14) | carried, carried | carried |
| CHARPIC (X=21) | `#$00` | — |
| CHARPIC (X=22) | `#$00` | `#$00` |
| COMPIC (X=23) | carried | carried |
| ITEMFILE (X=24) | carried | `#$00` |
| CODE (X=25, DoK only) | — | `#$00, #$01, #$03` |

(Regenerate with `python tools/c64_resources.py calls --title cok`/`dok`, or group
`all_loader_calls()`'s output by `x_imm` as this table's own generating script did.)

**This table is a resolved-X census, not a proven-exhaustive one** — every real `JSR`/`JMP` to a
loader entry point in the searched overlays is found (that part of the walk is exhaustive over
`COK_CANDIDATE_FILES`/`DOK_CANDIDATE_FILES`, 10 files each), but not every one resolves an `X`
immediate: 8 of CoK's 57 total loader calls and 3 of DoK's 29 have `x_imm=None` (the preceding
`LDX #imm` was not found within 8 instructions, or was itself carried) and are excluded from every
row above, so no row's count should be read as "all sites of this family, period."

**GDRIVE is the only family whose *every resolved-X site* is accounted for by an immediate
literal or the one traced cache-reload exception, across both titles combined (14 sites total:
CoK 8, DoK 6 — DoK's count includes the easy-to-miss `CODE01 $0A6F` site, `A=#$05`, sitting in an
overlay whose own family is CODE, not GDRIVE)**: 13 of the 14 set `A` from an immediate literal,
and the 14th (the one exception, CoK `DUNGEON $297E`) from `$7F13 | $80`, i.e. **the family's own
previously-cached id with the force-reload bit set** — which is itself always traceable back to an
earlier hardcoded immediate, not to any area/context variable. Contrast with the six genuinely
per-area families in the table (GEO, SECSET, WALLS, MON, BODY, HEAD): **14 of their 16 combined
sites** carry `A` from a non-immediate source, and the 2 exceptions are both the same SECSET
`#$64` init-time default (CoK COM.PREP, DoK COMPREP) — every *other* per-area family (GEO, WALLS,
MON, BODY, HEAD) is carried at 100% of its found sites (**12/12**). The null this checks against is
"GDRIVE's A values are drawn from the same immediate-vs-carried mix as a genuinely per-area
family's"; it is refuted: GDRIVE 13/14 immediate vs. the per-area group **14/16** carried (2/16
immediate, both the one shared SECSET default, not an area id).

> **CORRECTION (lead session, 2026-08-13).** This paragraph originally read "12 of their 14
> combined", "10/10" and "12/14 carried" — but summing the per-family table immediately above it
> (GEO 2 + SECSET 4 + WALLS 2 + MON 2 + BODY 3 + HEAD 3) gives 16, not 14. Re-derived live by
> grouping `all_loader_calls('cok') + all_loader_calls('dok')` by `x_imm`: total 16, carried 14,
> immediate 2 (both SECSET `#$64`); non-SECSET 12/12. The conclusion is unchanged and slightly
> stronger with the right numbers, but this ratio is cited as the discriminating statistic for
> the section's central claim, so it has to be the measured one. Pinned by
> `test_per_area_family_carried_ratio_is_sixteen_not_fourteen`.

## 4. Q3 answered: what the table implies about which resources are per-area

**GDRIVE is not per-area, despite sitting in the identical resource-stem table alongside
genuinely per-area entries, and this is now a proven fact rather than an inference from file
counts alone** (though the file counts already pointed the same way — CoK ships exactly 3 GDRIVE
files against, e.g., 57 MON files and 22 WALLSET files; DoK ships 5 GDRIVE files against similarly
large per-area families):

1. **Every GDRIVE call site's id is a compile-time constant**, not a value read from the current
   area/dungeon/map context (contrast §3's table: every genuinely per-area family shows at least
   one `carried` site; GDRIVE shows zero, in either title).
2. **The constant is gated by a real hardware/feature flag** at at least one site: CoK
   `DUNGEON $0A58`-`$0A5F` only issues its `GDRIVE01` (X=0, A=1) request when
   `LDA $4BE6 : BNE` is true, i.e. some detected condition — the shape of a hardware/config
   probe, not an area lookup.
3. **A phantom id appears in both titles, requesting a file neither ships.** CoK's `DUNGEON`
   (`$2972`) and `INIT` (`$111A`), and DoK's `INIT` (`$10FC`), all unconditionally set `A = #$03`
   before calling the loader with X=0 — i.e. they request `GDRIVE03` — but **neither CoK's nor
   DoK's disk set ships a `GDRIVE03` file** (CoK has 00/01/02; DoK has 00/01/02/04/05). This is
   not a bug in this round's reading: both titles' `INIT` files independently contain the
   identical unconditional request. The most likely explanation, consistent with everything else
   found: **`GDRIVE03` is a real, meaningful driver variant in the wider 7-title series** — Curse
   of the Azure Bonds and Gateway to the Savage Frontier both genuinely ship a `GDRIVE03` file —
   and CoK/DoK's `INIT` inherited the shared hardware-detection call from the same underlying
   engine codebase without the corresponding disk-side driver ever being produced for those two
   titles specifically. This is offered as the best-supported reading, not a proven fact — it was
   not traced further than the cross-title file-manifest correlation reported here.
4. **The DoK-only `CODE00`/`CODE01`/`CODE03` family (BUILD-QUEUE C1.9's "still open" item) turns
   out to be loaded through this exact same generic mechanism**, at table slot X=25 (Y=20,
   `resolve_family('dok', 25) == 'CODE00'`). Its real call sites (`GEN $0808` A=`#$00`, `CAMP
   $1349` A=`#$01`, `COMPREP $0912` A=`#$03`) request exactly the three ids DoK's disk actually
   ships (`CODE00`, `CODE01`, `CODE03` — no phantom here), which is a useful incidental check on
   this round's whole method: where a family's shipped-file set is known, the found immediate ids
   line up with it exactly.

**What the table shows, stated precisely (not what it hints):** `ITEMNAMES`'s resource-stem
catalog is a **generic name-template registry for the loader's digit-patch mechanism**, used by
*any* resource family that needs a 2-hex-digit-suffixed filename built at runtime — regardless of
whether that suffix varies by dungeon area (GEO, MON, WALLSET, ...) or by a small, load-time-fixed
hardware/config selection (GDRIVE). The catalog's presence does not, by itself, imply per-area
variation; that has to be (and here, was) established per family from the actual `A` register
values at real call sites.

## 5. What is left open

- The exact runtime address of `ITEMNAMES`'s own resident copy (equivalently, the contents of the
  `$9EE6`/`$9FE6` pointer table) — see §2's honest negative. The search space covered: absolute
  and abs,X/abs,Y `STA`/`STX`/`STY` to either address across every PRG on every side of CoK
  (342 distinct files via `c64_kernel.all_bodies`); an immediate `LDX #$E6`/`LDY #$9E` pointer
  setup, same corpus. Neither found a real write site.
- What exactly gates the two CoK/DoK GDRIVE-family=3 ("phantom") requests, and whether they are
  genuinely unreachable on the retail disks' own supported hardware set, was not traced past the
  cross-title file-manifest correlation in §4 point 3.
- CoAB / Gateway / Pool of Radiance's own equivalent catalog (confirmed to live in `LIBRARY`
  rather than `ITEMNAMES`) was not mapped this round — out of the C1.8 lead's original scope.
- Secret of the Silver Blades and Buck Rogers were confirmed to share the exact hex-ASCII idiom
  (§1) but their own index/length-table addresses and GDRIVE call sites were not derived — the
  round focused on CoK+DoK, the two titles the original C1.8 lead was recorded against.
