# Amiga combat geometry: research step 1 (2026-11-11)

Status: in progress. Milestone 3, phase 2 (user answer "2 start it"). No profile, no code change, no deploy.
Goal: a measured Amiga battle grid (origin, cell size, columns, rows) with source and hash, so an
`AMIGA_PAL` presentation profile can be added (milestone 3 exit criterion 3).

## What is measured here

Source: `{external-workspace}/batch03_work/e2e-adf-decoded-private/ChampionsOfKrynn/disk1/` (ADF extraction, read-only).

| Item | Measured value | Method |
|---|---|---|
| `game` executable | 479,844 bytes, AmigaDOS HUNK_HEADER, 101 hunks, all typed CODE | `tools/amiga_hunk_map.py` |
| Hunk table | sizes sum to 421,716 bytes; 12,317 relocation entries | same tool; the sizes, 4 bytes per relocation entry and hunk headers are consistent with the file length (not an exact byte reconciliation) |
| `scrn1b.lbm` | 320×200, 5 planes, 32-colour CMAP, ByteRun1 compression (comp=1), CAMG 0x4000 | IFF BMHD/CMAP/CAMG read |
| `scrn2.lbm` | 320×200, 5 planes, masking on, CAMG 0x4000 | same |
| `charS.LBM`, `charT.LBM` | 320×200, 5 planes, CAMG 0x4000 | same |
| `text1.lbm`, `text2.lbm`, `gothic.lbm` | 240×88, 320×89, 128×32 (text/font panels) | same |

Reading: the Amiga screen images are 320×200 with 5 bitplanes (32 colours). That matches the DOS
native framebuffer (320×200), but the screen images are not proof of the battle grid.

## What is not measured yet

- The battle grid itself (origin, cell width and height, columns, rows). The DOS values are
  `originX 8, originY 8, cellW 24, cellH 24, cols 7, rows 7` (`packages/engine/src/render/combatScreen.ts`,
  COAB oracle). They are not assumed for Amiga.
- Which `scrn*.lbm` or `LBM` image is the battle backdrop, and where its grid lies.
- Which hunk holds the battle routine. The hunks carry no symbols (`symbols=0` everywhere), so the
  routine must be located by its code.

## Next step (one unit per tick)

1. Disassemble the code hunks with Capstone (installed: 5.0.7, `CS_ARCH_M68K`), starting from the hunk
   that references the LBM/battle assets (relocation targets) and searching for battle-related constants
   (for example cell size 24 or 0x18 with a 7-column loop).
2. Confirm the candidate routine by behaviour, not by constants alone: its draw calls must place
   sprites on a 7×7 grid of 24-pixel cells at (8, 8) in the 320×200 screen, the same as DOS.
   If it does not, record the measured values instead.
3. Record the values with source (hunk index, instruction offset) and a hash of the bytes read.

## Caveats

- Amiga hunk code may be built from a different layout than DOS. Use only measured values.
- Capstone disassembles; it does not identify routines. Each identification is a dated note.

## Step 2 (2026-11-11): immediate-pair scan, negative result

Tool: `tools/amiga_immediate_scan.py` (Capstone M68K sweep; on a decode failure it skips 2 bytes and
resynchronises). Coverage: 412,822 of 421,716 code-hunk bytes decode (97.9%). A plain linear sweep
stops at data and decodes far less, so its zero count was not evidence.

Pattern: a `moveq #24` (or `#$18`) followed within 40 instructions by a `#7` compare or move.

Result: 2 sites (hunks 70 and 95). Both are false positives:
- hunk 70 at 0x162c: `moveq #$18,d2; move.l d2,-(a7); jsr $f6.l` (24 passed as a call argument).
- hunk 95 at 0x17c4: `moveq #$18,d2; move.l d2,-(a7); move.l #$10000,-(a7); jsr $68.l` (an allocation-style call).
Neither is battle-grid code.

Not decided: the battle routine is not yet located. The immediate pattern is too weak on its own. Next
method (one unit): find the battle code through its data (the battle screen references its backdrop
and sprite tables), or through a `mulu`/`muls` by 24 used to place cells, and confirm by behaviour.
Not changed: no profile, no value recorded for Amiga.

## Step 3 (2026-11-11): asset-name references, negative result

Asset names in the executable (file offsets): `scrn1b.lbm` at 0xF172 (hunk 7, rel 0x26A); `COMSPR` at 0xDFB7
(hunk 6, rel 0xC3). Other names found: `SPRIT`, `CPIC`, `.lbm`, `.daa`, `.DAX`. `DUNGCOM`, `RANDCOM`,
`WILDCOM`, `8X8D` do not occur as plain text.

Tool: `tools/amiga_asset_refs.py` (PC-relative operand scan within the hunk, Capstone detail).
Result: no PC-relative reference within 0x40 bytes of either string.
Also checked: no code-hunk longword equal to the addend (0x26A, 0xC3). So the strings are not loaded by a direct
PC-relative or absolute reference in the code hunks.

Interpretation (not verified): the loader reads names through a pointer table or a base register set up at
start-up. Not yet located. No battle routine identified; no Amiga geometry recorded.
Next method (one unit): find the pointer table that holds these names (scan for longwords that point into hunk 7's
string area), then trace which code reads that table.

## Step 4 (2026-11-11): exact-target reference scan, negative result

Re-ran the PC-relative scan with an exact target match (the earlier step 3 scan used a loose window of
0x40 bytes, which is not an exact match). Exact matches for `scrn1b.lbm` (hunk 7, rel 0x26A) and `COMSPR`
(hunk 6, rel 0xC3) within their own hunks: none.

Conclusion: the names are not reached by a PC-relative reference inside their hunk, and not by a stored
longword addend. Likely they are reached through a base register (for example an `a4`-relative table, as in
hunk 95 `movea.l $380(pc),a4`) or from another hunk. This route has produced three negative results and
needs a different method before another scan is useful.

Options for the next decision (not decided here):
(a) Trace the `a4` global base from its start-up load and map the table it indexes (multi-tick disassembly).
(b) Pick a different entry point: the Amiga combat screen may be drawn from the DOS-side screen layout note
    (`cok-dos-screen-layout.md`) only after the Amiga grid is measured; no proxy values are used.
(c) Stop milestone 3 phase 2 for Amiga and record the Amiga profile as "no measured data" (the state the
    design note already allows).

## Step 5 (2026-11-11): correction of steps 3-4, and the a4 trace (not resolved)

Correction: the PC-relative operand check in steps 3 and 4 never matched. Capstone reports PC-relative memory
operands as type 3, not type 2, and the displacement is not on `br_disp`. The earlier "no reference" results
were produced by a scan that could not see any PC-relative operand, so they were not evidence. The corrected
scan (`tools/amiga_pc_refs.py`, which parses the `$xx(pc)` text of each operand, target = instruction address
+ 2 + displacement) finds no exact PC-relative reference to `scrn1b.lbm` (hunk 7, 0x26A) or `COMSPR`
(hunk 6, 0xC3). The negative result therefore stands, now on a valid scan.

a4 trace: the hunk prologues load the base register with `movea.l d16(pc),a4` (846 sites, after the parser fix).
The longwords those slots read are not plausible table pointers (many are instruction bytes such as 0x4EB9 or
0x4E75). Either the slots are not data words in this file, or the code hunks mix code and data so the sweep
reads the wrong bytes. Not resolved. No a4 table identified; no battle routine identified; no Amiga geometry.

Next (one unit): verify the hunk byte layout against the HUNK_RELOC32 entries (record which longwords the loader
relocates) before reading any slot, so a slot is only read when its address is known to be data.

## Step 6 (2026-11-11): relocation check on the a4 slots

`tools/amiga_hunk_map.py` now keeps each HUNK_RELOC32 entry (source hunk, longword offset, target hunk). It
reads all 12,317 entries, the same total as before.

Test: for each `movea.l d16(pc),a4` (891 sites), is the slot longword one the loader relocates?
- relocated (a real pointer): 45 sites (most in hunk 27: 11; hunks 64, 85: 4 each).
- not relocated: 846 sites.

Reading: the a4-table hypothesis is not supported by the majority of prologue slots. The 846 non-relocated slots
are not pointers the loader patches, so they cannot be a base table. The 45 relocated slots are the only
candidate base pointers in this file. Not yet connected to any battle code.
Next (one unit): follow the 45 relocated slots to their target hunks and check whether any target contains the
asset names or a grid constant (24 / 7) in its code.

## Step 7 (2026-11-11): where the 45 relocated slots point; asset-name route closed

Targets of the 45 relocated `a4` slots: hunk 5 (about 20 sites), hunks 29, 43, 61, 63, 30, 58, 64, 85 and others
(list reproduced by the step 6 check). No relocated slot targets hunk 6 or hunk 7.

Check: no relocation entry in any hunk points at the asset names (hunk 7 offset 0x26A `scrn1b.lbm`, hunk 6
offset 0xC3 `COMSPR`). So the name strings are not reached through a loader-patched pointer. The name route is
closed; it cannot find the battle code.

Remaining anchors (none tried yet): hunk 5 as the most-used base target (a global data area, to be checked
for grid-like constants); mulu/muls by 24 in code that also reads a table; the battle screen's draw calls
(blit or copy into the 320x200 bitmap with a 24-pixel stride). Each is one unit.

## Step 8 (2026-11-11): multiply-by-24 anchor, negative result

Multiply-by-24 sites: 30 `mulu.w`/`muls.w #$18` in the code hunks (hunks 29, 35, 47, 48 and others). 24 is also a
common record size, so a multiply by 24 is not evidence of a grid. Filter: a site with an origin constant (`#8`)
within six instructions: 2 sites. With a seven-column constant (`#7`) too: 0 sites.

Result: no grid-like multiply found. This anchor gives no evidence; the battle placement is not in these sites.
Remaining anchors: hunk 5 base constants; battle draw calls (blit or copy with a 24-pixel stride).

## Step 9 (2026-11-11): column-position table, negative result

Search: the 7-term sequence 8, 32, 56, 80, 104, 128, 152 (origin 8, step 24, seven columns; the same values serve
as row positions) as big-endian 16-bit or 32-bit words in every code hunk. Hits: 0.

Result: no stored column or row table with the DOS grid values. The Amiga grid, if it exists, is not stored as a
table of these positions. Remaining anchor: the battle draw calls (a blit or copy with a 24-pixel stride).

## Step 10 (2026-11-11): custom-chip (blitter) base references

Option (a) chosen by the user (2026-11-11): continue with function-level disassembly.

Search: the custom-chip base `$DFF000` as an immediate (the usual Amiga way to reach the blitter and
bitplane registers via offsets). Results:
- hunk 49 at 0x22E: `movea.l #$dff000,a3` inside a routine (clip/mask setup at 0x244-0x28E).
  The routine uses `#$28` (40 bytes, one 320-pixel bitplane row) and word masks `#$ffff` / `#$ff00`. This is a
  blit clipping routine, not grid geometry.
- hunk 100 at 0xC: `move.l #$dff000,$0.l` (the chip base stored at absolute address 0, a global pointer).

No literal absolute `$DFF040`/`$DFF058` (blitter control and size) references were found. So the blitter is
driven through the base register, and the users of the global at address 0 are the next place to look.
Next (one unit): find the loads from absolute address 0 (`$0.l`) and the blitter size writes (offset $58 from
the base) in those routines; check whether a routine blits 24-pixel cells at a 7x7 spacing.

## Step 11 (2026-11-11): absolute-0 users and blitter-offset writes, negative result

Tool: `tools/amiga_chip_refs.py` (resync sweep; reports `$0.l` operands and `$40`/`$58` displacements).
The raw `$0`/`$40`/`$58` operand counts are noisy (immediates and struct fields), so only exact forms count.

Measured:
- `movea.l $0.l,aN` loads (the global at absolute address 0): 6 sites, in hunks 93 (0x10, 0x24) and 99
  (0x120, 0x14e, 0x17e, 0x192).
- Hunk 93 (sha256 24853335b304b619, 56 bytes): both loaded pointers write `#$8020` / `#$20` to `$9a(a3)`. A struct
  field, not a blitter size or control register.
- Hunk 99 (sha256 fb179f5d62bdc933, 932 bytes): a byte-output routine. It writes `move.b` through the pointer at
  absolute 0, increments that pointer (`addq.l #1,$0.l`) and a counter at `$108.l`. Not a blit or grid routine.
- Blitter-offset writes (`move.w ...,$40(aN)` / `$58(aN)`): 224 hits by the loose scan, 13 in hunk 4 with `#$1`.
  Values `#$1` and `#$20`-style constants indicate struct fields. None of these address registers is set from the
  chip base `$DFF000` in its own routine (only hunks 49 and 100 load that immediate).

Interpretation: the absolute-0 global is a general pointer used by output and struct routines. The blitter writes
are not tied to a chip-base load in the same routine, so the battle draw path is not identified. The chip-base
route is closed as a direct route to the battle grid.

Options for the next decision (not decided here):
(a) Continue: trace the hunk 99 pointer target (the value stored at absolute 0 by hunk 100) and the callers of
    hunk 49 at 0x22E. Multi-tick, uncertain.
(b) Record the Amiga profile as "no measured data" for milestone 3 (the state the design note allows). The DOS
    profile stays; no Amiga geometry is invented.

## Step 12 (2026-11-11): callers of the hunk 49 routine (user answer 2a: keep tracing)

Correction to step 10: the routine's real entry is hunk 49 offset 0x224 (`link.w a5,#0`, then `addq.w #4,a5`
and a `movem.l` prologue). Offset 0x22E, used in step 10, is the middle of that function.

Measured callers (no `tools` change; the same resync sweep and `reloc_offsets`):
- Within hunk 49: no `bsr`/`bra`/`jsr` to 0x224.
- Relocated longwords pointing to hunk 49 + 0x224: one, in hunk 30 at offset 0x27A. It is the operand of
  `jsr $224.l` at hunk 30 offset 0x278 (the relocation is on the jsr operand).
- Hunk 30 caller function starts at offset 0x25C (`link.w a5,#0`). It pushes its own arguments unchanged
  (`move.w $18(a5)`, `$16`, `$14`, `$12`, `$10` as words, and `move.l $c(a5)`) and then calls 0x224. So hunk 30 at
  0x25C is a thin wrapper that forwards six argument slots.

Consistency check: hunk 49's routine reads `$4(a5)` (long), `$10(a5)` (word) and `$11(a5)` (byte). These fall inside
the forwarded argument block (`$c` long, `$10` word), so the wrapper and routine agree on the layout. This is a
structural match, not a behavioural one.

Not decided: whether the wrapper at hunk 30 0x25C is battle code. Its callers are the next unit (search for `jsr`/`bsr`
to 0x25C in hunk 30 and for relocated pointers to hunk 30 + 0x25C). No geometry; no profile; no deploy.

## Step 13 (2026-11-11): callers of the hunk 30 wrapper, negative result

Search for the wrapper at hunk 30 offset 0x25C (step 12):
- relocated longwords pointing to hunk 30 + 0x25C in any hunk: none;
- same-hunk `bsr`/`bra`/`jsr`/`jmp` to 0x25C in hunk 30: none;
- absolute `jsr`/`jmp` to 0x25C from any other code hunk: none.

Reading: the wrapper has no direct caller in this file. It may be reached through a base-register table (for example
an `a4`-relative slot, step 5-7) or an indirect call, which the scans above cannot see. Not identified as battle code.

Next (one unit): check whether the wrapper is reached through an indirect `jsr (aN)` or `jsr d(aN)` whose base register is
loaded from a relocated slot in hunk 30 or hunk 5 (the step 7 hub). No geometry; no profile; no deploy.

## Step 14 (2026-11-11): indirect-call search for the hunk 30 wrapper, negative result

- Longwords equal to 0x25C (hunk 30 offset of the wrapper) in any code or data hunk, read on a 2-byte step: 0 sites.
- Indirect `jsr`/`jmp` with an address-register operand in hunk 30: 15 sites. 14 use `(a0)` (most follow an
  `movea.l (a7)+,a0` load and are the stack-return pattern seen in the prologues). One uses an indexed table,
  `jmp (a3, d2.w)` at hunk 30 0x944. None of these can be tied to 0x25C without a table that holds that value.

Reading: the wrapper is not reached through a stored absolute offset, a relocated pointer or a direct call. The
remaining route is the stack-return pattern (`(a7)+` load then `jmp (a0)`), which a static scan cannot resolve
without tracing the callers' stack contents. This is a dead end for a static search.

Result: the hunk 30 wrapper's caller is not identified. The Amiga battle grid is still not measured. Step 12 remains
the only confirmed link (hunk 30 wrapper -> hunk 49 routine at 0x224). No geometry; no profile; no deploy.

## Step 15 (2026-11-12): PC-relative and immediate references to the wrapper, negative result

Search: every `$xx(pc)` operand in hunk 30 whose target (instruction address + 2 + displacement) equals 0x25C, and
every immediate or absolute operand naming 0x25C in hunk 30. Result: 0 sites. Other hunks cannot address hunk 30
PC-relative, and absolute references from them are relocated (step 12 and 13 checked those).

Combined with steps 12-14: the hunk 30 wrapper at 0x25C has no direct, relocated, PC-relative, immediate or table
reference in this file. Its only static link is the one-way call from the wrapper to the hunk 49 routine (0x224).
The wrapper's entry is reached by a route a static scan cannot see (a stack-return or computed address). The
Amiga battle grid is not measured. No geometry; no profile; no deploy.
