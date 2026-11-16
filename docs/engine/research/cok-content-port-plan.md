# CoK Content Port Plan (TASK #16)

**Goal:** Produce a DOS executable, built on the Dark Queen of Krynn (DQK / Gen2)
engine, that *is* Champions of Krynn (CoK) — plays the way CoK originally did, but
with the superior Amiga artwork. This is roadmap step 6 in `CLAUDE.md` ("Port CoK/DoK
game content (GEO maps, MON, ITEM, ECL) onto the DQK engine, handling ECL opcode
drift") plus the executable-assembly step 7.

**Status going in:** much of the pipeline already exists and is byte-verified. This
doc is a *consolidation + gap map + verification/milestone plan*, not a from-scratch
design. It extends the existing build path (`tools/build-dqk-dir.mts` →
`buildDqkGameData` → `planDqkBuild`); it does not duplicate it.

**Scope guard:** design only. No `.asm`, no engine `.ts`, no game data is written by
this task. Game folders are read-only source.

---

## 0. What already exists (do not rebuild)

The CoK→DQK port is *not greenfield*. The following are present and verified this
project; the plan below reuses them verbatim.

| Stage | Code / tool | Verified by | What it does |
|-------|-------------|-------------|--------------|
| GEO port (E3.1) | `packages/engine/src/loaders/geoEncode.ts` `encodeGen2GeoArchive` | `geoEncode.test.ts` (real CoK `GEO1.DAX` golden) | Gen1 1026-byte 4-plane map → Gen2 HLIB `DATA` member (8-byte header + 4×W·H planes). Loss-free. |
| MON port (E3.2) | `monchaEncode.ts` `encodeMonchaArchive`, `moncha.ts` | `buildDqkGame.test.ts` | CoK 409-byte monster record → `MONCHA.GLB` member. |
| ITEM port (E3.2b) | `dqkItem.ts` (`portDokItemToDqk`) | `dqkItem.test.ts` | DoK item → DQK `item.dat` loss-free. |
| ITEM name recode (Gap G3) | `cokItem.ts` (`portCokItemToDqk`, `recodeCokNamenum`) | `cokItem.test.ts` | **Done.** CoK's 63-byte plain-ASCII item recoded to DQK's VOCAB-indexed name via a byte-grounded `COK_VOCAB→DQK_VOCAB` index map (exact-string + alias match). |
| Multi-area merge (Gap G1) | `buildDqkGame.ts` (`buildDqkGameDataMulti`) | `buildDqkGameMulti.test.ts` (real CoK+DoK multi-disk) | **Done.** Unions GEO/ECL ids (disjoint, verified) and dedup-merges MON slots across all 3 disks into one `manifest.merge` audit. |
| MON side-tables (Gap G2) | `monsterSideTables.ts` (`mergeMonsterSideTables`) | `monsterSideTables.test.ts` | **Done.** `MON{n}ITM`/`MON{n}SPC` carried-item + affect tables merged per-monster into the port. |
| ECL port (E3.3) | `eclEncode.ts` `portGen1EclArchiveToGen2` | `eclEncode.test.ts` | Gen1 ECL block → Gen2 by `block.slice(2)` (strip magic). The "drift" answer (§2). |
| New-game entry shim (E6.1) | `eclEncode.ts` `makeEclForwardStub` / `planEntryStub` | `eclEncode.test.ts` | Synthetic `ECL.GLB` area-1 stub → `NEWECL #16` → CoK overland. No EXE patch. |
| Game-data assembly (E4.1) | `buildDqkGame.ts` `buildDqkGameData` | `buildDqkGame.test.ts` | One call: CoK `GEO{n}/MON{n}CHA/ECL{n}.DAX` → the three GLBs + manifest. |
| Disk/EXE assembly (E4.2) | `buildDqkDisk.ts` `planDqkBuild`, `DQK_DISK_LAYOUT` | `buildDqkDisk.test.ts` (layout == real GOG listing) | Resolve every disk file to emit/copy; retitle `DQK.EXE`; emit DOSBox conf. |
| Art lift (E5) | `daa.ts` `decodeDaa`, `amigaToHlib.ts`, `dqkArtMap.ts` `DQK_ART_LAYOUT`, `buildPortableArtOverrides` | `dqkArtMap.test.ts` | Amiga `.DAA` → DQK `TILE`. **Partial**: only `portable-master`/`portable-leaf` verdicts lift today; `SPRIT*`/`PIC*` are format-solved (`subframe_decode.py`) but not yet ported into this pipeline (task #66). |
| Protection bypass (E6.2b-4) | `dqkProtection.ts` / `planProtectionBypassPatches` | byte-exact + DOSBox confirmed | One stub patch at file offset `0x212E3` → `MOV AX,1; RETF`. Skips journal-word prompt on every path. |
| End-to-end driver | `tools/build-dqk-dir.mts` | manual; outputs in `build/cok-on-dqk*` | Reads CoK DAX, builds GLBs, plans disk, writes a bootable dir. |
| Boot verification | `tools/dosbot/run-boot-tests.ps1` (+ vision judge) | both rebuilds boot to "CHAMPIONS OF KRYNN" | Unattended DOSBox boot → vision-judged title match. |

The asm sibling-track oracles (`native/src/ccecl.asm`, `cccombat.asm`, `ccgeo.asm`,
`ccdat.asm`) are *clean-room verification oracles*, used by the verification strategy
(§5) — not part of the DOS-executable port itself, which targets the real `DQK.EXE`.

---

## 1. Port inventory: CoK source → DQK target

CoK ships 52 `.DAX` (DOS/GOG release at `Champions of Krynn/`). The port maps each
class of content to a DQK container. "Best-of art" sources are the extracted Amiga
`.DAA` (`amiga_extracted/ChampionsOfKrynn/`, referenced not vendored).

### 1.1 Game logic / data (the "plays like CoK" content) — ported

| CoK source (`Champions of Krynn/`) | Content | DQK target | Tool | State |
|---|---|---|---|---|
| `GEO1.DAX`, `GEO2.DAX`, `GEO3.DAX` | Dungeon maps (16×16, 4 planes) | `DISK3/GEO.GLB` | `encodeGen2GeoArchive` | done; per-area merge needed (§4) |
| `ECL1.DAX`, `ECL2.DAX`, `ECL3.DAX` | Event/dialogue/combat scripts | `DISK3/ECL.GLB` | `portGen1EclArchiveToGen2` + area-1 stub | done; per-area merge needed (§4) |
| `MON1CHA/2CHA/3CHA.DAX` | Monster stats (409-byte rec) | `DISK2/MONCHA.GLB` | `encodeMonchaArchive` | done; merge needed |
| `MON{n}ITM.DAX`, `MON{n}SPC.DAX` | Monster item/special tables | side data merged per-monster | `mergeMonsterSideTables` | **done** (Gap G2) |
| `ITEM1/2/3.DAX` | Item definitions (63-byte ASCII-name) | `DISK1/ITEM.DAT` + `ITEMS.DAT` | `portCokItemToDqk` (CoK name→VOCAB recode) | **done** (Gap G3) |
| `RANDCOM.DAX` | *(reclassified — see below)* | n/a | — | **resolved, not a gap** (Gap G4) |

### 1.2 Art — Amiga-sourced where solved, DOS/DQK-native otherwise

Driven by `DQK_ART_LAYOUT` verdicts (`dqkArtMap.ts`). The build replaces only files
whose verdict is liftable; everything else is copied from the DQK release (so the
build is always complete and bootable).

| DQK target `.TLB` | Amiga `.DAA` source | Verdict | In build today |
|---|---|---|---|
| `BIGPIC.TLB` | `BIGPIC1.DAA` | `portable-master` | **Amiga art lifted** |
| `COMSPR.TLB` | `COMSPR`-equiv | `portable-leaf` | **Amiga art lifted** |
| `SPRIT.TLB` | `SPRIT1/2.DAA` | `blocked-unsolved-source` (6-byte sub-frame) | copied from DQK (DOS art) |
| `PICA/B/C.TLB` | `PIC1/2.DAA` | `blocked-unsolved-source` | copied from DQK |
| `CPIC.TLB` | CoK `CPIC` 24×24 | `shape-mismatch` (DQK 48×48) | copied from DQK |
| `8X8DB/DC.TLB`, `DUNGCOM`, `WILDCOM` | n/a (DQK banks more tiles) | `shape-mismatch` | copied from DQK |
| `FINAL`, `FRAME`, `GEN`, `BACK`, `TITLE` | none / separate IFF | `no-amiga-source` | copied from DQK |

**Honest art status:** the two "best-of art on the newest engine" drop-ins that work
today are BIGPIC and COMSPR. Full Amiga sprite/scene art (`SPRIT*`, `PIC*`) still shows
DQK's own DOS art in the actual build — but the blocker is now the **pipeline wiring,
not the format**: the 6-byte sub-frame inner-pixel codec itself was solved 2026-06-25
(`docs/engine/research/subframe-format.md`, `tools/subframe_decode.py`, 158/169 files
render coherent full-color art), it just hasn't been ported into `daa.ts`/
`amigaToHlib.ts`/`dqkArtMap.ts` yet — see task #66. The build still plays correctly in
the meantime; this is a known, flagged gap, not a regression.

### 1.3 Audio + engine plumbing — carried from DQK unchanged

`DISK1` XMI tracks, `SFXDQ.VOC`, `SOUNDS.GLB`, the `.ADV` drivers, `INSTR.AD`,
`DQK.CFG`, `GAME.FON` are `origin: 'audio'`/`'engine'` in `DQK_DISK_LAYOUT` and copied
verbatim. CoK's own `MIDI.DAX`/`SOUND.DAX` are **not** ported in v1 (DQK's XMI music
plays). Per-platform audio swap (Amiga SMUS/8SVX) is the web-engine track's concern,
out of scope for the DOS executable. (Flag: if the user wants *CoK's original DOS
music* on the rebuilt EXE, that is a separate XMI-conversion slice — see §7 Q4.)

---

## 2. The ECL-drift verdict (CRUX 1)

**Verdict: NO opcode drift in the bytecode body. CoK ECL runs on a DQK-engine EXE
as-is, after a single 2-byte header fixup (strip the magic word). No opcode remapping
is required.**

### Evidence (all primary, all in-repo)

1. **Identical opcode table.** `docs/engine/research/ecl-opcode-spec-for-asm.md §5`
   states the headline finding explicitly: the opcode table (0x00–0x40), operand
   framing, and 6-bit string packing are byte-for-byte identical across Gen1 (CoK/DoK)
   and Gen2 (DQK). Source of truth: `packages/engine/src/ecl/opcodes.ts`
   (`KRYNN_GEN1_OPCODES`, from EclDump.exe IL) used unchanged for both dialects in
   `packages/engine/src/ecl/vm.ts`.

2. **Empirical confirmation on real DQK data.** Same doc §5: DQK `ECL.GLB` has 47
   member blocks, **zero** carry the `0x1388` magic; disassembling them with the Gen1
   opcode table yields 166 clean `EXIT` terminations and 446 inline strings that decode
   to readable English under the Gen1 6-bit rule. Gen2 scripts run through the (Gen1)
   VM and produce real effects.

3. **The one structural difference is the block header**
   (`ecl-opcode-spec-for-asm.md §5`, `eclEncode.ts` module docstring):
   - Gen1: 22-byte header = `[0x1388 magic] + 5 far-pointers`; `vbase = 0x7FFE`.
   - Gen2: 20-byte header = `5 far-pointers`, no magic; `vbase = 0x8000`.
   Dropping the 2-byte magic shifts every body byte −2, but `vbase` rises +2
   simultaneously, so `vaddr = vbase + offset` is **preserved for every instruction**:
   entry stays `0x8014`, all GOTO/GOSUB/string-ref vaddrs unchanged. The 20 bytes after
   the magic are *already exactly* the Gen2 header.

### The conversion step (already implemented)

`portGen1EclToGen2(block) === block.slice(2)`. Proven by disassembling the ported block
as Gen2 and getting the identical instruction stream (`eclEncode.test.ts`). The
archive-level porter `portGen1EclArchiveToGen2` applies this to every block.

### The one real ECL caveat: data addresses & dispatch, not opcodes

`ecl-opcode-spec-for-asm.md §5` documents that the *data addresses* scripts read/write
differ (Gen1 backdrop-indexed `searchLocation` via `0xC04F→0x7F79`; Gen2 cell-descriptor
at `0x002D` host-populated). **This does not affect the CoK port** — because the *whole*
CoK ECL body (which produces and consumes its own Gen1 addresses) ports unchanged onto
the engine, the engine just runs the CoK scripts in their own address convention. The
Gen1/Gen2 address divergence only matters when *mixing* Gen1 and Gen2 scripts, which the
port does not do. The CoK build is pure-Gen1 ECL re-headered to Gen2 — internally
consistent.

**Probe if doubted:** disassemble every ported CoK `ECL.GLB` member as Gen2 and assert
each block's instruction stream equals the Gen1 disassembly of the source DAX block
(byte-for-byte mnemonics/operands/vaddrs). `eclEncode.test.ts` already does this for the
sample block; extending it to *all* CoK blocks is a cheap, decisive gate (Milestone 2).

---

## 3. Does DQK.EXE need binary patches? (CRUX 2)

**Position: the content port is pure data/script conversion; DQK.EXE needs only two
SMALL, content-independent patches, both already built and verified — a 23-byte title
string overwrite and (optionally) a 4-byte copy-protection stub. No opcode-level or
logic-level engine patch is required for CoK to play.**

### Evidence and reasoning

- **Title patch (cosmetic, required):** `planExeTitlePatch` overwrites the 23-byte
  "The Dark Queen of Krynn" string at file offset 427923 with "Champions of Krynn".
  This is a string, not logic. Verified; the boot tests confirm the rebuild announces
  "CHAMPIONS OF KRYNN".

- **Protection patch (optional, deterministic):** `DQK_PROTECTION_PATCH_SPECS` — 4
  bytes at `0x212E3` → `MOV AX,1; RETF`. Skips the journal-word prompt on *all* paths
  (verified in DOSBox, `cok-copy-protection.md`). Only needed to reach gameplay without
  a manual lookup; not a content patch.

- **New-game entry: solved WITHOUT an EXE patch.** The one genuine engine-startup
  conflict — `DQK.EXE` hard-codes `EclBlockId = 1` for a fresh "Begin Adventuring", but
  CoK's lowest ECL id is 16 (`dqk-newgame-entry.md §5`) — is resolved by **Option A**
  (synthetic area-1 `ECL.GLB` stub that `NEWECL #16`s to the CoK overland), already
  implemented as `makeEclForwardStub` and wired in `buildDqkGame.ts`. The doc's
  Option C (patch the `EclBlockId=1` immediate) was explicitly rejected: the offset is
  in an *unlocated* Borland far-call overlay (`dqk-newgame-entry.md §1, §8`).

### What would *force* an EXE patch (the residual risk)

A DQK.EXE patch would be needed only if a CoK mechanic the engine executes natively
(not via ECL) differs from DQK's hard-coded behavior — e.g. CoK class/level/XP tables,
spell lists, or hard-coded area counts baked into `DQK.EXE` rather than read from data.
This is the genuine unknown. **Probe to settle it:** boot the full CoK build under
DOSBox past the menu into the overland (Milestone 1), then into a dungeon + a scripted
combat (Milestone 4), and watch for engine-vs-CoK divergences (wrong monster stats,
wrong spell availability, wrong level-up). If gameplay is faithful through a real CoK
area, the "pure data conversion" position holds. If a specific subsystem diverges, that
subsystem — and only it — gets a targeted patch, scoped at that point.

**Confidence:** high that v1 is data-only for *reaching and exploring* an area; medium
that *all CoK-specific rules* (Dragonlance class kits per `cok-dragonlance-rules.md`)
survive on the DQK rules engine without any patch. The latter is what Milestone 4 tests.

---

## 4. The pipeline (source CoK → bootable DQK dir) + the gaps

Existing flow (`tools/build-dqk-dir.mts`):

```
CoK GEO{n}/MON{n}CHA/ECL{n}.DAX
  → buildDqkGameData()         # E4.1: three GLBs + manifest
  → planDqkBuild()             # E4.2: resolve disk layout, retitle EXE, emit conf
       + overrides{}           # E5: Amiga BIGPIC/COMSPR TILEs (where solved)
       + bypassProtection      # E6.2b-4 (optional)
       + save{}                # E6.2b: party-present save to enable "Begin Adventuring"
  → write emit / copy passthrough from a DQK release
  → build/cok-on-dqk/ (+ dosbox.conf)
```

### Gap G1 — per-area DAX merge — **DONE**

**Resolved.** `buildDqkGame.ts`'s `buildDqkGameDataMulti(input)` is the multi-archive
front-end this gap called for: it takes the per-disk `GEO{1..3}`/`ECL{1..3}`/
`MON{1..3}CHA` archive arrays, unions the GEO/ECL block sets (ids confirmed globally
disjoint — 16–36 / 48–68 / 80–99, matching `dqk-newgame-entry.md §5`'s prediction
exactly, asserted by a disjoint-union guard test) and dedup-merges MON slots, reporting
everything in `manifest.merge` (a `DqkMergeAudit`: which ids came from which disk,
any conflicting monster slots — never silently dropped). Verified end-to-end on real
CoK **and** DoK multi-disk source sets in `buildDqkGameMulti.test.ts`. The single-trio
`buildDqkGameData` stays as the back-compat one-area API (`manifest.merge === null`).

### Gap G2 — MON item/special tables — **DONE**

**Resolved.** `monsterSideTables.ts`'s `mergeMonsterSideTables(itm, spc)` decodes and
merges `MON{n}ITM.DAX` (carried items) and `MON{n}SPC.DAX` (affects/spell lists) per
monster id, wired into both `buildDqkGameData` and `buildDqkGameDataMulti`. Verified on
real CoK+DoK bytes in `monsterSideTables.test.ts` (carried-item field decode, WIZ
memorized-spell-list decode, real-archive round-trip for every game in the roster).

### Gap G3 — CoK item name recode — **DONE**

**Resolved.** `cokItem.ts` implements the byte-grounded VOCAB recode: `COK_VOCAB` and
`DQK_VOCAB` were extracted from each executable's own string table (CoK `START.EXE`
offset 51326, DQK `DQK.EXE` offset 429197), and `recodeCokNamenum` maps every CoK
namenum to its DQK equivalent by exact string match (+ a 2-entry alias table for
spelling variants — "Elven"/"Elfin Chain", "3 Spell"/"3 Spells"). `portCokItemToDqk`
uses it to emit a faithful 17-byte `item.dat` record from a real 63-byte CoK item.
Words with no DQK equivalent (Long Bow, Staff, Holy Water, …) are documented and
degrade gracefully (component dropped, base type still names the item) rather than
silently wrong. Verified on real `ITEM{1,2,3}.DAX` in `cokItem.test.ts`, including a
name round-trip proof (CoK-rendered name via `COK_VOCAB` reads the same word as the
ported record rendered via `DQK_VOCAB`).

### Gap G4 — RANDCOM / random encounters — **RESOLVED (not a gap)**

**Reclassified, not ported.** The "random-encounter table" premise was a filename
inference the real bytes disprove: `RANDCOM.DAX` decodes as a **24×24 combat-backdrop
tile-set** (the same `DUNGCOM`/`WILDCOM` graphics family — confirmed independently by
the COAB clean-room decompile's `ovr034.Load24x24Set(6, 0x22, 1, "RandCom")` call and by
directly decoding the file here), not encounter data. There is no separate table to
port — wilderness/random encounters are driven by the area **ECL scripts** (which
already port via `portGen1EclArchiveToGen2` + the area-1 entry stub). Pinned by
`randcom.test.ts` so a future "port RANDCOM as data" attempt fails loudly first.

### Gap G5 — full Amiga art (format solved; repack tool now shipped, M8)

The 6-byte sub-frame format is solved end-to-end (`docs/engine/research/subframe-format.md`,
`tools/subframe_decode.py`, 158/169 files render coherent full-color art) and **is now
ported into the live TypeScript engine** — `daa.ts`'s `decodeDaa` populates real
`frameSet.frames` for `kind: 'index'` archives (SPRIT1.DAA/pic1.daa decode real pixels
today, not empty sets). `dqkArtMap.ts`'s verdict table reflects this honestly: SPRIT/
PICA/PICB/PICC moved from `blocked-unsolved-source` to **`shape-mismatch`** — the
*codec* isn't the blocker anymore, the *shapes* are (e.g. DQK `SPRIT.TLB` wants 96×
72×25 overworld-map icons; the Amiga source gives 17 base sprites × 3 distance frames
of 88×88 monster/portrait art — a fundamentally different image set, not a resize).
Lifting these needs a **repacking design decision** (crop/select/downscale which Amiga
frames map to which DQK slots — a content judgment call, not a decode problem).

**Milestone M8 closes the tooling half of this gap** (2026-07-02, M8.S1–M8.S4): a human
now has an actual editor to make that judgment call, and a mechanical function to turn
the result into real HLIB bytes — the *decision* stays a human's, exactly as scoped
above, but it is no longer "out of scope for an automated pipeline pass" in the sense of
having no tooling at all:
- M8.S1/M8.S2 — bundled + catalogued the raw Amiga `shape-mismatch` sources and the DQK
  target slot layouts side by side (`apps/web` viewer, no new format work).
- M8.S3 — `?artmap=1`, a click-to-assign two-panel editor (`artSlotMapping.ts`'s
  `AmigaSlotMapping`: `{slot, sourceBlockId, frameIndex}` triples, `localStorage`-
  persisted, JSON-exportable). Produces the mapping, makes zero art decisions itself.
- M8.S4 — `dqkArtMap.ts`'s `buildMappedArtOverride(target, sources, mapping)` mechanically
  repacks an `AmigaSlotMapping` into real, `decodeHlib`-readable HLIB bytes: relocates
  each assigned frame to the target's VGA palette base, then crop/pads (top-left anchor,
  no scaling/interpolation) to the target's exact geometry, packing ONLY the assigned
  slots (never inventing art for a slot the human didn't choose). Proven against real
  bytes both ways — real-crop (`CBODY.TLB`←`BODY1.DAA`, `8X8DC.TLB`←`8X8D1.DAA`) and
  real-pad (`CPIC.TLB`←`CPIC1.DAA`, 24×24 source into a 48×48 target). Threaded into
  `buildPortableArtOverrides` via an optional `mappings?: AmigaSlotMapping[]` — a
  `shape-mismatch` target with a supplied, valid mapping upgrades from untouched to
  `lifted`; an invalid/failing one reports `unavailable`, never throws.
  **The former SPRIT.TLB gap is CLOSED (2026-07-18): `hlibEncode.ts` now implements the
  method-23 ("compressed transparent") encoder (`encodeMethod23`), proven byte-exact
  against all 93 real SPRIT.TLB method-23 streams (96/96 chunk bodies incl. the 3
  method-21 frames — `hlibEncode.test.ts` golden), so
  `buildMappedArtOverride('SPRIT.TLB', ...)` repacks a valid mapping instead of
  throwing (`dqkArtMap.test.ts`'s sprite-slot test). See `docs/hlib-format.md` §5 for
  the packer's canonical choices (skips-not-literal-255, dropped trailing skips,
  word-aligned chunks).**

Producing an actual game-facing Amiga→DQK art mapping (curating which real frames go in
which slots for SPRIT/PICA/PICB/PICC/CPIC/etc.) remains a deliberate human content
decision, not automated by M8 — the tool exists now; the taste is still a human's. This
is the boundary the VISION doc intends for the authoring layer, not a gap still to close.

---

## 5. Verification strategy ("plays the way CoK originally did")

Lean on the project's headless-oracle pattern: prove equivalence at the *data* layer
cheaply and deterministically, then confirm the *behavior* layer in DOSBox.

### Layer A — data-layer equivalence (fast, deterministic, CI-able)

| Check | Oracle | Asserts |
|---|---|---|
| ECL re-header identity | disassemble ported `ECL.GLB` member as Gen2 vs Gen1 disasm of source DAX block | instruction streams identical (extends `eclEncode.test.ts` to *all* CoK blocks) |
| ECL execution trace | `packages/engine/src/ecl/vm.ts` (TS) **and** `native/src/ccecl.asm` (asm) | both VMs produce the same effect sequence on CoK block 34 (the dungeon-init path); already verified on Tier-1 opcodes |
| GEO round-trip | `geoEncode.ts` ↔ `geo.ts` + `native/src/ccgeo.asm /B` | ported `GEO.GLB` map decodes to the same 4 planes as the CoK DAX source; CCFP `WALLS.BIN` matches |
| MON round-trip | `moncha.ts` decode of ported `MONCHA.GLB` | equals `decodeMonsterRecord` of the CoK DAX source (stat-for-stat) |
| Combat trace | `tactical.ts` (TS) vs `native/src/cccombat.asm` | Tier-1 tactical combat identical on a CoK encounter (already verified) |
| Art render diff | `daa_to_hlib` output decoded back to PNG | lifted BIGPIC/COMSPR pixels match the Amiga source (the lossless-remap proof, `renders/daa/`) |

### Layer B — behavior-layer (DOSBox, vision-judged)

| Gate | Harness | Pass criterion |
|---|---|---|
| Boots to title | `tools/dosbot/run-boot-tests.ps1` | vision judge reads "CHAMPIONS OF KRYNN" on the front menu (**already passing**) |
| Reaches overland | extend `e62b-explore.ps1` with `--save` party-present + `--bypass-protection` | vision judge: wilderness/overland map visible, not crashed |
| Reaches a dungeon | drive into area 16→first dungeon | first-person dungeon view renders; no hang on `LOAD_FILES`/`LOAD_PIECES` |
| Scripted event fires | walk to a known CoK event cell | the CoK room/encounter text appears (string match) |
| Scripted combat | trigger a known CoK encounter | combat starts with the right monster art/name |

The vision-judged loop (qwen3-vl on the 5090, `tools/dosbot/`) is the existing
unattended judge — reuse it; do not invent a new one.

---

## 6. Milestone / task breakdown

Ordered, each with a verification gate. "Parallel" = subagent-safe (independent files,
read-mostly); "Lead" = needs integration judgment or touches shared build code.

### Milestone 1 — Smallest end-to-end slice: ONE CoK area playable on DQK engine — **DONE**

**Resolved.** `build/cok-on-dqk` (git-ignored, holds copyrighted art) assembles CoK
area-1 content + the area-1 ECL stub + title patch, and the unattended `tools/dosbot`
harness (qwen3-vl vision judge) confirms it **boots clean to the patched "CHAMPIONS OF
KRYNN" front menu with roster loaded** (E4.2b-2). The overland/dungeon render past
"Begin Adventuring" is gated on the copy-protection prompt — folded into Milestone 4
below (it turned out to be the same gate, not a separate one — see M4).

### Milestone 2 — ECL-drift verdict locked across ALL CoK blocks — **DONE**

**Resolved (2026-07-02).** `eclEncode.test.ts`'s new "ECL-drift verdict locked across
ALL CoK blocks (Milestone 2)" describe block extends the identity check from the
original ECL1.DAX-only sample to **all 22 real Gen1 ECL blocks across ECL1+ECL2+ECL3**
(ids 16–99, corpus size pinned so a future sniff regression fails loudly) — every block
re-disassembles byte-identically on the Gen2/DQK path, and the merged 22-block set
round-trips through `portGen1EclArchiveToGen2` → `decodeEclGlb` by id. **CRUX 1 (no
opcode drift) is now proven for the whole game, not a sample.** M2.2 (cross-VM trace
against the `ccecl.asm` clean-room oracle) stays open — it's a heavier ask (build +
run the asm sibling track) with lower marginal value now that the TS-side identity
check covers 100% of the corpus; revisit only if a real divergence is ever suspected.

### Milestone 3 — Full-game data merge (Gap G1) — **DONE**

**Resolved.** `buildDqkGameData.ts`'s `buildDqkGameDataMulti` is exactly the
multi-archive front-end this milestone called for — see Gap G1 above. Verified on real
CoK **and** DoK multi-disk source sets (`buildDqkGameMulti.test.ts`), including an
explicit disjoint-id-union guard test (M3.2's "collision audit," confirmed: none).

### Milestone 4 — Behavioral fidelity (settles CRUX 2 fully) — **the one open gate, BLOCKED**

Still open, and it turned out to be the **same wall as E6.2b-4** (not independent as
this doc originally assumed): the DOSBox playthrough needed for M4.1 requires getting
past DQK.EXE's per-boot copy-protection journal-word prompt, which the user wants
technically bypassed (not typed around — see `[[goldbox-protection-bypass]]`). That RE
effort has had 5 dedicated passes (2 static/DOSBox + 3 bounded Unicorn-emulator
sessions) and is formally parked pending either an interactive DOSBox-X debugger
session or a much larger FBOV-fixup-table RE effort — see `docs/engine/BUILD-QUEUE.md`
E6.2b-4 and `docs/engine/research/unicorn-dqk-trace.md`. **M4 cannot proceed until
E6.2b-4 unblocks**, at which point M4.1/M4.2 (quest-beat playthrough + rules-fidelity
cross-check) become the last remaining verification for the PRIMARY deliverable.

### Milestone 5 — Content-completeness gaps (parallelizable, independent) — **DONE**

**Resolved.** All three sub-items closed: M5.1 (MON side-tables, Gap G2) and M5.2 (item
VOCAB recode, Gap G3) both shipped in code with real-byte test coverage (see §0/§4
above); M5.3 (RANDCOM, Gap G4) resolved by reclassification — it's graphics, not a
data table, so there was nothing to port. The DOSBox spot-check this milestone also
called for is subsumed by M4 (same protection-prompt gate).

### Milestone 6 — Best-of art completion (blocked-track, opportunistic) — **codec solved, repack tool shipped (M8)**

**Resolved at the tooling layer.** M6.1's premise (solve the 6-byte sub-frame format) is
done — see Gap G5 above: the codec is solved and ported into `daa.ts`, so `SPRIT1.DAA`/
`pic1.daa` decode real pixels today. `DQK_ART_LAYOUT`'s verdict didn't automatically flip
to portable as this milestone originally predicted — the DQK target shapes (overworld
map icons, tile banks) don't match what the Amiga source frames actually are
(monster/portrait art), so the verdict correctly reads `shape-mismatch`, not `portable-*`.
Lifting these needed a repacking **design decision** (which Amiga frames map to which
DQK slots) — Milestone M8 (2026-07-02) shipped the tool for that decision: the
`?artmap=1` editor (M8.S3) for the human judgment call, and `buildMappedArtOverride`
(M8.S4) for the mechanical crop/pad/relocate repack once it's made. `BIGPIC`/`COMSPR`
still lift automatically; every other `shape-mismatch` library — SPRIT.TLB included,
since the method-23 HLIB encoder landed 2026-07-18 — now lifts once a human supplies
a mapping.

### Dependency graph (updated — only M4 is still open, and only on an external unblock)

```
M1 ──► M2 ──► M3 ──► M4 (BLOCKED on E6.2b-4 — the only open item)
          └─► M5 (done)
M6 partially done (codec solved; shape-mismatch repacking needs a user design call)
```

M1 and M2 can start immediately (both reuse existing code). M3 (the merge) is the
gating code change for a *complete* game. M4 depends on M3. M5/M6 parallel.

---

## 7. Risks + open questions needing a USER decision

| # | Question | Default taken | Why it needs the user |
|---|----------|--------------|----------------------|
| Q1 | **CoK-first vs DoK-first.** | **CoK-first** (assumed per task). | CoK is the canonical first deliverable; DoK reuses the same path (`buildDqkDisk` already supports `target:'dok'`) and the DoK item port is *already loss-free* (`dqkItem.ts`) while CoK item names are not — so DoK is arguably *easier*. User may prefer DoK-first to ship the easier one sooner. |
| Q2 | **Protection bypass ON by default in shipped builds?** | Bypass available, off unless `--bypass-protection`. | It defeats CoK's copy protection. Distribution-stance question (the engine ships without copyrighted assets; the user owns the game). User decides whether shipped rebuilds include the bypass. |
| Q3 | **Acceptable art state for v1.** | Ship with BIGPIC/COMSPR Amiga art + DQK DOS art elsewhere; SPRIT/PIC blocked. | "Superior Amiga artwork" is the stated goal but `SPRIT*`/`PIC*` are blocked on an unsolved format. User decides: ship partial-Amiga v1 now, or wait for the sub-frame solve. |
| Q4 | **CoK original DOS music, or keep DQK's XMI?** | Keep DQK XMI (no CoK music port). | Faithful-audio purists may want CoK's `MIDI.DAX` converted. Extra slice; user priority call. |
| Q5 | **Save-drop vs character-creation for "Begin Adventuring".** | Drop a party-present save (`--save`) to reach gameplay deterministically. | A pre-made party isn't a "fresh CoK start." If the user wants the authentic create-a-party flow verified, that needs mouse-driven character creation under DOSBox (harder to automate). |

### Residual technical risks (no user decision, just watch-items)

- R1: A CoK-specific *native* mechanic baked into `DQK.EXE` (class/spell/level tables)
  diverges from CoK rules → forces a targeted EXE patch (settled by M4).
- R2: ECL cross-block numeric jumps to block 16 (the remapped overland) if Option D is
  ever preferred over the stub — currently moot because Option A (stub) leaves all ids
  unchanged.
- R3: GEO/ECL/MON id pairing across merged areas (M3) — low risk (ids globally unique).

---

## 8. Bottom line — updated 2026-07-02 (gap audit: G1–G4 done, G5 tooling shipped (M8), only M4 open)

- **ECL drift (CRUX 1): no body drift, and now proven for 100% of CoK's ECL corpus**
  (all 22 blocks across ECL1/ECL2/ECL3, not a sample — Milestone 2, closed this pass).
  CoK ECL runs on the DQK engine after a 2-byte magic-strip.
- **Content-layer port is data-complete.** Every tracked gap from §4 is closed in code
  with real-byte test coverage: **G1** multi-area merge (`buildDqkGameDataMulti`), **G2**
  MON side-tables (`mergeMonsterSideTables`), **G3** CoK item VOCAB recode
  (`cokItem.ts`), **G4** RANDCOM (reclassified as art, not a gap). **G5** (Amiga
  SPRIT/PIC art) has its codec solved and ported; the DQK target shapes don't match the
  Amiga source content, so lifting them needed a repacking *design* decision — Milestone
  M8 (2026-07-02) shipped that as a tool (`?artmap=1` editor + `buildMappedArtOverride`
  mechanical repack), so the gap is now "human supplies a mapping," not "no tool exists."
- **DQK.EXE patches (CRUX 2): pure data/script conversion** + two tiny content-free
  patches (title string, optional protection stub). The new-game-id conflict is solved
  in data (area-1 stub), not in the binary.
- **The one thing left, and it's not a code gap: Milestone 4 (behavioral fidelity)**,
  blocked on the same copy-protection wall as `BUILD-QUEUE.md` E6.2b-4 (parked after 5
  RE passes — needs an interactive DOSBox-X session or a large FBOV RE effort, neither
  of which fits a bounded autonomous pass). Once that unblocks, M4's quest-beat
  playthrough is the only remaining step to fully settle "plays the way CoK originally
  did" for the PRIMARY deliverable.

---

## 9. DoK M4 build-completeness audit (2026-07-18, STATIC ONLY -- no DOSBox-X)

Scoped audit for the ROADMAP "Critical path to the two end goals (2026-07-18)" Goal-1
chain: "repeat the same M4 run for dok-on-dqk (build path already supports target:'dok'
...)". This section checks whether `dok-on-dqk` **assembles** as completely as
`cok-on-dqk` before that M4 DOSBox-X run is spent on it. It does not run DOSBox-X and does
not change the M4 blocked-vs-unblocked verdict tracked elsewhere (§6 above /
`BUILD-QUEUE.md` E6.2b-4 / ROADMAP's GameLink note).

**Method:** ran `npx tsx tools/build-dqk-dir.mts --target cok --out build/audit-cok-on-dqk`
and the same with `--target dok --src "Death Knights of Krynn" --out build/audit-dok-on-dqk`
against the real GOG `The Dark Queen of Krynn` + `Champions of Krynn` + `Death Knights of
Krynn` folders (multi-disk `--n all`, no `--amiga`/`--save`), then diffed file inventories
and spot-checked byte content. Scratch output only; not committed (`build/` is
git-ignored).

### Verdict: file-inventory-identical; two DoK-relevant content gaps found, both pre-existing and outside this driver's current wiring (not new build-script bugs)

```
[build-dqk] cok (merged 3 GEO / 3 ECL / 3 MON disks): 15 maps, 22 scripts, 57 monsters, 15 playable areas.
[build-dqk] dok (merged 3 GEO / 3 ECL / 1 MON disks): 19 maps, 25 scripts, 64 monsters, 19 playable areas.
[build-dqk] wrote 5 generated file(s) + copied 43 passthrough file(s) -> .../audit-cok-on-dqk
[build-dqk] wrote 5 generated file(s) + copied 43 passthrough file(s) -> .../audit-dok-on-dqk
```

`diff` of the two output directories' relative file lists (`find | sort`) is **empty**:
both builds emit the exact same 48 paths (5 generated + 43 passthrough), because
`DQK_DISK_LAYOUT` (`buildDqkDisk.ts`) is target-agnostic -- `target` only selects the
`GAME_TITLES` string baked into the retitled `DQK.EXE`. So at the **file-existence**
level, `dok-on-dqk` assembles exactly as completely as `cok-on-dqk`: same GEO.GLB /
MONCHA.GLB / ECL.GLB / DQK.EXE / dosbox.conf slots, same art/audio/engine passthrough
set. No missing category, no unhandled DoK format delta that breaks assembly, no
TODO-stub file. `buildDqkGameDataMulti`'s own per-disk decode is tolerant
(`safeDaxBlocks` catches a bad/absent archive and contributes zero blocks rather than
throwing), and DoK's already-documented Gen1 format deltas (216-byte compact monster
record, area/checksum GEO header word instead of CoK's constant `1024`, etc. -- see
`geo.ts`/`monster.ts`/`monchaEncode.ts` module docs) are handled in the shared decoders,
so the DoK GEO/ECL/MON port itself decodes and re-encodes cleanly (19 paired areas,
zero `monConflictingIds`, matching the `merge` audit printed above).

**Gaps found (real, but symmetric -- they affect `cok-on-dqk` too, so they are not a
"DoK assembles less than CoK" asymmetry):**

1. **ITEM.DAT / ITEMS.DAT are never overridden by the port** in `tools/build-dqk-dir.mts`.
   `portCokItemToDqk` (`cokItem.ts`) and `portDokItemToDqk` (`dqkItem.ts`) exist,
   are exported from `packages/engine/src/index.ts`, and are unit-tested in isolation
   (`cokItem.test.ts` / `dqkItem.test.ts`) -- but the CLI driver never calls them and
   never passes an `ITEM.DAT`/`ITEMS.DAT` entry into `planDqkBuild`'s `overrides`. Both
   files therefore fall through `planDqkBuild`'s "not an override, not a port GLB -> copy
   verbatim from the source DQK release" branch. Confirmed by hash: `DISK1/ITEM.DAT` and
   `DISK1/ITEMS.DAT` are **byte-identical across both `build/audit-cok-on-dqk` and
   `build/audit-dok-on-dqk`, and identical to the stock `The Dark Queen of Krynn` release's
   own files** (sha1 `bfb170222113...` / `7d11db9c871e...` in all three locations). Neither
   rebuild currently carries CoK's or DoK's own item catalogue into the assembled DOS
   directory -- both ship DQK's items untouched. This is a real content gap in the
   packaging step (not the underlying port library, which works and is tested) and
   applies equally to both targets.
2. **`MON{n}ITM.DAX` / `MON{n}SPC.DAX` (Gap G2 side-tables) are never collected by the
   multi-disk driver.** `build-dqk-dir.mts`'s `--n all` auto-discovery only globs
   `GEO{k}.DAX` / `ECL{k}.DAX` / `MON{k}CHA.DAX`; it never looks for `MON{k}ITM.DAX` /
   `MON{k}SPC.DAX` and never passes `itm`/`spc` into `buildDqkGameDataMulti` (whose
   `DqkGameInputMulti` interface does accept them). Confirmed: `game.manifest.sideTables`
   is `{withItems:0, withAffects:0, totalItems:0, totalAffects:0}` for both a real CoK and
   a real DoK multi-disk build even though both games ship `MON1ITM.DAX`/`MON1SPC.DAX`
   (CoK also ships `MON2*`/`MON3*`). §0's "Gap G2 -- Done" table entry is accurate for the
   merge function (real-byte tested in `monsterSideTables.test.ts`), but
   `buildDqkGameMulti.test.ts` (the test that exercises the actual assembly path this CLI
   driver calls) never passes `itm`/`spc` either -- so "Done" describes a library
   capability that is not yet wired into the one script that produces a bootable
   directory, for either game.
3. **DoK-specific, not shared with CoK: `MON1WIZ.DAX` (monster memorized-spell
   side-table) is decoded (`decodeMonsterWizArchive`, `monsterSideTables.ts`) and
   consumed by the browser combat engine (`combat.ts`'s `applyPreparedSpellIds` /
   `monster.ts`'s `preparedSpellIds` field), but `DqkGameInput{,Multi}` has no `wiz`
   field at all and `buildDqkGame.ts`'s `assembleGlbs` never calls
   `applyPreparedSpellIds`.** DoK's caster monsters (WIZ.DAX documents which spells they
   have memorized -- 14 blocks in the real `Death Knights of Krynn/MON1WIZ.DAX`) therefore
   lose their prepared-spell data when ported into `MONCHA.GLB` for the DOS DQK-engine
   build. CoK has no `MON{n}WIZ.DAX` file, so there is no equivalent gap on the CoK side
   -- this is a real, DoK-specific content-fidelity gap in the DOS packaging path,
   distinct from gap 2 above.
4. **Already-documented, not newly found -- restated for the M4-audit record:** DoK's
   216-byte compact monster record has no located saving-throw/XP/hit-dice fields
   (`monster.ts` "gap B5", `monchaEncode.ts`'s `NO_SAVES`), so every DoK monster's ported
   `MONCHA.GLB` record carries all-zero saves/XP/HD -- a genuine DoK-vs-CoK fidelity
   asymmetry baked into the port encoder itself (not a build-script wiring gap like 1-3),
   already known and already the honest documented state, not fixed here.

None of 1-4 broke the build (both targets assembled 48/48 files, boot-titled correctly
per the existing `dosbot` vision checks referenced in §0), and per the task's audit scope
none were fixed here -- 1 and 2 are shared, pre-existing, moderate-sized wiring gaps
(touch the CLI driver + `DqkGameInputMulti`'s call sites, need new tests) and 3 is a real
but DoK-specific and non-trivial feature addition (new interface field, new archive
discovery, new merge call) -- none of them qualify as "a missing filename in a list."
They are left as precise, named next steps rather than patched under audit scope.

### UPDATE (2026-07-18, same day): gaps 1-3 CLOSED (STATIC ONLY — gap 4 stays open)

All three wiring gaps above are now fixed and verified; gap 4 (DoK's unlocated
saves/XP/HD fields in the 216-byte compact record) remains the honest open encoder gap.

- **Gap 1 (ITEM.DAT/ITEMS.DAT) — CLOSED.** New engine module
  `packages/engine/src/loaders/buildDqkItems.ts` packs the tested per-record ports into
  the two on-disk shapes, and `tools/build-dqk-dir.mts` now passes them as `planDqkBuild`
  overrides (`buildGen1ItemOverrides`). Two on-disk facts were pinned en route:
  - the real `DISK1/ITEM.DAT` is **254 × 17-byte slots** (4,318 bytes; stride-17 decode
    yields 254/254 plausible named records, stride-18 yields garbage past slot 0). **The
    17 is the record itself, not a truncation of it** (corrected 2026-08-21): the engine's
    `DQK_ITEM_SIZE` said 18 until then, so this line was read as "an 18-byte record with its
    last byte dropped on disk". 18 is FRUA's stride — FRUA's `ITEM.DAT` is 4,572 = 254 × 18
    and is not divisible by 17, DQK's is 4,318 = 254 × 17 and is not divisible by 18. Both
    ship 254 records, which is why a record count alone never caught it;
  - the Gen1 `ITEMS` file is a **2-byte prefix + the same 128×16 catalogue layout** as
    `ITEMS.DAT`, keyed directly by the instance record's base-type byte (COAB `type`
    @0x2e) — proven via known AD&D stats (DoK Long Sword base 18→1d8, Mace 8→1d6+1,
    Dart 5→1d3; CoK Long Sword→18→1d8, Broad Sword→17→2d4, Battle Axe→1→1d8). CoK's and
    DoK's catalogues differ in only 2 of 2,048 bytes. Carrying the Gen1 catalogue keeps
    every ported instance's base-type pointer resolving to the SAME stats (DQK's own
    catalogue differs in ~20 % of bytes, so the old copy-verbatim behavior mis-statted
    every item).
  DoK's port is index-preserving byte-for-byte (slot *i* = DoK item *i*); CoK's flattens
  the area-keyed `ITEM{1..3}.DAX` in disk→block→record order — deterministic and
  name/stat-faithful, but the CoK-ECL-operand → slot-index correspondence on the DQK
  engine is **honestly unverified until the M4 run** (documented in the module doc).
  Verified by hash (the audit's own method): `DISK1/ITEM.DAT`/`ITEMS.DAT` now differ per
  target and from stock (cok `b4405cf5…`/`f947cb2f…`, dok `4f58355e…`/`8d433369…` vs stock
  `bfb17022…`/`7d11db9c…`), byte-length-identical to stock.
- **Gap 2 (MON{n}ITM/SPC side-tables) — CLOSED.** The multi-disk driver now auto-collects
  `MON{k}ITM.DAX`/`MON{k}SPC.DAX` alongside `MON{k}CHA.DAX` (and the single-disk `--n`
  path passes the per-disk pair), so `manifest.sideTables` is no longer all-zero: real
  builds report CoK 30 monsters with items (73) / 29 with specials (75), DoK 17 with
  items (56) / 52 with specials (198). `buildDqkGameMulti.test.ts` now exercises the full
  input set the driver assembles (the audit's exact finding that it never passed
  `itm`/`spc`).
- **Gap 3 (MON1WIZ.DAX) — CLOSED.** `DqkGameInput{,Multi}` gained a `wiz` field;
  `mergeMonsterWizTables` (new, in `monsterSideTables.ts`) merges per-disk WIZ archives by
  monster id; the assembly carries them as `DqkGameData.monsterWizTables` (id-keyed, like
  ITM/SPC — NOT folded into the 108-byte MONCHA record, which has no spell-list field) and
  the manifest summary gained `withSpells`/`totalSpells`. A real DoK build now reports
  **14 casters / 162 memorized spells** instead of silently dropping them. The driver
  auto-collects `MON{k}WIZ.DAX` (CoK has none — 0 casters, correctly).

Gates: `pnpm -r exec tsc --noEmit` clean; engine vitest **1743/1743** (new
`buildDqkItems.test.ts` + extended `buildDqkGameMulti.test.ts`/`monsterSideTables.test.ts`);
both targets rebuilt end-to-end (now **7 generated + 41 copied**, was 5+43);
`tools/cok_m4_static_verify.mts` still passes all data-layer checks against the new build
(the one SAVGAMA.QSV FAIL is the scratch build's deliberate lack of `--save`, not a
regression). Note for the M4 slot-holder: the fidelity build should be **re-materialized**
with the updated driver so the run exercises the ported item files too.

### Practical read for the wave-3 M4 DOSBox-X run

`dok-on-dqk` is **exactly as ready for the M4 fidelity run as `cok-on-dqk`** at the
assembly level -- same file set, same target-agnostic disk layout, same retitle path,
same `--save`/`--save-area` drop mechanism available. The M4 DOSBox-X pass does not need
to wait on gaps 1-3; they affect item flavor text/stats and caster-monster spell lists,
not whether the build boots or whether overland/dungeon/combat mechanics (the actual M4
behavioral-fidelity question) work. Gap 4 (DoK monster saves/XP/HD zeroed) is the one item
worth watching during the M4 combat leg specifically -- a DoK monster whose to-hit/damage
looks right but whose saving throws never trigger would be this gap surfacing at runtime,
not a new M4 finding.

> **Gap 4 update, 2026-08-18 -- two thirds of it is closed and the sentence above is now
> only about XP.** `DOK_LAYOUT` byte-locates DoK's **saving throws at 42..46** and **hit
> dice at 48**, so the Gen1 -> Gen2 port carries both; `encodeDqkMonsterRecord`'s
> `NO_SAVES` fallback is no longer reached for DoK. Evidence: 43/64 DoK records reproduce
> the exact AD&D 1e fighter row keyed off their own hd byte, and **0/64** do so at any of
> the other 211 candidate 5-byte windows (`docs/engine/research/dok-save-key-sweep.md`;
> the 0/64 half is table-variant-independent, which is what the anti-off-by-one conclusion
> rests on). Newly pinned by `monchaEncode.test.ts`'s DoK GHOUL/SIVAK anchors, which read
> their expected rows off the retail bytes and were confirmed to go RED under two separate
> mutations (`DOK_LAYOUT.saves` 42->43, and forcing the encoder to `NO_SAVES`).
> **Gap 4 is now CLOSED entirely (2026-08-19).** Kill XP was located too: a u16 LE flat term at
> **@109..110** with the per-hit-point multiplier at **@111**, from two byte-exact sites in
> `Death Knights of Krynn/GAME.OVR` -- `0x4CED` (the XP core of DoK's own `calc_battle_exp`,
> reading `es:[di+0x6c/0x6d/0x6f]`) and `0x12DA3` (the CoK-import table, copying **3 bytes** from
> CoK 304 to DoK 109, i.e. SSI's own statement that these are the same three fields). Cross-title
> pin: GHOUL is **(65, 2) in both titles**; in DoK's GHOUL record `u16le == 65` occurs at 109 and
> nowhere else, and a column-multiset null over 2000 draws produced the joint pattern 0 times.
> Details and the refutation record: `docs/engine/research/dok-kill-xp.md`. So the M4 combat-leg
> watch item that this note previously narrowed to "a DoK kill awarding no experience" is now
> **retired** -- DoK monsters port with real saves, hit dice and XP.
>
> **The one thing that does NOT port as a renumbering:** the treasure->XP conversion. DoK pools
> **3** money slots into the battle total where CoK pools **7** (loop-start `c6 46 fb 04` vs
> `c6 46 fb 00`). Anything that ports the money term by displacement translation alone will be
> wrong; that term needs its own pass.

---

## 10. Curated Amiga→DQK art-slot mapping — first committed mapping data (2026-07-18, wave-1)

The ROADMAP wave-1 item "Curate the Amiga→DQK art-slot mapping for SPRIT/PICA/PICB/PICC"
is now closed with **committed, evidence-based mapping data**:
`packages/engine/data/cok-amiga-art-mappings.json` (strict `AmigaSlotMapping[]` under a
`mappings` key, plus machine-readable `provenance`/`unmapped`/`knownMechanicalGaps`
audits). Wired into `tools/build-dqk-dir.mts` (`--amiga` now auto-loads
`packages/engine/data/{target}-amiga-art-mappings.json` and passes it to
`buildPortableArtOverrides`), and validated end-to-end in `dqkArtMap.test.ts`'s new
"committed CoK Amiga→DQK art-slot mapping" describe block.

**Method — programmatic evidence, not taste.** Every assignment rests on two measured
facts (probed from the real bytes, not inferred):

1. **Set-id/block-id parity.** The DQK masters carry a real set-id table (HLIB §1c —
   `{u16 id, u16 ptr#}` per set). Measured: PICA carries engine picture ids
   `5,10,14,21,23,30,32,43,44,49,64,70,74,84,90,91,112-116` (all <128); PICB carries
   `128-150`; PICC `151-174,239`; SPRIT `1..195`. The cok-on-dqk build ships CoK's ECL
   *unchanged*, so the engine will request **CoK picture ids** — and CoK's picture id
   space (union of `PIC1/2/3.DAX` block ids ≡ Amiga `pic1/pic2.daa` block ids) tops out
   at **73**. An Amiga block is a candidate for a DQK slot iff their ids are equal.
   Cross-checks: all 14 pic block ids shared between `pic1.daa` and `pic2.daa` are
   **pixel-identical** frame-for-frame (same id = same asset across disks), and the
   Amiga SPRIT id union equals the DOS SPRIT id union exactly.
2. **Exact dimension parity.** A pair maps only when the Amiga frame and the real DQK
   slot have identical geometry (88×88 == 88×88). Mismatches are *flagged* in
   `unmapped`, never forced through the top-left crop/pad.

**Coverage result (slots mapped / candidates flagged / no candidate):**

| Family | Mapped | Flagged (candidates exist, blocked) | No candidate | Why |
|---|---|---|---|---|
| `PICA.TLB` | **6** (slots 0,3,14,18,22,24 ← `pic2.daa` blocks 5,10,23,32,44,64, frame 0) | 3 (id 14/slot 6 + id 70/slot 25: DQK base is 96×104 vs Amiga 88×88; id 30/slot 17: only in `pic1.daa`, blocked by the one-source-per-target mapping model) | 26 (14 anim-overlay slots — structurally different animation systems; 12 base slots whose ids no CoK picture carries) | the one family CoK ids actually reach |
| `PICB.TLB` | 0 | 0 | 36 | ids 128-150 are out of CoK's 0-73 picture id space — unreachable by CoK content (watch-item: engine-side Camp pic id 128) |
| `PICC.TLB` | 0 | 0 | 47 | ids 151-174,239 — same reasoning |
| `SPRIT.TLB` | 0 | 11 id-parity candidates (ids 1,2,3,4,8,12,14,19,22,25,28) | 85 | blocked on two *mechanical* repack gaps, not mapping unknowns: Amiga frames are 88×88 canvases vs per-slot tight crops (and the tool crops everything to the table's 72×25), and master method-23 repack applies no transparent-background keying — a mapped sprite would render as an opaque box |

**Validation (all green):** each committed mapping round-trips
`deserializeSlotMapping` + `validateSlotMapping`; against the real GOG + Amiga bytes the
PICA mapping repacks through `buildMappedArtOverride` into a decodable HLIB master whose
6 images are **pixel-exact** relocations of the Amiga source (dims equal → the crop/pad
stage is a proven no-op), and `buildPortableArtOverrides(sources, mappings)` reports
`PICA.TLB` lifted. Proof sheets (original DQK slot vs mapped Amiga art, decoded back out
of the actual override bytes): `npx tsx tools/render_artmap_proof.mts` →
`renders/artmap/PICA_slot{N}_{dqk,amiga}.bmp` (git-ignored; the six Amiga renders are
coherent CoK art — monster, portraits, flying citadel, etc.).

**Honest limits (recorded in the JSON's `knownMechanicalGaps`, follow-up slices, not
mapping work):** (a) `buildMappedArtOverride` still emits a placeholder set-id table
(ids 0..n-1) and packs only assigned slots — for the real DOS engine to *find* CoK
picture id N in the override, `encodeHlibMaster` must eventually receive a real set-id
table carrying the mapped ids and carry unassigned sets over from the DQK original;
(b) no transparent keying for master method-23 targets (blocks all SPRIT candidates);
(c) the one-source-per-target model blocks `pic1.daa`-only id 30. Closing (a)+(b) turns
the 11 SPRIT candidates and 1 pic1-only slot into mappable rows with zero new curation.

## 11. Drop-in art-override rebuild — §10's two mechanical gaps CLOSED, SPRIT candidates adjudicated (2026-07-18)

§10's `knownMechanicalGaps` (a) and (b) — plus the (c) one-source-per-target model gap —
are now closed in code, and the 11 recorded SPRIT id-parity candidates plus the pic1-only
PICA slot were re-examined against the evidence gate they were waiting on. Result: **PICA
gains slot 17 (7 mapped slots total, now emitted as a true drop-in replacement); all 11
SPRIT candidates are REJECTED on measured evidence** (not on mechanics — the mechanics now
work and are proven by tests on the real bytes).

**Gap (a) closed — real set-id table + verbatim carry-over.** `buildMappedArtOverride`
takes an optional 4th argument: the ORIGINAL DQK `.TLB` bytes. When supplied (the real
build always does), the override is rebuilt FROM the original via the new
`rebuildHlibMasterWithSlotReplacements` (`hlibEncode.ts`) + `mapHlibMasterSlots`
(`hlib.ts`, maps each flattened `decodeHlib` image index to its physical set/pointer
location + per-slot geometry/draw method): member[0] (the §1c set-id table) is preserved
**byte-for-byte** (pointer-#s stay valid because set count/order never change), every set
holding no mapped slot is carried over **verbatim** (byte-identical slice), and each mapped
slot is replaced in place at its own original geometry and draw method, with the Amiga
32-colour palette patched over the owning set's colour-table RGB slice (header, cycling
ranges, and out-of-slice colours untouched). Verified against the real GOG bytes: the
emitted `build/cok-on-dqk-*/DISK2/PICA.TLB` decodes to 37/37 images, set-id table
byte-identical, 7/7 mapped slots replaced, 30/30 unmapped slots pixel-identical to the
original — a drop-in with the original's full engine picture-id coverage.
`buildPortableArtOverrides` gained the matching `originals` parameter and
`tools/build-dqk-dir.mts --amiga` now feeds it the DQK release's TLBs.

**Gap (b) closed — method-23 transparent keying + per-slot crop.** In drop-in mode a
transparent-class slot (draw method 21/23) keys the source frame's **measured** background
(dominant border colour, new `detectFrameTransparentBackground` in `amigaToHlib.ts` — the
per-frame counterpart of the archive-level detector; measured because the key varies
per frame within one Amiga archive: SPRIT frame 0 uses index 13, frames 1/2 use index 0)
to the HLIB 255 key BEFORE cropping, so `encodeMethod23` emits skip runs instead of an
opaque box. And the crop is now **per-slot** to the slot's own original dimensions (from
the master TLB), not the layout table's first-image geometry — the old hardcoded-72×25
behavior survives only in the legacy no-original mode. Both proven by a real-bytes test:
an ad-hoc SPRIT.TLB drop-in mapping (slots 0/3/39 ← SPRIT1.DAA block 25 frame 1) decodes
at 72×25 / 72×45 / 88×88 respectively with the decoded transparent-pixel mask exactly
equal to the Amiga source's background mask (`dqkArtMap.test.ts` "drop-in override
rebuild" describe).

**Gap (c) closed — per-assignment source.** `SlotAssignment` gained an optional `source`
field (backward compatible; absent = the mapping-level source), so one target can draw on
several Amiga archives. This unblocked **PICA slot 17** (DQK set id 30, 88×88 m18) ←
`pic1.daa` block 30 frame 0 (88×88, pixel-coherent white-dragon portrait — proof render
`renders/artmap/PICA_slot17_amiga.bmp`), which passes the full §10 gate: id parity ✓,
exact dimension parity ✓, decodable round-trip ✓. Committed in
`cok-amiga-art-mappings.json` (now 7 assignments + provenance).

**SPRIT: all 11 candidates rejected on the evidence gate (measured, per-frame).** With
the mechanics unblocked, the candidates were probed frame-by-frame against the real
`SPRIT.TLB` per-slot geometry:

1. **No zoom correspondence exists.** DQK sets carry 3 tightly-cropped zoom frames
   (e.g. id 12: 72×73 / 40×42 / 24×24). The Amiga sub-frame's 3 frames are NOT zooms:
   frame 0 is an 88×88 **multi-figure sheet** (magenta bg=13, figures clipped at the
   canvas edges), frames 1/2 are two **same-size animation poses** on black (bg=0 — e.g.
   id 12 both bbox 50×60). The DOS CoK `SPRIT1.DAX` same ids DO hold 3 shrinking zooms —
   the Amiga simply stores different content. No candidate has any frame whose keyed art
   bbox fits its set's z1/z2 slots (16×16..64×39); z0 fits exist only for ids
   4/8/12/14/25/28 via frames 1/2.
2. **Frames 1/2 render with an incoherent palette** — the block's own 32-colour table
   yields rainbow noise on them while rendering frame 0 coherently (matches the
   checked-in `renders/subframe/amiga_cok_sprit1/` output; the DOS twins are coherent).
   An unresolved Amiga-side palette question, upstream of any repack.
3. **The one dimension-exact pair** (id 25 base slot 39, 88×88 == 88×88) fails eyeball
   coherence: frame 0 is the multi-figure sheet, not a single sprite.
4. Partial z0-only lifts were also rejected: one sprite id would then morph between CoK
   art (close) and DQK art (mid/far) as the party approaches.

Full per-id audit is in the JSON's rewritten `SPRIT.TLB` unmapped entry. SPRIT unblocks
only when the Amiga combat-frame palette question is solved AND a frame-role
correspondence is evidenced — a research finding, no longer a tooling gap.

**Validation:** `dqkArtMap.test.ts` +4 tests (all running on the real GOG + Amiga bytes,
none skipped): PICA drop-in (37-image coverage, set-id byte-preservation, verbatim
unmapped sets, replaced slots pixel-exact + palette-slice patch), SPRIT ad-hoc drop-in
(per-slot crop dims + transparency mask round-trip + set-id preservation), per-assignment
source schema/loud-failure, leaf-target refusal. Proof renders regenerated for all 7 PICA
slots (drop-in path). Gates: `pnpm -r exec tsc --noEmit` clean; engine vitest 146 files /
1723 tests green.
