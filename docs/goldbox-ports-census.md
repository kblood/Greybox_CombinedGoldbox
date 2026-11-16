# SSI Gold Box Series — Platform Ports & Versions Census

**Date: 2026-08-14**

This is a web-sourced secondary-research census of every platform port and re-release of
SSI's D&D "Gold Box" line (the Forgotten Realms and Dragonlance/Krynn titles, plus the two
Buck Rogers XXVc games built on the same engine family). It covers **13 distinct games**
across **roughly 11 platform categories** (9 of which have at least one confirmed release;
Atari ST and SNES appear in the record only as disputed or cancelled entries). Summing
confirmed game×platform releases gives **approximately 47** — plus several additional
claimed releases that remain unresolved (marked `Y?` below) and a handful of documented
cancelled/vaporware ports.

Every claim here passed through a two-stage pipeline: a research pass, then an independent
**adversarial verifier** whose job was to try to refute it. Where a verifier returned
**REFUTED**, the original claim is not presented as fact here — it is either dropped or
shown corrected. Where **UNSETTLED**, the entry is marked disputed. All five research
families used for this census (Forgotten Realms I: Pool of Radiance/Curse of the Azure
Bonds; Forgotten Realms II: Secret of the Silver Blades/Pools of Darkness; Krynn: Champions/
Death Knights/Dark Queen of Krynn; Savage Frontier & companion titles: Gateway/Treasures/
Neverwinter Nights (AOL)/Unlimited Adventures; Buck Rogers) carried both a research pass and
a verification pass — none is missing its check.

See `docs/goldbox-versions-holdings.md` for what this project actually holds of all this,
byte-grounded against local disks.

## Master table — Western platforms

Legend: **Y** = released, reasonably confirmed · **Y?** = claimed release, unsettled/disputed
· **C** = cancelled/never shipped, confirmed by verifier evidence · **C?** = claimed
cancelled/planned, weakly sourced or unsettled · **—** = no evidence found, treated as not
released. See "Disputed and cancelled ports" below for every `Y?`/`C?`/`C` and the reasoning
behind it.

| Game (year) | MS-DOS/PC | C64 | Apple II | Macintosh | Amiga | Atari ST | NES | Genesis | SNES |
|---|---|---|---|---|---|---|---|---|---|
| Pool of Radiance (1988) | Y | Y | Y | Y | Y | C | Y¹ | — | — |
| Curse of the Azure Bonds (1989) | Y | Y | Y | Y | Y | Y | — | — | C? |
| Champions of Krynn (1990) | Y | Y | Y | — | Y | — | — | — | — |
| Buck Rogers: Countdown to Doomsday (1990) | Y | Y | — | — | Y | — | — | Y | — |
| Secret of the Silver Blades (1990) | Y | Y | — | Y | Y | C? | — | — | — |
| Death Knights of Krynn (1991) | Y | Y | — | — | Y | — | — | — | — |
| Pools of Darkness (1991) | Y | — | — | Y | Y | — | — | — | — |
| Gateway to the Savage Frontier (1991) | Y | Y | — | — | Y | — | — | — | — |
| Neverwinter Nights (AOL) (1991)² | Y | — | — | — | — | — | — | — | — |
| The Dark Queen of Krynn (1992) | Y | — | — | Y | Y | — | — | — | — |
| Treasures of the Savage Frontier (1992) | Y | — | — | — | Y | — | — | — | — |
| Buck Rogers: Matrix Cubed (1992) | Y | — | — | — | C | — | — | — | — |
| Forgotten Realms: Unlimited Adventures (1993) | Y | — | — | Y | — | — | — | — | — |

¹ NES released in North America (FCI, April 1992); a separate, earlier Japanese Famicom
release (Pony Canyon, June 28 1991) is the "Y" on this platform — see the Japanese table
and the per-game section. These are two different real releases, not a dating conflict.

² NWN is a live AOL online service, not a packaged port; the "MS-DOS" cell means "the AOL
for DOS client that hosted it, from March 1991." A later AOL-for-Windows client
(2.0/2.5/3.0, 9600+ baud) could apparently also run it, but no source found establishes
whether that was a distinct game build or the same DOS-era game inside a newer client shell
— left off the table as unsettled (see Disputed section).

## Master table — Japanese platforms

| Game | Famicom (JP) | PC-98 |
|---|---|---|
| Pool of Radiance | Y (1991-06-28, Pony Canyon) | — |
| Curse of the Azure Bonds | — | Y (1991-06-21, Pony Canyon/Marionette) |
| Secret of the Silver Blades | — | Y (1992-07-17, Pony Canyon) |
| Pools of Darkness | — | Y (1993-03, Pony Canyon) |
| Champions of Krynn | — | Y (existence solid; exact date/developer credit disputed — see below) |
| Death Knights of Krynn | — | Y (existence solid; exact date/developer credit unverified) |

No PC-98 or Famicom release was found for The Dark Queen of Krynn, Gateway/Treasures of the
Savage Frontier, either Buck Rogers title, Neverwinter Nights, or FRUA. No PC-88, Sharp X1,
FM Towns, or X68000 release was found for anything in the series; this is an
absence-of-evidence result (see Confidence section), not a confirmed negative for every one
of those platforms.

## Per-game detail

### Pool of Radiance (1988)
First Gold Box game. DOS and C64 shipped simultaneously June 1988.

| Platform | Year | Publisher/developer | Notes |
|---|---|---|---|
| MS-DOS/PC | 1988 | SSI | CGA/EGA/Tandy-16 all supported |
| Commodore 64 | 1988 | SSI | shipped alongside DOS |
| Apple II | 1988 | SSI | Hi-Res graphics |
| Macintosh | 1989 | SSI (developer credit unconfirmed — see Disputed) | mono on Plus/Classic, color needs Mac II |
| Amiga | 1990 | U.S. Gold (pub) / Ubi Soft Montreal (dev) | 32 colors, largely redrawn art, called the best-looking 1988–90 port by a fan review |
| Famicom (JP) | 1991-06-28 | Pony Canyon (dev Marionette) | censored vs. NES text/content |
| NES (NA) | 1992-04 | FCI | distinct, later regional release from the Famicom version |
| Atari ST | — | — | **cancelled/vaporware** — see Disputed |

Versions: GOG.com re-release (2015-08-20, DOSBox); Steam/SNEG re-release (2022-03-29, part
of "Forgotten Realms: The Archives — Collection Two"); SSI's own *Forgotten Realms: The
Archives* CD compilation (1997) and *Silver Edition* (~1998); no evidence of an official
German localization was found (a 2012 German fan forum reports failing to find one after
extensive searching).

### Curse of the Azure Bonds (1989)
Direct sequel; no NES port this time, unlike its predecessor.

| Platform | Year | Publisher/developer | Notes |
|---|---|---|---|
| MS-DOS/PC | 1989 | SSI | CGA/EGA/Tandy, 16-color EGA |
| Commodore 64 | 1989 | SSI | |
| Apple II | 1989 | SSI | Hi-Res |
| Macintosh | 1990 | SSI (retail) / MicroMagic (dev) | |
| Amiga | 1990 | U.S. Gold (pub) / MicroMagic (dev) | based on DOS EGA art rather than redrawn; a fan review calls it a graphics downgrade vs. PoR's Amiga port; exact color count (16 vs. "messed with" 32) is unsettled — see Disputed |
| Atari ST | 1991 | SSI/U.S. Gold (pub) / MicroMagic (dev) | corroborated across multiple independent sources, unlike PoR's ST version |
| PC-98 | 1991-06-21 | Pony Canyon (dev Marionette) | |
| SNES | — | FCI (if real) | **claimed-cancelled, weakly sourced** — see Disputed |

Versions: GOG.com re-release (2015-08-20); Steam/SNEG re-release (bundled, ~2022); *Forgotten
Realms: The Archives* (1997/Silver Edition); no evidence of an official German localization.

### Secret of the Silver Blades (1990)

| Platform | Year | Publisher/developer | Notes |
|---|---|---|---|
| MS-DOS | 1990 | SSI | EGA, 16-color, no VGA |
| Commodore 64 | 1990 | SSI | last Gold Box title on C64 before SSI dropped the platform |
| Macintosh | 1991 | SSI (retail) / MicroMagic (dev) | "MacSoft" publisher attribution is **refuted** — see Disputed |
| Amiga | 1991 | SSI (retail) / MicroMagic (dev) | graphics-quality characterization conflicts between sources — see Disputed |
| PC-98 | 1992-07-17 | Pony Canyon | |
| Atari ST | 1991 (solicited) | SSI | **unsettled whether it ever actually shipped** — see Disputed |

Versions: two DOS executable variants (Turbo Pascal 5.5 vs. 6.0-era compile) referenced by
Wikipedia with no independent citation, unresolved; a C64 "3 disks + save disk" vs. "4 disks"
listing discrepancy across two Internet Archive items turned out to be **the same release**,
cataloged inconsistently by the same uploader (resolved, not a real second pressing); GOG.com
/ Steam re-release, bundled; *AD&D Collector's Edition Vol. 1* (1994, WizardWorks) and the
full 9-game *Collector's Edition* CD-ROM.

### Pools of Darkness (1991)

| Platform | Year | Publisher/developer | Notes |
|---|---|---|---|
| MS-DOS | 1991 | SSI | first Krynn/Realms-line title on **VGA, 256 colors** |
| Amiga | 1992 | SSI (retail) / MicroMagic (dev) | 32-color OCS/ECS — a real downgrade vs. DOS VGA, unlike earlier titles; added UI conveniences (bundled scrolls, load-from-camp) DOS lacked |
| Macintosh | 1992 | SSI | |
| PC-98 | 1993-03 | Pony Canyon | exact day (03-19) not corroborated by a primary ad |
| Commodore 64 | — | — | **confirmed not released** — a 2013 AtariAge collector thread states SSI had stopped C64 Gold Box development by this point (same thread also rules out C64 for Dark Queen of Krynn, Treasures of the Savage Frontier and Matrix Cubed) |

Versions: GOG/Steam re-release, bundled; *AD&D Collector's Edition Vol. 3* (1994, WizardWorks)
— confirmed to contain Gateway to the Savage Frontier, Pools of Darkness, and Treasures of
the Savage Frontier together; a claimed German Amiga release could not be confirmed as a real
text translation vs. an English disk set in German packaging.

### Champions of Krynn (1990)

| Platform | Year | Publisher/developer | Notes |
|---|---|---|---|
| MS-DOS/PC | 1990 | SSI (NA) / U.S. Gold (EU) | EGA 16-color only, AdLib |
| Commodore 64 | 1990 | SSI | held locally, see holdings doc |
| Amiga | 1990 | SSI | 32-of-4096 colors, reworked art + extra combat sprites |
| Apple II | 1990 | SSI | in-box "Mini-Docs" confirm CPU/RAM requirements but state no explicit graphics mode ("double hi-res" is an era-typical inference, not a documented spec); the docs give IIgs setup instructions, arguing against a strong "IIgs-incompatible" reading of a single forum post |
| PC-98 | 1992-10-21 (disputed exact date) | Pony Canyon (dev "Opera House") | existence corroborated across several listings/media; the exact date and "Opera House" credit trace to a single Wayback-archived uvlist.net page — see Disputed |

Versions: DQK.EXE-adjacent Krynn-line note — CoK's own `START.EXE` carries no plain-ASCII
version string (unlike DQK, below); *AD&D Collector's Edition Vol. 2* (1994, with DoK/DQK);
GOG.com re-release; Steam "Dungeons & Dragons: Krynn Series" (2022-03-29, adds German/French
UI text — this is the modern Steam re-release's localization, not a period-original one).

### Death Knights of Krynn (1991)

| Platform | Year | Publisher/developer | Notes |
|---|---|---|---|
| MS-DOS/PC | 1991 | SSI | EGA 16-color — "the last of the EGA games" per lead artist Maurine Starkey |
| Commodore 64 | 1991 | SSI | held locally, see holdings doc |
| Amiga | 1991 | SSI | 32-color, enhanced vs. DOS/C64 16-color |
| PC-98 | 1993 (exact date unverified) | Pony Canyon (dev credit "Opera House" unverified) | existence corroborated (uvlist, GameFAQs, Zophar's Domain, VGMRips, a YouTube intro capture); the single archived uvlist snapshot found carries no date/credit field at all |
| Apple II | — | — | **confirmed not released** — the canonical Apple II preservation archive (asimov.net) has a real Champions-of-Krynn folder but no Death-Knights-of-Krynn folder, and a placeholder cross-reference entry on uvlist now resolves as "deleted for being a duplicate entry" |
| Macintosh | — | — | no genuine 1990s SSI Mac port found; a modern fan-made DOSBox/emulation "1-Click Install" bundle exists but is not a period port |

Versions: two DOS executable revisions referenced (v1.00, Turbo Pascal 5.5; v1.10, Turbo
Pascal 6.0); *AD&D Collector's Edition Vol. 2* (1994); GOG.com / Steam "Krynn Series"
re-release (2022).

### The Dark Queen of Krynn (1992)

| Platform | Year | Publisher/developer | Notes |
|---|---|---|---|
| MS-DOS/PC | 1992 | SSI | VGA, 256-color, first Krynn title off EGA; the installed GOG copy's `DQK.EXE` carries the plain-ASCII string **"Version 1.1     July 29,1992"** (byte-verified — see holdings doc, which independently found the identical string) |
| Amiga | 1992 | SSI | 32-color — stayed at the same depth as CoK/DoK's Amiga ports despite DQK being the most advanced engine generation; called the weakest of the three Amiga Krynn renders by this project's own art-source verdict |
| Macintosh | 1992 (exact day, Aug 24, is a single retrospective blog's post title — see Disputed) | SSI | 256-color, matching DOS VGA; this is the only one of the three Krynn games with a confirmed genuine 1990s Mac release |
| Commodore 64 / Apple II / PC-98 | — | — | no evidence found for any of these, consistent with the DOS EXE's VGA-only enforcement and the series' move off 16-color hardware |

Versions: *AD&D Collector's Edition Vol. 2* (1994); GOG.com / Steam "Krynn Series"
re-release (2022) — a Steam community thread notes the digital re-release still shows the
original word-lookup copy-protection prompt.

### Gateway to the Savage Frontier (1991)

| Platform | Year | Publisher/developer | Notes |
|---|---|---|---|
| MS-DOS | 1991 | SSI | first SSI Gold Box title with a VGA/MCGA 256-color mode alongside CGA/EGA/Tandy |
| Commodore 64 | 1991 (year not independently cross-checked against a second dated source) | SSI | widely regarded by retrospective reviewers as a weak port: missing spell re-memorization, reused older Krynn-era art |
| Amiga | 1991 | SSI | reportedly lacked a hard-drive install option and shipped with a save-often warning (single blog-aggregated source, low confidence) |

No Apple II, Atari ST, Macintosh, NES, Genesis, or PC-98 release was found. Widely called the
weakest Gold Box entry by retrospective reviewers. Versions: GOG/Steam re-release (Steam
AppID 1904523, 2022-03-29); an unofficial fan German text patch exists for the GOG build
(not an SSI localization); a fan-maintained WHDLoad packaging of the Amiga version exists.

### Treasures of the Savage Frontier (1992)

| Platform | Year | Publisher/developer | Notes |
|---|---|---|---|
| MS-DOS | 1992 | SSI | |
| Amiga | 1992 | SSI | one review called the graphics "poor verging on off-putting" by this point in the engine's life; added wilderness weather effects |

No Commodore 64 release (SSI had wound down 8-bit Gold Box ports by 1992). A claimed native
Macintosh version is **false** — the only "Mac" hit found is a modern fan-made DOSBox-wrapped
macOS installer bundle of the DOS game, not a period port (unlike FRUA's genuine Mac release,
below). No Apple II, Atari ST, NES, Genesis, or PC-98 release found.

Versions: GOG/Steam re-release (Steam AppID 1904524, 2022-03-29); a claimed WizardWorks
CD-ROM budget re-release remains **unsettled** — two Wikipedia articles agree on it, but both
sit in the same shallow tertiary-database ecosystem with no independent corroboration found.

### Neverwinter Nights (AOL) (1991)
A live online service accessed via the AOL client, not a packaged multi-platform release —
read the platform table entry above as "which AOL client could run it," not a conventional
port list. Co-developed by Stormfront Studios/SSI/TSR; AOL operated the service. Launched
March 1991 on the AOL-for-DOS client; ran until shutdown on **1997-07-19** after a rights
dispute with TSR. Per-server capacity grew from 50 players (1991) to ~2000 (1997 peak). No
Macintosh AOL client support, and no Commodore 64/Quantum Link-era version, was found for
this title specifically (AOL had already moved off the C64-only Quantum Link service by the
time NWN shipped).

A widely-repeated claim that "an offline, singleplayer version remained available for
download" is **refuted**: it traces (via Wikipedia's own footnote) to a hobbyist-built
*Forgotten Realms: Unlimited Adventures* module named "Neverwinter Nights - Offline,"
built with FRUA's community modding tools (UAShell/Toolbox/UA256) by a user credited as
"GoldBoxFan" between 2012 and 2013 — fifteen years after the real service shut down, and
built on a completely different (1993) SSI product's construction kit, not an official
AOL/SSI release. See Disputed section.

### Forgotten Realms: Unlimited Adventures (1993)

| Platform | Year | Publisher/developer | Notes |
|---|---|---|---|
| MS-DOS | 1993-03-17 | SSI (dev MicroMagic) | |
| Macintosh | 1993 | SSI | genuine native-era Mac port (68k disk images survive on preservation sites), unlike the false "Mac" hits found for Gateway/Treasures |

Versions: v1.0 → v1.2 English patch cycle referenced by a GOG community guide (an
intermediate v1.1 is unconfirmed — see Disputed); a German-language localization exists but
per the same guide was never updated past v1.0 and is "badly translated" / incompatible with
most modding tools; GOG/Steam re-release (Steam AppID 1904526, 2022-03-29), includes the
pre-made "Heirs to Skull Crag" scenario. Two current-day fan/homebrew reimplementation
projects (`OpenUA` for Amiga, a WIP Atari Falcon/TT port thread) are **not** period SSI
ports and must not be read as "FRUA shipped on Amiga/Atari ST" — flagged here only as a
caution against that misreading.

### Buck Rogers: Countdown to Doomsday (1990)

| Platform | Year | Publisher/developer | Notes |
|---|---|---|---|
| MS-DOS/PC | 1990 | SSI | The **buck-rogers verifier extracted the local DAX archive bytes directly**: `START.EXE` contains the literal setup string `GRAPHICS ADAPTER TYPE: [1] CGA [2] EGA [3] Tandy [4] VGA`, and the locally-held `BUCK.CFG`'s video-adapter field is set to `V` (VGA) — a genuine, binary-confirmed VGA option that neither CoK's nor DoK's `START.EXE` offers. Whether the VGA mode carries true 256-color art or DAC-enhanced 16-color EGA-equivalent pixels (the DAX container itself has no per-file palette) is a separate, still-open question. |
| Commodore 64 | 1990 | SSI | held locally, see holdings doc |
| Amiga | 1990 | SSI | OCS/ECS chipset confirmed independently by Lemon Amiga/Hall of Light; exact color count (~32, by chipset-class inference) not stated by any source found |
| Sega Genesis/Mega Drive | NA Dec 1991 / EU Apr 1992 | EA (pub) | changed to third-person isometric party-sprite navigation/combat, simplified character creation, full continuous soundtrack; "Game Development: Tony Van" (with Bret Berry) confirmed via the cartridge's own in-game credits scroll and the printed US manual, both independently cited by Sega Retro |

No PC-98/PC-88/FM Towns/X68000/MSX, Apple II, Atari ST, Macintosh, or NES/Famicom release was
found. No GOG.com or Steam re-release exists: the entire SSI Buck Rogers catalog remains
undigitized because of an unresolved Dille Family Trust trademark/copyright dispute (per a
GOG forum thread and Hollywood Reporter coverage). Extensive German-magazine review coverage
(Amiga Joker, ASM, Power Play, PC Joker, Play Time, Happy Computer) implies strong German
retail distribution, but Hall of Light's own manual-language breakdown shows only the core
manual was translated to German — Rule Book, Log Book, Data Card, and Cluebook stayed
English — which leans toward a manual-only localization rather than translated game text
(still not fully confirmed either way).

### Buck Rogers: Matrix Cubed (1992)

| Platform | Year | Publisher/developer | Notes |
|---|---|---|---|
| MS-DOS/PC | 1992 | SSI | Same verifier byte-check as BR1: `START.EXE` (extracted from a local `buckrogers2_dos_win.7z` archive) contains `GRAPHICS ADAPTER TYPE: [1] EGA [2] Tandy [3] VGA` (CGA dropped by 1992), and the local `MATRIX.CFG` is configured for VGA. Hall of Light's conversion catalog independently tags the DOS release "EGA VGA." **Reconciled 2026-08-14:** the archive is real. `buckrogers2_dos_win.7z` (2.0 MB, 58 files) contains `BuckRogers2\c\Matrix\` with `START.EXE`, `TITLE.DAX`, `WALLDEF1.DAX`, `VENUSCOM.DAX` and `TANDY.ADV`. The first holdings pass simply never listed the parent directory, only its `BuckRogers1-...` subfolder. Matrix Cubed is held, and is a DAX title. |

An Amiga port was actively developed and previewed/reviewed by UK and German press (Amiga
Power, Zero, Power Play 78% issue 6/92, Amiga Joker 64% issue 5/92) — real, independently
corroborated evidence a build existed — but it was **cancelled** and never released at
retail. The specific "a severe bug needing a logic analyzer to isolate" cancellation story
traces to one interview (programmer Kerry Bonin) quoted verbatim across several sites; a
second, independent SSI-producer account (Rhonda Van) corroborates that a build existed and
was likely never finished, but attributes this to general company financial trouble and a
PC-first budget rather than the specific bug — the underlying cancellation is doubly
sourced, the bug-mechanism story is not. Same Dille Family Trust rights block applies as for
the first game; both titles appear together on the same unresolved GOG wishlist thread.

## Disputed and cancelled ports

Every claim below went to an adversarial verifier and did not come back a clean CONFIRMED.
Reported here with the verifier's own reasoning, briefly.

**Pool of Radiance, Atari ST — cancelled/vaporware.** Verdict: **CONFIRMED never shipped.**
Wikipedia only ever says a version "was announced"; AtariLegend's own database entry is
undated with no screenshots and an open call for anyone who has one; an Atari-Forum collector
thread states plainly "Pool of Radiance is vapor... but Curse was released," with concrete
evidence Curse of the Azure Bonds actually circulated on named cracking-group disk
collections; and MobyGames independently notes Curse's ST version lacks the Pool-of-Radiance
character-import option every other platform's Curse of the Azure Bonds has — indirect but
real technical evidence nothing to import from ever existed on that platform.

**Pool of Radiance, Macintosh developer (SSI in-house vs. MicroMagic).** Verdict:
**UNSETTLED.** MobyGames — the presumed source either way — was unreachable (403/CAPTCHA) by
every method tried, including a real headless-browser fetch. No independent source was found
confirming a developer credit for the Mac port either way.

**Curse of the Azure Bonds, cancelled SNES/NES sequel port.** Verdict: **UNSETTLED,**
leaning weak. The claim traces to two Wikipedia footnotes; one is a GameFAQs NES-FAQ page not
obviously about an SNES cancellation at all, and the other is a since-likely-dead Russian fan
page on narod.ru titled (per its own name) "there were plans to remake it for the SNES" — a
single obscure enthusiast source, not a primary one. Unseen64.net, a site built specifically
to catalog cancelled games, has zero coverage of it — meaningful corroborating silence, not
proof of nonexistence.

**Curse of the Azure Bonds, Amiga color count (16 vs. a "messed with" 32).** Verdict:
**UNSETTLED.** Hall of Light and LemonAmiga were both unreachable (bot-protection / dead
links) in the verification pass; the claim rests only on a fan blog/forum discussion, exactly
as the original researcher characterized it.

**Pool of Radiance NES/Famicom "1991 vs. April 1992" date conflict.** Verdict: **REFUTED as
a conflict.** vgmpf.com's own release table and an independently-fetched ja.wikipedia.org
article both give Japan/Famicom = 1991-06-28 (Pony Canyon) and USA/NES = April 1992 (FCI)
side by side — two different, both-correct regional releases. English Wikipedia's infobox
only shows the US date because the English article doesn't discuss the Japanese release at
all. Reflected as two separate table entries above, not a dispute.

**Secret of the Silver Blades, Amiga graphics quality ("richer colors" vs. an unmodified
EGA carryover).** Verdict: **UNSETTLED.** The Amiga Power review quoted by the original
researcher could not be located directly (no working search engine reachable); Wikipedia's
own Reception section quotes a different magazine, Amiga Action (87%, unreserved praise,
no graphics comment either way), which neither confirms nor refutes the Amiga Power
characterization.

**Secret of the Silver Blades, Atari ST — shipped or only solicited?** Verdict:
**UNSETTLED.** The compiler of the fan SSI-history price-list site — a primary, first-person
source — asks in his own words "does anyone know if the ST versions of Pool of Radiance and
Secret of the Silver Blades ever shipped? I haven't been able to find copies..." This is
genuine evidence the question is real and open among SSI historians, not settled either way.
Wikipedia's own SSB platform table omits Atari ST entirely, a mild additional data point
against a retail release but not conclusive.

**Secret of the Silver Blades / Pools of Darkness, Macintosh publisher (SSI vs.
"MacSoft").** Verdict: **REFUTED.** Four independently-fetched infobox reads (PCGamingWiki
and Wikipedia, both games) agree: publisher = Strategic Simulations, Inc. throughout, with
MicroMagic credited only as SSB's Mac *developer*. "MacSoft" does not appear on any of the
four pages — it is a later-1990s SSI-adjacent imprint, unconnected to these original
releases.

**Pools of Darkness, "German Amiga version."** Verdict: **UNSETTLED.** A forum post claims
to have found one, but no source establishes whether it's a genuine text translation or an
English disk set repackaged with German retail materials (a common period practice).

**Secret of the Silver Blades, C64 "3 disks + save disk" vs. "4 disks."** Verdict:
**REFUTED as a real discrepancy — resolved.** Both Internet Archive items were uploaded by
the same person on the same date; the "4 disks" item's own file listing shows only 3 disks'
worth of images despite its label. Both descriptions plausibly describe the same release,
with the 4th "disk" being the uncounted blank save disk, not a second game disk requiring
its own dump.

**Champions of Krynn / Death Knights of Krynn, PC-98 dates and "Opera House" developer
credit.** Verdict: **UNSETTLED.** A Wayback Machine snapshot of uvlist.net does verbatim
confirm CoK's claimed date (1992-10-21) and "Opera House" credit — real data, not a
hallucination — but it is still a single, user-editable listing with no second independent
source found. DoK's only reachable uvlist snapshot carries **no** date or developer field at
all, so that half of the claim is unverifiable with what could be reached.

**Death Knights of Krynn, no Apple II port.** Verdict: **CONFIRMED (strengthened).** The
canonical Apple II preservation archive (asimov.net) has a real 7-disk Champions of Krynn
folder but no Death Knights of Krynn folder anywhere in its listing; uvlist's own placeholder
cross-reference entry for a Death Knights Apple II release now resolves as "deleted for being
a duplicate entry."

**The Dark Queen of Krynn, Macintosh release date (Aug 24, 1992).** Verdict: **CONFIRMED as
weakly sourced.** The source is a single retrospective blog whose post title literally is the
date claim, with no magazine, box, or press-release citation anywhere in the post. The Mac
release itself is real; only the exact day is this weakly attested.

**Champions of Krynn / Dark Queen of Krynn, "no DOS patch history was found."** Verdict:
**REFUTED.** Direct string inspection of this project's own `DQK.EXE` (GOG copy) turns up a
plain-ASCII marker: `Version 1.1     July 29,1992` — a real internal build/version string
absent (as plain ASCII) from either CoK's or DoK's `START.EXE`. This does not by itself prove
a public v1.0→v1.1 patch was distributed to end users (it may simply be the shipped build
number), but the claim that no evidence exists at all was wrong. This string is independently
corroborated by the byte-grounded holdings census — see the holdings doc.

**Gold Box DOS games, official 1990s German/French text localizations.** Verdict:
**UNSETTLED**, but with a concrete new lead: uvlist.net tags DQK-DOS and DoK-Amiga as
published by "SSI / Softgold" with languages "eng ger." Softgold Computerspiele GmbH was
SSI's real period German-market publisher — distinct from U.S. Gold, which is only confirmed
as the general European distributor. This doesn't establish a full text translation existed
for any specific title, but it's a stronger lead than an unsourced assumption.

**Gateway to the Savage Frontier, C64 release year (1991).** Verdict: **UNSETTLED.** Three
tertiary sources agree (c64-wiki.de, English and German Wikipedia), but none cites a primary
source, and all three likely draw on the same shallow database lineage — agreement here is
not independence.

**Treasures of the Savage Frontier, WizardWorks CD-ROM re-release.** Verdict:
**UNSETTLED.** Two separately-edited Wikipedia articles agree, one better than a single
source, but both still sit in the same tertiary ecosystem; no box scan, catalog ad, or
MobyGames release-list page (Cloudflare-blocked) was reachable to independently confirm it.

**Neverwinter Nights, AOL-for-Windows client as a distinct game build.** Verdict:
**UNSETTLED.** No source addresses AOL client architecture/versioning for this title at all
— a genuine, unresolved gap, not evidence either way.

**Neverwinter Nights, official "offline singleplayer version."** Verdict: **REFUTED.** The
actual source, traced through Wikipedia's own footnote, is the readme of a hobbyist-built
*Forgotten Realms: Unlimited Adventures* module ("Neverwinter Nights - Offline," by
"GoldBoxFan," built with FRUA's UAShell/Toolbox/UA256 modding tools, versions 1.00–1.17,
2012–2013) — a fan reconstruction on a different SSI product's engine, fifteen years after
the real service closed, not an official AOL/SSI release. Wikipedia's own article text does
not flag this origin, which is worth knowing before citing that sentence elsewhere.

**Forgotten Realms: Unlimited Adventures, an intermediate v1.1 patch.** Verdict:
**UNSETTLED.** Only v1.0 and v1.2 are attested by the one source found (a GOG community
guide); no source confirms or denies a v1.1 existed.

**Buck Rogers: Countdown to Doomsday, DOS graphics mode.** Verdict: **REFUTED** (in the
"unconfirmed by any explicit source" sense) **— resolved in favor of VGA support.** Direct
byte inspection of the locally-held `START.EXE` shows the literal four-way adapter menu
quoted above, and the locally-held `BUCK.CFG` is configured for VGA. This is stronger,
byte-level evidence, not an analogy to sibling EGA-only titles.

**Buck Rogers: Countdown to Doomsday, Genesis lead developer "Tony Van."** Verdict:
**REFUTED** (in the "uncorroborated" sense) **— confirmed via primary credits.** Sega Retro
quotes both the cartridge's own in-game credit scroll and the printed US manual (page 74),
independently, both naming Tony Van (the credits scroll also names Bret Berry).

**Buck Rogers: Matrix Cubed, DOS graphics mode.** Verdict: **REFUTED — resolved in favor of
VGA support**, on the same kind of direct byte evidence as the first game (see per-game
section above).

**Buck Rogers: Matrix Cubed, cancelled-Amiga-port cancellation story.** Verdict:
**CONFIRMED as partially single-sourced.** The build's existence is doubly corroborated
(two independent German magazine reviews plus two independent producer/programmer
first-person accounts), but the specific "logic analyzer bug" causal mechanism is attested
by one interview alone, quoted verbatim across several sites — a second, independent
producer account gives a different reason (general financial trouble) and doesn't mention the
bug at all.

**Any Buck Rogers title on a Japanese platform (PC-98/PC-88/FM Towns/X68000/MSX).**
Verdict: **UNSETTLED.** The verifier's WebSearch budget was exhausted before Japanese-language
queries could be attempted; no English-language source checked mentions one. Absence of
evidence, not confirmed absence.

## Confidence and sources

This is **web-sourced secondary research**, not a primary-document audit. Databases covering
this series (MobyGames, Wikipedia, Hall of Light, LemonAmiga, Lemon64, uvlist.net, AtariAge/
Atari-Forum threads, C64-Wiki) frequently **contradict each other**, and several — most
persistently **MobyGames**, which returned a Cloudflare bot-challenge to every fetch attempt
across multiple verification passes, including via a real headless-browser fetch — could not
be read directly at all in this round. At least one verifier (Forgotten Realms II) reported
its WebSearch quota was **exhausted before a single query ran**; two others (Savage Frontier
& companion titles, Buck Rogers) reported it exhausted mid-task. The user's brief for this
census also asked that a MobyGames/Giant Bomb 403 pattern specifically be recorded here: the
MobyGames 403/Cloudflare-block pattern is heavily and repeatedly attested across the source
transcripts for this census; a specific Giant Bomb block was not separately evidenced in the
transcripts reviewed for this document. **Given both of these, an entry marked UNSETTLED
above may simply be under-searched rather than genuinely balanced 50/50** — treat UNSETTLED
as "we could not confirm this, not that it's false."

Only `docs/goldbox-versions-holdings.md` is byte-grounded (read directly off local disk
images and installed game files, not off the web). Where this census and the holdings doc
overlap — the DQK.EXE `Version 1.1     July 29,1992` string is the clearest example, found
independently by both a web-research verifier reading the repo's own installed copy and by
the separate byte-grounded holdings inventory pass — the agreement is worth noting as a
confidence booster. Where they conflicted — the Buck Rogers verifier's claimed extraction of a
local `buckrogers2_dos_win.7z` / `buckrogers_amiga_win.7z`, versus the holdings census's
"nothing held for Matrix Cubed anywhere" finding — the conflict was **resolved in the
verifier's favour on 2026-08-14** by listing the directory directly: both archives exist and
were opened. The holdings pass had enumerated only the `BuckRogers1-...` subfolder, not its
parent. The same review found that the holdings pass had missed an entire fifth location (GOG
Galaxy), which is where the DOS copies of six more titles and FRUA turned out to live; the
holdings document has been rewritten accordingly and its earlier gap list should not be
cited.

Per the task brief, the **buck-rogers verifier's verdicts outrank any web-sourced graphics-
mode claim for Countdown to Doomsday and Matrix Cubed**, because it went further than every
other family's verifier: it directly extracted and read the local DAX archive bytes (setup
strings, `.CFG` adapter fields) rather than relying on secondary web sources. Its VGA-support
findings for both DOS releases are treated as settled here on that basis, not as disputed.
