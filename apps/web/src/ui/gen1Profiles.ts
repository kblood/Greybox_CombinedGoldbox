/**
 * Per-title config for the generalized Gen1 intro/title-menu/demo pipeline (`intro.ts` +
 * `titleMenu.ts` + `demoGen1.ts`). One entry per non-CoK Gen1 title as it's shipped — see
 * `tools/map_gen1_demo_entry.py` for how each `demoBlockId` is located.
 */
import {
  DOK_FRAME_LAYOUT,
  COAB_FRAME_LAYOUT,
  SECRET_FRAME_LAYOUT,
  GATEWAY_FRAME_LAYOUT,
  ECL_GEN1,
  ECL_GEN1_SHORT,
  ECL_GEN1_SHORT_GATEWAY,
  ECL_GEN1_SHORT_POOLS,
  ECL_GEN1_SHORT_TREASURES,
  makeEgaPalette,
} from '@goldbox/engine';
import type { Gen1DemoProfile } from './demoGen1.js';
import type { ExploreFrameLayout } from '@goldbox/engine';

/** Death Knights of Krynn — `TITLE.DAX` boots the same 4-block shape as CoK's own. */
export const DOK_TITLE_PATH = 'Death Knights of Krynn/TITLE.DAX';

/**
 * DoK's own literal `inDemo` `EclBlockId` (`ECL1.DAX` block 2, located via
 * `tools/map_gen1_demo_entry.py --profile death-knights-of-krynn`). Unlike CoK's single linear
 * cutscene, this script is a real branching conversation — it pauses at several in-script `PARLAY`
 * "choose an attitude" prompts as the three named NPCs (Sir Dryden, Tanar, Flavius — decoded from
 * DoK's own `MON1CHA.DAX`) react. Corrected 2026-07-23: the per-profile decode continues through
 * two native first-person walking montages, a real monster roster, and COMBAT at vaddr 0x8363.
 * The older "SETUP_MONSTER then EXIT" claim was a long-dialect mapper desync, not retail behavior.
 * `demoGen1.ts` auto-answers pauses and now renders those host-driven walk effects from the real
 * GEO/WALLDEF/8X8D banks before handing the decoded roster to automatic combat.
 *
 * Its PIC4/PIC5 portrait animations and BIGPIC1 scene all use the solved DAX picture decoders; the
 * host retains and advances their full frame sequences rather than flattening each block to frame 0.
 */
export const DOK_DEMO_PROFILE: Gen1DemoProfile = {
  displayName: 'Death Knights of Krynn',
  audioGame: 'dok',
  eclPath: 'Death Knights of Krynn/ECL1.DAX',
  demoBlockId: 2,
  dialect: ECL_GEN1_SHORT,
  uiPath: 'Death Knights of Krynn/8X8D1.DAX',
  walkBackdrop: {
    path: 'Death Knights of Krynn/SKYGRND.DAX',
    kind: 'dok-skygrnd',
    dayBlockId: 2,
    nightBlockId: 1,
  },
  frameLayout: DOK_FRAME_LAYOUT,
  // Native t=60 framebuffer: full Solinari, Lunitari, and Nuitari discs at columns 8/19/30.
  demoMoonTiles: [23, 15, 19],
  picturePaths: [
    'Death Knights of Krynn/BIGPIC1.DAX',
    'Death Knights of Krynn/BIGPIC2.DAX',
    'Death Knights of Krynn/BIGPIC3.DAX',
    'Death Knights of Krynn/PIC4.DAX',
    'Death Knights of Krynn/PIC5.DAX',
  ],
  monsterPaths: [
    'Death Knights of Krynn/MON1CHA.DAX',
    'Death Knights of Krynn/MON1SPC.DAX',
  ],
  monsterProfileId: 'death-knights-of-krynn',
  dungeonPaths: {
    geoPaths: ['Death Knights of Krynn/GEO1.DAX'],
    // DoK numbers its wall/tile DAX files by bank, while ECL addresses globally-unique block ids.
    // Demo block 2 loads wall block 2 from bank 4 but still needs boot tiles 201/202 from bank 1.
    walldefPaths: [
      'Death Knights of Krynn/WALLDEF1.DAX',
      'Death Knights of Krynn/WALLDEF2.DAX',
      'Death Knights of Krynn/WALLDEF3.DAX',
      'Death Knights of Krynn/WALLDEF4.DAX',
      'Death Knights of Krynn/WALLDEF5.DAX',
    ],
    tilesPaths: [
      'Death Knights of Krynn/8X8D1.DAX',
      'Death Knights of Krynn/8X8D2.DAX',
      'Death Knights of Krynn/8X8D3.DAX',
      'Death Knights of Krynn/8X8D4.DAX',
      'Death Knights of Krynn/8X8D5.DAX',
    ],
  },
  combatPaths: {
    tilesPath: 'Death Knights of Krynn/8X8D1.DAX',
    iconPath: 'Death Knights of Krynn/CPIC1.DAX',
    dungcomPath: 'Death Knights of Krynn/DUNGCOM.DAX',
    frameLayout: DOK_FRAME_LAYOUT,
    moonTileIds: [23, 15, 19],
  },
  combatScene: {
    // DUNGCOM indices recovered from native combat frame t136; occupied cells use floor 22.
    tileIndices: [
      22,22,15,9,13,22,22,
      22,22,16,14,7,22,22,
      22,22,22,22,8,22,22,
      22,22,22,22,22,22,22,
      22,22,22,22,22,22,22,
      22,15,17,22,22,22,22,
      22,16,23,22,22,22,22,
    ],
    partyAnchor: { col: 1, row: 3 },
    enemyAnchor: { col: 11, row: 3 },
  },
  // The compact DoK MON layout's HP field is still unlocated in the shared decoder. The three hero
  // values are visible in the native demo HUD; enemy values keep the scripted auto-battle viable
  // until that field is recovered, and are ignored automatically once decoding returns nonzero HP.
  demoHitPoints: {
    'SIR DRYDEN': 134,
    TANAR: 131,
    FLAVIUS: 101,
    'EVIL WARLORD': 30,
    'DREAD WOLF': 20,
    GHOUL: 16,
  },
};

// CoAB/Secret install as external GOG Galaxy paths (same absolute-path convention gameData.ts
// already uses for these two titles). NOTE: every path below is a full single-quoted literal, NOT
// built from a shared directory constant + template interpolation — scripts/bundle-assets.mjs
// finds bundled-asset paths by regex-scanning `src/ui/*.ts` for literal `'C:/...'`/`'<Game>/...'`
// strings (see its GAME_DIR_RE), so an interpolated path would be invisible to it and 404 in the
// deployed build (the exact bug class `goldbox-web-viewer-deploy` memory already hit once).

export const COAB_TITLE_PATH = 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/TITLE.DAX';
export const SECRET_TITLE_PATH = 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/TITLE.DAX';

/**
 * Curse of the Azure Bonds — `ECL1.DAX` block 82 (`0x52`), located via
 * `tools/map_gen1_demo_entry.py --profile curse-of-the-azure-bonds` (ratio `1.0` — CoAB is
 * itself the CoAB oracle installation this project's whole demo-entry method is built on, so this
 * run is a pure self-consistency check). Structurally a linear script exactly like CoK's own demo:
 * three named temporary NPCs (**Rustle**, **Cynthia**, **Grendel**, `MON1CHA.DAX`), a scripted
 * `COMBAT` (2× monster id 53), then closing narration and `EXIT` — no branching menus, unlike
 * DoK's. Picture ids `29`/`80` use the engine's solved animated PIC decoder; ids
 * `1`/`121`/`123` (`PIC1.DAX`/`BIGPIC1.DAX`) are ordinary standard frames.
 */
export const COAB_DEMO_PROFILE: Gen1DemoProfile = {
  displayName: 'Curse of the Azure Bonds',
  audioGame: 'coab',
  eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/ECL1.DAX',
  demoBlockId: 82,
  dialect: ECL_GEN1,
  uiPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/8X8D1.DAX',
  frameLayout: COAB_FRAME_LAYOUT,
  picturePaths: [
    'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/BIGPIC1.DAX',
    'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/BIGPIC2.DAX',
    'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/BIGPIC6.DAX',
    'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/PIC1.DAX',
  ],
  monsterPaths: [
    'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/MON1CHA.DAX',
    'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/MON1SPC.DAX',
  ],
  monsterProfileId: 'curse-of-the-azure-bonds',
  combatPaths: {
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/8X8D1.DAX',
    iconPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/CPIC1.DAX',
    dungcomPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/DUNGCOM.DAX',
    frameLayout: COAB_FRAME_LAYOUT,
  },
  combatScene: {
    // CoAB paints sparse DUNGCOM vegetation over a flat gray field; precise overlay cells remain
    // under recovery, while the native named formation and CPICs are exact.
    tileIndices: new Array(49).fill(22),
    partyAnchor: { col: 2, row: 2 },
    enemyAnchor: { col: 5, row: 4 },
    partyPositions: [{ col: 2, row: 2 }, { col: 4, row: 3 }, { col: 4, row: 4 }],
    // One dragon enters the native 7×7 camera at (3,4); its partner begins beyond the right edge
    // and moves into view later (hence only one 48×48 dragon is visible in frame t0120).
    enemyPositions: [{ col: 3, row: 4 }, { col: 8, row: 5 }],
    partyPictureIds: [85, 88, 90],
    flipPartyPictures: true,
  },
};

/**
 * Secret of the Silver Blades — `ECL1.DAX` block 3, located via
 * `tools/map_gen1_demo_entry.py --profile secret-of-the-silver-blades` (ratio `0.8182`).
 * Also a linear script like CoK's: three named temporary NPCs (**Sieglinda**, **Capet**,
 * **Averoes**, `MON1CHA.DAX`), a first-person walking montage driven by X/Y updates plus redraw
 * calls, a scripted `COMBAT` (2× monster id 6), then five closing narration beats with real
 * pictures and `EXIT`. Both `BIGPIC1.DAX` picture ids (`112`/`113`) are standard frames;
 * `60`/`87`/`89` (`PIC1.DAX`/`PIC4.DAX`) use the animated PIC decoder.
 */
export const SECRET_DEMO_PROFILE: Gen1DemoProfile = {
  displayName: 'Secret of the Silver Blades',
  audioGame: 'secret',
  eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/ECL1.DAX',
  demoBlockId: 3,
  dialect: ECL_GEN1,
  uiPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/8X8D1.DAX',
  frameLayout: SECRET_FRAME_LAYOUT,
  walkBackdrop: {
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/SKY.DAX',
    kind: 'cok-sky',
    dayBlockId: 252,
  },
  picturePaths: [
    'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/BIGPIC1.DAX',
    'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/PIC1.DAX',
    'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/PIC4.DAX',
  ],
  monsterPaths: [
    'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/MON1CHA.DAX',
    'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/MON1SPC.DAX',
  ],
  monsterProfileId: 'secret-of-the-silver-blades',
  dungeonPaths: {
    geoPaths: ['C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/GEO1.DAX'],
    walldefPaths: ['C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/WALLDEF1.DAX'],
    tilesPaths: ['C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/8X8D1.DAX'],
  },
  combatPaths: {
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/8X8D1.DAX',
    iconPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/CPIC1.DAX',
    dungcomPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/DUNGCOM.DAX',
    frameLayout: SECRET_FRAME_LAYOUT,
  },
  combatScene: {
    // Native t0048; cells hidden by figures are floor tile 22, consistent with every neighbour.
    tileIndices: [
      22,22,22,22,22,22,22,
      22,22,22,22,18,17,22,
      22,22,22,22,20,23,22,
      13,22,22,22,8,22,22,
      3,13,22,22,22,22,22,
      4,3,13,22,22,22,22,
      22,4,3,13,22,22,22,
    ],
    partyAnchor: { col: 2, row: 3 },
    enemyAnchor: { col: 3, row: 4 },
    partyPositions: [{ col: 2, row: 3 }, { col: 3, row: 3 }, { col: 2, row: 2 }],
    enemyPositions: [{ col: 3, row: 4 }, { col: 5, row: 5 }],
    partyPictureIds: [205, 76, 66],
    flipEnemyPictures: true,
  },
};

/**
 * Gateway to the Savage Frontier — `TITLE.DAX` boots through the Gateway/Treasures-family
 * VGA-extended picture codec (5-bit/32-colour, 33-byte prefix plus five per-row bitplanes), NOT
 * plain EGA-16 like every other title shipped so far — see `daxVgaPicture.ts` and
 * `docs/engine/research/gateway-vga-picture-format.md` (including that doc's 2026-07-21
 * plane-order correction). `decodeDax` now classifies these frames `'vga-ext-frame'` and carries
 * their own richer palette on the decoded image; `intro.ts`'s `show()` already prefers a frame's
 * own palette when present, so no per-title intro code is needed to render this correctly.
 */
export const GATEWAY_TITLE_PATH = 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/TITLE.DAX';

// Native t0086 proves the UI bank retains ordinary EGA indices 0..15 and programs only extension
// registers 16/17 for its gold/orange frame ramp (the same two DAC writes found in GAME.OVR).
const GATEWAY_DEMO_PALETTE = (() => {
  const palette = makeEgaPalette();
  const set = (index: number, r: number, g: number, b: number) => { palette.colors[index] = { r, g, b }; };
  set(16, 243, 195, 65);
  set(17, 243, 146, 65);
  set(19, 0, 113, 113);
  set(21, 113, 0, 113);
  set(24, 130, 130, 130);
  set(25, 130, 130, 243);
  set(26, 48, 211, 48);
  set(27, 97, 97, 97);
  set(29, 48, 48, 48);
  set(31, 227, 227, 227);
  palette.source = 'gateway-native-demo';
  return palette;
})();

/**
 * Gateway changes the low DAC bank again for tactical mode. The t=150 RAM checkpoint contains the
 * native expanded 48x48 Giant Squid buffer byte-for-byte; pairing its indices with frame t0128
 * proves index 8 is the blue field and pins the extra red/green ramp below without visual guessing.
 */
const GATEWAY_COMBAT_PALETTE = (() => {
  const palette = { ...GATEWAY_DEMO_PALETTE, colors: [...GATEWAY_DEMO_PALETTE.colors] };
  const set = (index: number, r: number, g: number, b: number) => { palette.colors[index] = { r, g, b }; };
  set(8, 0, 0, 166);
  set(18, 0, 130, 0);
  set(20, 130, 0, 0);
  set(28, 243, 0, 0);
  set(255, 0, 0, 0);
  palette.source = 'gateway-native-combat';
  return palette;
})();

/**
 * Gateway's own literal `inDemo` `EclBlockId` (`ECL2.DAX` block 82), located via
 * `tools/map_gen1_demo_entry.py --profile gateway-to-the-savage-frontier` using the same
 * structural function-shape match as every other title. Structurally linear like CoK's own demo:
 * four named temporary NPCs join (**Whitman**, **Prolous the 3rd**, **Hal**, **Krevish**, ids
 * 74/75/76/60 — decoded from `MON2CHA.DAX`/`MON2SPC.DAX`), narration sets up a caravan/Yartar
 * story opening, a native first-person walking montage (redraw/move-forward call pairs), then a
 * scripted `COMBAT` (2× **Giant Squid**, id 68) and closing `EXIT`. The
 * script's picture ids (`5`/`6`/`7`/`101`) all resolve into `PIC2.DAX` through Gateway's proven
 * prefixed planar5 decoder, including its XOR-delta animation form. The browser renders those real
 * pictures plus the native walking montage from Gateway's GEO/WALLDEF/8X8D banks; see
 * `gen1-demo-sequence-patterns.md`.
 */
export const GATEWAY_DEMO_PROFILE: Gen1DemoProfile = {
  displayName: 'Gateway to the Savage Frontier',
  audioGame: 'gateway',
  eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/ECL2.DAX',
  demoBlockId: 82,
  // Gateway's own split off the short family (2026-07-23): long 3-operand 0x0C SETUP_MONSTER —
  // see ECL_GEN1_SHORT_GATEWAY's doc comment in disassemble.ts.
  dialect: ECL_GEN1_SHORT_GATEWAY,
  picturePaths: [
    'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/PIC2.DAX',
  ],
  uiPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/8X8D1.DAX',
  frameLayout: GATEWAY_FRAME_LAYOUT,
  screenPalette: GATEWAY_DEMO_PALETTE,
  walkBackdrop: {
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/SKY.DAX',
    kind: 'cok-sky',
    dayBlockId: 252,
  },
  monsterPaths: [
    'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/MON2CHA.DAX',
    'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/MON2SPC.DAX',
  ],
  monsterProfileId: 'gateway-to-the-savage-frontier',
  dungeonPaths: {
    geoPaths: ['C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/GEO2.DAX'],
    // Gateway's ECL2 demo mixes the numbered area bank with globally-addressed base wall block 15;
    // 8X8D1 contributes the shared boot tiles (201/202), as in retail's resident preload.
    walldefPaths: [
      'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/WALLDEF.DAX',
      'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/WALLDEF2.DAX',
    ],
    tilesPaths: [
      'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/8X8D.DAX',
      'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/8X8D1.DAX',
      'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/8X8D2.DAX',
    ],
  },
  combatPaths: {
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/8X8D1.DAX',
    iconPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/CPIC2.DAX',
    dungcomPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/DUNGCOM.DAX',
    frameLayout: GATEWAY_FRAME_LAYOUT,
    palette: GATEWAY_COMBAT_PALETTE,
    // DUNGCOM #22 is all source index 0; the native expanded combat buffer writes it as active
    // tactical index 8, whose DAC register is the solid blue seen in every captured battle frame.
    backdropIndexRemap: { 0: 8 },
    iconTransparentIndices: [0],
    iconIndexRemap: { 8: 255 },
  },
  combatScene: {
    // Native t0138/t0140: the tactical field is uniformly DUNGCOM #22. The named figures use
    // CPIC ids 74/75/76/60 in ADD_NPC order; Krevish and the squid face west in this snapshot.
    tileIndices: new Array<number>(49).fill(22),
    partyAnchor: { col: 4, row: 3 },
    enemyAnchor: { col: 5, row: 3 },
    partyPositions: [
      { col: 4, row: 5 },
      { col: 4, row: 2 },
      { col: 4, row: 3 },
      { col: 5, row: 2 },
    ],
    enemyPositions: [
      { col: 5, row: 3 },
      { col: 8, row: 4 },
    ],
    partyPictureIds: [74, 75, 76, 60],
    partyPictureFlips: [false, false, false, true],
    flipEnemyPictures: true,
  },
};

/**
 * Pool of Radiance — **title-only, no Play/Demo prompt.** Confirmed by string-scanning both
 * `GAME.OVR` and `START.EXE` for every readable ASCII run: neither contains `"Play"` or
 * `"Demo"` anywhere, unlike CoK/DoK/CoAB/Secret/Gateway's `START.EXE`, which all carry the
 * literal two-hotkey prompt string. `START.EXE` carries exactly one relevant boot string,
 * `"Press any key to continue"` — matching `intro.ts`'s own existing advance hint — with
 * nothing resembling a menu in between. Pool is also the odd one out structurally: it's a
 * `gen1-fbov` corpus title (`goldbox_corpus.py`), and `tools/map_gen1_demo_entry.py` fails to
 * resolve a demo entry at all (`resolved=False`), consistent with there being no such script to
 * find, not a locator failure. Its `TITLE.DAX` also has a different shape from CoK's own
 * (2 plain 320×200 EGA frames, no top-band overlay blocks — verified via `decodeDax`), which
 * `intro.ts`'s existing full-frame handling already renders correctly (each full frame with
 * no following band shows standalone). The live wiring (`main.ts`) reflects this honestly: the
 * title sequence's `onDone` goes straight to `startExplore('pool')`, skipping `titleMenu.ts`
 * entirely rather than showing a Play/Demo prompt the original never had.
 */
export const POOL_TITLE_PATH = 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/TITLE.DAX';

/**
 * Treasures of the Savage Frontier. `TITLE.DAX` boots through a third
 * single-frame DAX picture codec, distinct from both plain EGA and Gateway's own VGA-extended
 * format: a full embedded 256-colour palette + plain row-major 8bpp chunky pixels (`daxVga256Title.ts`,
 * found and render-verified in `docs/engine/research/treasures-pools-darkness-scoping.md` §2 — the
 * BEYOND SOFTWARE logo, a "FORGOTTEN REALMS ... Vol. IV" banner, and the TREASURES OF THE SAVAGE
 * FRONTIER logo screen all decode clean). `decodeDax` classifies these frames `'vga256-title'` and
 * carries the full palette on the image itself, so — like Gateway's own title — no per-title intro
 * code is needed to render this correctly.
 *
 * Treasures' own `GAME.EXE` carries the literal `"Play Demo"` prompt. A 2026-07-24 native capture
 * settled the formerly ambiguous script mapping: `ECL1.DAX#4` is the retail attract script, and
 * its bytes only decode correctly once opcode 0x42's title-specific trailing framing byte is
 * retained. The earlier "false positive" conclusion is superseded by RAM, framebuffer, file-open,
 * and bytecode evidence; `TREASURES_DEMO_PROFILE` below is the recovered route.
 */
export const TREASURES_TITLE_PATH = 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/TITLE.DAX';

/**
 * Treasures combat uses BORD#0's 64 direct-8bpp tiles, not exploration `8X8D0#202`.
 * The top and sides below are exact palette-invariant matches against native frame t0084. Tile 39
 * is the transparent/black continuation across the message-side bottom row; combat's vertical
 * divider uses the same repeated brown side member (#7) visible in the retail framebuffer.
 */
const TREASURES_COMBAT_FRAME_LAYOUT: ExploreFrameLayout = {
  outerBase: 0, innerBase: 0, straightH: 6, straightV: 7,
  outerTop: [0,0,2,10,11,12,25,27,28,6,6,6,22,6,6,18,19,15,14,15,3,0,0,0,2,8,9,17,39,39,62,60,61,39,53,54,6,3,0,0],
  outerBottom: new Array<number>(40).fill(39),
  outerLeft: [0,0,4,51,7,7,7,7,44,45,46,42,7,7,43,45,7,7,7,7,5,0,0,39],
  outerRight: [0,0,4,47,48,49,39,52,39,50,51,59,58,45,7,7,7,7,7,58,5,0,0,39],
  hsep: new Array<number>(40).fill(39),
  vsep: new Array<number>(17).fill(7),
  innerTop: new Array<number>(15).fill(39),
  innerBottom: new Array<number>(15).fill(39),
  innerLeft: new Array<number>(15).fill(7),
  innerRight: new Array<number>(15).fill(7),
};

/**
 * Native capture 2026-07-24 proves block 4 is the retail Treasures attract script after all: the
 * earlier VM rejection used the generic short dialect, but this title's LOAD_FILES frame is the
 * already-proven Treasures-specific two-operand form. Retail shows portrait narration followed by
 * automatic combat; it has no first-person walking montage.
 */
export const TREASURES_DEMO_PROFILE: Gen1DemoProfile = {
  displayName: 'Treasures of the Savage Frontier',
  audioGame: 'treasures',
  eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/ECL1.DAX',
  demoBlockId: 4,
  dialect: ECL_GEN1_SHORT_TREASURES,
  picturePaths: [
    'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/PIC1.DAX',
  ],
  uiPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/8X8D0.DAX',
  monsterPaths: [
    'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/MON1CHA.DAX',
    'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/MON1SPC.DAX',
  ],
  monsterProfileId: 'treasures-of-the-savage-frontier',
  portraitOrigin: { x: 24, y: 24 },
  screenArt: {
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/BORD.DAX',
    backdropBlockId: 1,
    decorations: [
      { blockId: 3, frameIndex: 0, x: 0, y: 0, transparentIndex: 13 },
      { blockId: 3, frameIndex: 1, x: 0, y: 112, transparentIndex: 13 },
      { blockId: 5, frameIndex: 0, x: 0, y: 24, transparentIndex: 13 },
      { blockId: 5, frameIndex: 1, x: 112, y: 24, transparentIndex: 13 },
    ],
  },
  combatPaths: {
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/8X8D0.DAX',
    frameTilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/BORD.DAX',
    frameTilesBlockId: 0,
    iconPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/CPIC1.DAX',
    dungcomPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/DUNGCOM.DAX',
    frameLayout: TREASURES_COMBAT_FRAME_LAYOUT,
  },
  combatScene: {
    // Native t0084: cells whose figures obscure the floor conservatively retain the neutral #178
    // tile; every orange path cell below is the lowest-error DUNGCOM match (RGB error <= 1/channel).
    tileIndices: [
      178,178,178,178,178,178,178,
      178,178,178,178,178,178,178,
      178,178,178,178,178,178,178,
      169,178,178,178,178,178,178,
      165,158,161,161,161,161,161,
      170,159,162,166,166,166,166,
      178,160,159,169,178,178,178,
    ],
    partyAnchor: { col: 1, row: 2 },
    enemyAnchor: { col: 9, row: 3 },
    partyPositions: [
      { col: 1, row: 2 }, { col: 2, row: 2 }, { col: 0, row: 2 },
      { col: 2, row: 3 }, { col: 0, row: 3 }, { col: 1, row: 3 },
    ],
    // Native t0084 shows only the lead foe at (3,3); the other six start beyond the initial
    // 7x7 camera and enter as combat advances. Keeping them east on the full 13x9 field prevents
    // the former artificial seven-sprite pile-up while preserving the complete scripted roster.
    enemyPositions: [
      { col: 3, row: 3 }, { col: 8, row: 1 }, { col: 9, row: 2 },
      { col: 8, row: 3 }, { col: 9, row: 4 }, { col: 8, row: 5 }, { col: 9, row: 6 },
    ],
    partyPictureIds: [91, 92, 94, 96, 93, 95],
    flipPartyPictures: true,
  },
  demoHitPoints: { LORAC: 44, AERON: 49, CYRUS: 28, MELCOR: 27, AIRLANA: 21, DANI: 20 },
  demoArmorClasses: { LORAC: -3, AERON: -4, CYRUS: -4, MELCOR: 2, AIRLANA: 8, DANI: 3 },
};

/**
 * Pools of Darkness — `TITLE.DAX` uses the exact same chunky-VGA256 codec as Treasures' own (see
 * `TREASURES_TITLE_PATH`'s doc comment) — both titles' `TITLE.DAX` share the identical 64910-byte
 * container shape (`docs/engine/research/treasures-pools-darkness-scoping.md` §2), and Pools' own
 * block 1 renders the same BEYOND SOFTWARE logo splash.
 */
export const POOLS_TITLE_PATH = 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/TITLE.DAX';

/** 233/237 exact native chrome cells; the four residual cells are the two-layer top-left flourish. */
const POOLS_FRAME_LAYOUT: ExploreFrameLayout = {
  outerBase: 0, innerBase: 0, straightH: 4, straightV: 5,
  outerTop:    [0,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,0,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,0],
  outerBottom: [0,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,0],
  outerLeft:   [0,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,0,5,5,5,5,5,5,0],
  outerRight:  [0,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,0,5,5,5,5,5,5,0],
  hsep:        [0,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,0,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,0],
  vsep:        [0,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,0],
  innerTop:    [0,0,0,4,4,4,4,4,4,4,4,4,4,4,0],
  innerBottom: [0,0,0,4,4,4,4,4,4,4,4,4,4,4,0],
  innerLeft:   [0,0,0,5,5,5,5,5,5,5,5,5,5,5,0],
  innerRight:  [0,0,0,5,5,5,5,5,5,5,5,5,5,5,0],
};

/**
 * Pools of Darkness's own literal `inDemo` `EclBlockId` (`ECL1.DAX` block 4), located via
 * `tools/map_gen1_demo_entry.py --profile pools-of-darkness` (ratio 0.70) and corroborated by a
 * real `EclVm` run (`docs/engine/research/treasures-pools-darkness-scoping.md` §4): real narration
 * ("BANE IS BENT ON VENGEANCE...", the game's own actual villain), three named NPCs joining from
 * Pools' own `MON1CHA.DAX` (**Sir Cynehelm**, **Alefraed**, **Kristka** — decoded under Treasures'
 * own record layout by an exact 510-byte size match, the identical `TREASURES_MONSTER_RECORD_SIZE`),
 * DoK-shaped branching `PARLAY` menus (not CoK's single linear cutscene), `SETUP_MONSTER`, and a
 * real `COMBAT` opcode. Corrected 2026-07-23: the old clean-EXIT claim came from decoding this
 * short-dialect block with CoK's long operand table. Its visual host sequence still needs a native
 * capture before it can be classified as walking or non-walking.
 *
 * Most of the script's own picture ids (`113`/`129`/`7`/`43`, `PIC1.DAX`) fall in the still-
 * genuinely-unsolved "complex" portrait codec (the same project-wide gap Gateway/DoK/Secret's own
 * demos already carry); `244` (`BIGPIC1.DAX`) and `131` (`CPIC1.DAX`) also don't resolve this
 * session (format not yet tested for these files specifically); `0` (`CBODY.DAX`) is plausibly a
 * "no picture"/clear-screen sentinel. None of this is worse than the existing precedent — the
 * player already leaves the prior real frame on screen rather than fabricate one.
 */
export const POOLS_DEMO_PROFILE: Gen1DemoProfile = {
  displayName: 'Pools of Darkness',
  audioGame: 'pools',
  eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/ECL1.DAX',
  demoBlockId: 4,
  dialect: ECL_GEN1_SHORT_POOLS,
  uiPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/8X8D0.DAX',
  frameTilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/BORDERS.DAX',
  frameTilesBlockId: 1,
  frameLayout: POOLS_FRAME_LAYOUT,
  picturePaths: [
    'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/PIC1.DAX',
    'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/BIGPIC1.DAX',
  ],
  monsterPaths: [
    'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/MON1CHA.DAX',
    'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/MON1SPC.DAX',
  ],
  monsterProfileId: 'pools-of-darkness',
  dungeonPaths: {
    geoPaths: ['C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/GEO1.DAX'],
    walldefPaths: ['C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/WALLDEF1.DAX'],
    tilesPaths: ['C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/8X8D1.DAX'],
  },
  // Native t114/t120 use the neutral-gray lair bank; 8X8D1/WALLDEF1 block 3 carries it.
  fallbackPieces: [3, 0xff, 0xff],
  poseAddresses: { x: 0x34, y: 0x35, facing: 0x11, hour: 0x08 },
  // The late short dialect preserves these tagged host operands as ids 0x8002..0x8004.
  callRoutineIds: {
    redrawDungeonView: 0x8002,
    movePositionForward: 0x8003,
    advanceAnimatedPicture: 0x8004,
  },
  walkBackdrop: {
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/SKYGRND.DAX',
    kind: 'dok-skygrnd',
    dayBlockId: 2,
    nightBlockId: 1,
  },
  combatPaths: {
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/8X8D0.DAX',
    frameTilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/BORDERS.DAX',
    frameTilesBlockId: 1,
    iconPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/CPIC1.DAX',
    dungcomPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/DUNGCOM.DAX',
    frameLayout: POOLS_FRAME_LAYOUT,
  },
  combatScene: {
    tileIndices: new Array<number>(49).fill(126),
    partyAnchor: { col: 3, row: 3 },
    enemyAnchor: { col: 5, row: 5 },
  },
  demoHitPoints: { 'SIR CYNEHELM': 162, ALEFRAED: 124, KRISTKA: 80 },
};

/**
 * Neverwinter Nights (DOS/AOL) — `TITLE.DAX` decodes 5/5 blocks as plain standard EGA frames
 * (`docs/engine/research/neverwinter-nights-dos-format-coverage.md`'s executive summary), the same
 * shape as CoK/DoK's own title art — no VGA-extended or VGA256 codec involved (NWN is confirmed
 * `dos-ega`, unlike Gateway/Treasures/Pools). Block 1 (320x200) renders the real "AMERICA ONLINE /
 * STRATEGIC SIMULATIONS / STORMFRONT STUDIOS" credit screen, visually verified in that audit.
 *
 * **Title-only, no Play/Demo prompt — verified, not assumed.** A direct string scan of both
 * `GAME.OVR` (23 hits) and `GAME.EXE` (11 hits) for `PLAY`/`DEMO`/`PRESS`/`QUIT` this session found
 * zero "Play"/"Demo" two-hotkey prompt pairing anywhere — only "Quit to SYSTEM", "Press any key to
 * continue", and combat/menu-internal strings, unlike Treasures/Pools' own `GAME.EXE`, which really
 * do carry the literal paired prompt (`treasures-pools-darkness-scoping.md` §5). This matches the
 * task's own framing: NWN's original AOL client was an online session with no local attract demo,
 * and this scan confirms it also shipped no local title Play/Demo *menu* at all — the DOS client
 * just shows its credit screens and continues straight into the game. Per this project's "leave a
 * gap honestly, don't invent" convention, `main.ts`'s wiring for this title skips `titleMenu.ts`
 * entirely (the same shape `POOL_TITLE_PATH` already established for the one other title with no
 * real prompt) rather than showing a fabricated Play/Demo choice — see `bootNwnAfterTitle`.
 */
export const NWN_TITLE_PATH = 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/TITLE.DAX';
