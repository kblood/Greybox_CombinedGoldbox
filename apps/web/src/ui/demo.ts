/**
 * Champions of Krynn attract-demo compatibility wrapper.
 *
 * CoK used to have a separate copy of the Gen1 demo player because it was the first located
 * attract script. The generalized player now handles the complete native presentation sequence:
 * decoded narration/pictures, scripted GEO/WALLDEF walking, temporary NPCs, auto-combat, and the
 * post-combat continuation. Keeping this small wrapper preserves the public `startDemo`/`__demo`
 * route contract while ensuring CoK uses the same proven machinery as DoK, Secret, and Gateway.
 */
import { closeDungeon3d } from './dungeon3dHost.js';
import { COK_DEMO_AMIGA_SOURCE, COK_DEMO_DOS_SOURCE, COK_DEMO_PICTURE_ID, loadCokDemoRestyle } from './cokDemoArt.js';
import { ECL_GEN1 } from '@goldbox/engine';
import {
  gen1DemoStats,
  isGen1DemoPlaying,
  startGen1Demo,
  stopGen1Demo,
  type Gen1DemoHooks,
  type Gen1DemoProfile,
} from './demoGen1.js';

const COK_DEMO_PROFILE: Gen1DemoProfile = {
  displayName: 'Champions of Krynn',
  audioGame: 'cok',
  eclPath: 'Champions of Krynn/ECL2.DAX',
  demoBlockId: 57,
  dialect: ECL_GEN1,
  uiPath: 'Champions of Krynn/8X8D1.DAX',
  demoMoonTiles: [32, 28, 36],
  walkBackdrop: {
    path: 'Champions of Krynn/SKY.DAX',
    kind: 'cok-sky',
    dayBlockId: 252,
  },
  picturePaths: [
    'Champions of Krynn/PIC2.DAX',
    'Champions of Krynn/BIGPIC2.DAX',
  ],
  runtimeArt: {
    gameId: 'cok',
    pictureId: COK_DEMO_PICTURE_ID,
    dosArchivePath: COK_DEMO_DOS_SOURCE.archive,
    amigaArchivePath: COK_DEMO_AMIGA_SOURCE.archive,
    loadRestyle: loadCokDemoRestyle,
  },
  compositePictures: [{
    pictureId: 68,
    width: 88,
    height: 88,
    parts: [
      { path: 'Champions of Krynn/HEAD2.DAX', blockId: 69, x: 0, y: 0 },
      { path: 'Champions of Krynn/BODY2.DAX', blockId: 68, x: 0, y: 40 },
    ],
  }],
  monsterPaths: [
    'Champions of Krynn/MON2CHA.DAX',
  ],
  monsterProfileId: 'champions-of-krynn',
  dungeonPaths: {
    geoPaths: ['Champions of Krynn/GEO2.DAX'],
    walldefPaths: ['Champions of Krynn/WALLDEF2.DAX'],
    // The demo's wall sets are area-2 data, but their low-id tile references
    // resolve through the resident boot bank (8X8D1 blocks 202/203).  Loading
    // only 8X8D2 silently dropped those tiles and left gaps in the right walls.
    // Put the boot archive first so area-2 blocks retain priority on any id overlap.
    tilesPaths: ['Champions of Krynn/8X8D1.DAX', 'Champions of Krynn/8X8D2.DAX'],
  },
  combatPaths: {
    tilesPath: 'Champions of Krynn/8X8D1.DAX',
    iconPath: 'Champions of Krynn/CPIC2.DAX',
    dungcomPath: 'Champions of Krynn/DUNGCOM.DAX',
    moonTileIds: [32, 28, 36],
  },
  combatScene: {
    // DUNGCOM indices recovered cell-for-cell from native combat frame t0120 (22 = gray floor).
    tileIndices: [
      22,22,22,22,22,22,22,
      22,22,22,22,22,22,22,
      15,9,13,22,22,22,22,
      16,14,3,13,22,22,22,
      22,22,4,3,13,22,22,
      22,22,22,4,3,13,22,
      13,22,22,22,4,3,13,
    ],
    partyAnchor: { col: 1, row: 3 },
    enemyAnchor: { col: 11, row: 3 },
  },
};

export type DemoHooks = Gen1DemoHooks;

export function isDemoPlaying(): boolean {
  return isGen1DemoPlaying();
}

export function demoStats(): ReturnType<typeof gen1DemoStats> {
  return gen1DemoStats();
}

export function stopDemo(): void {
  stopGen1Demo();
}

export function startDemo(hooks: DemoHooks = {}): Promise<number> {
  closeDungeon3d();
  return startGen1Demo(COK_DEMO_PROFILE, hooks);
}
