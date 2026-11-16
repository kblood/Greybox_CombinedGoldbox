# Amiga Krynn Trilogy — Disk Extraction Inventory

Generated: 2026-06-20

---

## Summary Table

| Game | Variant Used | Disks | Files Extracted | Unreadable Disks |
|------|-------------|-------|-----------------|-----------------|
| Champions of Krynn (CoK) | Clean set `ChampionsOfKrynn_Nof3.Adf` | 3 of 3 | 109 | None |
| Death Knights of Krynn (DoK) | `dkk01.adz` / `dkk02.adz` (Skid Row crack) | 2 of 2 | 137 | None |
| Dark Queen of Krynn (DQK) | Skid Row `.adf` set | 1+2 readable; 3 unreadable | 53 | Disk 3 (crash), Disk 2 (data errors but extracted) |

**Extraction root:** `{repo-root}\amiga_extracted\`

---

## Champions of Krynn — Full File Inventory

**Set:** `ChampionsOfKrynn_1of3.Adf`, `ChampionsOfKrynn_2of3.Adf`, `ChampionsOfKrynn_3of3.Adf`
**Filesystem:** OFS (Old Filing System) — all 3 disks standard, readable with minor boot-block checksum warning (not an error).

### Disk 1 (`amiga_extracted/ChampionsOfKrynn/disk1/`)

| Path | Size (bytes) | Type Guess |
|------|-------------|-----------|
| `.info` | 46 | Workbench icon |
| `8X8D0.DAA` | 25,916 | Graphics — 8x8 tile font/character set (set 0) |
| `BORDER.DAA` | 287 | Graphics — UI border definition |
| `DUNGCOM.DAA` | 8,935 | Graphics — dungeon common sprites/tiles |
| `Disk.info` | 306 | Workbench disk icon |
| `EmptyDirectory/.info` | 16 | Workbench icon |
| `RANDCOM.DAA` | 1,757 | Graphics — random common element |
| `SKY.DAA` | 2,981 | Graphics — sky/outdoor backdrop |
| `Sound/arrow` | 778 | Audio sample |
| `Sound/cast2` | 2,468 | Audio sample |
| `Sound/cast3` | 59 | Audio data/header |
| `Sound/cast3Samp` | 6,516 | Audio sample |
| `Sound/cast4` | 64 | Audio data/header |
| `Sound/dead` | 4,898 | Audio sample |
| `Sound/fireb` | 1,804 | Audio sample |
| `Sound/gate` | 2,468 | Audio sample |
| `Sound/hit` | 2,004 | Audio sample |
| `Sound/krynn` | 2,306 | Music module/data |
| `Sound/lightSamp` | 846 | Audio sample |
| `Sound/pad` | 324 | Audio sample |
| `Sound/pad2` | 1,772 | Audio sample |
| `Sound/periodTable` | 640 | Audio period table (pitch lookup) |
| `Sound/soundData` | 4,013 | Audio data blob |
| `Sound/swish` | 1,344 | Audio sample |
| `Sound/tuningfork` | 1,860 | Audio sample |
| `Sound/whislSamp2` | 558 | Audio sample |
| `WILDCOM.DAA` | 8,410 | Graphics — wildcard/combat common sprites |
| `c/assign` | 3,008 | AmigaOS executable (system) |
| `c/endcli` | 696 | AmigaOS executable (system) |
| `c/run` | 2,568 | AmigaOS executable (system) |
| `c/stack` | 872 | AmigaOS executable (system) |
| `charS.LBM` | 16,504 | **GRAPHICS** — IFF/LBM character screen (portrait or charset) |
| `charT.LBM` | 25,652 | **GRAPHICS** — IFF/LBM character screen/tileset |
| `comspr.daa` | 12,865 | Graphics — common sprite sheet |
| `emptydirectory.info` | 894 | Workbench icon |
| `game` | 479,844 | **Executable** — main game binary |
| `game.info` | 12,338 | Workbench icon (large — likely includes icon image) |
| `gothic.lbm` | 1,166 | **GRAPHICS** — IFF/LBM (small — gothic font or decorative) |
| `hdinstall` | 16,784 | Executable — HD installer |
| `hdinstall.info` | 518 | Workbench icon |
| `items` | 2,050 | Data — item definitions |
| `l/disk-validator` | 1,848 | AmigaOS library/filesystem |
| `pointers.daa` | 804 | Data — pointer table |
| `s/startup-sequence` | 40 | AmigaOS script |
| `scrn1b.lbm` | 33,134 | **GRAPHICS** — IFF/LBM full screen image (intro/cutscene) |
| `scrn2.lbm` | 34,626 | **GRAPHICS** — IFF/LBM full screen image (intro/cutscene) |
| `text1.lbm` | 11,030 | **GRAPHICS** — IFF/LBM text background screen |
| `text2.lbm` | 14,462 | **GRAPHICS** — IFF/LBM text background screen |

### Disk 2 (`amiga_extracted/ChampionsOfKrynn/disk2/`)

| Path | Size (bytes) | Type Guess |
|------|-------------|-----------|
| `8X8D1.DAA` | 25,916 | Graphics — 8x8 tile font/character set (set 1, area 1) |
| `8X8D1.DAX` | 14,346 | Graphics — compressed 8x8 tile set (area 1 variant) |
| `BIGPIC1.DAA` | 103,275 | **GRAPHICS** — large picture pack (area 1 big pics) |
| `BODY1.DAA` | 2,927 | Graphics — body/torso sprite data (area 1) |
| `CPIC1.DAA` | 37,459 | **GRAPHICS** — combat pictures pack (area 1) |
| `DUNGCOM.DAA` | 8,935 | Graphics — dungeon common (duplicate from disk 1) |
| `ECL1.DAX` | 54,401 | Data — encounter/event script data (area 1) |
| `GEO1.DAX` | 4,661 | Data — geometry/map data (area 1) |
| `HEAD1.DAA` | 4,669 | **GRAPHICS** — character portrait heads (area 1) |
| `ITEM1.DAX` | 2,633 | Data — item data (area 1) |
| `MON1CHA.DAX` | 3,683 | Data — monster character data (area 1) |
| `MON1ITM.DAX` | 2,118 | Data — monster item data (area 1) |
| `MON1SPC.DAX` | 390 | Data — monster special ability data (area 1) |
| `RANDCOM.DAA` | 1,757 | Graphics — random common (duplicate) |
| `SKY.DAA` | 2,981 | Graphics — sky (duplicate) |
| `SPRIT1.DAA` | 128,875 | **GRAPHICS** — sprite sheet pack (area 1) — LARGE |
| `WALLDEF1.DAX` | 7,558 | Data — wall definitions (area 1) |
| `WILDCOM.DAA` | 8,410 | Graphics — wildcard common (duplicate) |
| `charS.LBM` | 16,504 | **GRAPHICS** — IFF/LBM character screen (duplicate) |
| `charT.LBM` | 25,652 | **GRAPHICS** — IFF/LBM character tileset (duplicate) |
| `comspr.daa` | 12,865 | Graphics — common sprites (duplicate) |
| `pic1.daa` | 165,455 | **GRAPHICS** — picture pack (area 1) — LARGE |

### Disk 3 (`amiga_extracted/ChampionsOfKrynn/disk3/`)

| Path | Size (bytes) | Type Guess |
|------|-------------|-----------|
| `8X8D2.DAA` | 28,734 | Graphics — 8x8 tile font/character set (area 2) |
| `BODY2.DAA` | 2,927 | Graphics — body sprite data (area 2) |
| `DUNGCOM.DAA` | 8,935 | Graphics — dungeon common (duplicate) |
| `ECL2.DAX` | 77,265 | Data — encounter/event script data (area 2) |
| `GEO2.DAX` | 9,020 | Data — geometry/map data (area 2) |
| `HEAD2.DAA` | 4,669 | **GRAPHICS** — character portrait heads (area 2) |
| `ITEM2.DAX` | 1,658 | Data — item data (area 2) |
| `MON2CHA.DAX` | 4,459 | Data — monster character data (area 2) |
| `MON2ITM.DAX` | 1,889 | Data — monster item data (area 2) |
| `MON2SPC.DAX` | 749 | Data — monster special ability data (area 2) |
| `RANDCOM.DAA` | 1,757 | Graphics — random common (duplicate) |
| `SKY.DAA` | 2,981 | Graphics — sky (duplicate) |
| `SPRIT2.DAA` | 133,658 | **GRAPHICS** — sprite sheet pack (area 2) — LARGE |
| `WALLDEF2.DAX` | 9,517 | Data — wall definitions (area 2) |
| `WILDCOM.DAA` | 8,410 | Graphics — wildcard common (duplicate) |
| `bigpic2.daa` | 101,561 | **GRAPHICS** — large picture pack (area 2) |
| `charS.LBM` | 16,504 | **GRAPHICS** — IFF/LBM character screen (duplicate) |
| `charT.LBM` | 25,652 | **GRAPHICS** — IFF/LBM character tileset (duplicate) |
| `comspr.daa` | 12,865 | Graphics — common sprites (duplicate) |
| `cpic2.daa` | 43,679 | **GRAPHICS** — combat picture pack (area 2) |
| `pic2.daa` | 223,194 | **GRAPHICS** — picture pack (area 2) — LARGEST FILE |
| `save/CHRDATA*.sav/.swg/.fx` | 10–426 | Save game character data (pre-loaded party) |
| `save/savgamA.dat` | 5,481 | Save game state |

---

## Death Knights of Krynn — Full File Inventory

**Set:** `dkk01.adz` / `dkk02.adz` (Skid Row crack, decompressed from .adz)
**Filesystem:** OFS — both disks standard and readable.

### Disk 1 (`amiga_extracted/DeathKnightsOfKrynn/disk1/`)

| Path | Size (bytes) | Type Guess |
|------|-------------|-----------|
| `.info` | 41 | Workbench icon |
| `8x8d1.daa` | 63,376 | Graphics — 8x8 tile/font set |
| `AssignCOK` | 15 | AmigaOS script — COK disk path assignment |
| `AssignCOK.info` | 666 | Workbench icon |
| `BACK1.DAA` | 39,875 | **GRAPHICS** — outdoor/map background tiles |
| `BIGPIC1.DAA` | 17,602 | **GRAPHICS** — large picture pack (area 1) |
| `BORDER.DAA` | 287 | Graphics — UI border |
| `COMSPR.DAA` | 19,362 | **GRAPHICS** — common sprite sheet |
| `CPIC1.daa` | 74,929 | **GRAPHICS** — combat pictures (area 1) — LARGE |
| `DUNGCOM.daa` | 6,942 | Graphics — dungeon common sprites |
| `Directoryinfo` | 894 | Workbench icon file |
| `Disk.info` | 1,094 | Workbench disk icon |
| `ECL1.DAX` | 42,500 | Data — encounter script data (area 1) |
| `GEO1.DAX` | 3,738 | Data — geometry/map data |
| `Game.info` | 11,098 | Workbench icon |
| `HDInstall` | 17,548 | Executable — HD installer |
| `HDInstall.info` | 654 | Workbench icon |
| `ITEM0.DAX` | 1,745 | Data — base item definitions |
| `ITEMS` | 2,050 | Data — item list |
| `MON1WIZ.DAX` | 752 | Data — monster/wizard data |
| `PIC1.DAA` | 33,567 | **GRAPHICS** — picture pack (area 1) |
| `Title0.LBM` | 12,430 | **GRAPHICS** — IFF/LBM title screen (variant 0) |
| `Title1.LBM` | 37,836 | **GRAPHICS** — IFF/LBM title screen (main) |
| `Title1A.LBM` | 27,406 | **GRAPHICS** — IFF/LBM title screen (variant A) |
| `Title1B.LBM` | 27,406 | **GRAPHICS** — IFF/LBM title screen (variant B) |
| `WILDCOM.daa` | 12,525 | Graphics — wildcard/combat common |
| `c/Assign` | 3,008 | AmigaOS executable |
| `c/IconX` | 3,884 | AmigaOS executable |
| `c/LoadWB` | 2,804 | AmigaOS executable |
| `c/endcli` | 696 | AmigaOS executable |
| `c/stack` | 872 | AmigaOS executable |
| `chars.lbm` | 14,532 | **GRAPHICS** — IFF/LBM character screen |
| `chart.lbm` | 24,858 | **GRAPHICS** — IFF/LBM character tileset |
| `game` | 193,208 | **Executable** — main game binary |
| `globals.daa` | 11,398 | Data — global game state/constants |
| `gothic.lbm` | 1,166 | **GRAPHICS** — IFF/LBM gothic font/decorative |
| `l/disk-validator` | 1,848 | AmigaOS library |
| `mon1cha.dax` | 6,747 | Data — monster character data |
| `mon1itm.dax` | 2,774 | Data — monster item data |
| `mon1spc.dax` | 2,346 | Data — monster special data |
| `pointers.daa` | 804 | Data — pointer table |
| `s/startup-sequence` | 17 | AmigaOS script |
| `sound/action.smu` | 1,084 | Music module (.smu = SSI music) |
| `sound/arrow` | 778 | Audio sample |
| `sound/cast2` | 2,468 | Audio sample |
| `sound/cast3` | 59 | Audio header |
| `sound/cast3Samp` | 6,516 | Audio sample |
| `sound/cast4` | 64 | Audio header |
| `sound/dead` | 4,898 | Audio sample |
| `sound/fireb` | 1,804 | Audio sample |
| `sound/gate` | 2,468 | Audio sample |
| `sound/hit` | 2,004 | Audio sample |
| `sound/horror.smu` | 284 | Music module |
| `sound/krynn.smu` | 4,658 | Music module |
| `sound/lightSamp` | 846 | Audio sample |
| `sound/lordsoth.smu` | 550 | Music module |
| `sound/pad` | 324 | Audio sample |
| `sound/pad2` | 1,772 | Audio sample |
| `sound/periodTable` | 640 | Audio pitch table |
| `sound/sorrow.smu` | 410 | Music module |
| `sound/soundData` | 4,013 | Audio data |
| `sound/swish` | 1,344 | Audio sample |
| `sound/tuningfork` | 1,860 | Audio sample |
| `sound/undead.smu` | 632 | Music module |
| `sound/victory.smu` | 1,810 | Music module |
| `sound/whislSamp2` | 558 | Audio sample |
| `walldef1.dax` | 13,319 | Data — wall texture definitions |

### Disk 2 (`amiga_extracted/DeathKnightsOfKrynn/disk2/`)

| Path | Size (bytes) | Type Guess |
|------|-------------|-----------|
| `.info` | 18 | Workbench icon |
| `8x8d1.daa` | 63,376 | Graphics — 8x8 tile set (duplicate) |
| `BIGPIC2.DAA` | 64,044 | **GRAPHICS** — large picture pack (area 2) |
| `COMSPR.DAA` | 19,362 | **GRAPHICS** — common sprite sheet (duplicate) |
| `CPIC1.daa` | 74,929 | **GRAPHICS** — combat pictures (duplicate) |
| `DUNGCOM.daa` | 6,942 | Graphics — dungeon common (duplicate) |
| `Disk.info` | 1,104 | Workbench disk icon |
| `ECL2.DAX` | 48,630 | Data — encounter script (area 2) |
| `ECL3.DAX` | 55,412 | Data — encounter script (area 3) |
| `GEO2.DAX` | 6,808 | Data — geometry (area 2) |
| `GEO3.DAX` | 6,277 | Data — geometry (area 3) |
| `ITEM0.DAX` | 1,745 | Data — item definitions (duplicate) |
| `ITEMS` | 2,050 | Data — item list (duplicate) |
| `MON1WIZ.DAX` | 752 | Data — monster/wizard (duplicate) |
| `PIC2.DAA` | 282,317 | **GRAPHICS** — picture pack (area 2) — LARGEST FILE |
| `SPRIT1.DAA` | 78,075 | **GRAPHICS** — sprite pack (area 1) |
| `Save/CHRDATA*.gam/.eff/.jnk/.wiz` | 10–288 | Save game character data |
| `Save/savgamA.pty` | 2,925 | Save game party data |
| `Save/vaultA.dat` | 12 | Save game vault |
| `WILDCOM.daa` | 12,525 | Graphics — wildcard common (duplicate) |
| `mon1cha.dax` | 6,747 | Data — monster character (duplicate) |
| `mon1itm.dax` | 2,774 | Data — monster items (duplicate) |
| `mon1spc.dax` | 2,346 | Data — monster specials (duplicate) |
| `pointers.daa` | 804 | Data — pointer table (duplicate) |
| `sound/` (all sound files) | (same as disk 1) | Audio — full sound set duplicated |
| `walldef1.dax` | 13,319 | Data — wall definitions (duplicate) |

---

## Dark Queen of Krynn — Full File Inventory

**Set:** Skid Row `.adf` files (disk 1 clean; disk 2 extracted with data errors; disk 3 unreadable)
**Filesystem:** OFS — disk 1 standard; disk 2 OFS with multiple data block checksum errors (likely copy protection remnants or image damage); disk 3 causes unadf segfault.

### Disk 1 (`amiga_extracted/DarkQueenOfKrynn/disk1/`)

| Path | Size (bytes) | Type Guess |
|------|-------------|-----------|
| `.info` | 85 | Workbench icon |
| `DISK1.info` | 894 | Workbench icon |
| `Disk.info` | 606 | Workbench disk icon |
| `Disk1/ALWAYS.TLB` | 1,506 | Data — always-present data table |
| `Disk1/COMSPR.TLB` | 8,826 | **GRAPHICS** — common sprite table (TLB = table library) |
| `Disk1/DQK.MX` | 68,580 | **Executable** — main game module (.MX format) |
| `Disk1/GAME.FON` | 768 | **GRAPHICS** — game font bitmap |
| `Disk1/ITEM.DAT` | 4,572 | Data — item definitions |
| `Disk1/ITEMS.DAT` | 2,048 | Data — item list |
| `Disk1/MUSIC.SLB` | 6,548 | Music — sound library (SLB format) |
| `Disk1/SOUNDS.GLB` | 61,602 | Audio — sound library (GLB = global library) |
| `Disk1/TITLE.TLB` | 145,614 | **GRAPHICS** — title screen table library — LARGEST |
| `Disk1/TOPVIEW.TLB` | 386 | Data/Graphics — top-view map table |
| `Drawer_info` | 894 | Workbench icon |
| `Install_DH0` | 600 | Executable — HD install script |
| `Install_DH0.info` | 568 | Workbench icon |
| `Install_DH1` | 600 | Executable — HD install script |
| `Install_DH1.info` | 568 | Workbench icon |
| `Save.info` | 894 | Workbench icon |
| `Save/FLINTFIR.qch` | 526 | Save game character (.qch format) |
| `Save/GILTHANA.qch` | 506 | Save game character |
| `Save/HUMABRIG.qch` | 470 | Save game character |
| `Save/ISHARVLA.qch` | 470 | Save game character |
| `Save/LAURANA.qch` | 488 | Save game character |
| `Save/LUCIFER.qch` | 478 | Save game character |
| `Save/ONANNOIV.qch` | 470 | Save game character |
| `Somewhere` | 27,264 | **Executable** — loader / intro executable |
| `Somewhere.info` | 830 | Workbench icon |
| `c/SetPatch` | 5,088 | AmigaOS executable |
| `c/echo` | 560 | AmigaOS executable |
| `c/loop.ago` | 7,128 | Executable — cracker loader loop |
| `devs/system-configuration` | 232 | AmigaOS config |
| `l/Disk-Validator` | 1,848 | AmigaOS library |
| `s/SkidRow` | 14,428 | Executable — Skid Row crack intro |
| `s/startup-sequence` | 111 | AmigaOS startup script |

### Disk 2 (`amiga_extracted/DarkQueenOfKrynn/disk2/`) — EXTRACTED WITH ERRORS

**Note:** Multiple data block checksum failures during extraction. Files were written but content integrity is suspect — binary verification recommended before use.

| Path | Size (bytes) | Type Guess |
|------|-------------|-----------|
| `.info` | 22 | Workbench icon |
| `DISK2.info` | 894 | Workbench icon |
| `Disk.info` | 606 | Workbench disk icon |
| `Disk2/8X8DB.TLB` | 82,238 | **GRAPHICS** — 8x8 tile set B (large) |
| `Disk2/8X8DC.TLB` | 83,184 | **GRAPHICS** — 8x8 tile set C (large) |
| `Disk2/BACK.TLB` | 43,788 | **GRAPHICS** — background tile library |
| `Disk2/BIGPIC.TLB` | 56,184 | **GRAPHICS** — large picture library |
| `Disk2/CPIC.TLB` | 162,984 | **GRAPHICS** — combat picture library — LARGEST |
| `Disk2/DUNGCOM.TLB` | 7,422 | **GRAPHICS** — dungeon common table library |
| `Disk2/MONCHA.GLB` | 14,226 | **GRAPHICS** — monster character portraits (global library) |
| `Disk2/PICA.TLB` | 93,192 | **GRAPHICS** — picture set A |
| `Disk2/PICB.TLB` | 90,668 | **GRAPHICS** — picture set B |
| `Disk2/PICC.TLB` | 90,012 | **GRAPHICS** — picture set C |
| `Disk2/SPRIT.TLB` | 99,854 | **GRAPHICS** — sprite table library — LARGE |
| `Disk2/WILDCOM.TLB` | 9,816 | **GRAPHICS** — wildcard/combat common table |
| `Journal` | 0 | Empty file (journal log?) |

### Disk 3 — UNREADABLE via our own ADF extraction (see 2026-07-18 update below — recovered via a different source)

Both the `.adz` decompressed image and the Skid Row `.adf` image cause `unadf` to segfault immediately after the boot block. No files extracted from *this* image set. This disk likely uses a non-standard track format or is image-damaged. **A complete Disk 3 was found via a different source (WHDLoad's pre-unpacked pack) on 2026-07-18 — see the dated section at the end of this file.** The recovery note below (from the original 2026-06-20 pass) is retained for the record.

---

## Candidate Graphics / Art Resources

### Champions of Krynn — Priority Art Files

| File | Location | Reason |
|------|----------|--------|
| `pic2.daa` | disk3 | 223 KB — largest single asset; likely a multi-frame picture/cutscene pack for area 2 |
| `pic1.daa` | disk2 | 165 KB — picture pack area 1; scene/story images |
| `SPRIT1.DAA` / `SPRIT2.DAA` | disk2/disk3 | 129 KB / 134 KB — main sprite sheets; all combat and character sprites |
| `BIGPIC1.DAA` / `bigpic2.daa` | disk2/disk3 | 103 KB / 102 KB — "big picture" packs; full-screen NPC/location art |
| `CPIC1.DAA` | disk2 | 37 KB — combat pictures; monster/battle portrait art |
| `cpic2.daa` | disk3 | 44 KB — combat pictures area 2 |
| `scrn1b.lbm` / `scrn2.lbm` | disk1 | 33 / 35 KB — IFF LBM full-screen images; intro/title screens, directly viewable |
| `charT.LBM` | disk1/2/3 | 26 KB — IFF LBM; likely character creation/roster screen background |
| `charS.LBM` | disk1/2/3 | 17 KB — IFF LBM; character sheet/stats screen graphic |
| `HEAD1.DAA` / `HEAD2.DAA` | disk2/disk3 | 4.7 KB each — character portrait heads by area |
| `comspr.daa` | disk1 | 13 KB — common sprites shared across game |
| `8X8D0.DAA` | disk1 | 26 KB — 8x8 pixel font/icon tiles |

**IFF/LBM files** (`.lbm`) are directly readable by standard IFF-ILBM viewers. The `.DAA`/`.DAX` files use a custom SSI packing format that requires format-specific unpacking.

### Death Knights of Krynn — Priority Art Files

| File | Location | Reason |
|------|----------|--------|
| `PIC2.DAA` | disk2 | 282 KB — largest file in entire DoK set; major picture pack |
| `CPIC1.daa` | disk1/disk2 | 75 KB — combat pictures; all battle monster art |
| `BACK1.DAA` | disk1 | 40 KB — outdoor/overworld background tiles |
| `BIGPIC2.DAA` | disk2 | 64 KB — large pictures area 2 |
| `8x8d1.daa` | disk1/disk2 | 63 KB — 8x8 tile set; larger than CoK version |
| `SPRIT1.DAA` | disk2 | 78 KB — sprite pack; combat/overworld character sprites |
| `PIC1.DAA` | disk1 | 34 KB — picture pack area 1 |
| `COMSPR.DAA` | disk1/disk2 | 19 KB — common sprites shared across game |
| `Title1.LBM` | disk1 | 38 KB — IFF LBM; main title screen, directly viewable |
| `Title1A.LBM` / `Title1B.LBM` | disk1 | 27 KB each — IFF LBM title screen variants |
| `Title0.LBM` | disk1 | 12 KB — IFF LBM; earlier title variant |
| `chart.lbm` | disk1 | 25 KB — IFF LBM; character screen background |
| `chars.lbm` | disk1 | 15 KB — IFF LBM; character portraits/charset |
| `BIGPIC1.DAA` | disk1 | 18 KB — large pictures area 1 |
| `globals.daa` | disk1 | 11 KB — may contain shared palette/global graphics data |

**Notable:** DoK has 4 title screen LBM variants (Title0, Title1, Title1A, Title1B), making it a richer source for key art than CoK.

### Dark Queen of Krynn — Priority Art Files

| File | Location | Reason |
|------|----------|--------|
| `Disk1/TITLE.TLB` | disk1 | 146 KB — title screen table library; largest file on disk 1, likely holds the main title artwork |
| `Disk2/CPIC.TLB` | disk2 (errors) | 163 KB — combat picture library; all monster/battle art |
| `Disk2/SPRIT.TLB` | disk2 (errors) | 100 KB — sprite table library |
| `Disk2/PICA.TLB` | disk2 (errors) | 93 KB — picture set A |
| `Disk2/PICB.TLB` | disk2 (errors) | 91 KB — picture set B |
| `Disk2/PICC.TLB` | disk2 (errors) | 90 KB — picture set C |
| `Disk2/BIGPIC.TLB` | disk2 (errors) | 56 KB — large picture library |
| `Disk2/8X8DB.TLB` / `8X8DC.TLB` | disk2 (errors) | 82–83 KB each — tile sets |
| `Disk2/BACK.TLB` | disk2 (errors) | 44 KB — background tiles |
| `Disk2/MONCHA.GLB` | disk2 (errors) | 14 KB — monster character graphics |
| `Disk1/COMSPR.TLB` | disk1 | 9 KB — common sprites |
| `Disk1/GAME.FON` | disk1 | 768 bytes — game font bitmap |

**Caveat:** All disk 2 files have checksum errors and may be partially corrupted. Disk 3 (which likely holds additional picture sets and the rest of the game data) was unrecoverable from *this* ADF set with current tools — **now recovered from a different source, see the 2026-07-18 section below.**

**TLB/GLB format:** DQK uses a different file format than CoK/DoK (`.TLB` = table library, `.GLB` = global library), suggesting a newer/revised SSI engine. These require different unpacking than the `.DAA`/`.DAX` format.

---

## Problems / Unreadable Disks

| Game | Disk | Image(s) Tried | Problem | Impact |
|------|------|----------------|---------|--------|
| Dark Queen of Krynn | Disk 2 | `dqk2.adz` (decompressed) AND `Dark Queen of Krynn...(Disk 2 of 3).adf` | Multiple `adfReadDataBlock` checksum errors; blocks reference out-of-range sectors | Files extracted but data integrity suspect — binary verification required before use |
| Dark Queen of Krynn | Disk 3 | `dqk3.adz` (decompressed) AND `Dark Queen of Krynn...(Disk 3 of 3).adf` | `unadf` segfaults immediately; both images identical behaviour | Zero files extracted *from this image set*; **now recovered from a different source — see 2026-07-18 section below** |
| Champions of Krynn | All disks | `ChampionsOfKrynn_Nof3.Adf` | Boot block checksum warning only (not an error); content intact | No impact — all 109 files extracted cleanly |
| Death Knights of Krynn | All disks | `dkk01.adz` / `dkk02.adz` | Boot block checksum warning only; content intact | No impact — all 137 files extracted cleanly |

### Recovery Options for DQK Disk 3

- ~~Source a different image (another crack group, a different dump)~~ **Done 2026-07-18** — see below. The Skid Row `.adf`/`.adz` in this project's own ADF set remain unreadable for Disk 3, but a pre-unpacked WHDLoad pack supplied the same data via a different distribution path.
- Use a Kryoflux/SuperCard Pro raw flux dump if original disks are available (still an option if byte-for-byte provenance of *this specific* Skid Row release is ever needed).
- The DQK Skid Row `.adf` Disk 2 data, while extracted, should be checksum-validated — file sizes look plausible (CPIC.TLB at 163 KB, SPRIT.TLB at 100 KB) but individual byte ranges may be corrupted.

---

## File Extension Reference

| Extension | Meaning (SSI Gold Box Amiga) |
|-----------|------------------------------|
| `.DAA` | SSI data archive — uncompressed or lightly packed graphics/data block |
| `.DAX` | SSI data archive — compressed variant (game data: maps, scripts, items) |
| `.LBM` | IFF ILBM — standard Amiga interleaved bitmap, directly viewable |
| `.TLB` | Table library — DQK-era-and-later SSI graphics/data container, magic `GLIB` (see 2026-07-18 section) |
| `.GLB` | Global library — DQK-era-and-later SSI sound/graphics container, magic `GLIB` |
| `.SMU` | SSI music module format (CoK/DoK) |
| `.MX` / `.SLB` | Amiga-native music container (DQK-era, magic `MXTX`/`SLBR` respectively — no DOS equivalent) |
| `.qch` | DQK character save file |
| `.guy` | CoAB/Pool-series/Gateway/Treasures character save file |
| `.sav/.swg/.fx` | CoK character save file variants |
| `.gam/.eff/.jnk/.wiz` | DoK character save file variants |

---

## 2026-07-18 — WHDLoad unpacked archive + `SSI - Pool` ADFs (new source locations)

Two new Amiga source locations, both **read-only, referenced by path only, never vendored**
(same convention as the ADFs above):

1. `D:\Games\Emulator\Amiga\All Games\Series\TSR\SSI - Pool\` — raw `.adf` disk images
   (**not extracted this round** — the WHDLoad location below already has pre-unpacked
   copies of every title here, so extracting these ADFs would be redundant unless a
   different crack/release is specifically wanted later):
   - `1 Pools of Darkness\` — 3 ADFs
   - `2 AzureBonds\` — `Cotab_1.adf`/`Cotab_2.adf` + a Skid Row `.adf` set + `Cursedocs.zip`
   - `3 SilverBlades\` — 2 ADFs (`Secret of the SilverBlades D1/D2.adf`)
   - `4 Pool of Radiance\` — 2 ADFs
   - Also present, not Krynn/not pursued: `SSI - Dragons\Dragons of Flame\` (SSI but not
     Gold Box — a Dragonlance real-time strategy title), `Eye Of The Beholder*` and
     `Shadow Sorcerer*` (non-Gold-Box, note-only per task scope).
2. `D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\unpacked\`
   — **pre-unpacked Amiga filesystems** (WHDLoad installer packs already extracted to
   plain files — no `unadf`/ADF work needed at all). 9 Gold Box titles confirmed:
   `ChampionsOfKrynn`, `DeathKnightsOfKrynn` (+ `DeathKnightsOfKrynnDe`, German),
   `DarkQueenOfKrynn`, `CurseOfTheAzureBonds`, `PoolOfRadiance`, `PoolsOfDarkness`
   (+ `PoolsOfDarknessDe`, icons/docs-only shell — data files absent from this particular
   pack), `SecretOfTheSilverBlades`, `GatewayToSavageFrontier`, `TreasuresOfSavageFrontier`.

### 1. Per-title inventory + format verdict

| Title | Container ext. | Magic bytes | Format family | Disks | Same release as `amiga_extracted/`? |
|---|---|---|---|---|---|
| `ChampionsOfKrynn` | `.DAA`/`.DAX`/`.LBM` | (DAA: headerless BE word0) | **DAA** (Krynn Gen1, see `docs/daa-format.md`) | merged (all 3 disks' data in one `data/` dir) | **Yes for game data** — `8X8D0.DAA`, `BIGPIC1.DAA` etc. SHA1-identical to our clean-set extraction (see below). `scrn1b.lbm` differs (32,576 B here vs 33,134 B in `amiga_extracted`) and the `game` executable differs — expected, WHDLoad repacks/patches the loader; likely also a slightly different intro-screen asset variant. |
| `DeathKnightsOfKrynn` | `.DAA`/`.DAX`/`.LBM` | same as CoK | **DAA** | merged (both disks) | **Yes for game data** — `ECL1.DAX` SHA1-identical to `amiga_extracted/DeathKnightsOfKrynn`. `game` executable is a different size (461,944 B vs 193,208 B) — WHDLoad build is much larger, almost certainly a different (later/patched) binary, not just a repack. |
| `DeathKnightsOfKrynnDe` | `.dax`/`.DAA`/`.LBM` | same | **DAA**, German localization | merged | New — no prior extraction to compare. Localized `ecl*.dax` are slightly smaller (43,177/48,582/55,005 vs English 42,500/48,630/55,412 — net roughly a wash), `MON1CHA.DAX` is **larger** (6,870 B vs English 6,747 B, monster-name/text strings). Confirms DoK German is a genuine separate localization build, not just a renamed English copy. |
| `DarkQueenOfKrynn` | `.TLB`/`.GLB`/`.MX`/`.SLB`/`.FON` | **`GLIB`**, big-endian | **GLIB** (new — see §2) | **all 3 disks**, incl. Disk 3 | Disk 1/2 file set matches our prior partial extraction; **Disk 3 is new** (see §2) — our own ADF extraction segfaulted on Disk 3, WHDLoad's pack has it intact. |
| `CurseOfTheAzureBonds` | `.TLB`/`.GLB`/`.FON`/`.SLB` | `GLIB` | **GLIB** | DISKA+DISKB (merged) | New title for this project. |
| `PoolOfRadiance` | lowercase `.dax` | non-DAX, non-DAA BE variant | **4th distinct format — SOLVED 2026-07-22** (see §3, `docs/pool-amiga-format.md`) | single merged `data/` (1988 original is disk-light) | New title. |
| `PoolsOfDarkness` | `.TLB`/`.GLB`/`.fon`/`.mx` | `GLIB` | **GLIB** | DISK1/Disk2/Disk3 (merged) | New title. |
| `PoolsOfDarknessDe` | — | — | (icons/docs shell only — `data/` absent from this pack; not usable as an asset source) | — | N/A |
| `SecretOfTheSilverBlades` | `.TLB`/`.GLB`/`.FON`/`.MX`/`.SLB` | `GLIB` | **GLIB** | DISK1+DISK2 (merged) | New title. |
| `GatewayToSavageFrontier` | `.tlb`/`.glb`/`.fon`/`.slb` | `GLIB` | **GLIB** | DiskA+DiskB+DiskC (merged) | New title (Forgotten Realms, not Dragonlance — outside the Krynn trilogy but same engine family). |
| `TreasuresOfSavageFrontier` | `.tlb`/`.glb`/`.fon`/`.slb` | `GLIB` | **GLIB** | diska+diskb+DiskC (merged) | New title. |

All WHDLoad packs merge every source disk's data into one `data/` tree (that is the point of
WHDLoad — install once, no disk swapping), so "disks" above describes the *original*
disk/subfolder split preserved inside `data/`, not separate extraction runs.

**Hash-verification method (CoK/DoK):** SHA1 of `8X8D0.DAA`, `BIGPIC1.DAA` (CoK) and
`ECL1.DAX` (DoK) between `amiga_extracted/` (our own `unadf` extraction of the "clean set"
CoK ADFs and the Skid Row DoK `.adz`s) and this WHDLoad pack's `data/` — all three matched
byte-for-byte. This confirms the WHDLoad packs carry the **same underlying game-data
release** we already have for CoK/DoK (not a different crack's altered data), so nothing
here changes the CoK/DoK art-sourcing verdict — it is corroboration, not new data.

### 2. Amiga DQK deep-dive — Disk 3 is no longer missing

`DarkQueenOfKrynn/data/Disk3/` contents (all present and readable via WHDLoad's pack,
unlike our own Skid Row ADF extraction which segfaulted on Disk 3):

| File | Size (bytes) | DOS `DISK3\` equivalent | DOS size |
|---|---|---|---|
| `CBODY.TLB` | 27,492 | `CBODY.TLB` | 62,830 |
| `ECL.GLB` | 456,550 | `ECL.GLB` | 456,526 |
| `FINAL.TLB` | 51,024 | `FINAL.TLB` | 197,152 |
| `FRAME.TLB` | 9,820 | `FRAME.TLB` | 40,664 |
| `GEN.TLB` | 7,804 | `GEN.TLB` | 28,456 |
| `GEO.GLB` | 48,114 | `GEO.GLB` | **48,114 (exact size match)** |

`GEO.GLB` (the map/geometry data) is the **same length on both platforms**, and a
byte-for-byte compare shows only **173 of 48,114 bytes differ (99.6% identical)** —
consistent with the two files sharing the same underlying map data and differing mainly in
per-record numeric fields whose *encoding* (not value) differs by endianness (see below).
`ECL.GLB` sizes are within 24 bytes of each other too. The DOS/graphics-heavy files (`CBODY`,
`FINAL`, `FRAME`, `GEN`) are much larger on DOS, consistent with DOS DQK's richer/denser VGA
256-color art vs Amiga's 32-color art — **this does not change the project's standing
verdict that DOS VGA is the best DQK art**; it is a completeness/documentation result, not
an art-source change (as the task anticipated).

**Container format — `GLIB`, not `HLIB`.** Magic-byte check (first 16-48 bytes) of
`Disk1/ALWAYS.TLB`, `Disk1/TITLE.TLB`, `Disk1/SOUNDS.GLB`, `Disk2/CPIC.TLB`,
`Disk2/MONCHA.GLB`, `Disk3/ECL.GLB`, `Disk3/GEO.GLB`, `Disk3/CBODY.TLB`, `Disk3/FINAL.TLB`,
`Disk1/DQK.MX`, `Disk1/MUSIC.SLB`, `Disk1/ITEM.DAT`, against the DOS `DISK1..3` equivalents:

| | DOS DQK | Amiga DQK |
|---|---|---|
| Top-level magic | `HLIB` | **`GLIB`** |
| Multi-byte fields | little-endian (x86) | **big-endian** (68000) — exactly the same DAX<->DAA relationship already documented for CoK/DoK |
| Sub-chunk types seen | `TILE`, `DATA`, `DIG4`, nested `HLIB` | `TILE`, `DATA`, **`DIG8`** (not `DIG4`), nested **`GLIB`** |
| Music container | XMI (`*.XMI`) + driver `.ADV` files | **`.MX`** (`DQK.MX`, magic `MXTX`) + **`.SLB`** (`MUSIC.SLB`, magic `SLBR`) — Amiga-native music/sound-library formats, no DOS equivalent |

Verdict: **Amiga DQK is a genuine sibling of DOS DQK's HLIB architecture** — same
container idea (4-byte magic, typed sub-chunks, `TILE`/`DATA` chunk kinds), same
DAX<->DAA-style endianness split — but it has its **own distinct magic word (`GLIB`) and
sound-chunk type (`DIG8`)**, so it is **not** byte-compatible with DOS `HLIB` and would need
its own reader (structurally straightforward — same shape as `.DAA`'s BE-vs-DAX
relationship, likely a few hours of work if ever prioritized, but **not attempted here**
per the "read-only, no decoder changes" task scope; `docs/hlib-format.md` and
`tools/hlib_decode.py`, which would be the natural home for a `GLIB` reader, are owned by
a concurrent sibling agent this round and were not touched).

`ITEM.DAT` on both platforms is a **raw table with no container magic** (identical framing
`1e 00 00 1e` prefix on both) — confirms it is a plain data table (not `HLIB`/`GLIB`-wrapped)
on both platforms, consistent with the DOS-side finding already documented for `HLIB`.

### 3. Smoke-decode results (task 3)

Per the task, tried `tools/daa_decode.py`/`tools/subframe_decode.py` (unmodified) against
2-3 graphics files per new title:

| Title | File(s) tried | Result | Evidence |
|---|---|---|---|
| `CurseOfTheAzureBonds` | `DISKB\PIC.TLB` | **Different format** — fails cleanly at container level | `daa_decode.py`: `ERROR: word0=18252 (body 18250) not a multiple of 9 or 6` — the file does not even look like a DAA container once its real `GLIB` header is present; magic bytes confirm `GLIB`, not the headerless DAA layout. |
| `GatewayToSavageFrontier` | `DiskB\Pic.tlb` | Different format | Same error/verdict as above (all `GLIB`-family files fail identically — the DAA parser's word0 heuristic has nothing to grab onto). |
| `TreasuresOfSavageFrontier` | `DiskC\Pic.tlb` | Different format | Same. |
| `SecretOfTheSilverBlades` | `DISK2\PIC.TLB` | Different format | Same. |
| `PoolsOfDarkness` | `Disk2\PIC.TLB`, `DISK1\INTRO.TLB` | Different format | Same. |
| `PoolOfRadiance` | `pic.dax`, `ecl.dax`, `8x8d.dax`, `head.dax`, `cpic.dax`, `geo.dax` | **Different format — neither DAA nor DOS DAX** | `dax_decode.py` (DOS-style LE header): `ERROR: word0=19970 is not a multiple of 9`. `daa_decode.py` (BE, 9- or 6-byte TOC): routes to the 6-byte sub-frame path but produces nonsense (`sub_offset` values in the billions, non-monotonic) — a false-positive route match, **not a real decode**. Manual inspection (documented below) shows a genuine **4th container variant**. |

**No `.DAA` files exist in any of the 8 non-Krynn titles** — the `.DAA` extension and its
container format are **CoK/DoK-specific** (Krynn Gen1 only); they do **not** generalize
forward to CoAB/Pool/Secret/Gateway/Treasures/DQK, which all use the `GLIB` family instead
(§2), nor backward to Pool of Radiance, which uses a third, distinct big-endian format
(below). This is the clean, useful answer to "does the DAA codec generalize?": **no** — it
tops out at exactly the two titles it was built for.

**Pool of Radiance's `.dax` files — 4th distinct format, ~~unsolved~~ SOLVED 2026-07-22.**
Full spec: `docs/pool-amiga-format.md`; decoder: `tools/pool_amiga_decode.py`. The TOC is
`{u16 BE id, u32 BE offset, u16 BE comp_size, u16 BE raw_size}` (the "fieldA/fieldB"
guesses below resolved to comp/raw size — fieldB "repeats" because same-dimension frames
share a raw size). Compression is NOT any RLE: it is a **backwards bit-stream LZSS with a
per-block XOR checksum**, cracked by disassembling the Amiga 68000 `program` executable
(decompressor at hunk 27+0x7346). Verified: 843/843 blocks across all 23 `.dax` files
decompress exact-size with checksum residual 0, and **28/29 Amiga `ecl.dax` blocks are
byte-identical to the DOS GOG `ECL*.DAX` plaintext** (id 0 is a genuinely different boot
script). Frames are 4-plane (16-color) contiguous planar with a 12-byte header; `pic`/
`final`/`sprit` use an animated multi-frame variant; palettes live in `program` hunk 23
(picture palette confirmed by coherent renders — 1544 PNGs in `renders/pool_amiga/`).
The Amiga art is genuinely redrawn vs DOS (same dimensions, no pixel identity).
**2026-07-23 follow-up — both leftover unknowns closed** (`docs/pool-amiga-format.md`
§3d/§4/§4a): the full per-context palette dispatch was traced through the five setter
functions' call sites (paper dolls = `pic` +64, fixed, no user/race composition;
`alt` +128 = camp/treasure/special scenes, correcting the earlier "chargen?" guess;
`dark` = dungeon 3D ambient; `combat`/`combat2` = combat + wilderness), the chargen
head/body id-mapping tables were recovered from hunk 31 (heads 1..14, bodies 1..12,
88×88 composite geometry; `--paperdoll` mode added to the decoder), and `sqrpaci.dax`
was identified as the two 64-frame banks of 48×24 **wilderness map square art**
(bit 7 of a map square code selects the bank — draw routine at hunk 22+0x1848; the
earlier "data, not frame-formatted" note was stale, both blocks are ordinary standard
frame blocks).
The original first-look notes (historical, superseded):
Manual byte inspection of `pic.dax` (270,220 B) found:
- A big-endian `word0` at offset 0 (like DAA), but the TOC entry stride is **10 bytes**,
  not DAA's 9 or DOS DAX's implicit list: `{u16 BE sparse_id, u32 BE offset, u16 BE fieldA,
  u16 BE fieldB}`. Verified against the first 15 entries: `id` sequence is sparse
  (0,1,2,3,4,5,6,7,8,9,**11**,12,**16**,17,18 -- 10, 13-15 skipped, same sparse-id idea as
  DAX/DAA) and **`offset[i+1] == offset[i] + fieldA[i]`** -- i.e. the chain accumulates via
  `fieldA`, unlike DAA/DAX where it accumulates via the *compressed* size. `fieldB`'s
  values are suspicious (repeat across unrelated entries, e.g. 8484/12724/4244 recur
  several times each with a constant 4240 stride) -- plausibly not a real per-entry
  compressed size at all, more likely a shared lookup/attribute index. This was **not**
  pursued further (no RLE/pixel-layer verification attempted) -- flagged as a clean,
  bounded next task if Pool of Radiance's Amiga art is ever wanted: confirm `fieldA`
  really is `raw_size`, identify what `fieldB` is, then find the pixel/palette frame
  layout (likely still 5-plane BE-planar like DAA §4, given the shared Amiga-hardware
  target, but unverified).

### 4. Top opportunities this unlocks

1. **Amiga art-switch breadth for Greybox jumps from 2 titles to 8.** The `.DAA` codec
   (already 100% solved for CoK/DoK per `docs/daa-format.md` §8) does not directly reach
   the other 6 GLIB-family titles, but they share the *same architectural idea* as DOS
   HLIB (which Greybox already targets) -- a `GLIB` reader is a bounded, well-scoped
   follow-up (not attempted here) that would light up Amiga-sourced art for Curse of the
   Azure Bonds, Pools of Darkness, Secret of the Silver Blades, Gateway to Savage
   Frontier, and Treasures of Savage Frontier -- all currently DOS-VGA-only in the
   engine's asset model.
2. **Amiga DQK Disk 3 recovered -- closes a 2026-06-20 open question outright**, with a
   strong data-fidelity signal (`GEO.GLB` 99.6% byte-identical to DOS across the
   endianness difference) that the Amiga and DOS DQK builds share the same underlying
   level data. Not an art-source change (DOS VGA stays the pick) but removes a standing
   "unrecoverable" caveat from three docs (`docs/amiga-inventory.md`,
   `docs/amiga-format-research.md`, `CLAUDE.md`).
3. **German DoK as a localization reference.** `DeathKnightsOfKrynnDe` is a complete,
   separate build (not just renamed files -- `ecl*.dax`/`MON1CHA.DAX` differ in size from
   the English release), useful if the project ever wants multi-language text handling in
   the FRUA-superset authoring layer.
4. **WHDLoad ReadMes independently confirm every title's manual/word-lookup copy
   protection was removed** (`grep`'d "Manual protection removed" in all 8 non-Krynn
   ReadMes, and it is present for CoK/DoK/DQK too) -- Amiga-side prior art for the
   project's own DQK copy-protection-bypass goal
   (`docs/engine/research/dqk-copy-protection.md`). The *technique* is
   68000/WHDLoad-specific and not directly portable to the DOS x86 patch work, but it is
   independent confirmation that the check is a small, patchable gate in every one of
   these games, not just DQK.

### 5. Open questions / unknowns

- ~~Pool of Radiance's 4th container format~~ **SOLVED 2026-07-22** (`docs/pool-amiga-format.md`,
  `tools/pool_amiga_decode.py`); ~~remaining nuance: per-context palette dispatch for
  `head`/`body` paper-doll art~~ **CLOSED 2026-07-23** together with `sqrpaci.dax`
  (wilderness square art) — no load-bearing unknowns remain. Original open item:
- Pool of Radiance's 4th container format: `fieldB`'s real meaning, and the pixel/palette
  frame layout inside each block -- **UNLOCATED**, not attempted this round (see §3).
- `GLIB` sub-chunk internal frame layout (palette placement, plane count/order inside
  `TILE` chunks) -- **not verified** this round; only the outer 4-byte-magic + typed-chunk
  shell was confirmed against DOS `HLIB`. (Inferred to mirror DOS `HLIB` `TILE` structure
  closely, by analogy with the DAX<->DAA relationship, but **UNLOCATED** until someone
  reads the `HLIB` inner-frame layout and diffs it against a `GLIB` `TILE` chunk.)
- Why the WHDLoad CoK `game` executable and `scrn1b.lbm` differ in size from our own
  Skid-Row/clean-set ADF extraction while other game-data files hash-match -- likely just
  WHDLoad's own loader patch plus a minor asset-variant swap, but not traced byte-by-byte.
- `SSI - Pool\` raw ADFs (location 1) were not extracted/hash-compared against the WHDLoad
  copies (location 2) -- if a different crack/release is ever specifically needed, that
  comparison is still open.
- `PoolsOfDarknessDe` in the WHDLoad pack has no `data/` directory (icons/docs shell only)
  -- not a usable asset source as packed; German Pools of Darkness data was not found in
  this collection.

---

## 2026-09-02 — Buck Rogers: Countdown to Doomsday (Amiga, WHDLoad)

Source: `D:\Games\Emulator\Amiga\WHDLoad\WHDLoadPacks\WHDLoad Collection\Games-WHDLoad\
unpacked\BuckRogersCountdownDday\data\` (read-only, never vendored, same convention as the
rest of this document). `BuckRogersCountdownDday` (+ the German `...De` variant) was omitted
from `CLAUDE.md`'s WHDLoad title list until 2026-08-14; this section is the first per-file
inventory of it.

**Format verdict:** this is a **DAA + DAX title, structurally the same shape as CoK/DoK's
Amiga ports** — NOT the big-endian `GLIB` container the DQK-and-later Amiga titles use.
Graphics live in `.daa` files (big-endian, the shared 9-byte/6-byte TOC families already
solved for CoK/DoK — see `docs/daa-format.md`); non-graphics game data (`ecl*.dax`,
`geo*.dax`, `mon0*.dax`, `walldef*.dax`) is ordinary little-endian DAX, matching the DOS
side's own file-family split. No new decoder was required for any of it.

### Re-measured per-file decode table

Measured directly against the real files with the unchanged `tools/daa_decode.py` (9-byte-TOC
"blocks" family) and `tools/subframe_decode.py --amiga` (6-byte-index family), decoding at
`--scale 1` and counting PNGs written per input file:

```
python tools/daa_decode.py --out <dir> "<data>/<file>.daa"                 # blocks family
python tools/subframe_decode.py --amiga --out <dir> "<data>/<file>.daa"    # index family
```

| Family | File(s) | Blocks / entries | Frames rendered |
|---|---|---|---|
| blocks | `bigpic1/2/3.daa` | 3 ids each | 3/3/3 (304x120 each) |
| blocks | `cpic1/2/3.daa` | — | 14 / 50 / 40 |
| blocks | `comspr.daa` | — | 50 |
| blocks | `ships.daa` | 23 ids | 23 |
| blocks | `8x8d0/1/2/3.daa` | — | 5 / 8 / 12 / 12 tile strips |
| blocks | `back1/2/3.daa` | — | 4 / 6 / 6 |
| blocks | `borders.daa` | 1 id | 1 |
| blocks | `hitek0/1.daa` | — | 1 / 1 |
| blocks | `lotek0/1.daa` | — | 1 / 1 |
| blocks | `marscom0/1.daa` | — | 1 / 1 |
| blocks | `venuscom0/1.daa` | — | 1 / 1 |
| blocks | `spacetvl.daa` | 1 id | 1 |
| index | `pic0/1/2/3.daa` | 6 / 10 / 9 / 17 entries | 6 / 36 / 21 / 49 primary+distance frames |
| index | `sprit1/2/3.daa` | 4 / 16 / 11 entries | 12 / 48 / 33 primary+distance frames |
| — | `globals.daa`, `pointers.daa` | n/a | **fail the container check** (`word0=0`) — not graphics, engine/save-adjacent state |

Every family/count above matches the numbers first reported in
`docs/engine/PLAN-NEXT-ROUND-2026-09-02.md` §R1 exactly. **One correction to that plan's own
headline sentence**, found by re-measuring rather than trusting it: the plan states "31 `.daa`
files, and 29 decode"; the real folder has **34 `.daa` files** (the plan's own itemized list,
summed, already totals 32 decoding + 2 non-decoding = 34 — the "31/29" headline undercounts by
3 against its own enumeration). 32 of 34 decode as graphics; `globals.daa` and `pointers.daa`
are the two that do not.

Also present: 6 ILBM `.lbm` titles. Re-measured dimensions (the plan's "ttl1..4.lbm, 320x72,
32 colours" describes only `ttl1.lbm` — the other three are NOT the same size):

| File | Size | Colours |
|---|---|---|
| `ttl1.lbm` | 320x72 | 32 |
| `ttl2.lbm` | 288x144 | 32 |
| `ttl3.lbm` | 272x32 | 32 |
| `ttl4.lbm` | 232x64 | 32 |
| `buckfont.lbm` | 128x32 | 2 |
| `chars.lbm` | 288x144 | 32 |

`bigpic1.daa` block 112 (a 304x120 frame) was rendered and visually confirmed as a coherent
32-colour space-wreck scene — the same sanity check `docs/daa-format.md` uses elsewhere.

### What this unlocks

Amiga art is a **second, distinct graphic set for Buck Rogers** (32-colour Amiga vs the DOS
release's own 256-colour VGA — see `Buck Rogers: Countdown to Doomsday/`'s DOS manifest,
which independently corrected its own EGA→VGA graphic-set claim on 2026-08-26). It is not
"the best art" for this title the way Amiga is for CoK/DoK — DOS VGA remains the richer
palette here — so this is presented as an alternate asset preview
(`apps/web/games/buck-rogers-amiga.json`, `GAME_IDS` id `buck-rogers-amiga`), not a
"best-of" claim. The install's data files (`ecl1.dax`, `geo1.dax`, `mon0cha.dax`, …) are
listed but undecoded-as-gameplay; no playability is claimed for either Buck Rogers platform.

### Detection fix landed alongside this inventory

`packages/engine/src/detect/profiles.ts`'s CoK-Amiga and DoK-Amiga variants both `require`
only `BIGPIC1.DAA`, which this Buck Amiga dump also has, and neither previously excluded any
Buck-only basename — so pointing the Library's "Add asset folder reference" at this folder
was silently identified as Champions of Krynn (via CoK-Amiga: `required` cleared, its
`Title1.LBM` exclude absent) and would tie for Death Knights of Krynn too (DoK-Amiga excludes
only `scrn1b.lbm`/`scrn2.lbm`/`gothic.lbm`, all absent here). Fixed by adding a dedicated Buck
Amiga variant to the `buck-rogers-countdown-to-doomsday` profile (`required: ['SHIPS.DAA',
'BIGPIC1.DAA']`) and adding `SHIPS.DAA`/`BUCKFONT.LBM`/`MARSCOM0.DAA` to both Krynn-Amiga
variants' `exclude` lists. Covered by `packages/engine/test/detect.test.ts` (watched red by
reverting the CoK-Amiga exclude list, which reproduces the exact false-positive named above).
