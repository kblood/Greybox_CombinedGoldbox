# C1.9a: the C64 resident kernel is LIBRARY, relocated (not resident-in-place) to $2DC8

**Status: SOLVED — both "what and where" and, as of 2026-08-12, the bootstrap mechanism too.**
This doc established the origin structurally; a sibling slice independently detokenized the
BASIC boot stub and read the same address straight out of it. See
`docs/engine/research/c64-boot-chain.md`, and the reconciliation note under
[Open](#open-the-exact-bootstrap-mechanism) — the "open" framing below is superseded.

**2026-08-12, C1.9c update: LIBRARY's interior is now mapped.** A same-day follow-on round
read the ~7.4 KB kernel body itself (rather than just locating it) and closed most of the
open items this doc and `c64-boot-chain.md` §8 left behind. Headline results, each detailed
in [§9](#9-c19c-librarys-interior-2026-08-12):

- **STOP.PRG is solved.** It is byte-identical to LIBRARY's own jump-table slot 0 — the exact
  routine the BASIC boot's `SYS 11720` calls — except for the 2-byte STOP-key-vector address
  operand. LIBRARY's own boot-time init already installs the identical STOP-key vector
  unconditionally, every boot, in both titles; STOP.PRG is a standalone duplicate of that
  same tiny template pointing at a different (but functionally identical) copy of the
  3-instruction STKEY-check routine, and nothing in the corpus was found to load it. See
  [§9.3](#93-stopprg-solved-its-librarys-own-boot-init-duplicated).
- **LIBRARY's leading jump table is fully mapped** (32 slots in CoK, 3 in DoK). Slot 0 is not
  a mysterious "kernel init" — it's the literal `SYS <KERNEL_ORIGIN>` target from the BASIC
  boot stub, and it does nothing but install that STOP-key vector and `RTS`. The
  `JMP $0803` slot ($2E10 in CoK, index 1 in DoK) is confirmed as the general-purpose
  "call into whatever is currently loaded in the $0800 overlay slot" trampoline. See
  [§9.2](#92-librarys-leading-jump-table-fully-mapped).
- **A cross-side call census** (all 6 sides per title, not just the boot side) roughly
  8x's the target list used in the original solve (400 CoK / 385 DoK addresses vs. the
  original 51/59), and around two dozen of the highest-fan-in ones are disassembled and
  functionally labelled below — text-field editing/blanking, save/restore context-swap
  pairs, a bank-switch trampoline pair, the KERNAL LOAD/SAVE/SETNAM/file-probe wrappers, and
  VIC-II/CIA2 video-bank setup. See [§9.4](#94-named-routine-map).
- **`FINAL`** (the dispatch-table entry with no matching file on any side) most likely drives
  LINKER into its own ordinary "wrong disk, please swap" retry prompt forever, not a crash —
  an evidenced inference, not a proof. See [§9.5](#95-final-what-actually-happens).
- **`SECSET02`/`SECSET10`/`SECSET64`**: refined, still-negative. No reader was found anywhere
  in LIBRARY's now-readable interior; a new self-consistency measurement makes "this is
  resident code" *less* likely than the prior round's framing suggested. See
  [§9.6](#96-secset0210064-refined-negative).
- **DoK's `CODE00`/`CODE01`/`CODE03`**: first-pass identification. `CODE01`/`CODE03` behave
  like ordinary further `$0800`-slot overlay content; `CODE00` does not run at `$0800` at all
  (near-zero self-consistency there) and its real address is unresolved. See
  [§9.7](#97-dok-code00code01code03-first-pass).

**2026-08-12/13, C1.9d update: the four C1.9c loose ends, closed or sharpened.** A same-day
follow-on round to §9 above. Headline results, each detailed in
[§10](#10-c19d-closing-the-four-loose-ends):

- **`FINAL` is dispatch-table index 8, not index 6.** Both this doc's own §9.5 and
  `c64-boot-chain.md` §2a's prose stated index 6 — a real error, corrected this round; the
  worked table in `c64-boot-chain.md` §2a already had it right. Indices 6 and 7 are PADDING
  slots that alias `FINAL`'s own address with the *wrong* length, decoding to garbage
  (`FINALCAM`/`FINALCA` in CoK, `FINAL\x00CA`/`FINAL\x00C` in DoK) — neither is a real name.
  A corpus-wide (all sides, both titles) census of every write to the `$7F11` "next program"
  global finds 22 write sites; every one that resolves to a literal value lands in
  `{0,1,2,3,5,9}` — real overlay indices only — and never 6, 7, or 8. Two sites resolve to a
  genuinely *computed* (not literal) value that this round could not fully pin, honestly left
  open. See [§10.1](#101-final-index-corrected-to-8-and-a-corpus-wide-7f11-census).
- **`SECSET02`/`10`/`64`: FASTL.O ruled out as a reader, cleanly.** The task's own suggested
  lead — FASTL.O, the drive-side fastloader, as a plausible SECSET64 consumer — is refuted by
  direct disassembly: no `"SECSET"` ASCII anywhere in its 429 bytes, no per-file address table
  of any kind. See [§10.2](#102-secset0210064-fastlo-ruled-out).
- **`CODE03`'s residence is now SOLVED: `$8000`.** Filtering LIBRARY's own heavily-called span
  out of the self-consistency measurement (the confound that made C1.9c's numbers hard to
  read) reveals a strong, two-technique-corroborated signal at `$8000` — far above the naive
  `$0800`/`$C000` guesses and approaching the corpus's real-code baseline range. `CODE01` gets
  the same, weaker, signal. `CODE00` stays genuinely unresolved — its own peak sits right on
  LIBRARY's boundary, a materially different (and murkier) case from `CODE01`/`CODE03`. See
  [§10.3](#103-code00code01code03-code03-solved-at-8000-code01-leans-the-same-way-code00-still-open).

Three independent slices in the prior round hit the same wall: JSR calls in the C64 Gold Box
corpus target addresses roughly $2E00-$3C00 that belong to no directory entry. Two hypotheses
were tested and ruled out: a hidden/orphaned disk block (no orphaned blocks on either title's
boot side), and *an ordinary file resident unmodified at a page-aligned shifted origin* (best
fit only 3 of 10 targets, and the winning origin for the same file disagreed between titles).

The second hypothesis was **half right and half wrong**. Right: it is an ordinary file, not a
hidden block. Wrong: the origin is not page-aligned, so the prior sweep never probed it. The
prior sweep's ten-target sample was also far too small for its scoring heuristic to resolve the
true origin from noise — see [Why the prior sweep missed it](#why-the-prior-sweep-missed-it),
corrected 2026-08-12 after the lead session re-measured it.

## The finding

Two files on both titles' side-1 disks carry a PRG header claiming load address `$4000` --
the same generic staging-buffer placeholder every ordinary overlay uses -- but are placed by
this corpus's custom disk loader at addresses that do **not** match that header:

| File    | Header claims | True runtime origin | Proof |
|---------|---------------|----------------------|-------|
| LINKER  | $4000         | **$2D00** (both titles) | self-referential JMP operands (type-a evidence) |
| LIBRARY | $4000         | **$2DC8** (both titles, kernel portion only) | byte-exact sweep + jump-table match + routine coherence |

Both origins are **identical across Champions of Krynn and Death Knights of Krynn**, despite
the two titles' LIBRARY files differing in length (7435 vs 7467 bytes) and internal layout
(the routine that motivated this whole hunt sits at $2E9A in CoK and $2E49 in DoK -- a 0x51-byte
internal shift -- while the *origin* of the file itself does not move at all).

### LINKER: proven by self-consistency alone (no target list needed)

LINKER's own code contains two real, unconditional `JMP` instructions and nothing else needed
to locate it:

```
CoK: $2D39  JMP $2D1B          $2D3F  JMP $2D00
DoK: $2D42  JMP $2D24          $2D48  JMP $2D00
```

Scan the *entire* LINKER body (146 bytes CoK / 75 bytes DoK) for opcode `$4C` (JMP abs) and
keep only operands landing inside LINKER's own claimed range `[$2D00, $2D00+len)`:

```
$ python -c "
import sys; sys.path.insert(0,'tools'); import c64_kernel as k
for title in ('cok','dok'):
    body = k.linker_body(title)
    jmps = [body[i+1]|(body[i+2]<<8) for i in range(len(body)-2) if body[i]==0x4C]
    print(title, [t for t in jmps if k.LINKER_ORIGIN <= t < k.LINKER_ORIGIN+len(body)], jmps)
"
cok [11547, 11520] [11547, 11520, 16707, 22098]
dok [11556, 11520] [11556, 11520]
```
(decimal `11547` = `$2D1B`, `11520` = `$2D00`, `11556` = `$2D24` -- the two self-jumps quoted
above; CoK's extra `16707`/`22098` = `$4143`/`$5652`, the aliased-not-real hits explained next.)

CoK's body also contains two *other* JMP-opcode-looking byte pairs (targets `$4143` and
`$5652`) inside its embedded ASCII filename table (`GENDUNGEONCOMBATINITCOM.PREPPOST.COMFINALCAMP`,
followed by a per-overlay lookup-table region -- see [bonus finding](#bonus-linkers-overlay-dispatch-table)).
These are real bytes that happen to decode as `JMP abs`, exactly the
`c64_disasm.py find_stores` docstring's documented caveat ("a byte pair inside an operand can
alias an opcode") -- and they are automatically filtered out by the containment check, because
their operand VALUES land nowhere near LINKER's ~150-byte range. No manual code/data boundary
guess was needed.

This is evidence type (a) from the brief -- "the file's own absolute JSR/JMP operands landing
inside `[org, org+len)`" -- the strongest kind, because it needs no assumption about which
external addresses matter and cannot be fooled by a cross-title-conflated target list.

Reproduce: `python tools/c64_kernel.py selfcheck --title cok --file LINKER --org 0x2D00` (and
`--title dok`).

### LIBRARY: proven four independent ways

**1. Unbiased call census, not the hand-me-down 10-address list.** Before trusting any of the
ten previously-collected addresses, they were re-derived from scratch: scan every side-1 file
for `JSR` (`$20`) operands in `[$2000,$4000)`, keep addresses called from at least 4 distinct
files. A routine called by many mutually-exclusive $0800-slot overlay files (CAMP, COMBAT,
DUNGEON, GEN, ECL*, POST.COM, ... -- up to 15 distinct callers on one DoK address) cannot live
inside any single one of them, which is itself independent confirmation that *something*
resident and shared exists in this band, with no assumption about which file it is.

```
python tools/c64_kernel.py census --title cok   # 51 addresses, $2000-$3FEC, fan-in up to 13
python tools/c64_kernel.py census --title dok   # 59 addresses, $2000-$3F87, fan-in up to 15
```

**2. Byte-exact (non-page-aligned) content-matching sweep.** For every side-1 file, propose
every origin `org = target - offset` where `body[offset-1]` is a routine-ender byte
(`RTS`/`JMP abs`/`RTI`/`JMP ind`), then score how many OTHER census targets land inside
`[org, org+len)` and are themselves ender-preceded. Unlike the prior round's sweep, origins are
**not** restricted to multiples of `$100`. LIBRARY wins by a wide margin, at the *same* origin
in both titles:

```
python tools/c64_kernel.py sweep --title cok
  LIBRARY   7435B  org=$2DC8  19 entryish / 48 inside   (next best: POST.COM, 9 entryish)
python tools/c64_kernel.py sweep --title dok
  LIBRARY   7467B  org=$2DC8  20 entryish / 55 inside   (next best: GEN, 10 entryish)
```

**3. The named entry point decodes to matching, coherent code in both titles.** The routine
that motivated this hunt -- MON's name-scrub pointer setup -- is $2E9A in CoK and $2E49 in DoK.
At `org=$2DC8`, both decode to the byte-identical structure, offset by exactly the titles'
0x51-byte internal delta:

```
CoK $2E9A (LIBRARY body offset 210, byte before = $60 RTS):
  2E9A  AD CD 03   LDA $03CD
  2E9D  20 84 2E   JSR $2E84
  2EA0  85 4E      STA $4E
  2EA2  86 4F      STX $4F
  2EA4  60         RTS

DoK $2E49 (LIBRARY body offset 129, byte before = $60 RTS):
  2E49  AD CD 03   LDA $03CD
  2E4C  20 2D 2E   JSR $2E2D
  2E4F  85 4E      STA $4E
  2E51  86 4F      STX $4F
  2E53  60         RTS
```

Reproduce: `python tools/c64_kernel.py show --title cok --addr 0x2E9A --count 5` (and the DoK
equivalent).

**4. A leading jump table whose slots match two of the ORIGINAL ten targets exactly --
evidence type (b).** CoK's LIBRARY opens (at `org=$2DC8`) with 32 `JMP` slots, 3 bytes each. Two
of those slots land exactly on two of the round's original target addresses:

```
LIBRARY body offset $3C  ->  $2DC8+$3C = $2E04  ->  JMP $4840
LIBRARY body offset $5D  ->  $2DC8+$5D = $2E25  ->  JMP $4857
```

Both `$2E04` and `$2E25` were independently named in the brief as GDRIVE00 call targets --
confirmed: `python tools/c64_kernel.py`'s `find_callers` (see the module) shows GDRIVE00 is the
sole caller of both in CoK. And both slots' own jump targets, `$4840`/`$4857`, land inside
GDRIVE00's own body (staged at `$4000`, 2806 bytes long, so `$4000`-`$4AF6` -- `$0x840` and
`$0x857` both fit) -- i.e. these two kernel-table slots are **trampolines back into whichever
overlay is currently staged at $4000**, callable at a fixed kernel address regardless of which
transient overlay/driver variant is loaded there. (`GDRIVE00`/`01`/`02` are the established
mutually-exclusive $C000-slot occupants; this looks like the general-purpose version of the
same indirection pattern, not specific to graphics drivers.) A third slot, body offset `$48` ->
`$2E10`, is `JMP $0803` -- the same "call whatever's in the currently-loaded $0800 overlay"
trampoline that LINKER's own dispatcher uses directly (see below).

DoK's equivalent table is much shorter -- only 3 slots (`JMP $4A90`, `JMP $0803`, `JMP $3A98`,
9 bytes total, vs CoK's 96) -- and none of its 3 slot addresses (`$2DC8`/`$2DCB`/`$2DCE`) are
called by absolute JSR anywhere in DoK's side-1 corpus (checked with `find_callers`). Honest
open detail, not resolved: either DoK's engine revision dropped most of this indirection layer,
or it is reached some other way (indirect JSR through a vector, not a literal `$20 xx xx`) that
a static absolute-operand scan cannot see.

## Coherence-checked: what the other named routines do

At `org=$2DC8`, the remaining originally-given target addresses all decode into sensible code,
none of them garbage/misaligned:

- **`$2E84`** (CoK; called from LIBRARY itself 8 times and GDRIVE02 once -- corrected from an
  earlier miscount of 7; recount: `find_callers(bodies, [0x2E84])` lists 8 distinct LIBRARY
  call-site offsets, 110/127/170/213/444/506/684/3400, each independently disassembling as
  `JSR $2E84`): `LDX #$28; JSR $3007; STA $A3; ...` -- a pointer-computation front end that
  immediately calls `$3007`.
- **`$3007`** (12 distinct callers across nearly every overlay in the corpus -- corrected from
  an earlier "the single highest-fan-in CoK address" claim: by `call_census`'s own count it
  ties for 3rd/4th, not 1st -- `$2020` and `$3B02` each have 13 distinct callers, one more than
  `$3007`'s 12; see `python tools/c64_kernel.py census --title cok`): `STA $AB; STX $4B; LDA
  #$00; STA $4C; LDX #$07; LSR $AB; ...` -- a generic "compute a record pointer from an index"
  primitive, and still among the most shared routines in the corpus even though not the single
  most-called one.
- **`$30E2`**: `STA ($4C),Y; PHA; LDA $0286; STA ($A3),Y; PLA; RTS` -- a small store-via-pointer
  utility, entered mid-stream by design (register state is caller-prepared).
- **`$3B69`/`$3B70`**: `SEI; PHA; LDA #$F9; JMP $3B76` and (7 bytes later) `PHA; LDA #$06; JMP
  $3B7C` -- classic ISR-prologue shape (interrupts disabled, accumulator saved) for two
  adjacent, independently-called handler entries. Not preceded by an RTS (as expected for
  vectored interrupt entries, unlike JSR-called subroutines).
- **`$3EEC`**: `STX $4C; LDX #$00; STX $4D; STA $AB; STX $4B; LDA #$00; STA $7F3F; STA $7F40` --
  zeroes two bytes inside the already-established `$7E00-$7FFF` shared globals/flags block,
  corroborating that established fact from a completely independent direction.

Reproduce any of these: `python tools/c64_kernel.py show --title cok --addr <ADDR>`.

## LINKER is the overlay dispatcher, and it assumes the kernel is already resident

LINKER's code (both titles) is a tight loop:

```
2D1B  LDX $7F11            ; overlay index, in the established $7E00-$7FFF globals block
2D1E  LDA $2D79,X           ; table 2 -> $3214
2D21  STA $3214
2D24  LDA $2D83,X           ; table 3 (all $2D, i.e. high byte of a $2Dxx-page pointer) -> $3216
2D27  STA $3216
2D2A  LDA $2D6F,X           ; table 1 (also the per-name LENGTH byte, e.g. 3,7,6,4,8,8,... for
                            ;   GEN,DUNGEON,COMBAT,INIT,COM.PREP,POST.COM,...)
2D2D  LDX #$00
2D2F  LDY #$08
2D31  JSR $31CD             ; CoK; $3186 in DoK -- a KERNEL-resident load call, fixed address
2D34  BEQ $2D3C
2D36  JSR $4298             ; error/retry path
2D39  JMP $2D1B
2D3C  JSR $0800             ; run the overlay that was just loaded
2D3F  JMP $2D00             ; back to the top for the next overlay
```

The call at `$31CD`/`$3186` is itself one of the census's fan-in addresses -- i.e. LINKER
**calls into the kernel by a fixed absolute address**, which only works if the kernel is
already resident in memory before LINKER's loop runs. LINKER does not relocate the kernel; it
depends on it. This is consistent with the established fact that `LIBRARY` is also listed among
the "$0800 overlay slot" occupants: LIBRARY's file is loaded in (at least) two pieces by
whatever the true bootstrap does -- the first ~4.6KB (kernel) ends up at `$2DC8`, permanently
resident, and the remainder of the same file is the actual swappable LIBRARY overlay content
that later takes its turn at `$0800` like DUNGEON/COMBAT/CAMP/etc. The split point is
*estimated*, not structurally proven: the highest census target explained by the LIBRARY sweep
is `$3FEC` (CoK) / `$3F87` (DoK), i.e. body offset `0x1224` (4644 bytes) / `0x11BF` (4543
bytes) into the file -- no hard sentinel marking the boundary was found.

## Why the prior sweep missed it

> **Corrected 2026-08-12 by the lead session, which ran that prior sweep and therefore has the
> measurements.** This section originally blamed cross-title conflation of the target list.
> **That is not what went wrong.** The prior sweep's filter tested whether each target falls
> *inside* `[org, org+len)` — not whether the current title calls it — and all ten targets fall
> inside LIBRARY's span at `$2DC8` in **both** titles (CoK `$2DC8`-`$4AD2`, body 7435; DoK
> `$2DC8`-`$4AF2`, body 7467). So the all-ten-inside filter was satisfied by LIBRARY in both
> titles and never rejected it. The conflation described below is a real property of the corpus
> and worth knowing, but it is not the cause of the miss.
>
> **The actual cause is sample size.** Re-running the prior round's exact ender-preceded scoring
> at the now-known-correct origin gives LIBRARY only **4 of 10** in CoK and **1 of 10** in DoK —
> against 3 of 10 at page-aligned `$2E00` and 3 of 10 at `$2700`. At n=10 the true origin is
> statistically indistinguishable from noise, and in DoK it actually scores *worse* than a wrong
> origin. Page-alignment was a contributing factor (`$2DC8` is not page-aligned, so the true
> origin was never even probed) but fixing alignment alone would not have found it.
>
> What made this round's sweep work is that it scores against **48 (CoK) / 55 (DoK)**
> census-derived targets instead of ten, turning a 4-vs-3 non-result into 19-vs-9 and 20-vs-10 —
> the same ~40% hit rate, now with enough samples to resolve it. **The lesson for the next
> structural sweep in this project is "collect more targets", not "align more finely".**

The cross-title conflation itself, recorded because it is true and useful even though it did not
cause the miss: `$2E49` (a DoK-only call site) and `$2E9A` (a CoK-only call site) are the *same
logical routine* at *different internal offsets* in the two titles' otherwise-identical LIBRARY
layout. Confirmed directly:

```
python tools/c64_kernel.py census --title cok   # -- $2E49 never appears (checked separately;
python tools/c64_kernel.py census --title dok   #    it's below the fan-in>=4 cut in DoK's own
                                                 #    census here, but find_callers below shows
                                                 #    it firmly present with 3 real callers)
```
```
$ python -c "
import sys; sys.path.insert(0,'tools'); import c64_kernel as k
bodies = k.read_bodies(k.load_side1('dok'))
print(k.find_callers(bodies, [0x2E49]))
"
{0x2E49: [('DUNGEON', 2448), ('COMPREP', 533), ('INIT', 706)]}
```
```
$ python -c "
import sys; sys.path.insert(0,'tools'); import c64_kernel as k
bodies = k.read_bodies(k.load_side1('cok'))
print(k.find_callers(bodies, [0x2E49]))
"
{0x2E49: []}
```
`$2E49` is real, and only in DoK. Once the page-alignment restriction is dropped **and the
target list is widened from 10 to the full census**, the sweep converges on the same file at the
same origin in both titles. Of those two changes, the measurements above show the widening is
the one that carries the result.

## A ruled-out false lead: DoK's TITLEPG "$2E04 reference"

An early, broader byte-alias scan flagged `TITLEPG` (DoK) as containing a reference to `$2E04`
at body offset 2792. `TITLEPG` is a title-screen picture (3763 bytes of graphics data, not
code); the bytes around that offset are `... 1E 04 2E 32 3C 3E 88 ...` -- ordinary pixel/colour
data that happens to alias a `JSR $2E04` opcode+operand by chance. This is exactly the
`find_stores`/`find_callers` caveat documented in both `c64_disasm.py` and this module: a hit
must be sanity-checked against the file's actual type before being trusted. Verified by
inspecting the raw bytes directly (see reproduction command in `test_c64_kernel.py`'s
`RealCorpusTests`, or run `python tools/c64_kernel.py show` -- it will refuse to make sense of
this offset as code because there is no ender byte anywhere nearby).

## Open: the exact bootstrap mechanism

> **CLOSED 2026-08-12 — reconciled by the lead session.** This section was written without
> knowledge of a sibling slice running concurrently, which found the answer from the other end
> and recorded it in `docs/engine/research/c64-boot-chain.md`. The mechanism is not a copy loop
> at all, which is why searching for one (approach 1 below) correctly came up empty:
>
> **The boot stub is tokenized CBM BASIC V2, and it simply asks the KERNAL to load the file to
> a different address.** `SETLFS` ($FFBA) with **secondary address 0** selects a *relocated*
> load — the target address comes from the caller, and the file's own embedded PRG header is
> ignored. That is the entire trick behind the `$4000`-header-vs-real-address mismatch that has
> puzzled three rounds of this investigation. There is no relocator to find.
>
> Independently verified by the lead session, on the raw bytes of both titles rather than by
> re-running the agent's tool. The `$0801`-loading file is `BOOT` on Champions and
> `DEATH KNIGHTS` on Death Knights; detokenizing both yields, at the same line numbers:
>
> ```
> line   41   SYS 11720      ; = $2DC8  -> LIBRARY, the kernel
> line  240   SYS 11520      ; = $2D00  -> LINKER, the overlay dispatcher
> ```
> with the loader subroutines at lines 20010-21050 calling `SYS 65466` ($FFBA SETLFS),
> `SYS 65469` ($FFBD SETNAM) and `SYS 65493` ($FFD5 LOAD). Both origins this doc derived
> structurally are therefore also *literal constants in the shipped BASIC program* — two fully
> independent derivations of `$2DC8` and `$2D00`, which is as strong as this kind of evidence
> gets.
>
> **Reconciling point 3 below, which reads as a contradiction of the boot-chain doc.** That doc
> says the loader works "exclusively by filename via ordinary KERNAL LOAD, no track/sector
> command found"; this section says the corpus "loads via a custom raw-sector protocol, not
> KERNAL LOAD". *Both are correct, at different layers.* `FASTL.O` patches the KERNAL's
> **ILOAD indirect vector at `$0330`/`$0331`** — so every call site does perform an ordinary
> `SETNAM`/`SETLFS`/`LOAD`, and the routine that vector dispatches to is `FASTL.O`'s own
> raw-sector fastloader rather than the ROM's. Nothing needs to change in either conclusion.
> (Point 3 does contain one real error, corrected here: `$0330`/`$0331` is the **LOAD** vector,
> not the SAVE vector; `ISAVE` is `$0332`/`$0333`. The boot-chain doc has this right.)

The three approaches tried below all failed to find a relocator. In hindsight that is the
expected result, not a gap — there is no relocator. Retained because the negative results are
still useful and approach 3's `FASTL.O` analysis stands on its own:

1. **No copy loop inside LIBRARY or LINKER themselves.** Searched both files' bodies for
   `LDA #$2D` / `LDA #$2E` / `LDA #$40` (immediate loads of a plausible pointer high byte)
   feeding a zero-page pointer pair later used with `(zp),Y`. The only hits (`LDA #$2D` at CoK
   LIBRARY body offset 809 / DoK offset 738) are unrelated: a self-modifying `+`/`-` sign-glyph
   selector for a number-printing routine, not a relocator (disassembles as
   `LDA #$2D; STA <code-addr>; ...; LDA #$2B; STA <same code-addr>` -- a runtime choice between
   the ASCII glyphs for `-` and `+`, not a pointer). Ruled out by direct disassembly, reproduce
   with `python tools/c64_kernel.py show --title cok --addr 0x30F1 --count 8`.
2. **Nothing else in the side-1 corpus references `$2D00` or `$2DC8` as a JSR/JMP/absolute
   target**, other than LINKER's own two self-jumps (checked with
   `find_callers(bodies, [0x2D00, 0x2DC8])` across every side-1 file in both titles; the one
   other hit, DoK `MON22` body offset 116, is a 482-byte monster-stat data file, not code -- the
   same byte-alias caveat as the TITLEPG case above, not investigated further because monster
   data files contain no code by construction).
3. **`FASTL.O`** (429 bytes, **byte-identical between titles**) is a drive-side fastloader
   upload: it patches the `$0330`/`$0331` KERNAL SAVE vector, sets `CIA2 $DD02`, and stages a
   custom serial-bus routine at `$B8xx` (RAM under BASIC ROM) before uploading a 6-byte + a
   32-byte block to the drive via `$FFA8`/`$FFAE` (`CIOUT`/`UNLSTN`). This confirms the whole
   corpus loads via a **custom raw-sector protocol**, not KERNAL `LOAD` -- fully consistent
   with (and probably the general mechanism behind) files landing at addresses that don't match
   their embedded PRG header, a pattern already established for `GEN` (header `$4000`/`$1220`,
   real address `$0800`) and now shown for `LINKER` and `LIBRARY` too. But FASTL.O itself is
   generic (identical in both titles) and contains no per-file address table -- the title- and
   file-specific target addresses must be supplied by whatever calls into this drive-side
   uploader, which was not identified.

**Best remaining lead for the next round:** trace `BOOT` (CoK) / `DEATH KNIGHTS` (DoK) -- the
very first loaded file (PRG header `$0801`, i.e. ordinary BASIC-launched) -- for its own
raw-sector-read call sites immediately after it uploads FASTL.O. Unlike the many interchangeable
`$0800` overlays (which need LINKER's per-name lookup table because there are many of them,
loaded in an order chosen at runtime), LINKER and the LIBRARY-kernel are each loaded exactly
once, always in the same order, at boot -- so their target addresses plausibly appear as two
literal immediate operands passed directly to a shared "read N sectors starting at
track/sector T to address A" call, rather than through a table. This search was NOT completed:
`BOOT`'s own `LDA #$2D` / `LDA #$2E` scan came up empty (reproduced below), meaning if the
target address is there at all, it is built some other way (e.g. two separate `LDA #<lo` /
`LDA #>hi` loads that don't share an immediate byte pattern easy to grep for, or the constant
lives inside `INIT` rather than `BOOT`).

```
$ python -c "
import sys; sys.path.insert(0,'tools'); import c64_kernel as k; import c64_disk as c64
img = k.load_side1('cok')
for e in c64.directory(img):
    if e.name == 'BOOT':
        data = c64.read_file(img, e)
body = data[2:]
idxs = [i for i in range(len(body)-1) if body[i]==0xA9 and body[i+1] in (0x2D,0x2E)]
print(idxs)   # []  -- empty, the lead this doc leaves open
"
```

## Bonus finding: LINKER's overlay-dispatch table (partially decoded, not fully pinned)

CoK's LINKER embeds, after its ~66-byte code prologue: the overlay filenames
`GEN DUNGEON COMBAT INIT COM.PREP POST.COM FINAL CAMP` back-to-back with no separators (45
bytes), then three parallel 10-byte arrays at `$2D6F` (a length/parameter byte per overlay --
matches the first 6 name lengths exactly: `3 7 6 4 8 8`, then 4 more entries `8 7 5 4` that do
**not** cleanly match a naive 8-name parse -- the true name count is likely 10, not 8, and the
name-region boundary used above was not correctly re-derived; left open rather than guessed),
`$2D79` (low bytes `$42 $45 $4C $52 $56 $5E $66 $66 $66 $6B` -- addresses `$2D42`-`$2D6B`, all
landing *inside LINKER's own body*, i.e. probably per-overlay sub-pointers into LINKER's own
data, not yet traced), and `$2D83` (**all ten entries are `$2D`** -- confirms the mid table
holds the low byte of a two-byte pointer whose high byte is fixed at page `$2D`, corroborating
that this whole resident cluster sits in the `$2Dxx` page, independently of everything above).
This sub-structure is a real, evidenced finding but is NOT needed for (and does not change) the
kernel-origin result above; flagged here as the next thing to fully parse, not solved.

## 9. C1.9c: LIBRARY's interior (2026-08-12)

The original solve (§§1-8 above) established WHERE LIBRARY lives and WHAT it is; it read only
a handful of named entry points, called out from LINKER's own code or from the ten original
mystery targets. This round reads the rest of the ~7.4 KB body: a wide, cross-side inbound call
census; the leading jump table in full; the four open anomalies (`FINAL`, `STOP.PRG`,
`SECSET02`/`10`/`64`, DoK's `CODE00`/`01`/`03`); and about two dozen individually disassembled,
functionally-labelled interior routines. Four specific addresses (`$2E9A`/`$2E49` and
`$2E04`/`$2E25`) were independently disassembled in depth by a sibling slice working the same
round and are deliberately not re-covered here beyond what the original doc already said.

### 9.1 A cross-side call census, not a boot-side-only one

The original census (`c64_kernel.py:call_census`) scanned only each title's *side 1*. Most of
the corpus's overlay-family files — `ECLnn`, `MONnn`, `GEOnn`, `SPELLnn`, `CODEnn`,
`WALLSETnn`, `COMPICnn`, ... — live on sides 2-6, so a side-1-only census both undercounts real
fan-in and misses whole categories of caller entirely. `c64_kernel.py:all_bodies()` (new this
round) unions every side's directory (342 distinct CoK files across all 6 sides + savedisk vs.
82 on side 1 alone; 273 DoK files across 6 sides vs. 91 on side 1) and scanning that for JSR
operands landing inside LIBRARY's own established range finds:

```
python tools/c64_kernel.py fullcensus --title cok --top 20
  cok: 342 distinct files across all sides; 400 addresses in LIBRARY's own range $2DC8-$4AD3
       called from outside LIBRARY
python tools/c64_kernel.py fullcensus --title dok --top 20
  dok: 273 distinct files across all sides; 385 addresses in LIBRARY's own range $2DC8-$4AF3
       called from outside LIBRARY
```

— roughly 8x the target list (400/385) the original solve's side-1 census produced (51/59).
Only 60/400 (CoK) and 55/385 (DoK) of these addresses are "ender-aligned" (immediately preceded
by an `RTS`/`JMP`/`RTI`/`JMP ind` byte, the signature of a conventional subroutine entry point);
the rest are called with the caller relying on a specific register/flag state, i.e. genuine
*mid-routine* entry points into a bigger routine, entered past a shared prologue — this is a
real, common pattern in this kernel (see the `$2F7E`/`$2F9D`/`$2FA2` and `$3355`/`$336B`
examples below), not a scanning artifact; each case below that shows this is disassembled and
checked by hand, not inferred from alignment alone.

### 9.2 LIBRARY's leading jump table, fully mapped

`c64_kernel.py:library_jump_table()` decodes the run of `JMP abs` ($4C) instructions starting
at LIBRARY's own origin, stopping at the first non-`$4C` byte — CoK has **32 slots** (96 bytes,
`$2DC8`-`$2E27`), DoK has only **3** (9 bytes, `$2DC8`-`$2DD0`):

```
python tools/c64_kernel.py jumptable --title cok
  [ 0] $2DC8  JMP $4AC1  <- BASIC boot SYS target (line 41)
  [ 1] $2DCB  JMP $2E2B
  [ 2] $2DCE  JMP $3B69
  ...
  [24] $2E10  JMP $0803  <- overlay-call trampoline (JMP into the $0800 slot)
  ...
  [31] $2E25  JMP $4857

python tools/c64_kernel.py jumptable --title dok
  [ 0] $2DC8  JMP $4A90  <- BASIC boot SYS target (line 41)
  [ 1] $2DCB  JMP $0803  <- overlay-call trampoline (JMP into the $0800 slot)
  [ 2] $2DCE  JMP $3A98
```

Two things the brief specifically asked to confirm or correct:

**Slot 0 is not a mysterious "kernel init routine" — it's the literal `SYS <KERNEL_ORIGIN>`
target, and it's tiny.** The BASIC boot stub's line 41 (`SYS 11720` = `SYS $2DC8`,
`c64-boot-chain.md` §1a) lands exactly on slot 0's own address (`$2DC8` = `KERNEL_ORIGIN` by
construction — slot 0 is the first 3 bytes of the file). Its target turns out to be a
**7-byte routine that only installs a STOP-key vector and returns** — see §9.3, this is the
whole story, solved by direct byte comparison against `STOP.PRG`.

**The `JMP $0803` slot IS the overlay-call trampoline — confirmed, in both titles.** CoK slot
24 (`$2E10`) and DoK slot 1 (`$2DCB`) both read `JMP $0803`. `$0803` is a fixed offset into the
$0800 overlay slot — 3 bytes past the slot's own start, i.e. past a leading `JMP` at `$0800`
DUNGEON is known to have (`c64-boot-chain.md` §2, DUNGEON's own disassembly opens
`$0800 JMP $0806 / $0803 JMP $0A2E`). So this table slot is a **stable, overlay-independent
`JMP` into "whatever is 3 bytes into the currently-loaded $0800 overlay"** — the same
indirection LINKER's own dispatch loop performs directly with its `JSR $0800` (§2 of the
boot-chain doc), just exposed as a fixed kernel-table entry so *other* callers (not just
LINKER) can reach into the active overlay without knowing which one is loaded.
`test_overlay_trampoline_slot_targets_0803_in_both_titles` pins this in both titles.

**A correction to this doc's own earlier reading of two of the slots.** §"LIBRARY: proven four
independent ways", point 4 above describes CoK slots 20/31 (`$2E04 -> JMP $4840`,
`$2E25 -> JMP $4857`) as "trampolines back into whichever overlay is currently staged at
$4000", reasoning that GDRIVE00 (2806 bytes) is "staged at $4000" and that both targets land
inside its `$4000`-`$4AF6` span. Disassembling `$4840`/`$4857` directly this round shows they
are **fully coherent LIBRARY-internal code** (a matched bank-switch-out/bank-switch-in pair,
detailed in §9.4) — not garbage, not GDRIVE00 content. GDRIVE00's *real* execution address is
established elsewhere in this project's memory map as `$C000` (the mutually-exclusive
graphics-driver slot), not `$4000` — its `$4000` PRG header, like LIBRARY's and LINKER's own,
is very likely the same generic staging-buffer fossil this whole investigation exists to
correct for, not GDRIVE00's real address. So `$4840`/`$4857` were mis-attributed in the
original write-up; they are LIBRARY's own bank-switch trampoline, reachable both via these two
table slots and via direct `JSR` from ordinary overlay code (`$3B05` calls `$4840` directly,
for instance — bytes `20 40 48`). This is a correction to this document, not to the underlying
jump-table-origin finding, which is unaffected.

> **Address corrected 2026-08-12:** this cited `$3B02`, which is `AD F8 03` = `LDA $03F8`, the
> instruction three bytes earlier. The claim it supports — that `$4840` is reachable by
> ordinary `JSR` outside the jump-table slots — is unaffected and still true.

### 9.2a The trampoline slot IS the DOS ECL `op_call` redraw operand (2026-09-10)

§9.2 established WHAT the `JMP $0803` slot is on the C64 and left it there. This section
connects it to the DOS side, where it has been sitting unrecognised in every Gen1 title's ECL
bytecode.

**The correspondence.** The Gen1 DOS ECL VM computes an `op_call` routine id from its operand as
`id = word - 0x7FFF` (`native/src/ccecl.asm:op_call`, mirrored by
`tools/ecl_host_call_coverage.py:call_routine_id`). Invert it and the **raw on-disk operand
word** is `raw = id - 0x8001`. For the id each title's demo/walk scripts use to redraw the
first-person viewport, that raw word is numerically **that same title's own LIBRARY
leading-jump-table slot address whose target is `JMP $0803`**:

| Title   | DOS ECL redraw id | raw word | C64 LIBRARY table | trampoline slot |
| ------- | ----------------- | -------- | ----------------- | --------------- |
| CoK     | `0xae11`          | `$2E10`  | 32 slots          | slot 24 = `$2E10` |
| DoK     | `0xadcc`          | `$2DCB`  | 3 slots           | slot 1  = `$2DCB` |
| Secret  | (`0xadcc`)        | `$2DCB`  | 3 slots           | slot 1  = `$2DCB` |
| Gateway | (`0xae11`)        | `$2E10`  | 32 slots          | slot 24 = `$2E10` |

```powershell
python tools/c64_kernel.py trampoline --title cok      # slot 24 at $2E10
python tools/c64_kernel.py trampoline --title dok      # slot  1 at $2DCB
python tools/c64_kernel.py trampoline --title secret   # slot  1 at $2DCB
python tools/c64_kernel.py trampoline --title gateway  # slot 24 at $2E10
```

**Secret and Gateway are OUT OF SAMPLE.** The hypothesis was formed from CoK and DoK alone;
`TITLE_DIRS` did not contain the other two titles until this section was written. Their C64
trampoline addresses were *predicted* from
`docs/engine/research/gen1-demo-sequence-patterns.md`'s DOS-side table before their `LIBRARY`
files were opened, and both predictions were exact. The DOS half was then re-derived from retail
bytes rather than taken from that doc — a raw 16-bit word scan over each title's own
`ECL*.DAX` (GOG DOS installs) gives CoK `$2E10` x112 / `$2DCB` x0, DoK `$2DCB` x111 /
`$2E10` x1, Secret `$2DCB` x147 / `$2E10` x1, Gateway `$2E10` x135 / `$2DCB` x0.

**Null, with its denominator.** Denominator 65536 = the whole 16-bit space an ECL operand word
can occupy. Per title, the chance a random word hits *the* `$0803` slot is 1/65536 (each table
has exactly one); hits any slot boundary is 3/65536 (DoK/Secret) or 32/65536 (CoK/Gateway); and
merely lands inside the table span at all is 9/65536 or 96/65536. Both out-of-sample predictions
being right by chance: **2.3e-10** on the exact-slot metric, **2.0e-7** even on the weakest
span-only one.

**Control A — cross-assignment (4x4).** Scoring each title's word against every title's table,
the metric fires only on the right pairings. But *which clause* carries it matters and is easy to
overstate: `$2E10` is outside DoK's and Secret's 3-slot span, so those two reject on span — while
`$2DCB` **is** inside CoK's and Gateway's span *and* on a valid 3-byte slot boundary (it is their
slot 1) and rejects only because that slot targets `$2E2B`. A span+boundary metric without the
`$0803` target test would fire on the wrong title in half the cross-pairings.

**Control B — separation.** Of the five raw words the CoK/DoK ECL corpus actually uses, exactly
two are accepted and three rejected, in all four titles: `$6803` (id `0xe804`), `$C01E`
(id `0x401f`) and `$B203` (id `0x3204`) are not inside any title's table span. `$6803` and
`$C01E` are outside `LIBRARY`'s whole body; `$B203` likewise. `$3203` and `$401E` — which a prior
note reached for by subtracting 1 instead of `0x8001` — occur **zero** times as raw 16-bit words
in any of the four titles' `ECL*.DAX`, so they are not corpus operands at all.

**`KERNEL_ORIGIN` is grounded per title, not assumed.** CoK, DoK **and Secret** each ship a
tokenized-BASIC boot stub whose line 41 reads `SYS 11720` = `$2DC8` (`c64_boot.parse_sys_calls`),
so for three of the four the origin is read straight out of the game's own boot code, exactly as
§"the boot stub" does for CoK/DoK. **Gateway has no such stub** — its boot file is a `SYS 2059`
machine-language loader with no BASIC listing — so Gateway's `$2DC8` rests on two weaker but
independent signals: `self_consistency(LIBRARY, $2DC8)` = 422/540 (78.1%) against 189/540 (35.0%)
at the PRG header's own `$4000` placeholder and under 2% at `$0800`/`$8000`/`$C000`; and nine of
its own jump-table TARGET operands (`$2E2B`, `$2EAB`, `$2ECF`, `$2EA5`, `$2F12`, `$2F46`,
`$2FA2`, `$2F9D`, `$2F7E`) being the identical absolute addresses CoK's table holds, which decode
as those addresses only if the table sits at `$2DC8`.

**WHAT THIS DOES NOT ESTABLISH.** Three limits, and they are the load-bearing part of this
section:

1. **`$0803` is generic overlay dispatch** — "jump 3 bytes into whatever overlay is currently
   staged at `$0800`" (§9.2). A match therefore identifies WHICH SLOT the DOS operand names and
   contributes nothing about what that slot's staged overlay does. The label
   "redraw dungeon view" is unaffected by this finding and still rests solely on the DOS-side
   script-shape reading in `gen1-demo-sequence-patterns.md`, unchecked against any `GAME.OVR`.
2. **It is not "23 entries were deleted ahead of it."** DoK's and Secret's tables are 3 slots;
   CoK's and Gateway's are 32. Those are differently-built tables, not one table minus rows. The
   `0x45` difference between `0xae11` and `0xadcc` is 23 slots x 3 bytes arithmetically, and that
   arithmetic is all it is.
3. **It does not authorize the `native/src/ccecl.asm` alias.** `docs/engine/BUILD-QUEUE.md`
   gates that on a DoK `GAME.OVR` check which has not been done; this is C64 evidence and does
   not substitute for it.

It does, however, dispose of that queue item's "awkward fact" — that `0xe804` is the same id in
both titles while `0xae11`/`0xadcc` differ. `$6803` is not a jump-table slot in any of the four
titles, so it has no reason to move when the table's shape changes; the redraw word does.

Pinned by the `(zz)` block of `tools/test_ecl_host_call_coverage.py`, including an always-run
synthetic control (so the D:\ skip cannot pass vacuously) and two mutation proofs: retargeting
`OVERLAY_TRAMPOLINE_TARGET` from `$0803` to `$0806` turns
`test_PIN_call_redraw_operand_equals_c64_overlay_trampoline_slot` red with
`AssertionError: ('cok', None)`, and shifting `call_operand_word_gen1` by one turns
`test_call_operand_word_gen1_round_trips_and_matches_the_known_pairs` red with
`assert 11793 == 11792`.

### 9.3 STOP.PRG: solved. It's LIBRARY's own boot-init, duplicated

`STOP.PRG` (13 bytes, Champions side 1 only) was previously established (`c64-boot-chain.md`
§2b) to install a custom `ISTOP` (`$0328`/`$0329`) vector pointing at a 3-byte STKEY-check
routine inside LINKER's tail (`$2D8D`), but *nothing that loads STOP.PRG by name was found
anywhere in the corpus* — a genuine open item.

This round's jump-table decode makes the answer obvious: LIBRARY's own slot-0 target (`$4AC1`
CoK / `$4A90` DoK — the literal `SYS <KERNEL_ORIGIN>` boot target) is **the identical
7-instruction template**, just pointing at a *different* copy of the same 3-byte STKEY-check
routine:

```
$ python tools/c64_kernel.py stopcheck --title cok
STOP.PRG (13B) vs LIBRARY's slot-0 target $4AC1 (13B window): 2 differing byte(s)
  offset 2: STOP=$8D  LIBRARY=$CE
  offset 7: STOP=$2D  LIBRARY=$4A
```

Byte-for-byte:

```
              offset:  0  1  2  3  4  5  6  7  8  9 10 11 12
STOP.PRG:          78 A9 8D 8D 28 03 A9 2D 8D 29 03 58 60
LIBRARY $4AC1:     78 A9 CE 8D 28 03 A9 4A 8D 29 03 58 60
                          ^^                ^^
                     SEI LDA #<lo STA $0328 LDA #>hi STA $0329 CLI RTS
```

Only the 2-byte vector-target ADDRESS operand differs: STOP.PRG installs `$2D8D` (inside
LINKER's tail — an independently-confirmed, coherent `LDA $91; CMP #$7E; RTS`, per
`c64-boot-chain.md` §2b); LIBRARY's own copy installs `$4ACE` (7 bytes past its own slot-0
landing point — decodes to the **byte-identical** `LDA $91; CMP #$7E; RTS`, confirmed directly:
`lib[off:off+3] == bytes([0xA5, 0x91, 0xC9])`, pinned in
`test_stop_prg_is_library_own_boot_init_duplicated`). DoK's LIBRARY has the same structure at
its own slot 0 (`$4A90` installing a vector to `$4A9D`, same 3-byte STKEY-check), confirming
this is not a CoK-only quirk of the template — DoK simply never shipped a separate `STOP.PRG`
file (checked: absent from all 6 DoK sides), because it never needed one; its LIBRARY already
carries the same built-in copy CoK's does.

**Conclusion, stated as an inference because the corpus cannot directly prove "never loaded",
only "no loader was found":** LIBRARY's own boot-time init (run automatically and
unconditionally via `SYS <KERNEL_ORIGIN>`, in *both* titles, every boot, no `STOP.PRG` needed)
already performs the exact job `STOP.PRG` performs, byte-for-byte identically apart from which
of two functionally-identical STKEY-check copies it points the vector at. A full ASCII-name
sweep of every file on every Champions side (all 6, via `all_bodies`) found the literal string
`"STOP"` nowhere except inside `STOP.PRG` itself — ruling out the same named-load mechanism
`BOOT`/`LINKER` use for every other file they load. Combined, the best-supported reading is
that `STOP.PRG` is a **standalone, redundant duplicate** of functionality that got folded
directly into LIBRARY's own boot sequence — plausibly a leftover from an earlier build where
the vector-install lived only in this separate file, or a manual re-arm tool a developer could
`LOAD"STOP",8,1:SYS...` by hand after some code path left interrupts disabled without
restoring the vector. Neither of those two specific stories is provable from static bytes
alone; what IS proven is the byte-exact match and the exhaustive negative name search. No
loader for `STOP.PRG` was found — an honest negative, not resolved further this round.

### 9.4 Named routine map

Two dozen of the highest-fan-in cross-side census addresses (excluding the four sibling-owned
`$2E9A`/`$2E49`/`$2E04`/`$2E25`), disassembled at `KERNEL_ORIGIN` and cross-checked where a
title-parallel exists. Fan-in counts are from the §9.1 cross-side census (`fullcensus`); "E"
means ender-aligned (conventional entry); reproduce any row with
`python tools/c64_kernel.py show --title cok --addr <ADDR>`.

> **`(E)` markers corrected 2026-08-12 by the lead session.** Five rows carried an `(E)` that
> the tool's own `fullcensus` contradicts: `$2F7E` (preceding byte `$FF`), `$2F12` (`$48`/PHA),
> `$3355` (`$7E`), `$31CD` (`$98`), and `$3B2C`/DoK `$3A98` (`$48`/`$47`). None is preceded by
> an ender (`$40 RTI`, `$4C JMP`, `$60 RTS`, `$6C JMP ind`), so the markers are removed. The
> nine correctly-marked entries were re-checked and all hold: `$3007`, `$2F46`, `$2F6A`,
> `$336B`, `$3381`, `$3392`, `$4840`, `$4857`, `$2EA5`. **No routine identification changes** —
> ender-alignment is a heuristic about where a routine *starts*, and every one of these five was
> identified by disassembling it, not by the marker. Two rows are conservatively *under*-marked
> (`$2F6A` and `$2EA5` are ender-aligned but shown without `(E)`); left as-is, since an absent
> marker claims nothing. The lesson matches this document's own §"Why the prior sweep missed
> it": this heuristic is weak enough that it should never be hand-transcribed — regenerate it.

| Addr (CoK) | Fan-in | Group | What it does |
| --- | ---: | --- | --- |
| `$3007` | 11 (E) | record pointer | `STA $AB; STX $4B; ...; LSR/ROR` an 8-bit-index-to-16-bit-pointer shift primitive (already named in §"Coherence-checked" above; among the highest-fanin routines in the whole corpus). |
| `$2F7E` / `$2F9D` / `$2FA2` | 0 / 0 / 11 | **text-field blank** | `$2F7E`: `STA $B1; LDY $03F3; JSR $2E84; LDA #$20; STA ($4C),Y` looping down to `$03F2` — fills a field with ASCII space via an indirect pointer. `$2F9D` and `$2FA2` are alternate entries that `JMP $2F7E` after setting the length in A: `$2F9D` hard-codes `#$14` (20, the classic Gold Box 20-column text window width); `$2FA2` takes a caller-supplied length from `$03F4`. A clean two-arity "blank N chars" utility. |
| `$2F46` (E) / `$2F6A` | 11 / 9 | **bitmask index scan** | `$2F46`: shift-and-test loop against a mask table at `$2F76` (`$01,$03,$07,$0F,...`), incrementing `$03C8` per iteration, comparing `Y` against a target — "find/count the Nth set bit" style enumerator. `$2F6A` is `DEY; JSR $2F46; INX; INC $03C8; ...`, a thin wrapper. Called by nearly every overlay (CAMP/COM.PREP/COMBAT/COMBAT2/DUNGEON/GEN/INIT/POST.COM/SECSET64/SPELLE*) — one of the most broadly shared utilities in the kernel. |
| `$2F12` | 9 | multi-byte accumulate | `LDA $03C2; SEC; ADC $03C6; ADC $03C7; ...` then propagates the result through a 5-byte array `$03C2`-`$03C6` — a carry-propagating multi-byte add (likely a running total: gold, XP, or a scroll/screen offset). |
| `$2FF6` / `$2FF8` | 8 / 0 | (not individually decoded this round — high fan-in but out of budget; flagged for a future pass) | |
| `$3355` / `$336B` (E) | 4 / 5 | **256B context save/restore pair** | `$3355`: copies 256 bytes from `($3F),Y` and `($4C),Y` into fixed buffers `$7C00`/`$7D20`. `$336B` is the exact mirror: copies the SAME two fixed buffers back OUT to `($3F),Y`/`($4C),Y`. A symmetric "swap a working record out to / back in from fixed storage" pair, selected via `$7EB1` + a shared address-setup helper at `$3323` (not traced further). |
| `$3381` (E) / `$3392` (E) | 8 / 8 | **32B context save/restore pair** | Same shape as the 256-byte pair above but for a 32-byte (`$1F+1`) record via `($41),Y` <-> fixed buffer `$7D00`, selected via `$7EB4` + helper `$3338`. Plausibly a smaller record type (e.g. one character/monster slot vs. the 256-byte pair's larger structure) swapped by the same mechanism. |
| `$3809` | 11 | cross-overlay state transfer | A block of `LDA`/`STA` moves between the `$7C..`/`$7D..`/`$7E..` global arrays (already-established shared-globals pages), keyed by several table lookups (`$3FD2,X`, `$3731,X`/`$3750,X`). Broad fan-in (CAMP/COM.PREP/COMBAT/COMBAT2/DUNGEON/ECL64/GEN/POST.COM/SECSET64/SPELLE20/SPELLE65) is consistent with a general "hand off state between overlays" routine, most likely invoked once per overlay transition; not traced to a specific gameplay meaning. |
| `$31CD` | 4 | **KERNAL LOAD wrapper** | `JSR $321A` (save A/X/Y) `; JSR $3213` (SETNAM, see below) `; LDA #$0F; LDX $038E; LDY #$00; JSR $FFBA` (SETLFS, **secondary address 0 — the same load-address-override convention** `c64-boot-chain.md` established for the BASIC boot stub itself) `; JSR $3224` (restore) `; LDA #$00; JSR $FFD5` (LOAD) `; STX/STY $7E56/$7E57` (save end address) `; JMP $3F28` (parse the disk status channel, see below). This is the exact routine LINKER's own dispatch loop calls (`JSR $31CD` at `$2D31`, `c64-boot-chain.md` §2) — confirms every post-boot overlay load ALSO uses the SA=0 override mechanism, not just the initial BASIC-stage boot loads. |
| `$31EE` | 2 | **KERNAL SAVE wrapper** | Same shape as `$31CD` but `LDY #$FF` for SETLFS and `JSR $FFD8` (SAVE) instead of LOAD — mirrors the BASIC boot stub's own "BIN SAVE" (line 21000) subroutine, now confirmed to also exist as a callable 6502 kernel service (used by `CAMP`/`GEN`, consistent with saving party/game state). |
| `$3213` | 0 | **SETNAM via self-modifying operand** | `LDX #$FF; LDY #$FF; JMP $FFBD`. The `#$FF` operands at body offsets `$3214`/`$3216` are **poked by the caller** before the call — LINKER's own dispatch loop (`c64-boot-chain.md` §2) does exactly this (`STA $3214` / `STA $3216` using its per-overlay name-pointer table) — i.e. this is a shared SETNAM helper whose "argument" is passed via self-modifying code on the immediate operands of its own `LDX`/`LDY`, not via registers. `$322E` and other name-driven kernel calls (below) reuse this same helper. |
| `$322E` | 0 | **file-existence probe** | `JSR $3213` (SETNAM) `; LDA #$0F; LDX $038E; LDY #$0F; JSR $FFBA` (SETLFS, SA=15 — command-channel style) `; JSR $FFC0` (OPEN) `; JSR $3F37` (read+parse the disk error channel into `$03F1`, the same tail `$31CD`'s LOAD path falls into on failure) `; JSR $FFE7` (CLOSE) `; LDA $03F1; RTS`. Opens-then-immediately-closes a named file purely to read back its disk-status code — a "does this file exist / is the right disk in the drive" check that never actually transfers data. Zero JSR-fanin in the census (reached some other way, e.g. an indirect call this static scan can't see) but its own internals are unambiguous. |
| `$3F28`-`$3F75` | (reached via `JMP` from `$31CD`, not JSR) | **disk error-channel reader** | `LDA $7E9F` (a "silent mode" flag) — if the flag is set, synthesizes a canned status without querying the drive; otherwise `JSR $FFB4`/`JSR $FF96` open the command channel (device 8, secondary 15) and `JSR $FFA5`/loop parses ASCII digits from it into a 2-digit numeric code in `$03F1`, stopping at CR. This is the routine that turns a KERNAL disk error message (e.g. "63, FILE NOT FOUND") into the numeric code LINKER's own `BEQ $2D3C` tests after a load — see §9.5. |
| `$3025` | 6 | keyboard/joystick poll | `LDA $DC00` (CIA1 port A — the standard C64 keyboard-matrix/joystick-1 read) `; AND #$1F; STA $03F0`. Called from the same neighbourhood as the disk-status/retry cluster (`$4298`, below) — consistent with "wait for the user to press a key/fire button after swapping disks". |
| `$4298` | (reached via `JSR` from LINKER's own load-retry path, `c64-boot-chain.md` §2) | **load-failure / disk-swap handler** | Sets a couple of state flags, calls the already-documented `$3DDC`/`$3DE8` zero-buffer helpers, then a small state machine around `$03F0`/`$03F4`/`$7F12` (`ORA #$40`) that calls text-positioning helpers (`$3438`/`$343E`/`$3422`, an indirect-string-blit cluster keyed by `$9E8C,X`/`$9F8C,X` — the `$9Exx` page is the established `ITEMNAMES` staging area) before returning. Consistent with a generic **"tell the user to insert the right disk and press a key" prompt**, not a fatal error path — see §9.5. |
| `$4840` (E) / `$4857` (E) | 3 / 6 | **bank-switch trampoline pair** | `$4840`: `PHA; LDA $01; STA $038B; ...; JSR $3B70; PLA; RTS` — saves the CPU port (`$01`, the LORAM/HIRAM/CHAREN memory-config register) to `$038B` before switching banks and installing an IRQ vector. `$4857` is the mirror: restores `$01` from `$038B`, conditionally re-enables interrupts (`CLI`) based on the saved value's bits, `PLA; RTS`. A matched "bank out / do something / bank in" pair, reachable both directly (`JSR $4840` from `$3B05` etc. — corrected 2026-08-12, `$3B02` is the `LDA $03F8` three bytes earlier) and via two of LIBRARY's own jump-table slots (§9.2's correction). |
| `$3B2C` / DoK `$3A98` | 1 / 1 | **VIC-II/CIA2 video-bank setup** | `LDA #$03; ORA $DD02; STA $DD02` (CIA2 serial/VIC-bank select bits) `; LDA CIA2_PORTA; AND #$FC; STA CIA2_PORTA; LDA #$34; STA VIC_MEMPTR; LDA #$10; ORA VIC_CTRL2; STA VIC_CTRL2; LDA #$CC; STA $0288; RTS`. Byte-identical in structure between titles (only the absolute address differs); called exactly once, from `INIT`, in **both** titles — strong cross-title corroboration that this is the one-time video-mode/screen-and-charset-bank setup run at game start. In DoK this routine is reachable via LIBRARY's own jump-table slot 2 (`$2DCE`); in CoK the same routine exists at `$3B2C` but is not one of the 32 table slots — reached only by direct `JSR` from `INIT`. |
| `$3EF6` | 1 (POST.COM) | shift/subtract arithmetic | `LDA #$00; STA $7F3F; STA $7F40` (the SAME two shared-globals bytes `$3EEC`, documented in the original solve, also zeroes) `; LDY #$10` (16 iterations) `; ASL $4C; ROL $4D; ROL $7F3F; ROL $7F40; SEC; LDA $7F3F; SBC $AB; ...` — a 16-iteration, 4-byte-wide shift-and-subtract loop, the classic long-division/multiply-by-restoring-subtraction shape, operating on the same `$4C` pointer-low byte used pervasively elsewhere as an indirect-addressing register. Plausibly a coordinate/offset scaling primitive; not traced to a specific caller-visible meaning. |
| `$2EA5`/`$2EAB`/`$2ECF` | 1/4/0 | **name/text field editor** | Reads and increments `$03CD` (the SAME cursor/field-index global the sibling-owned `$2E9A`/`$2E49` name-scrub routine uses), calls `$4843` — a THIRD entry point into the `$4840` bank-switch routine, landing 3 bytes past its preamble, on a small counter-increment tail (`INC $4BC6,X; ...; INC $4BEC/$4BED`) that plausibly drives a blinking text-entry cursor's animation timer. Ties this cluster and the `$3061` keyboard-poll/field-clear code below into one coherent "name/text entry" subsystem. |
| `$3061` | 2 | field-entry driver | Clears a 40-byte line buffer at `$7A00`, then drives the `$2E84`/`$30E2`(`$1C`=28-char fill)/`$3046`/keyboard-poll (`$03F0` vs `$1F`) cluster in a loop — the outer driver for the name/text-entry subsystem above. |

Several addresses that appeared in the top-40 cross-side fan-in list were left undecoded this
round for budget reasons and are flagged as a natural next slice: `$3C43`/`$3C47` (fan-in 13/11,
called almost exclusively by `ECLnn` files — plausibly an ECL-VM-facing kernel service, not a
generic overlay one), `$435B`/`$3B02` (fan-in 12/12, part of a large state-machine cluster
around the bank-switch pair), `$4020` (fan-in 11, called by `GEOnn`/`WALLSETnn`/`PICnn` —
plausibly a graphics/tile-record setup routine).

### 9.5 `FINAL`: what actually happens

> **Index corrected 2026-08-13 by the C1.9d round (§10.1): `FINAL` is at index 8, not 6.**
> This section originally said index 6 throughout; that was wrong (a hand-transcription slip
> — `c64-boot-chain.md` §2a's own *worked table* always had index 8 right, only its prose and
> this section's prose repeated the wrong number). The reasoning below about what happens when
> `FINAL` is dispatched is unaffected by the correction; only the literal index number is
> fixed, here and in every occurrence below.

`FINAL` is named as dispatch-table index 8 in both titles' LINKER/LIBRARY overlay table (see
`c64-boot-chain.md` §2a) but matches no file on any side of either title — confirmed there by
an exhaustive directory scan. This round traces what LINKER's own load-and-retry loop
(`c64-boot-chain.md` §2) actually does if that index is ever selected, using the now-readable
`$31CD`/`$3F28`-`$3F75`/`$4298` cluster documented in §9.4:

1. LINKER sets up the name pointer and length from its table (`FINAL`, 5 chars), `JSR $31CD`.
2. `$31CD` performs an ordinary `SETNAM`/`SETLFS(SA=0)`/`LOAD`. Since no file named `FINAL`
   exists on any disk this loader could have in the drive, the KERNAL LOAD call fails.
3. `$31CD` falls through into `$3F28`, which (per §9.4) reads the KERNAL command channel and
   parses the disk drive's own ASCII error message into a numeric code in `$03F1` — for a
   missing file this is the standard 1541 error **63, "FILE NOT FOUND"**.
4. LINKER's own `BEQ $2D3C` (branch if the load "succeeded", i.e. `$03F1 == 0`) is NOT taken;
   control falls to `JSR $4298` — the disk-swap/retry handler, which per §9.4 clears some
   state, sets a flag bit in the same `$7F12` global LINKER's own "next program" logic uses,
   and drives a text-prompt-drawing cluster keyed off `$9Exx`-page name-staging data — before
   `JMP $2D1B`, which restarts the SAME dispatch-table index.

**This is the identical path an ordinary "please insert side N" prompt would take for any
overlay when the wrong disk is in the drive** — `$4298`/`$3025` (keyboard poll) is a *general*
disk-swap handler, not `FINAL`-specific machinery. Since `FINAL` names a file that exists on
*no* disk anywhere in this 12-side, 2-title corpus, the most defensible reading is: **if
`FINAL` is ever actually selected, the game asks the player to insert a disk it can never be
satisfied by, and loops the retry prompt indefinitely** rather than crashing outright — a
labelled inference, not a proof (this was not, and per the project's static-analysis-only
rules for this slice could not be, confirmed by actually driving LINKER to select index 8 and
watching it happen). Whether index 8 is ever reachable in real play at all (a `$7F11` value of
8 would have to be written somewhere) was not determined this round — closed (as a
corpus-wide negative, not a proof) by the C1.9d round; see [§10.1](#101-final-index-corrected-to-8-and-a-corpus-wide-7f11-census).

### 9.6 `SECSET02`/`10`/`64`: refined negative

The prior round left `SECSET64` as "code-shaped bytes at an unverified origin" and
`SECSET02`/`SECSET10` (Champions side 1 only) as clearly non-code (`$FF`-run / GCR-sync-like
openings). With LIBRARY's interior now readable, this round specifically searched it — and the
rest of the corpus — for a reader.

**No reader found, by two independent methods:**

1. **Name search.** No file anywhere in the CoK corpus (all 6 sides, `all_bodies`) contains the
   literal ASCII string `"SECSET"` as a would-be load-name, except the three `SECSET*` files
   themselves. The one substantive hit — `ITEMNAMES` contains the byte sequence
   `...GEO00\x00SECSET00\x00SQRDATA0...` — is a **passive catalog/prefix table** (base
   resource-family names, paralleling the project's established `GEO`+hex-block-id naming
   convention), not a load-call site; `ITEMNAMES` is itself the loader's own name-staging
   buffer (`c64-boot-chain.md` §1a table), so this reads as leftover/example content in that
   staging area rather than an active reference. (Two further raw hits, inside directory-label
   pseudo-entries like `"OF KRYNN (LADER)"`/`"----------------"`, are literal fragments of the
   disk's own directory-track bytes being mis-read as a file body — not code, not a reference.)
2. **Self-consistency, the same measurement that identified LIBRARY's own true origin.**
   `SECSET64`'s own absolute JSR/JMP operands land inside its own claimed body span at a rate
   **far below** LIBRARY's own signal, at every origin tried:

   ```
   SECSET64 (CoK) self-consistency:
     org=$4000 (its own PRG header): 3/138  (2.2%)
     org=$3FD8 (best cross-side sweep_origin hit, entryish=10/122): 3/138  (2.2%)
     org=$2DC8 (LIBRARY's real origin): 7/138  (5.1%)
   LIBRARY self-consistency @ its own real origin, for comparison:
     CoK: 444/532  (83.5%)      DoK: 425/513  (82.8%)
   ```

   > **Corrected 2026-08-12 by the lead session.** This comparison line read "roughly 40%"
   > until it was checked. Running the exact function the SECSET64 rows above use —
   > `self_consistency(kernel_body(t), KERNEL_ORIGIN)` — returns 444/532 and 425/513, i.e.
   > ~83% in both titles, not ~40%. The wrong figure is the *origin-sweep* score from a
   > different measurement entirely (19 entryish / 48 inside = 39.6%, §"Why the prior sweep
   > missed it"), pasted into a slot that calls for self-consistency. Two different metrics
   > with different denominators; do not mix them. **The SECSET64 negative is unaffected and
   > in fact stronger than stated** — the real contrast is 83% against 2-5%, not 40%.

   The `sweep_origin` "hit" at `$3FD8` (10 entryish / 122 inside, out of the full 400-address
   cross-side census) is much weaker evidence than it first looks: with 400 known addresses
   spread across LIBRARY's ~6.9 KB range, *any* 1535-byte blob of quasi-code-shaped bytes would
   be expected to land "inside" a fair number of them by chance alone, and the low
   self-consistency ratio shows `SECSET64`'s own internal jumps mostly do NOT land within its
   own body at that origin (or any other origin tried) — the opposite of what a genuinely
   resident routine looks like. `test_secset64_self_consistency_is_far_weaker_than_library`
   pins this quantitatively for both titles.

**Refined conclusion:** the evidence now leans more toward "SECSET64 is non-code resource
data whose bytes occasionally alias JSR opcodes by chance" than the prior round's more neutral
"code-shaped bytes, unverified origin" framing — but this is not a proof either, and no positive
identification of what kind of data it holds was reached. `SECSET02`/`SECSET10` are unchanged
from the prior round (clearly non-code by their opening bytes; no reader found for them
either). Reported as a genuine, still-open negative, not resolved.

### 9.7 DoK `CODE00`/`CODE01`/`CODE03`: first pass

All three appear only in DoK, are heavy LIBRARY callers in the cross-side census (fan-in up to
14, in the same company as `CAMP`/`COMBAT`/`DUNGEON`/`GEN`/`POSTCOM` — ordinary $0800-overlay
behaviour), and are referenced only inside the same kind of passive catalog string this round
found for `SECSET64` (`ITEMNAMES` contains `...MFILE00\x00CODE00\x00...`) plus directory-label
artifacts — no active load-by-name call site was found for any of them either.

Testing self-consistency at the established `$0800` overlay-slot origin (the address every
known `$0800`-slot file, e.g. `GEN`/`DUNGEON`, actually runs at) separates them:

```
GEN      self-consistency @ $0800: 249/678  (36.7%)  -- known-good baseline
DUNGEON  self-consistency @ $0800: 475/813  (58.4%)  -- known-good baseline
CODE01   self-consistency @ $0800:  36/423  ( 8.5%)
CODE03   self-consistency @ $0800:  33/411  ( 8.0%)
CODE00   self-consistency @ $0800:   1/328  ( 0.3%)
```

**`CODE01` and `CODE03`** show real, non-zero self-consistency at `$0800` — clearly weaker than
`GEN`/`DUNGEON`'s but well above `SECSET64`'s near-zero showing at any origin (§9.6) — combined
with their ordinary-overlay-shaped LIBRARY call pattern, the best-supported first-pass reading
is that they ARE further `$0800`-slot overlay content, most likely loaded by `GEN`/`DUNGEON`/
etc. themselves as a second dispatch tier `c64-boot-chain.md` §8 already flagged as plausible
(LINKER's own 8-name table has no `CODE*` entries, so something else must load them) — but no
second-tier dispatch table analogous to LINKER's was located this round. `test_dok_code_overlays_first_pass_self_consistency_at_0800`
pins these two numbers.

**`CODE00`** does NOT fit this pattern — its self-consistency at `$0800` is close to zero, and
its opening instructions (`LDA #$03; STA $8011; ...`) reference an address (`$8011`) far above
what any `$0800`-resident file's own body could reach. The most likely reading is that
`CODE00` runs at some OTHER, not-yet-determined address (its own internal `JSR $8xxx`/`JMP
$8xxx`-shaped references hint at somewhere in the `$8000`+ region, but this was not confirmed
by a self-consistency check at any specific candidate origin, so it is reported as unresolved
rather than guessed). Genuinely open; a natural next step for whoever picks up this thread.

## 10. C1.9d: closing the four loose ends

This round (2026-08-13) went back to the four items §9 explicitly left open, using two new
primitives (`find_abs_writes()` / `immediate_before()`, and `self_consistency_excluding()`) —
see [Tooling](#tooling) below. Two are closed with real, corroborated positive findings
(`FINAL`'s corrected index and `CODE03`'s residence); two are refined negatives (`SECSET64`/
FASTL.O and `CODE00`). All commands below reproduce with `tools/c64_kernel.py`.

### 10.1 `FINAL`: index corrected to 8, and a corpus-wide `$7F11` census

**The index was wrong.** §9.5 (and `c64-boot-chain.md` §2a's prose) said `FINAL` sits at
dispatch-table index 6. It does not — `c64-boot-chain.md`'s own *worked table* in that same
section always listed `FINAL` at index 8; the prose sentences in both docs simply repeated a
wrong number, most likely from an early draft that miscounted padding entries. Re-decoding all
10 raw slots (not just the 8 `find_dispatch_table()` treats as "real") settles it directly —
`tools/c64_kernel.py:dispatch_padding_slot_names()`, reproduce with
`python tools/c64_kernel.py padding --title cok` (and `--title dok`):

```
cok: all 10 raw dispatch-table slots
  [6] len= 8 addr=$2D66  b'FINALCAM'  <- PADDING (garbled alias)
  [7] len= 7 addr=$2D66  b'FINALCA'   <- PADDING (garbled alias)
  [8] len= 5 addr=$2D66  b'FINAL'    <- real overlay name
  [9] len= 4 addr=$2D6B  b'CAMP'     <- real overlay name

dok: all 10 raw dispatch-table slots
  [6] len= 8 addr=$4ACA  b'FINAL\x00CA'  <- PADDING (garbled alias)
  [7] len= 7 addr=$4ACA  b'FINAL\x00C'   <- PADDING (garbled alias)
  [8] len= 5 addr=$4ACA  b'FINAL'       <- real overlay name
  [9] len= 4 addr=$4AD0  b'CAMP'        <- real overlay name
```

Padding slots 6 and 7 share `FINAL`'s own address (that is what makes them "padding" —
`find_dispatch_table()`'s length check is what tells them apart from the real slot) but decode,
at their own (wrong) length, to garbage in **both** titles — `FINALCAM`/`FINALCA` in CoK (reading
past `FINAL` into the front of `CAMP`), `FINAL\x00CA`/`FINAL\x00C` in DoK (same idea, but
carrying the NUL separator DoK's encoding uses). Neither padding slot's decoded bytes match
`FINAL`, `CAMP`, or any other real name — so even if a padding slot were ever selected, LINKER
would try to load a file named `FINALCAM`/`FINALCA` (or DoK's NUL-embedded equivalents), which
also exists nowhere in the corpus, and would hit the identical §9.5 retry-loop path `FINAL`
itself does. **This closes the "is 6/7 secretly meaningful" question the wrong index number
invited**: they are not alternate content, they are the same kind of table filler `FINAL`
itself turned out to be, just doubly so (wrong address usage AND wrong length).

**Corpus-wide reachability census.** The open question §9.5 left — is index 8 (or the two
padding indices) ever actually *written* to `$7F11` anywhere in the corpus, i.e. could `FINAL`
ever really be dispatched — is answered by a decode-accurate scan of every side of both titles
for an absolute `STA`/`STX`/`STY $7F11` (`find_abs_writes()`), with the literal value resolved
wherever it is loaded by an immediate `LDA`/`LDX`/`LDY` right before the store
(`immediate_before()`). Reproduce: `python tools/c64_kernel.py writesites --title cok --addr
0x7F11` (and `--title dok`):

```
cok: 11 write(s) to $7F11 across 7 file(s)
  CAMP       off=93     STX $7F11   literal LDX #$01 (1)
  COM.PREP   off=304    STA $7F11   literal LDA #$02 (2)
  COM.PREP   off=310    STA $7F11   literal LDA #$05 (5)
  COMBAT2    off=5495   STA $7F11   literal LDA #$05 (5)
  DUNGEON    off=2109   STA $7F11   literal LDA #$09 (9)
  DUNGEON    off=4846   STY $7F11   computed (not an immediate load)
  DUNGEON    off=8343   STA $7F11   computed (not an immediate load)
  GEN        off=7192   STX $7F11   literal LDX #$01 (1)
  INIT       off=450    STA $7F11   literal LDA #$00 (0)
  INIT       off=504    STA $7F11   literal LDA #$01 (1)
  POST.COM   off=3327   STA $7F11   computed (not an immediate load)
```

DoK's own census (11 sites, the same 7 file roles) is structurally identical and resolves to
the same literal set. Every **literal** write across both titles resolves to a value in
`{0, 1, 2, 3, 5, 9}` — real overlay indices, matching `GEN`/`DUNGEON`/`COMBAT`/`INIT`/
`COM.PREP`/`POST.COM`/`CAMP` — and 6, 7, and 8 never appear. `test_7f11_write_sites_never_resolve_to_a_padding_or_final_index_literally`
pins this in both titles.

One of the three apparently-computed sites is itself a **byte-alias false positive worth
recording**: CoK `POST.COM` offset 3327's preceding bytes decode as `ORA ($32,X)`, which looks
like a data-driven dispatch at first glance — but the same bytes (`$14FD` onward) are also
referenced by a nearby instruction as an ordinary **decrement table**
(`SBC $14FD,X` inside an unrelated multi-byte countdown loop at `$14C9`-`$14EF`, confirmed by
`find_callers`'s only hit for `$14FD` being that `SBC`, never a `JSR`/`JMP`), i.e. `$14FD` is
DATA consumed by that loop, not a code entry point; the real, JSR/JMP-reachable trampoline for
this pattern is one byte later, at `$14FF` (`STA $7F11` directly, with 5 real callers found:
3 inside `POST.COM` itself passing literal `A` values `0`/`0`/`1`, matching DoK's equivalent
trampoline at `$1398`, which has 3 real callers passing `1`/`3`/`1`). The remaining two
computed sites (`DUNGEON` offset 4846, a `LDY #$05`/conditional-`DEY` pair bounded to `{4,5}`;
`DUNGEON` offset 8343, a deep command-fetch chain reading the currently-executing
dungeon-script byte stream, `JSR $1C5E` → `$171C`, whose `CMP #$00`/`#$01`/`#$02`-style branch
structure strongly suggests a small enumerated set of cases but was not fully traced to a
closed-form value this round) stay honestly **open** — their real values depend on runtime
script/game-state content a static slice cannot enumerate, not on a literal this scan could
miss.

**Net verdict on `FINAL`:** the dispatch-table entry is real (confirmed structurally, both
titles), sits at the corrected index 8, and — as far as a corpus-wide static write-site census
can show — is never actually assigned to `$7F11` anywhere in either title's shipped code,
literally or (for the two sites this round could fully trace) via any computed path either. The
two still-computed sites keep this a **narrowed, not fully closed**, honest negative: `FINAL`
is very likely dead/vestigial content (the "cut endgame overlay" reading §9.5 already floated
remains the best-supported story), but "never observed to be written, in the code this round
could fully trace" is the precise claim the evidence supports, not "provably unreachable."

### 10.2 `SECSET02`/`10`/`64`: FASTL.O ruled out

The C1.9d brief's own suggested next lead for `SECSET64` — that `FASTL.O` (the drive-side
fastloader, `docs/engine/research/c64-boot-chain.md` §4) might be the thing that reads it, since
it is the one file in this corpus that talks raw sectors — does not pan out. `FASTL.O`'s full
429 bytes (byte-identical between titles) disassemble cleanly at their own established `$B700`
origin end to end: it is a generic serial-bus bit-banger (KERNAL `ILOAD`-vector hijack, CIA2
data-direction setup, `CIOUT`/`UNLSTN`/`TALK`/`ACPTR`-style byte-at-a-time transfer loops) with
every drive-protocol parameter as an immediate operand. There is no `"SECSET"` ASCII anywhere in
the body and no absolute store naming `$4000` (the one address a per-file dispatch-table entry
would plausibly reference, since every ordinary file's PRG header claims it) —
`test_fastl_o_contains_no_secset_reference_or_per_file_table` pins both checks, in both titles.
This matches, and sharpens, the existing doc's own reading that "the title- and file-specific
target addresses must be supplied by whatever calls into this uploader" — it is now confirmed
that whatever supplies them is not FASTL.O itself. `SECSET02`/`SECSET10`/`SECSET64` remain an
unresolved, still-negative identification: no reader was found in LIBRARY's interior (§9.6) or
in FASTL.O (this round); what kind of data they actually hold is still unknown.

### 10.3 `CODE00`/`CODE01`/`CODE03`: `CODE03` solved at `$8000`; `CODE01` leans the same way; `CODE00` still open

§9.7's `$0800` self-consistency numbers are real but were the wrong comparison to stop at.
Sweeping the SAME self-consistency measurement across the full 16-bit address space (both a
coarse full-range pass and, for `CODE03`, an ender-anchored self-referential sweep like the one
that originally found LIBRARY's own `$2DC8`) turns up a much stronger signal at **`$8000`** for
all three files, unfiltered — `python tools/c64_kernel.py coderesidence --title dok --file
CODE03` (and `CODE01`/`CODE00`):

```
            $0800            $8000            $C000
CODE00    1/328  (0.3%)    56/328 (17.1%)    2/328  (0.6%)
CODE01   36/423  (8.5%)   119/423 (28.1%)    4/423  (0.9%)
CODE03   33/411  (8.0%)   204/411 (49.6%)   23/411  (5.6%)
```

`$8000` clearly beats both the naive `$0800` overlay-slot guess and the established `$C000`
graphics-driver slot for every one of the three files, unfiltered, with no cherry-picking.

**This raw comparison is itself confounded**, though: LIBRARY's own real span (`$2DC8`-`$4AF3`
in DoK) is a huge, heavily-called region every ordinary overlay legitimately references, so ANY
candidate origin whose window happens to reach into it scores well "for free," independently of
whether the candidate file is really resident there. `self_consistency_excluding()` (new this
round) removes that confound by ignoring operands landing inside LIBRARY's own range before
scoring. With it:

```
            $0800 (excl.)    $8000 (excl.)    $C000 (excl.)
CODE00    1/200  (0.5%)     56/200 (28.0%)    2/200  (1.0%)
CODE01   36/313 (11.5%)    119/313 (38.0%)    4/313  (1.3%)
CODE03   33/313 (10.5%)   204/313 (65.2%)    23/313  (7.3%)
```

**`CODE03` is now SOLVED at `$8000`, corroborated two independent ways:**

1. **Self-referential sweep.** Excluding LIBRARY's range, `CODE03`'s own JSR/JMP operands land
   inside a candidate `$8000`-origin window at **65.2%** — a full order of magnitude above its
   `$0800`/`$C000` alternatives (10.5%/7.3%) and comfortably inside the corpus's established
   real-code baseline range (GEN 36.7%, DUNGEON 58.4%, LIBRARY ~83%, all measured at their own
   *known-correct* origins). An ender-anchored self-referential sweep (the same technique that
   originally solved LIBRARY, applied to `CODE03` against its own operand values) independently
   picks the identical plateau, `$7FE4`-`$8000`.
2. **Cross-file target sweep.** A corpus-wide JSR fan-in census (files other than
   `CODE00`/`01`/`03`, fan-in ≥ 2, LIBRARY-range targets excluded to remove the same confound)
   fed into `sweep_origin()` against `CODE03`'s own body picks `$8000` as the **unique** best
   `entryish` score (16), clearly ahead of the runner-up (12) — an origin discovered from
   *other files' real call sites into `CODE03`*, independent of `CODE03`'s own internal jumps.

Both techniques agreeing on the same address, from two genuinely independent evidence sources,
is exactly the kind of convergence this project's own methodology treats as a real finding, not
a coincidence. Combined with the already-established fact that `CODE03` makes 5 genuine `JSR`
calls into GDRIVE00's discriminating `$C04B`-`$C066` tail range (confirmed separately, not
re-derived here), **`CODE03`'s residence is `$8000`** — a third, previously-unmapped
mutually-exclusive driver slot in this project's memory map, structurally parallel to `$C000`'s
GDRIVE family (nothing else in the established map claims `$4B00`-`$7DFF` or `$8000`-`$AFFF`).
`test_code03_residence_is_dollar8000_far_more_than_0800_or_c000` pins both the ratio margins and
the cross-file sweep's exact address.

**`CODE01` shows the same direction of evidence, more weakly.** Its LIBRARY-excluded `$8000`
score (38.0%) clearly beats its own `$0800` (11.5%) and `$C000` (1.3%), and its self-referential
sweep (LIBRARY-excluded) independently peaks in the same `$8000`-`$8050` neighbourhood
(39.9%) — consistent with `CODE01` being a second, mutually-exclusive occupant of the same
`$8000` slot `CODE03` occupies, on the pattern of `GDRIVE00`/`01`/`02`/`04`/`05` all sharing
`$C000`. This round did not run `CODE01` through the cross-file target sweep (budget), so it is
reported as a real, corroborated *lead* rather than "solved" the way `CODE03` is.

**`CODE00` stays genuinely unresolved — a materially different case, not just a weaker version
of the other two.** Its own best self-referential peak (LIBRARY-excluded) sits at `$4AE0`-
`$4B50`, i.e. right against LIBRARY's own upper boundary — too close to separate cleanly from
simple boundary-overlap noise. Its `$8000` score (28.0% excluded) IS real (clearly better than
its own `$0800`, 0.5%) and is consistent with an independent micro-observation — `CODE00`'s
very first instruction is `LDA #$03; STA $8011`, and if `org=$8000` that store's target
(`$8011`) lands exactly 15 bytes into `CODE00`'s own body, on the immediate operand of a nearby
`LDA #$FF` — a plausible self-modifying-code idiom, not proof — but `CODE00`'s `$8000` signal is
clearly weaker than `CODE03`'s (28.0% vs 65.2%) and its own strongest peak points elsewhere.
`test_code00_residence_stays_genuinely_unresolved_unlike_code03` pins this asymmetry so a future
round that finds a cleaner `CODE00` origin will see this test's assumption go stale and get
flagged for review, rather than the doc quietly going out of date.

## Tooling

- **`tools/c64_kernel.py`** -- `call_census()` (unbiased JSR fan-in), `sweep_origin()`
  (byte-exact, non-page-aligned content-matching sweep), `best_hosts()` (ranks every side-1
  file), `self_consistency()` (type-a evidence: a file's own operands vs. its claimed origin),
  `find_callers()` (per-target caller detail), plus a CLI (`census` / `sweep` / `selfcheck` /
  `show`) that reproduces every command quoted in this document. **C1.9c additions:**
  `all_bodies()` (unions every side's directory, not just side 1 -- needed for the §9.1 cross-
  side census), `library_jump_table()` (decodes LIBRARY's leading `JMP abs` run, §9.2),
  `stop_prg_diff()` (byte-compares `STOP.PRG` against LIBRARY's own slot-0 target, §9.3), and
  three more CLI subcommands (`fullcensus` / `jumptable` / `stopcheck`) reproducing this
  section's commands.
- **`tools/test_c64_kernel.py`** -- synthetic tests for the four original search primitives
  (each with a documented mutation check: implementation temporarily broken, confirmed red,
  restored, confirmed green -- see each test's docstring for exactly what was changed) plus
  three real-corpus tests pinning the original round's finding (LINKER's true origin,
  LIBRARY's sweep ranking, and the cross-title name-scrub match). **C1.9c additions:** two more
  synthetic test classes (`LibraryJumpTableSyntheticTests`, `StopPrgDiffSyntheticTests`, both
  mutation-checked the same way) plus a `LibraryInteriorTests` real-corpus class pinning: the
  cross-side `all_bodies()` union is real (a file only on a later side is found), LIBRARY's
  jump-table slot counts (32 CoK / 3 DoK), slot 0's identity as the BASIC boot SYS target, the
  `$0803` overlay trampoline in both titles, the `STOP.PRG`/LIBRARY byte-exact match (§9.3),
  `SECSET64`'s weak self-consistency relative to LIBRARY's own (§9.6), and DoK's
  `CODE00`/`CODE01`/`CODE03` first-pass self-consistency split (§9.7) -- all skipped cleanly
  when `D:\Games\Emulator\C64\Goldbox` is absent, all previously seen to fail under a real
  mutation and confirmed to pass again after reverting it.

All addresses, offsets, and byte counts in this document were produced by the commands shown
inline, re-run against `tools/c64_kernel.py` in this session -- not recalled from memory.
