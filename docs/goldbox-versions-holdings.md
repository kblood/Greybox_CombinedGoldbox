# Gold Box — What This Project Actually Holds

Dated 2026-08-14. Companion to [`goldbox-ports-census.md`](goldbox-ports-census.md). That file
is web-sourced secondary research about what *exists*; this file is byte-grounded and records
only what is **present on this machine**, enumerated from disk.

Everything below was produced by listing the filesystem directly. Where a count is given it is
a real count, not an estimate. Where something is absent it is recorded as a gap rather than
quietly omitted.

> **Correction, same day.** The first automated inventory pass covered only four locations —
> the repository root and three paths on `D:\` — because that is the list it was given, taken
> from `CLAUDE.md`. That list was incomplete, and the resulting gap list was badly wrong: it
> reported no DOS copy for Gateway, Treasures, Pool of Radiance, Curse of the Azure Bonds,
> Secret of the Silver Blades or Pools of Darkness, and no FRUA holdings at all. All six of
> those, plus FRUA, are installed via **GOG Galaxy**, a fifth location nobody had written down.
> It also flagged two Buck Rogers archives as an unreconciled discrepancy; those are real and
> are now opened and counted. The corrected position is close to the opposite of the first
> draft: **DOS coverage of the Gold Box line is complete.**

> **Second correction, 2026-08-26 — the same false gap, one location further down.** This
> document said we hold Countdown to Doomsday's DOS install, and we do; the *corpus scanner*
> disagreed and reported `local-install-not-found`, for two independent reasons. It never looked
> at `D:\Games\Emulator\DOS\Goldbox` (only the repo, GOG Galaxy and the NWN folder), and its
> marker set for the title required `BUCK1.EXE`/`BUCK2.EXE`/`BUCK3.EXE`, which that release does
> not contain — it ships `START.EXE`, `GAME.OVR` and `BUCK.CFG`. Both are fixed. The title now
> reports **detected**, contributing **73 DAX containers / 570 members, 0 parse failures**, which
> takes the whole corpus from 542/9535 to 615/10105. **Matrix Cubed stays undetected on purpose**:
> it is still inside `buckrogers2_dos_win.7z` and this project does not vendor or auto-extract
> source archives. A holdings document and a scanner can disagree, and when they do it is worth
> asking which one is wrong before believing either.

## 1. Headline

- **DOS: every canonical Gold Box game is held.** All twelve, counting both Buck Rogers titles
  and FRUA. The only Gold Box-adjacent thing not held in any form is the AOL *Neverwinter
  Nights* service game, which cannot be held — the service shut down in 1997 and no
  distributable client release exists.
- **Amiga: ten titles**, via the pre-unpacked WHDLoad collection, plus raw `.adf`/`.adz` disk
  images for seven of them.
- **C64: seven titles**, 49 `.d64` sides, plus 8 alternate-dump sides and 6 `.g64` GCR images.
- **Nothing at all** for Macintosh, Apple II, NES/Famicom, Genesis, Atari ST, or any Japanese
  platform. Every claim in the census about those ports is unverifiable from here.

## 2. Master matrix

Legend: **●** held · **◐** held but partial or indirect · **—** not held · **N/A** no such
release exists (per the census, which is secondary research — see that file's caveats).

| Game | DOS | Amiga | C64 | Mac | Apple II | Other |
|---|---|---|---|---|---|---|
| Pool of Radiance | ● GOG | ● WHDLoad + 2 img | ● 10 sides | — | — | — NES/Famicom |
| Curse of the Azure Bonds | ● GOG | ● WHDLoad + 4 img | ● 6 sides | — | — | |
| Secret of the Silver Blades | ● GOG | ● WHDLoad + 2 img | ● 6 sides | — | N/A | |
| Pools of Darkness | ● GOG | ● WHDLoad(+De) + 3 img | N/A | — | N/A | |
| Champions of Krynn | ● GOG + repo | ● WHDLoad + 8 img | ● 7 sides | N/A | — | ● 6 `.g64` GCR |
| Death Knights of Krynn | ● GOG + repo | ● WHDLoad(+De) + 5 img | ● 6 sides | N/A | N/A | |
| The Dark Queen of Krynn | ● GOG + repo | ● WHDLoad + 6 img | N/A | — | N/A | |
| Gateway to the Savage Frontier | ● GOG | ● WHDLoad | ● 8 sides | N/A | N/A | |
| Treasures of the Savage Frontier | ● GOG | ● WHDLoad | N/A | N/A | N/A | |
| Buck Rogers: Countdown to Doomsday | ● local | ● WHDLoad(+De), ◐ 1 `.adf` | ● 6 sides | N/A | N/A | — Genesis |
| Buck Rogers: Matrix Cubed | ◐ `.7z` bundle | N/A (cancelled) | N/A | N/A | N/A | |
| Forgotten Realms: Unlimited Adventures | ● GOG | N/A | N/A | — | N/A | |
| *Neverwinter Nights* (AOL) | N/A | N/A | N/A | N/A | N/A | service defunct 1997 |

## 3. DOS — complete coverage

### 3a. GOG Galaxy installs (`C:\Program Files (x86)\GOG Galaxy\Games\`)

The location the first pass missed. Ten Gold Box titles:

| Title | Files | Size | `.DAX` | `.TLB`/`.GLB` |
|---|---:|---:|---:|---:|
| Pool of Radiance | 193 | 54.6 MB | 113 | 0 |
| Curse of the Azure Bonds | 146 | 235.3 MB | 86 | 0 |
| Secret of the Silver Blades | 89 | 104.7 MB | 36 | 0 |
| Pools of Darkness | 105 | 67.1 MB | 25 | 0 |
| Champions of Krynn | 108 | 31.3 MB | 52 | 0 |
| Death Knights of Krynn | 238 | 27.2 MB | 50 | 0 |
| Gateway to the Savage Frontier | 115 | 34.0 MB | 70 | 0 |
| Treasures of the Savage Frontier | 101 | 28.9 MB | 29 | 0 |
| The Dark Queen of Krynn | 903 | 33.6 MB | 0 | **23** |
| Forgotten Realms: Unlimited Adventures | 145 | 100.2 MB | 0 | **29** |

Also present: **Hillsfar** (90 files, 34.2 MB) — the SSI AD&D action/RPG that shares character
files with Pool of Radiance and Curse of the Azure Bonds. It is not a Gold Box engine title
(zero `.DAX`, zero `.TLB`/`.GLB`) but is relevant to any character-import work.

**The container split is byte-visible in that table.** Ten titles divide cleanly: eight are
`.DAX` (Gen1) and two — DQK and FRUA — are `.TLB`/`.GLB` (HLIB). This locally confirms what
[`findings.md`](findings.md) §2 previously asserted from lineage alone: HLIB is the container
generation shared by DQK and Unlimited Adventures. FRUA is therefore a **second, independent
HLIB corpus** for anyone reading or writing that format, which matters because no HLIB
repacker exists yet and FRUA's files were authored by the same toolchain.

### 3b. Repository root (`{repo-root}\`)

Champions of Krynn (108 files, 31.3 MB), Death Knights of Krynn (237, 27.2), The Dark Queen of
Krynn (986, 52.5). These are the same GOG releases as above, vendored into the repo as the
working copies. DQK's higher file count here reflects extraction and build outputs, not extra
retail content.

### 3c. Non-GOG DOS (`D:\Games\Emulator\DOS\Goldbox\`)

| Item | Contents |
|---|---|
| `BuckRogers1-CountdownToDoomsday\` | 91 files, 1.78 MB — plain DAX release (`*.dax`, `game.ovr`, `start.exe`, per-character `.sav`/`.stf`, `read_me.1st`). No GOG markers. This is the only DOS Buck Rogers install not inside an archive. |
| `buckrogers2_dos_win.7z` | 2.0 MB, 58 files / 7 folders. **Matrix Cubed**, under `BuckRogers2\c\Matrix\` — `START.EXE` (70,277 B), `TITLE.DAX`, `WALLDEF1.DAX`, `VENUSCOM.DAX`, `TANDY.ADV`; 31 `.DAX`/`.EXE`/`.OVR`/`.CFG` files total. A gamesnostalgia DOSBox bundle, not an original distribution. **Matrix Cubed is a DAX title** — relevant, since it is the last Gold Box game and was not previously known to be held. |
| `buckrogers_amiga_win.7z` | 7.6 MB, 208 files / 26 folders. Buck Rogers Amiga in an FS-UAE bundle. Ships a **single** 901,120-byte `disk.adf` (one standard Amiga DD floppy), so treat this as partial: the retail Amiga release was multi-disk. |
| `buckrogers_manual.7z` | 75.1 MB — documentation scans. |

Both `.7z` bundles were flagged as an unreconciled discrepancy by the first pass and are now
opened and verified. They are third-party repackagings; the DOSBox/FS-UAE wrappers are not
original material and should not be treated as release evidence for the census.

> **2026-09-03 (R6, round 30) — Matrix Cubed extracted.** `buckrogers2_dos_win.7z` was extracted
> (read-only source, never written to; SHA-256
> `cc98d0bb20672684301ff27af85d106536721a27dcbbafc3ae786a7eb88f8a1b` unchanged before/after) into
> the git-ignored `matrixcubed_extracted/` (`.gitignore:5`'s `*_extracted/` rule — the same
> convention as `daxdump_extracted/`/`hackdocs_extracted/`/`amiga_extracted/`), via
> `tools/matrix_cubed_extract.py`. **py7zr 1.1.0 cannot open this archive** (unsupported BCJ2
> filter); the script's `7z.exe` CLI fallback did the actual extraction. Confirmed **58 files / 7
> folders**, matching the count above; of the row above's "31 `.DAX`/`.EXE`/`.OVR`/`.CFG` files
> total", the real count is **30** (27 `.DAX` + `START.EXE` + `GAME.OVR` + `MATRIX.CFG` — measured
> directly on the extracted files, not re-derived from the archive listing that row was likely
> built from). All 27 `.DAX` containers' offset chains close exactly on EOF; total 611 members
> across them. `GAME.OVR`'s magic is **`FBOV`**, NOT `TPOV` — the round 30 plan predicted TPOV by
> analogy with Countdown to Doomsday's own `GAME.OVR` (measured `TPOV` in commit `9b0dfeb`), but
> Matrix Cubed's own bytes disagree with its sibling title's overlay-manager magic. Every one of
> the 411 picture blocks across the 19 graphics-bearing `.DAX` files decodes as an
> embedded-6-bit-DAC-palette VGA format (`tools/dax_decode.py`'s `vga-chunky-items` /
> `vga-compressed-picture`), never as plain EGA 4bpp — this corrected
> `packages/engine/src/detect/profiles.ts`'s `buck-rogers-matrix-cubed` DOS `graphicSet` from
> `'dos-ega'` to `'dos-vga'`. Full inventory, the browser manifest and ledger profile, and the
> scratch validator run: `docs/engine/research/matrix-cubed-profile.md`. (Corrected 2026-09-03:
> this note originally said the manifest and ledger profile were "not yet landed", pending
> round 30's Phase B. They have since landed —
> `apps/web/games/buck-rogers-matrix-cubed.json` exists, is listed in
> `apps/web/src/ui/gameview.ts`'s `GAME_IDS`, and `tools/goldbox_capabilities.json` carries the
> `buck-rogers-matrix-cubed` profile entry.) This note does not change the "does not vendor
> or auto-extract" sentence two paragraphs above (§0's correction, `:28-30`) — that sentence is
> still true of the *corpus scanner* (`tools/goldbox_corpus.py` still does not itself extract
> anything); this was a separate, one-time, human/agent-directed extraction into the `*_extracted/`
> convention `CLAUDE.md` already documents, run once and checked in nowhere.

## 4. Amiga

### 4a. WHDLoad pre-unpacked filesystems

`D:\Games\Emulator\Amiga\WHDLoad\...\Games-WHDLoad\unpacked\` — no ADF extraction needed.
**Ten** Gold Box titles, plus three German variants:

| Entry | Files | Size |
|---|---:|---:|
| `PoolOfRadiance` | 56 | 1.3 MB |
| `CurseOfTheAzureBonds` | 46 | 1.3 MB |
| `SecretOfTheSilverBlades` | 38 | 1.3 MB |
| `PoolsOfDarkness` (+ `PoolsOfDarknessDe`) | 63 (+9) | 2.4 MB (+0.0) |
| `ChampionsOfKrynn` | 109 | 2.0 MB |
| `DeathKnightsOfKrynn` (+ `DeathKnightsOfKrynnDe`) | 103 (+104) | 1.8 MB (+1.8) |
| `DarkQueenOfKrynn` | 50 | 2.2 MB |
| `GatewayToSavageFrontier` | 51 | 1.9 MB |
| `TreasuresOfSavageFrontier` | 52 | 2.3 MB |
| `BuckRogersCountdownDday` (+ `BuckRogersCountdownDdayDe`) | 116 (+115) | 1.8 MB (+1.8) |

`PoolsOfDarknessDe` is 9 files and effectively zero bytes — a stub or patch, not a playable
German build; do not count it as a localised release.

> **`CLAUDE.md` was stale here; it has since been corrected.** As of this note (2026-08-14) it
> listed nine Gold Box WHDLoad titles and omitted **`BuckRogersCountdownDday`** and its German
> variant. `CLAUDE.md` now lists all ten, with its own note recording that the omission held
> until 2026-08-14 and that Amiga Buck Rogers was wrongly believed unheld until then — verified
> by reading `CLAUDE.md`'s current "Two more Amiga source locations" paragraph, which names
> `BuckRogersCountdownDday (+De)` explicitly.

### 4b. Raw disk images

| Set | Images |
|---|---:|
| `SSI - Krynn trilogi\champions of krynn` | 8 |
| `SSI - Krynn trilogi\dark queen` | 6 |
| `SSI - Krynn trilogi\DeathKnightsOfKrynn` | 5 |
| `SSI - Pool\1 Pools of Darkness` | 3 |
| `SSI - Pool\2 AzureBonds` | 4 |
| `SSI - Pool\3 SilverBlades` | 2 |
| `SSI - Pool\4 Pool of Radiance` | 2 |

30 `.adf`/`.adz` images across seven titles, including crack variants (Defjam-CCS, Paranoimia,
Quartex, Skid Row) and clean sets. The Krynn CoK set is the only one with a verified clean
variant. Our own extraction of Amiga DQK Disk 3 fails (`unadf` segfaults); the WHDLoad
`DarkQueenOfKrynn` entry above supplies that disk's data, so the gap is closed by a different
source rather than by a better dump — see [`findings.md`](findings.md) §3.

## 5. C64

`D:\Games\Emulator\C64\Goldbox\` — seven titles, **49 `.d64` sides**, all reading clean:

| Title | Sides |
|---|---:|
| Pool of Radiance | 10 |
| Gateway to the Savage Frontier | 8 |
| Champions of Krynn | 7 |
| Curse of the Azure Bonds | 6 |
| Death Knights of Krynn | 6 |
| Secret of the Silver Blades | 6 |
| Buck Rogers - Countdown to Doomsday | 6 |

Plus `Goldbox-alternates\` (8 sides — the independent dump that replaced CoAB's damaged sides
3 and 4) and `MyGames\CoK\` (6 `.g64` GCR flux images, the only GCR-format material and so the
only thing exercising that half of the reader).

**This set independently corroborates the census's entire C64 column**: the census lists
exactly these seven titles as having C64 releases and marks Pools of Darkness, DQK, Treasures,
Matrix Cubed and FRUA as never released on C64. Seven claimed, seven held. It also confirms
the Gateway C64 release, which an earlier repo note denied.

Two traps, both of which have already produced wrong results here:

- Glob `<Title>\*.d64` **non-recursively**. Each title keeps a `superseded\` subfolder of
  damaged dumps; a recursive glob reads them back in.
- The 2-byte PRG prefix is a load address **rewritten by the DOS port**, not inherited. Always
  compare payloads **from offset 2**.

## 6. What we hold nothing for

| Platform | Affected titles | Consequence |
|---|---|---|
| Macintosh | PoR, CoAB, SSB, Pools of Darkness, DQK, FRUA | Census says these exist; unverifiable here. |
| Apple II / IIgs | PoR, CoAB, CoK | Same. |
| NES / Famicom | Pool of Radiance | Same. Console ports are the census's least reliable region. |
| Sega Genesis | Buck Rogers: Countdown to Doomsday | Same. |
| Atari ST | CoAB (and the disputed SSB claim) | Same. |
| PC-98 / PC-88 / X1 | PoR, CoK, DoK per census | Japanese ports are entirely unverified from here. |

Absence here is **absence of holdings, not evidence of absence of the port**. These rows are
the exact set of census claims that cannot be checked against bytes, which is why the census
keeps its disputed section rather than collapsing to a clean table.

## 7. Why it matters for this project

- **Art sourcing.** The project's verdict is Amiga art for CoK/DoK and DOS VGA for DQK
  ([`findings.md`](findings.md) §1). Both sources are held for all three Krynn games, in two
  independent forms for the Amiga side (WHDLoad plus raw images). That verdict is not blocked
  by any gap in this table.
- **The C64 is an oracle, not an art source.** Its 16-colour multicolour art is not a
  candidate for anything. Its value is structural: the C64 release is effectively an unpacked
  `.DAX`, with loose CBM files whose filename hex suffix is the DOS block id, which makes it an
  independent check on DAX block identity that no other platform provides. See
  [`c64-disk-format.md`](engine/research/c64-disk-format.md).
- **FRUA is a second HLIB corpus.** §3a shows FRUA and DQK are the only two `.TLB`/`.GLB`
  titles held. Since no HLIB repacker exists and writing one is an open risk in
  [`findings.md`](findings.md) §5, a second same-toolchain corpus is directly useful for
  validating a writer against files it has never seen.
- **Matrix Cubed is newly known to be held**, and is a DAX title. It is the last Gold Box game
  and was previously assumed absent; anyone reasoning about Gen1 DAX coverage should include it.
- **The German Amiga variants** (DoK, Buck Rogers) are the only localisations held in any form,
  and are the only local check available on the census's localisation claims.

## 8. Method and limits

Enumerated from five locations: the repository root, GOG Galaxy's install directory, and three
paths on `D:\` (Amiga images, the WHDLoad unpacked collection, C64 images and non-GOG DOS).
All external paths are read-only and are never vendored into the repository.

The first pass covered only four of those five and produced a substantially wrong gap list; the
missing location was GOG Galaxy. If a future pass is automated again, enumerate the fifth
location explicitly, and note that no documentation file in this repo listed it at the time —
`CLAUDE.md` included, though `CLAUDE.md`'s separate under-count of the WHDLoad set (omitting
Buck Rogers) has since been fixed there; see the §4a note above.

Sizes are as reported by the filesystem and include third-party wrapper material (DOSBox,
FS-UAE) where the holding is a repackaged bundle rather than an original distribution.
