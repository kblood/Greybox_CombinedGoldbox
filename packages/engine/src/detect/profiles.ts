/**
 * Game detection profiles (M0.S4).
 *
 * The shipping product loads games through "Add asset folder reference": the user
 * points at one of their own game installs and the engine *fingerprints* the folder
 * against these profiles (basename sets + optional magic-byte signatures) to identify
 * the game, the platform, and which graphic sets are present. This replaces
 * hand-authored asset paths (the old web-engine/games/*.json manifests, which are
 * kept for viewer back-compat).
 *
 * A `GameProfile` describes one logical game (Champions of Krynn, …). Each game has
 * one or more `PlatformVariant`s (DOS, Amiga, …) — a single chosen folder is exactly
 * one variant. A variant is identified by a `Signature`:
 *   - `required`: basenames that MUST all be present, or the variant is disqualified
 *     (a cheap family gate, e.g. "this is a Krynn-Gen1 DAX install");
 *   - `exclude`: basenames that, if present, disqualify the variant (used to split
 *     two games that share the same `required` set — e.g. CoK's KRYNN.CFG excludes
 *     the DoK variant);
 *   - `markers`: weighted basenames that, when present, raise the match score
 *     (the discriminators that pick the right game among the survivors);
 *   - `magic`: optional first-bytes probes (e.g. HLIB at offset 0 of a .TLB) the
 *     async confirmation pass can use to harden a filename-only match.
 *
 * All basename matching is case-insensitive (Amiga ports mix `scrn1b.lbm` /
 * `BIGPIC1.DAA` / `Title1.LBM`). Folders are scanned recursively, so files nested
 * in DISK1/DISK2/disk3 subdirectories match on their basename.
 */

/** A first-bytes signature probe against a specific file. */
export interface MagicSignature {
  /** Basename (case-insensitive) of the file to probe, e.g. "TITLE.TLB". */
  file: string;
  /** Byte offset to read from. */
  offset: number;
  /** Expected bytes (as an ASCII string, e.g. "HLIB"). */
  ascii: string;
}

/** A weighted filename marker. */
export interface Marker {
  /** Basename (case-insensitive), e.g. "KRYNN.CFG". */
  name: string;
  /** Score contributed when this basename is present. */
  weight: number;
}

/** What identifies one platform variant of a game inside a chosen folder. */
export interface Signature {
  /** Basenames that must ALL be present (case-insensitive) or the variant is out. */
  required: string[];
  /** Basenames that, if present, DISQUALIFY this variant (game disambiguation). */
  exclude?: string[];
  /** Weighted discriminator basenames (raise score when present). */
  markers: Marker[];
  /** Optional first-bytes probes for the async magic-confirmation pass. */
  magic?: MagicSignature[];
}

/** One platform build of a game (the unit a single chosen folder resolves to). */
export interface PlatformVariant {
  /** Platform label, e.g. "DOS" | "Amiga". */
  platform: string;
  /** Graphic-set id this variant provides, e.g. "dos-ega" | "amiga" | "dos-vga". */
  graphicSet: string;
  /** Container family the art lives in, e.g. "DAX" | "DAA" | "HLIB". */
  container: string;
  signature: Signature;
}

/** A logical game, independent of platform. */
export interface GameProfile {
  /** Stable id, e.g. "champions-of-krynn". */
  id: string;
  title: string;
  /** Series/grouping, e.g. "Krynn". */
  series: string;
  /** Ruleset plugin id this game runs under (informational until M2). */
  ruleset: string;
  /** Engine generation, drives which loaders/ECL dialect apply. */
  engineGen: 'gen1-dax' | 'gen2-hlib';
  variants: PlatformVariant[];
}

// ---------------------------------------------------------------------------
// The built-in profile set (Krynn trilogy). New games extend this array.
// ---------------------------------------------------------------------------

// Generic Krynn-Gen1 DOS DAX "family gate" — every CoK/DoK DOS install has these.
// Disambiguation between CoK and DoK is done by exclude (the .CFG name) + markers.
const KRYNN_GEN1_DOS_REQUIRED = ['BIGPIC1.DAX', 'GEO1.DAX', 'ECL1.DAX', '8X8D1.DAX'];

export const BUILTIN_PROFILES: GameProfile[] = [
  {
    id: 'champions-of-krynn',
    title: 'Champions of Krynn',
    series: 'Krynn',
    ruleset: 'addnd1e-dragonlance',
    engineGen: 'gen1-dax',
    variants: [
      {
        platform: 'DOS',
        graphicSet: 'dos-ega',
        container: 'DAX',
        signature: {
          required: KRYNN_GEN1_DOS_REQUIRED,
          exclude: [
            'DKK.CFG',
            'BACK1.DAX',
            'POOL.CFG',
            'CURSE.CFG',
            'BLADES.CFG',
            'TREASURE.CFG',
            'POOL4.CFG',
            'GAME.CFG',
            'ZOUNDS.DAX',
          ], // DoK / broader-roster markers
          markers: [
            { name: 'KRYNN.CFG', weight: 50 },
            { name: 'GAME.OVR', weight: 10 },
            { name: 'MON1ITM.DAX', weight: 10 },
            { name: 'COMSPR.DAX', weight: 5 },
            { name: 'CHEAD.DAX', weight: 5 },
            { name: 'CBODY.DAX', weight: 5 },
          ],
        },
      },
      {
        platform: 'Amiga',
        graphicSet: 'amiga',
        container: 'DAA',
        signature: {
          required: ['BIGPIC1.DAA'],
          // Title1.LBM: DoK-Amiga marker. SHIPS.DAA/BUCKFONT.LBM/MARSCOM0.DAA: Buck-Amiga-only
          // markers, added 2026-09-02 (R1) — until then this variant's only required basename,
          // BIGPIC1.DAA, is ALSO present in the Buck Rogers Amiga WHDLoad dump (a distinct DAA/DAX
          // title, not GLIB), so a Buck Amiga folder was mis-identified as Champions of Krynn.
          exclude: ['Title1.LBM', 'SHIPS.DAA', 'BUCKFONT.LBM', 'MARSCOM0.DAA'],
          markers: [
            { name: 'scrn1b.lbm', weight: 30 },
            { name: 'scrn2.lbm', weight: 15 },
            { name: 'gothic.lbm', weight: 10 },
            { name: 'SKY.DAA', weight: 10 },
            { name: '8X8D0.DAA', weight: 10 },
            { name: 'DUNGCOM.DAA', weight: 5 },
          ],
        },
      },
    ],
  },
  {
    id: 'death-knights-of-krynn',
    title: 'Death Knights of Krynn',
    series: 'Krynn',
    ruleset: 'addnd1e-dragonlance',
    engineGen: 'gen1-dax',
    variants: [
      {
        platform: 'DOS',
        graphicSet: 'dos-ega',
        container: 'DAX',
        signature: {
          required: KRYNN_GEN1_DOS_REQUIRED,
          exclude: [
            'KRYNN.CFG',
            'POOL.CFG',
            'CURSE.CFG',
            'BLADES.CFG',
            'TREASURE.CFG',
            'POOL4.CFG',
            'GAME.CFG',
            'ZOUNDS.DAX',
          ], // CoK / broader-roster markers
          markers: [
            { name: 'DKK.CFG', weight: 50 },
            { name: 'BACK1.DAX', weight: 15 },
            { name: '8X8D4.DAX', weight: 10 },
            { name: 'MON1WIZ.DAX', weight: 10 },
            { name: 'ITEM0.DAX', weight: 5 },
          ],
        },
      },
      {
        platform: 'Amiga',
        graphicSet: 'amiga',
        container: 'DAA',
        signature: {
          required: ['BIGPIC1.DAA'],
          // scrn1b.lbm/scrn2.lbm/gothic.lbm: CoK-Amiga markers. SHIPS.DAA/BUCKFONT.LBM/
          // MARSCOM0.DAA: Buck-Amiga-only markers, added 2026-09-02 (R1) for the same reason as
          // the CoK-Amiga variant above — Buck's Amiga dump also has no Title1.LBM, so it would
          // otherwise pass this variant's gate too.
          exclude: ['scrn1b.lbm', 'scrn2.lbm', 'gothic.lbm', 'SHIPS.DAA', 'BUCKFONT.LBM', 'MARSCOM0.DAA'],
          markers: [
            { name: 'Title1.LBM', weight: 40 },
            { name: 'CPIC1.daa', weight: 5 },
          ],
        },
      },
    ],
  },
  {
    id: 'dark-queen-of-krynn',
    title: 'The Dark Queen of Krynn',
    series: 'Krynn',
    ruleset: 'addnd1e-dragonlance',
    engineGen: 'gen2-hlib',
    variants: [
      {
        platform: 'DOS',
        graphicSet: 'dos-vga',
        container: 'HLIB',
        signature: {
          required: ['TITLE.TLB'],
          markers: [
            { name: 'DQK.EXE', weight: 40 },
            { name: 'ALWAYS.TLB', weight: 20 },
            { name: 'SOUNDS.GLB', weight: 20 },
            { name: 'DQK.CFG', weight: 20 },
            { name: 'ECL.GLB', weight: 10 },
            { name: 'GEO.GLB', weight: 10 },
          ],
          magic: [{ file: 'TITLE.TLB', offset: 0, ascii: 'HLIB' }],
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Broader roster (M5.S6) — other SSI Gold Box titles sharing the Gen1 DAX
  // engine lineage. Grounding for each signature is documented per-profile;
  // full citation trail: docs/engine/research/broader-roster-detection.md.
  // No asset data for these broader-roster games is bundled or committed (G5) — the
  // engine only detects/loads whatever the user points it at.
  // -------------------------------------------------------------------------
  {
    id: 'pool-of-radiance',
    title: 'Pool of Radiance',
    series: 'Forgotten Realms',
    ruleset: 'addnd1e',
    engineGen: 'gen1-dax',
    variants: [
      {
        platform: 'DOS',
        graphicSet: 'dos-ega',
        container: 'DAX',
        signature: {
          // SteamDB's current release manifest confirms POOL.CFG beside START.EXE,
          // ECL1/GEO1/8X8D1.DAX and the broader Gen1 DAX family. Keep POOL.CFG as
          // the sole required gate so data-only folders remain detectable.
          required: ['POOL.CFG'],
          exclude: [
            'KRYNN.CFG',
            'DKK.CFG',
            'CURSE.CFG',
            'BLADES.CFG',
            'TREASURE.CFG',
            'POOL4.CFG',
            'GAME.CFG',
            'ZOUNDS.DAX',
          ],
          markers: [
            { name: 'START.EXE', weight: 10 },
            { name: 'GEO1.DAX', weight: 10 },
            { name: 'ECL1.DAX', weight: 10 },
            { name: '8X8D1.DAX', weight: 10 },
          ],
        },
      },
    ],
  },
  {
    id: 'curse-of-the-azure-bonds',
    title: 'Curse of the Azure Bonds',
    series: 'Forgotten Realms',
    ruleset: 'addnd1e',
    engineGen: 'gen1-dax',
    variants: [
      {
        platform: 'DOS',
        graphicSet: 'dos-ega',
        container: 'DAX',
        signature: {
          // Verified present via a real (uncommitted, git-ignored) coab_extracted/Data/ dump.
          // Deliberately does NOT include GEO1.DAX like the Krynn family gate: CoAB's dump has
          // GEO2..GEO6.DAX but no GEO1.DAX — area 1 apparently has no dungeon geo, the same
          // pattern the DQK decompile found for its own area-1 stub.
          required: ['BIGPIC1.DAX', 'ECL1.DAX', '8X8D1.DAX'],
          exclude: [
            'KRYNN.CFG',
            'DKK.CFG',
            'POOL.CFG',
            'BLADES.CFG',
            'TREASURE.CFG',
            'POOL4.CFG',
            'GAME.CFG',
            'ZOUNDS.DAX',
          ],
          markers: [
            { name: 'CURSE.CFG', weight: 50 },
            { name: 'COMSPR.DAX', weight: 10 },
            { name: 'SKY.DAX', weight: 10 },
            { name: 'TITLE.DAX', weight: 10 },
            { name: 'MON1CHA.DAX', weight: 5 },
            { name: 'TILES.DAX', weight: 5 },
          ],
        },
      },
    ],
  },
  {
    id: 'secret-of-the-silver-blades',
    title: 'Secret of the Silver Blades',
    series: 'Forgotten Realms',
    ruleset: 'addnd1e',
    engineGen: 'gen1-dax',
    variants: [
      {
        platform: 'DOS',
        graphicSet: 'dos-ega',
        container: 'DAX',
        signature: {
          // SteamDB's current release manifest lists BLADES.CFG beside START.EXE,
          // ECL1.DAX, GEO1.DAX and the normal Gen1 DAX family.
          required: ['BLADES.CFG'],
          exclude: [
            'KRYNN.CFG',
            'DKK.CFG',
            'POOL.CFG',
            'CURSE.CFG',
            'TREASURE.CFG',
            'POOL4.CFG',
            'GAME.CFG',
            'ZOUNDS.DAX',
          ],
          markers: [
            { name: 'START.EXE', weight: 20 },
            { name: 'GAME.OVR', weight: 5 },
            { name: 'GEO1.DAX', weight: 10 },
            { name: 'ECL1.DAX', weight: 10 },
            { name: '8X8D1.DAX', weight: 10 },
          ],
        },
      },
    ],
  },
  {
    id: 'treasures-of-the-savage-frontier',
    title: 'Treasures of the Savage Frontier',
    series: 'Forgotten Realms',
    ruleset: 'addnd2e',
    engineGen: 'gen1-dax',
    variants: [
      {
        platform: 'DOS',
        graphicSet: 'dos-vga',
        container: 'DAX',
        signature: {
          // SteamDB's manifest lists TREASURE.CFG, GAME.EXE and ZOUNDS.DAX in the
          // installed game folder. TREASURE.CFG disambiguates it from Gateway.
          required: ['TREASURE.CFG', 'ZOUNDS.DAX'],
          exclude: ['KRYNN.CFG', 'DKK.CFG', 'POOL.CFG', 'CURSE.CFG', 'BLADES.CFG', 'POOL4.CFG', 'GAME.CFG'],
          markers: [
            { name: 'GAME.EXE', weight: 20 },
            { name: 'GAME.OVR', weight: 10 },
            { name: 'STARTUP.EXE', weight: 5 },
            { name: 'CONTROL.EXE', weight: 5 },
            { name: 'ECL1.DAX', weight: 10 },
            { name: 'GEO1.DAX', weight: 10 },
          ],
        },
      },
    ],
  },
  {
    id: 'neverwinter-nights-dos',
    title: 'Neverwinter Nights (DOS/AOL)',
    series: 'Forgotten Realms',
    ruleset: 'addnd2e',
    engineGen: 'gen1-dax',
    variants: [
      {
        platform: 'DOS',
        graphicSet: 'dos-ega',
        container: 'DAX',
        signature: {
          // Local user-provided DOS/AOL NWN archive uses GAME.CFG/GAME.OVR and
          // starts its world data at ECL0/GEO0. ZOUNDS.DAX is excluded so the
          // Savage Frontier GAME.CFG profile remains separate.
          required: ['GAME.CFG', 'GAME.OVR', 'ECL0.DAX', 'GEO0.DAX'],
          exclude: ['KRYNN.CFG', 'DKK.CFG', 'POOL.CFG', 'CURSE.CFG', 'BLADES.CFG', 'TREASURE.CFG', 'POOL4.CFG', 'ZOUNDS.DAX'],
          markers: [
            { name: 'GAME.EXE', weight: 20 },
            { name: '8X8D.DAX', weight: 10 },
            { name: 'WALLDEF.DAX', weight: 10 },
            { name: 'MONCHA.DAX', weight: 10 },
            { name: 'CPIC.DAX', weight: 5 },
            { name: 'TITLE.DAX', weight: 5 },
          ],
        },
      },
    ],
  },
  {
    id: 'gateway-to-the-savage-frontier',
    title: 'Gateway to the Savage Frontier',
    series: 'Forgotten Realms',
    ruleset: 'addnd2e',
    engineGen: 'gen1-dax',
    variants: [
      {
        platform: 'DOS',
        graphicSet: 'dos-ega',
        container: 'DAX',
        signature: {
          // GAME.CFG disambiguates Gateway from Pools of Darkness, which also ships
          // ZOUNDS.DAX in the current Steam/GOG-style release.
          required: ['GAME.CFG', 'ZOUNDS.DAX'],
          exclude: ['KRYNN.CFG', 'DKK.CFG', 'POOL.CFG', 'CURSE.CFG', 'BLADES.CFG', 'TREASURE.CFG', 'POOL4.CFG'],
          markers: [
            { name: 'GAME.EXE', weight: 20 },
            { name: 'GAME.OVR', weight: 10 },
            { name: 'MUSIC.DAX', weight: 5 }, // shared with DoK — weak discriminator alone
            { name: '8X8D1.DAX', weight: 10 },
            { name: 'COMSPR.DAX', weight: 10 },
            { name: 'GO.BAT', weight: 5 },
            { name: 'DUNGCOM.DAX', weight: 5 },
            { name: 'RANDCOM.DAX', weight: 5 },
            { name: 'SKY.DAX', weight: 5 },
            { name: 'TITLE.DAX', weight: 5 },
          ],
        },
      },
    ],
  },
  {
    id: 'pools-of-darkness',
    title: 'Pools of Darkness',
    series: 'Forgotten Realms',
    ruleset: 'addnd1e',
    engineGen: 'gen1-dax',
    variants: [
      {
        platform: 'DOS',
        graphicSet: 'dos-vga',
        container: 'DAX',
        signature: {
          // POOL4.CFG is the game-specific marker. ZOUNDS.DAX is deliberately not
          // excluded: the current release ships it for both Pools and the Savage
          // Frontier games.
          required: ['POOL4.CFG'],
          exclude: ['KRYNN.CFG', 'DKK.CFG', 'POOL.CFG', 'CURSE.CFG', 'BLADES.CFG', 'TREASURE.CFG', 'GAME.CFG'],
          markers: [
            { name: 'GAME.EXE', weight: 20 },
            { name: 'GAME.OVR', weight: 10 },
            { name: 'STARTUP.EXE', weight: 10 },
            { name: 'CONTROL.EXE', weight: 10 },
            { name: 'VACE.EXE', weight: 10 },
            { name: 'ZOUNDS.DAX', weight: 5 },
            { name: 'ECL1.DAX', weight: 10 },
            { name: 'GEO1.DAX', weight: 10 },
          ],
        },
      },
    ],
  },
  {
    id: 'buck-rogers-countdown-to-doomsday',
    title: 'Buck Rogers: Countdown to Doomsday',
    series: 'Buck Rogers',
    ruleset: 'buckrogers',
    engineGen: 'gen1-dax',
    variants: [
      {
        platform: 'DOS',
        // VGA, corrected from 'dos-ega' on 2026-08-26 against the install's own bytes. BUCK.CFG's
        // first CRLF field is `V`; Champions' KRYNN.CFG and Death Knights' DKK.CFG hold `E` in the
        // identical field position with the identical field order (mode, sound, input, save path),
        // and Gateway's GAME.CFG holds `V`. Independently, Buck's picture blocks carry their own
        // 224-entry 6-bit DAC palettes and its BIGPIC/CPIC/TITLE families decode as chunky 8bpp —
        // neither is expressible in EGA. The install ships one art set, not an EGA/VGA pair.
        graphicSet: 'dos-vga',
        container: 'DAX',
        signature: {
          // Keyed on the INSTALLED folder, which this project now holds at
          // `D:/Games/Emulator/DOS/Goldbox/BuckRogers1-CountdownToDoomsday`. Until 2026-08-26 this
          // profile required BUCK1/2/3.EXE — the floppy distribution's 3-part split executable —
          // with a comment stating the installed data-file names were unverified. They are now
          // verified, and the installed folder contains none of those three, so the only Buck
          // install we hold could not be detected at all.
          //
          // BUCK.CFG plays the POOL4.CFG/TREASURE.CFG role. SHIPS.DAX is the space-combat table
          // and has no counterpart in any AD&D title. Negative control: of the 38 game folders in
          // the GOG Galaxy library, including all nine other Gold Box titles, ZERO contain
          // BUCK.CFG, SHIPS.DAX, HITEK.DAX, LOTEK.DAX, MARSCOM.DAX or VENUSCOM.DAX.
          //
          // What this deliberately gives up: a folder of raw floppy media alone no longer matches,
          // because it has neither file until INSTALL.COM has run. That is the right trade — the
          // media are self-extracting blobs, so a match on them would list a game with no readable
          // asset behind it. The media names stay as markers so a folder holding both still scores.
          required: ['BUCK.CFG', 'SHIPS.DAX'],
          exclude: ['KRYNN.CFG', 'DKK.CFG', 'POOL.CFG', 'CURSE.CFG', 'BLADES.CFG', 'POOL4.CFG', 'TREASURE.CFG', 'GAME.CFG'],
          markers: [
            { name: 'START.EXE', weight: 20 },
            { name: 'GAME.OVR', weight: 10 },
            { name: 'HITEK.DAX', weight: 10 },
            { name: 'LOTEK.DAX', weight: 10 },
            { name: 'MARSCOM.DAX', weight: 10 },
            { name: 'VENUSCOM.DAX', weight: 10 },
            { name: 'MON0CHA.DAX', weight: 10 },
            { name: 'ECL1.DAX', weight: 5 },
            { name: 'GEO1.DAX', weight: 5 },
            { name: '8X8D1.DAX', weight: 5 },
            // The floppy distribution still scores, as markers rather than as a hard gate: its
            // media carry the split executable and the installer, but no BUCK.CFG until install.
            { name: 'BUCK1.EXE', weight: 10 },
            { name: 'BUCK2.EXE', weight: 10 },
            { name: 'BUCK3.EXE', weight: 10 },
            { name: 'INSTALL.COM', weight: 5 },
          ],
        },
      },
      {
        // R1 (2026-09-02): the WHDLoad-unpacked Amiga dump at
        // `D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/
        // BuckRogersCountdownDday/data`. Measured directly: this is a DAA + DAX title like CoK/DoK
        // (NOT the GLIB big-endian HLIB sibling DQK-and-later Amiga titles use) — 34 `.daa` files,
        // 32 of which decode as graphics with the unchanged `tools/daa_decode.py` /
        // `tools/subframe_decode.py --amiga` decoders (`globals.daa`/`pointers.daa` are not
        // graphics), plus 6 ILBM `.lbm` titles. See docs/amiga-inventory.md's Buck Rogers section
        // for the full per-file table.
        platform: 'Amiga',
        graphicSet: 'amiga',
        container: 'DAA',
        signature: {
          // SHIPS.DAA is the space-combat art table and has no counterpart in CoK/DoK's Amiga
          // dumps (mirrors SHIPS.DAX on the DOS side, which is Buck-only there too). BIGPIC1.DAA
          // is shared with CoK/DoK-Amiga, so it alone cannot discriminate; SHIPS.DAA can.
          required: ['SHIPS.DAA', 'BIGPIC1.DAA'],
          // scrn1b.lbm/gothic.lbm (CoK-Amiga) and Title1.LBM (DoK-Amiga) are absent from Buck's
          // dump, but excluded here defensively for the same reason those variants now exclude
          // Buck-only names: a shared required basename (BIGPIC1.DAA) must not let either side
          // silently start matching the other if a future disk layout mixes files.
          exclude: ['scrn1b.lbm', 'gothic.lbm', 'Title1.LBM'],
          markers: [
            { name: 'hitek0.daa', weight: 15 },
            { name: 'lotek0.daa', weight: 15 },
            { name: 'marscom0.daa', weight: 15 },
            { name: 'venuscom0.daa', weight: 15 },
            { name: 'ttl1.lbm', weight: 10 },
            { name: 'buckfont.lbm', weight: 10 },
            { name: 'chars.lbm', weight: 5 },
            { name: 'spacetvl.daa', weight: 5 },
          ],
        },
      },
    ],
  },
  {
    id: 'buck-rogers-matrix-cubed',
    title: 'Buck Rogers: Matrix Cubed',
    series: 'Buck Rogers',
    ruleset: 'buckrogers',
    engineGen: 'gen1-dax',
    variants: [
      {
        platform: 'DOS',
        // VGA, corrected from 'dos-ega' on R6 (2026-09-03) against the extracted install's own
        // bytes (matrixcubed_extracted/, see docs/engine/research/matrix-cubed-profile.md). Two
        // independent measurements agree: (1) MATRIX.CFG's first CRLF field is `V`, the same
        // field position that reads `E` for Champions'/Death Knights' EGA installs and `V` for
        // Buck Rogers: Countdown to Doomsday's and Gateway's own VGA installs (see that
        // correction's comment below); (2) every one of the 411 picture blocks across all 19
        // graphics-bearing `.DAX` files (TITLE/BIGPIC1/PIC1/PIC7/PIC8/SPRIT1/BACK1/BORDERS/
        // CHARS/COMSPR/CPIC1/CURSOR/HITEK/LOTEK/MARSCOM/VENUSCOM/8X8D0/8X8D1/SHIPS) decodes as
        // `vga-chunky-items` or `vga-compressed-picture` (`tools/dax_decode.py`'s own kind
        // classification) — the SAME embedded-6-bit-DAC-palette, chunky-8bpp formats Countdown's
        // own VGA install uses — and ZERO decode as a plain EGA 4bpp `frame`. Matrix Cubed ships
        // one art set, not an EGA/VGA pair, exactly like Countdown's own comment states.
        graphicSet: 'dos-vga',
        container: 'DAX',
        signature: {
          // DOSBoxWiki lists START.EXE as the executable, and contemporary DOSBox/VOGONS
          // troubleshooting identifies MATRIX.CFG as the game's configuration marker. Keep the
          // unique config as the required discriminator because START.EXE is shared by many SSI
          // installs.
          required: ['START.EXE', 'MATRIX.CFG'],
          exclude: ['KRYNN.CFG', 'DKK.CFG', 'POOL.CFG', 'CURSE.CFG', 'BLADES.CFG'],
          markers: [
            { name: 'BUCKA.XMI', weight: 10 },
            { name: 'BUCKB.XMI', weight: 10 },
            { name: 'BUCKC.XMI', weight: 10 },
            { name: 'TANDY.ADV', weight: 5 },
          ],
        },
      },
    ],
  },
  {
    id: 'forgotten-realms-unlimited-adventures',
    title: 'Forgotten Realms Unlimited Adventures',
    series: 'Forgotten Realms',
    ruleset: 'addnd1e',
    engineGen: 'gen2-hlib',
    variants: [
      {
        platform: 'DOS',
        graphicSet: 'dos-vga',
        container: 'HLIB',
        signature: {
          // Mirrors the native GBBOOT fallback for FRUA-style installs: the base
          // engine executable is CKIT.EXE and the runtime script container is SCRIPT.GLB.
          required: ['CKIT.EXE', 'SCRIPT.GLB'],
          exclude: ['DQK.EXE', 'TITLE.TLB', 'KRYNN.CFG', 'DKK.CFG'],
          markers: [
            { name: 'GEO.GLB', weight: 20 },
            { name: 'STRG.GLB', weight: 10 },
            { name: 'SOUNDS.GLB', weight: 5 },
          ],
          magic: [{ file: 'SCRIPT.GLB', offset: 0, ascii: 'HLIB' }],
        },
      },
    ],
  },
];
