# cc Format-Support Coverage Matrix

> Authoritative test-target list for **goal "cc has tools to test that the different formats
> are supported."** Every Gold Box format used by Champions of Krynn (CoK), Death Knights of
> Krynn (DoK), and The Dark Queen of Krynn (DQK), across DOS and Amiga, mapped to the `cc`
> asm tool that parses it and the Python/TS **oracle** that proves the parse. Cells are
> `SUPPORTED` (asm verified == oracle), `PARTIAL` (some sub-cases), or `GAP` (no asm support;
> oracle exists). The unified harness (task #21, `native/ccformats-test.ps1`) drives one row
> per `SUPPORTED`/`PARTIAL` cell; the `GAP` rows feed task #23 (close gaps).

## cc tool inventory

| Tool (`.com`) | Role | Oracle |
| --- | --- | --- |
| **CCGBC** (`cgbc`) | DOS `.DAX` container list/extract (`L`/`X`/`XA`) | `tools/dax_decode.py` |
| **CCGB** (`cgb`) | DOS DAX **standard-frame** graphics → VGA / `/D` RAW | `tools/dax_decode.py` |
| **CCDAA** (`ccdaa`) | Amiga `.DAA` container + **standard 5-plane frame** + **8X8D** | `tools/daa_decode.py` |
| **CCHLIB** (`cchlib`) | DQK `HLIB` `.TLB`/`.GLB` image (TILE) + DATA/DIG4 member list/extract | `tools/hlib_decode.py` |
| **CCGLB** (`ccglb`) | `.GLB` sniffing dispatcher → CCSND / CCHLIB / CCGEO / CCMON | per-child oracle |
| **CCGEO** (`ccgeo`) | GEO area maps (top-down + WALLS bake → CCFP) | `packages/engine/.../geo.ts` |
| **CCECL** (`ccecl`) | ECL bytecode tier-1 interpreter/tracer | `packages/engine/.../vm.ts` |
| **CCSND** (`ccsnd`) | DQK `DIG4` digitized sound decode | `packages/engine/.../dig.ts` |
| **CCFP** (`ccfp`) | First-person walk: `8X8D` tiles + `WALLDEF` + collision | `.../explorer.ts` |
| **CCDAT** (`ccdat`) | Game-data records: MON `CHA` (409/422/216-byte), CoK/CoAB/DoK `ITEM` (63/17-byte), `SAV`, DQK `QSV`/`ITEMS.DAT`/`item.dat` | `.../monster.ts`,`item.ts`,`savedCharacter.ts`,`dqkSave.ts`,`dqkItem.ts` |
| **CCMON** (`ccmon`) | DQK `MONCHA.GLB` monster-record decompress + fixed-offset field decode | `.../moncha.ts` |
| **CCCOMBAT** (`cccombat`) | Tactical combat tier-1 engine | `.../tactical.ts` |
| **PIXEL** (`pixel`) | shared render/pixel include (not a standalone format tool) | — |

## Coverage matrix (format family × game)

Platform tag: **[D]** = DOS container, **[A]** = Amiga `.DAA`. DQK is DOS-VGA HLIB only.

| Format family | Container | CoK | DoK | DQK | cc tool | Status |
| --- | --- | --- | --- | --- | --- | --- |
| **Container — DAX** | `.DAX` | [D] 52 files | [D] 50 files | — | CCGBC | **SUPPORTED** |
| **Container — DAA** | `.DAA` | [A] | [A] | — | CCDAA `L` | **SUPPORTED** |
| **Container — HLIB TLB** | `.TLB` | — | — | 19 files | CCHLIB `L` | **SUPPORTED** |
| **Container — HLIB GLB** | `.GLB` | — | — | ECL/GEO/MONCHA/SOUNDS | CCGLB→CCHLIB | **SUPPORTED** |
| **Gfx — standard frame** | DAX/DAA/TLB | BIGPIC,BODY,DUNGCOM,WILDCOM,SKY,TILES,CURSOR,TITLE… | BIGPIC,BACK,SKYGRND,DUNGCOM… | BIGPIC,BACK,DUNGCOM,WILDCOM,FRAME,TOPVIEW,GEN,ALWAYS,TITLE | CCGB / CCDAA / CCHLIB | **SUPPORTED** |
| **Gfx — sub-frame (anim array)** | DAX/DAA/TLB | SPRIT*,PIC*,CPIC*,HEAD*,COMSPR,multi-BIGPIC | SPRIT*,PIC*,CPIC*,COMSPR | SPRIT,PICA/B/C,CPIC,COMSPR,FINAL | CCGB[D]/CCDAA[A]/CCHLIB | **SUPPORTED** — Amiga side (`CCDAA`) SOLVED+ported 2026-07-01 (task #67); DOS side's §B animated multi-frame codec now ported into native `cgb.asm` 2026-07-02 (task #72): `CCGB /D <file> <blk> <frame>` decodes SPRIT*/PIC* sub-frames (+`/X` XOR-delta for animated PIC portraits), verified byte-identical to the `dax_complex_decode.py` oracle on 9 CoK+DoK cells (3 SPRIT view-sizes, PIC single-frame, PIC 8-frame XOR delta) |
| **Gfx — 8X8D tiles** | DAX/DAA/TLB | 8X8D* | 8X8D* | 8X8DB,8X8DC | CCDAA[A] / CCGB[D] `/G`+`/T` / CCFP `/T` / CCHLIB | **SUPPORTED** (DOS DAX font+full tile-strip sheet added; both platforms + FP walker now covered) |
| **Walls — WALLDEF** | DAX | WALLDEF* | WALLDEF* | (in GEO/HLIB) | CCFP | **SUPPORTED** |
| **Maps — GEO** | DAX/GLB | GEO* | GEO* | GEO.GLB | CCGEO (Gen1 DAX + Gen2 GLB, auto-detected) | **SUPPORTED** |
| **Scripts — ECL** | DAX/GLB | ECL* | ECL* | ECL.GLB | CCECL (Gen1 DAX-block + Gen2 GLB dialect, auto-detected) | **SUPPORTED** |
| **Data — MON CHA (Gen1, CoK/CoAB/DoK)** | DAX | MON{1..3}CHA | MON1CHA / MON5CHA (CoAB local dump) | — | CCDAT `M` | **SUPPORTED** |
| **Data — MON CHA (Gen2, DQK)** | GLB | — | — | MONCHA.GLB | CCMON (via CCGLB dispatch) | **SUPPORTED** (name resolves for all 98 records; full stats for 46/98 — task #71, 2026-07-01 — matching moncha.ts's own `decodeMonchaGlb` coverage exactly; 2 purely-cosmetic roster-category refinements deliberately not ported, see below) |
| **Data — MON SPC/ITM side-tables** | DAX | MON{n}SPC/ITM | MON1SPC/ITM | (in MONCHA) | CCDAT `S`/`K` | **SUPPORTED** (task #68, 2026-07-01) |
| **Data — MON WIZ (spellbook)** | DAX | — | MON1WIZ | — | CCDAT `Z` | **SUPPORTED** (task #69, 2026-07-01: TS decoder `monsterSideTables.ts` `decodeMonsterWizArchive`; native asm `CCDAT Z` port added 2026-07-09 for the verified 0..73 memorized-spell-list region) |
| **Data — ITEM** | DAX/raw | ITEM* (63B recode) | ITEM* (17B, `CCDAT J`) | ITEMS.DAT (16B cat, `CCDAT T`) + item.dat (18B inst, `CCDAT N`) | CCDAT `I`/`J`/`T`/`N` | **SUPPORTED** |
| **Sound — DIG4** | GLB | — | — | SOUNDS.GLB | CCSND | **SUPPORTED** |
| **Sound — DAX SOUND/MIDI/MUSIC** | DAX | SOUND,MIDI | SOUND,MUSIC | — | — | **GAP** (audio track #13; DOS-native MIDI.DAX architecture/hardware-target DECODED — decompile task #63 — but note-timeline location still unlocated, so no playback yet) |
| **Sound — XMI / VOC / ADV** | raw | — | — | `*.XMI`,SFXDQ.VOC,*.ADV | — | **GAP** (audio track #13) |
| **Save — record** | SAV/GAM/QSV | CHRDATA*.SAV | *.GAM/.JNK/.WIZ/.EFF | *.QSV (`CCDAT Q`) | CCDAT `C`/`Q`/`G`/`V`/`W`/`E` | **PARTIAL** (task #70, 2026-07-01: `.GAM`/`.JNK`/`.EFF` RESOLVED; `.WIZ` partial — packing rule unconfirmed; `SAVGAMA.PTY` party-level record still an open negative. Note: DoK has no per-character `.PTY` — that extension turned out to be party-level only, correcting this doc's earlier premise. **Task #73, 2026-07-02: sharpened, not closed** — `.WIZ`'s 34-73 window CONFIRMED as a memorized-spell-slot list via a real level-up diff; its tail widened to 180-219 and ruled out matching the engine's own spell-slot table. `SAVGAMA.PTY`'s roster-table stride RESOLVED (41B × 6 slots @ 2586-2832) but shown to be camp-menu scratch, not party state; real party/quest data relocated to a new hot zone @ ~196-513, still unmapped) |

## Prioritized gaps (feed task #23)

Items 1-3, 5, 7 below were closed 2026-07-01 (tasks #67-#71, the "make a new plan and keep
going" batch); items 4 and 6(partial) were already closed earlier the same day (tasks
#56-#60, #63). What's actually still open, renumbered:

1. ~~**Sub-frame graphics (Amiga side, CCDAA)**~~ **DONE** (task #67, 2026-07-01). The Amiga
   6-byte sub-frame inner-pixel codec (solved task #55; wired into TS `daa.ts` task #66) is now
   also ported into the native asm `CCDAA` tool — real pixels + geometry, verified byte-for-byte
   against an independent Python oracle. ~~**New, separate gap: the DOS-side complex-subframe
   codec was never ported into `cgb.asm`.**~~ **DONE** (task #72, 2026-07-02). `cgb.asm` now
   routes its `.complex` branch (standard-frame test failed) to a §B animated-multi-frame decoder:
   reads `numFrames` + the 21-byte per-frame headers, walks to `CCGB /D <file> <blk> <frame>`'s
   selected sub-frame, expands its chunky-4bpp pixels, and (with `/X`) applies the frame-0 XOR
   delta for animated PIC portraits. Verified byte-identical to `tools/dax_complex_decode.py` on
   9 real CoK+DoK cells (SPRIT 3 view-sizes no-XOR; PIC single-frame; PIC 8-frame XOR delta
   frames 0 and 1). §C WALLDEF (not graphics — index table, handled by CCFP/CCGEO) and §D
   DUNGCOM/WILDCOM tilesets (the standard 17-byte-header path already renders tile 0) are out of
   scope for this animated-frame port.
2. ~~**MON SPC/ITM side-tables**~~ **DONE** (task #68, 2026-07-01). `CCDAT S` (affect) / `CCDAT K`
   (carried-item, `T` was already taken) mirror `monsterSideTables.ts` exactly; field-diffed with
   zero mismatches against the TS oracle on real CoK/DoK files.
3. ~~**MON1WIZ (DoK monster spellbook)**~~ **RESOLVED** (task #69, 2026-07-01,
   `docs/engine/research/decompile-mon1wiz.md`). No COAB oracle existed; RE'd empirically from
   real bytes (14 real blocks + player `.WIZ` saves). The part monster loading needs (the
   memorized-spell-instance list) is fully verified; two smaller sub-regions are inferred/left
   an honest open negative. TS decoder added (`monsterSideTables.ts`); native asm port now added
   as `CCDAT Z`, which validates 220-byte DAX blocks and prints the verified 0..73 spell slots
   as `{spellId, learning}` fields against real `MON1WIZ.DAX` block id 97.
4. ~~**DoK/DQK item records**~~ **DONE** — `CCDAT J` (DoK 17-byte item), `CCDAT T`/`N`
   (DQK `ITEMS.DAT`/`item.dat`).
5. ~~**Non-CoK saves**~~ **MOSTLY DONE** (task #70, 2026-07-01,
   `docs/engine/research/dok-chrdata-save-format.md`). Corrected premise: DoK has no per-character
   `.PTY` — the real quad is `.GAM`/`.JNK`/`.WIZ`/`.EFF`. `.GAM` (216B, byte-identical to the
   existing DoK monster layout), `.JNK` (63B inventory records), and `.EFF` (9B, same struct as
   `MON*SPC.DAX`'s affect record) are RESOLVED with `CCDAT G`/`V`/`E`. `.WIZ` (220B) is PARTIAL —
   caster flag + a verified nonzero-byte window, but the exact packing rule isn't pinned
   (`CCDAT W`). `SAVGAMA.PTY` (party-level) remains an honest open negative — the classic
   `SAVGAM.TXT` header layout is disproven and a filename-keyed roster table was found but not
   fully RE'd.
   **Follow-up (task #73, 2026-07-02) — sharpened, still not fully closed.** Used the larger
   `cloud_saves\SAVE\` corpus (3 save slots × up to 8 characters, incl. the same character
   captured at two different levels) instead of the original 4-6 samples. `.WIZ`: a real
   before/after level-up diff on one character CONFIRMS the 34-73 window is a sorted,
   duplicate-allowing list of currently-memorized spell-slot instances (it grows by a multiset
   union at level-up) — upgraded from a "plausibility read" to evidence-backed. The old
   `slotsA@188-191`/`slotsB@212-215` 4-byte-group model was too narrow (real data also occupies
   180-187/192-193/196-197); `CCDAT W` now prints the full 180-219 window. That tail was checked
   against and does **not** match the engine's own `spellSlots()` table (`packages/engine/src/
   ruleset/addnd1e/spells.ts`), and part of it (212-219) is byte-identical across 3 distinct
   characters — looks class-static, not personal, a new open question. `SAVGAMA.PTY`: the
   roster-table stride is now RESOLVED (41 bytes × 6 slots, offsets 2586-2832, confirmed
   identically across 4 independent save files) — but full-record dumps show the slots hold
   camp-menu UI strings (`"...Save View Magic Rest A..."`, `"Exit"`) and stale heap scratch
   (a leaked `"OK\SAVE\savgamJ.pty"` path), not per-character summary data — overturning the
   "filename-keyed roster record" hypothesis. A byte-density map of the file found the real
   candidate for party/quest state instead: a hot zone at offsets ~196-513, near-empty in a
   fresh save (7/400 nonzero bytes) but densely populated in a played one (128/400) and where
   most of the byte-level differences between two independently-played save copies cluster.
   Neither file is fully cracked — this is real, reproducible progress that narrows both
   searches, not a final answer.
6. ~~**Audio formats**~~ **PARTIALLY DONE.** XMI / VOC / Amiga SMUS-8SVX playback is wired (audio
   task #13's shipped slice). DOS-native `MIDI.DAX` (CoK/DoK) architecture, hardware target
   (dual-SAA1099/Game Blaster), and note-encoding are now DECODED (decompile task #63, 2026-07-01,
   `docs/midi-dax-format.md`) — but the actual note-timeline location is still an open RE question
   (the driver may receive it from `GAME.OVR`/`START.EXE` at runtime rather than storing it in the
   DAX block), so no real DOS-native music renders yet. This needs a dynamic trace, which task #61
   already showed is not currently feasible headlessly — genuinely blocked, not just unscheduled.
   `PC-speaker` SFX tone tables remain a separate, still-open dynamic-trace TODO
   (`decompile-seg044-sound.md`).
7. ~~**MONCHA.GLB full stat reconstruction**~~ **DONE** (task #71, 2026-07-01). `CCMON` now ports
   6 of moncha.ts's extended-reconstruction strategies, lifting real coverage from 5/98 to 46/98 —
   an exact match with `moncha.ts`'s own `decodeMonchaGlb` count, verified both at the member-set
   level and by field-level spot-check. Found and fixed two real `cs:`-prefix bugs in the process.
   Two purely-cosmetic roster-category strategies were deliberately not ported (CCMON's CLI has no
   roster-category field for them to affect).

**What's left after this batch:** `.WIZ`/`SAVGAMA.PTY` full packing rules (item 5, partial —
sharpened by task #73, 2026-07-02, but the exact spell-id encoding, the 0/1 flag region's
indexing, the class-static 212-219 run, and the SAVGAMA.PTY ~196-513 hot zone are all still
open; each would need either a disassembly pass or another dedicated byte-diffing pass on a
larger save corpus); DOS-native music playback (item 6, genuinely blocked on a dynamic trace);
PC-speaker SFX tone tables (item 6, same blocker class). The `cgb.asm` DOS complex-subframe asm
port (item 1's tail note) closed as task #72 (2026-07-02). Everything else in this matrix is
SUPPORTED.

## In-DOS self-test: CCVERIFY (task #22 — DONE)

`native/src/ccverify.asm` → `CCVERIFY.COM` is the **in-DOS companion** to the
headless oracle harness: point it at a file or wildcard and it classifies every
match by magic + structure and prints which cc tool supports it, with an exit
code of 1 if any file is UNSUPPORTED (so a `.BAT` can gate on it).

```
CCVERIFY *.DAX     ->  MON1CHA.DAX   DOS DAX container      SUPPORTED (CCGBC)
CCVERIFY *.GLB     ->  GEO.GLB       DQK HLIB DATA lib      SUPPORTED (CCGLB->CCGEO/CCHLIB)
                       SOUNDS.GLB    DQK HLIB DIG4 sound    SUPPORTED (CCSND)
CCVERIFY *.DAA     ->  DUNGCOM.DAA   Amiga DAA (blocks)     SUPPORTED (CCDAA)
                       SPRIT1.DAA    Amiga DAA (subframe idx) SUPPORTED (CCDAA)
CCVERIFY *.TLB     ->  ALWAYS.TLB    DQK HLIB TILE image    SUPPORTED (CCHLIB)
CCVERIFY NOTES.TXT ->  NOTES.TXT     --                     UNSUPPORTED (unrecognized format)
```

Detection (mirrors the verified decoders): **HLIB** = `HLIB` magic + tag@12
(`DI`→DIG4/CCSND, `TI`/`HL`→TILE/CCHLIB, `DA`→DATA/CCGLB); **DAX** = LE word0≠0,
%9==0, 2+word0≤filesize, block0 offset==0; **DAA** = BE word0∈[11,filesize], body
%9 (blocks) or %6 (sub-frame index). The blocks-vs-index ambiguity (body a
multiple of 18) is resolved by the 9-byte-TOC invariant `entry1.data_offset ==
entry0.comp_size`. Verified headlessly against real CoK/DoK/DQK files: every
classification matches the Python oracle (`daa_decode.parse_container` kind, etc.).

## Harness status (task #21 — DONE)

`native/ccformats-test.ps1` is **live and green: 28 cells PASS** across all three
container generations and both platforms, each proven BYTE-IDENTICAL to the
`tools/format_manifest.py` oracle in one clean-exit headless DOSBox run:

- **18 DOS DAX** (CoK+DoK × TITLE/8X8D/BIGPIC/GEO/ECL/MONCHA/SPRIT/PIC/WALLDEF) —
  `CCGBC XA` decompressed-block identity, **all** members per cell.
- **6 Amiga DAA** (CoK+DoK × DUNGCOM/BIGPIC/SKY/BACK) — `CCDAA /D` **render-RAW**
  identity (imgw,imgh, planar 5-plane→indices, 768-byte DAC palette). Deeper axis
  than container parsing: it exercises the full planar decode + 0RGB→×17 palette.
- **4 DQK HLIB** (GEO/ECL/MONCHA/SOUNDS `.GLB`) — `CCHLIB X` pointer-span identity,
  first/middle/last sampled.

Key runtime constraint: DOSBox only flushes mounted-drive writes on a **clean
`exit`**, so the whole sweep runs in one autoexec (`cycles=max`, 240 s wait). DAA
cells `copy` the fixed `CCDAA.RAW` to `OD{nn}\R{idx}.RAW` per sampled frame.

## Harness cell list (feed task #21)

The unified harness drives, per cell, the smallest deterministic check that proves support:
container = member-count + per-member extracted-byte identity vs oracle; graphics = decoded
`imgw,imgh,index-bytes,768-palette` RAW byte-identity (CCGB `/D`, CCDAA `/D`, CCHLIB `/D`) vs
the oracle RAW; GEO/ECL/MON = field/trace text diff vs the TS loader. Real assets only — CoK +
DoK DAX from the game folders, Amiga `.DAA` from `amiga_extracted/`, DQK `.TLB`/`.GLB` from
DISK1-3. Renders/dumps go to git-ignored `renders/` and scratch.
