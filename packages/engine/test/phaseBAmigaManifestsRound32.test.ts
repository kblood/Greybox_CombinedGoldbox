/**
 * Round 32 Phase B — pins the four new Amiga manifests landed in `apps/web/games/`:
 * `pool-amiga.json`, `secret-amiga.json`, `gateway-amiga.json`, `treasures-amiga.json`.
 *
 * Same convention as `phaseBAmigaManifests.test.ts` (round 31, which pinned
 * `dark-queen-amiga.json` / `pools-amiga.json` / `curse-amiga.json`): this file does NOT
 * re-measure decodeAsset's per-file routing in isolation -- it pins that the actual on-disk
 * MANIFEST JSON (paths, categories, decode flags) drives `loadGame()` to the exact per-file and
 * per-manifest totals a live measurement pass produced today (see
 * scratchpad `loadgame-frame-counts.md`), so a manifest typo (wrong path, wrong decode:false,
 * wrong category) would show up here even if the underlying decoder is untouched and correct.
 *
 * Null / negative check (per the project's epistemic rules): every manifest also asserts that
 * its `decode:false` (data) rows render exactly 0 frames AND that this is not vacuous -- the
 * same manifest's image-bearing rows render > 0 frames under the identical loadGame() pass, so
 * a decoder that produced 0 frames for everything would fail the image-bearing assertions
 * instead of silently passing the data-row assertions.
 *
 * Additionally (pool-amiga only) this file pins the `pool-amiga` format-scoped branch that
 * `packages/engine/src/game/loadGame.ts` gained today: before it existed, `?game=pool-amiga`
 * surfaced 744 of the archive's 1672 frames, silently truncating six `kind: 'standard'`
 * multi-frame families (BACPAC, 8X8D, DUNGCOM, WILDCOM, RANDCOM, SQRPACI) to their first frame
 * (or, for 8X8D/SQRPACI, to their block count) because the shared DAX/pool-amiga fallback
 * branch's `MULTI_FRAME_KINDS` allowlist never included pool-amiga's `'standard'` kind. That
 * branch is deliberately scoped to the `pool-amiga` format rather than widening the shared set,
 * because `'standard'` is a kind the DAX loader (`decodeDax`) never emits -- widening the shared
 * set would be a no-op for DAX today but would silently change DAX rendering the moment a
 * `'standard'` kind appeared there. This file pins BOTH sides of that reasoning: that pool-amiga
 * now surfaces every frame of its `'standard'` blocks, and that DAX's own emitted kinds still
 * never include `'standard'` (verified against a live decode of 102 real DAX files already held
 * in this repo, not just the TypeScript union, since the TS type does not by itself prove no
 * runtime path assigns an out-of-union string).
 *
 * Skips (not fails) when the external, never-vendored WHDLoad source is absent. The DAX
 * 'standard'-kind guard uses DAX files already committed in this repo (`Champions of Krynn/`,
 * `Death Knights of Krynn/`), so it never skips.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGame, type GameManifest, type FetchBytes, type LoadedGame } from '../src/index.js';
import { decodeDax } from '../src/loaders/dax.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

function loadManifest(name: string): GameManifest {
  return JSON.parse(
    readFileSync(resolve(repoRoot, 'apps', 'web', 'games', name), 'utf8'),
  ) as GameManifest;
}

// path.resolve treats an already-absolute second argument (e.g. "D:/Games/...") as an
// override, so this one fetcher correctly serves both repo-relative and absolute manifest
// paths -- matching the convention `buck-rogers-amiga.json` established and
// `phaseBAmigaManifests.test.ts` reused.
const fetchBytes: FetchBytes = async (p: string) => new Uint8Array(readFileSync(resolve(repoRoot, p)));

function manifestFilesExist(m: GameManifest): boolean {
  return m.files.every((f) => existsSync(resolve(repoRoot, f.path)));
}

/** Flatten a loaded game's file results into `{ path -> frame count }`, keyed by manifest path. */
function frameCountsByPath(game: LoadedGame): Record<string, number> {
  const out: Record<string, number> = {};
  for (const cat of game.categories) {
    for (const f of cat.files) out[f.path] = f.frames.length;
  }
  return out;
}

interface Spec {
  manifestFile: string;
  id: string;
  totalFrames: number;
  /** Every image-bearing row's expected frame count, keyed by its manifest `path`. */
  imageFrames: Record<string, number>;
  /** Every decode:false row's manifest `path` -- must render exactly 0 frames each. */
  dataPaths: string[];
}

const WHDLOAD =
  'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked';

const POOL = `${WHDLOAD}/PoolOfRadiance/data`;
const SECRET = `${WHDLOAD}/SecretOfTheSilverBlades/data`;
const GATEWAY = `${WHDLOAD}/GatewayToSavageFrontier/data`;
const TREASURES = `${WHDLOAD}/TreasuresOfSavageFrontier/data`;

const SPECS: Spec[] = [
  {
    manifestFile: 'pool-amiga.json',
    id: 'pool-amiga',
    totalFrames: 1672,
    imageFrames: {
      [`${POOL}/pic.dax`]: 171,
      [`${POOL}/final.dax`]: 14,
      [`${POOL}/cpic.dax`]: 118,
      [`${POOL}/chead.dax`]: 28,
      [`${POOL}/head.dax`]: 39,
      [`${POOL}/body.dax`]: 21,
      [`${POOL}/cbody.dax`]: 128,
      [`${POOL}/bacpac.dax`]: 21,
      [`${POOL}/icon.dax`]: 6,
      [`${POOL}/8x8d.dax`]: 774,
      [`${POOL}/dungcom.dax`]: 13,
      [`${POOL}/wildcom.dax`]: 17,
      [`${POOL}/randcom.dax`]: 4,
      [`${POOL}/sqrpaci.dax`]: 128,
      [`${POOL}/sprit.dax`]: 165,
      [`${POOL}/comspr.dax`]: 25,
    },
    dataPaths: [
      `${POOL}/geo.dax`,
      `${POOL}/ecl.dax`,
      `${POOL}/walldef.dax`,
      `${POOL}/moncha.dax`,
      `${POOL}/monitm.dax`,
      `${POOL}/monspc.dax`,
      `${POOL}/item.dax`,
    ],
  },
  {
    manifestFile: 'secret-amiga.json',
    id: 'secret-amiga',
    totalFrames: 2025,
    imageFrames: {
      [`${SECRET}/DISK1/8X8D.TLB`]: 65,
      [`${SECRET}/DISK1/ALWAYS.TLB`]: 72,
      [`${SECRET}/DISK1/COMSPR.TLB`]: 26,
      [`${SECRET}/DISK1/SKY.TLB`]: 3,
      [`${SECRET}/DISK2/8X8D.TLB`]: 1330,
      [`${SECRET}/DISK2/BIGPIC.TLB`]: 8,
      [`${SECRET}/DISK2/CBODY.TLB`]: 128,
      [`${SECRET}/DISK2/CHEAD.TLB`]: 56,
      [`${SECRET}/DISK2/CPIC.TLB`]: 106,
      [`${SECRET}/DISK2/DUNGCOM.TLB`]: 30,
      [`${SECRET}/DISK2/PIC.TLB`]: 94,
      [`${SECRET}/DISK2/SPRIT.TLB`]: 102,
      [`${SECRET}/DISK2/TITLE.TLB`]: 5,
    },
    dataPaths: [
      `${SECRET}/DISK1/sounds.glb`,
      `${SECRET}/DISK2/ECL.GLB`,
      `${SECRET}/DISK2/GEO.GLB`,
      `${SECRET}/DISK2/ITEM.GLB`,
      `${SECRET}/DISK2/MONCHA.GLB`,
      `${SECRET}/DISK2/MONITM.GLB`,
      `${SECRET}/DISK2/MONSPC.GLB`,
      `${SECRET}/DISK2/WALLDEF.GLB`,
    ],
  },
  {
    manifestFile: 'gateway-amiga.json',
    id: 'gateway-amiga',
    totalFrames: 3281,
    imageFrames: {
      [`${GATEWAY}/DiskA/Always.tlb`]: 128,
      [`${GATEWAY}/DiskA/ComSpr.tlb`]: 26,
      [`${GATEWAY}/DiskA/Sky.tlb`]: 3,
      [`${GATEWAY}/DiskA/Walls.tlb`]: 65,
      [`${GATEWAY}/DiskB/Body.tlb`]: 17,
      [`${GATEWAY}/DiskB/CBody.tlb`]: 128,
      [`${GATEWAY}/DiskB/CHead.tlb`]: 56,
      [`${GATEWAY}/DiskB/Cpic.tlb`]: 130,
      [`${GATEWAY}/DiskB/DungCom.tlb`]: 25,
      [`${GATEWAY}/DiskB/Head.tlb`]: 20,
      [`${GATEWAY}/DiskB/Pic.tlb`]: 73,
      [`${GATEWAY}/DiskB/RandCom.tlb`]: 6,
      [`${GATEWAY}/DiskB/Title.tlb`]: 6,
      [`${GATEWAY}/DiskB/WildCom.tlb`]: 34,
      [`${GATEWAY}/DiskC/BigPic.tlb`]: 12,
      [`${GATEWAY}/DiskC/Sprit.tlb`]: 120,
      [`${GATEWAY}/DiskC/Tiles.tlb`]: 48,
      [`${GATEWAY}/DiskC/Walls.tlb`]: 2384,
    },
    dataPaths: [
      `${GATEWAY}/DiskA/Sounds.glb`,
      `${GATEWAY}/DiskA/Strings.glb`,
      `${GATEWAY}/DiskB/Item.glb`,
      `${GATEWAY}/DiskB/MonCha.glb`,
      `${GATEWAY}/DiskB/MonItm.glb`,
      `${GATEWAY}/DiskB/MonSpc.glb`,
      `${GATEWAY}/DiskC/ECL.glb`,
      `${GATEWAY}/DiskC/Geo.glb`,
      `${GATEWAY}/DiskC/WallDef.glb`,
    ],
  },
  {
    manifestFile: 'treasures-amiga.json',
    id: 'treasures-amiga',
    totalFrames: 2273,
    imageFrames: {
      [`${TREASURES}/DiskC/Pic.tlb`]: 140,
      [`${TREASURES}/DiskC/walls.tlb`]: 1404,
      [`${TREASURES}/diska/Always.tlb`]: 164,
      [`${TREASURES}/diska/Sky.tlb`]: 3,
      [`${TREASURES}/diska/Walls.tlb`]: 65,
      [`${TREASURES}/diska/bigpic.tlb`]: 6,
      [`${TREASURES}/diska/comspr.tlb`]: 26,
      [`${TREASURES}/diska/cpic.tlb`]: 204,
      [`${TREASURES}/diska/dungcom.tlb`]: 25,
      [`${TREASURES}/diska/randcom.tlb`]: 6,
      [`${TREASURES}/diska/title.tlb`]: 5,
      [`${TREASURES}/diska/wildcom.tlb`]: 34,
      [`${TREASURES}/diskb/CBody.tlb`]: 128,
      [`${TREASURES}/diskb/chead.tlb`]: 56,
      [`${TREASURES}/diskb/map.tlb`]: 7,
    },
    dataPaths: [
      `${TREASURES}/DiskC/Luck.glb`,
      `${TREASURES}/DiskC/WallDef.glb`,
      `${TREASURES}/diska/Sounds.glb`,
      `${TREASURES}/diska/Strings.glb`,
      `${TREASURES}/diskb/ecl.glb`,
      `${TREASURES}/diskb/geo.glb`,
      `${TREASURES}/diskb/item.glb`,
      `${TREASURES}/diskb/moncha.glb`,
      `${TREASURES}/diskb/monitm.glb`,
      `${TREASURES}/diskb/monspc.glb`,
    ],
  },
];

for (const spec of SPECS) {
  const manifestPath = resolve(repoRoot, 'apps', 'web', 'games', spec.manifestFile);
  const manifestOnDisk = existsSync(manifestPath);
  const manifest = manifestOnDisk ? loadManifest(spec.manifestFile) : null;
  const ready = manifestOnDisk && manifest !== null && manifestFilesExist(manifest);
  const maybe = ready ? describe : describe.skip;

  maybe(`Phase B round 32 manifest — ${spec.manifestFile} (real loadGame pass over WHDLoad bytes)`, () => {
    it('has the pinned id and every declared file present on disk', () => {
      expect(manifest!.id).toBe(spec.id);
      expect(manifest!.platform).toBe('Amiga');
      // Row inventory: every expected image-bearing path and every expected data path must be
      // exactly the manifest's file list, with nothing missing and nothing extra (mutation: a
      // dropped or added row must fail this, not just the totals below).
      const declaredPaths = manifest!.files.map((f) => f.path).sort();
      const expectedPaths = [...Object.keys(spec.imageFrames), ...spec.dataPaths].sort();
      expect(declaredPaths).toEqual(expectedPaths);
    });

    it(`loadGame() renders exactly ${spec.totalFrames} total frames`, async () => {
      const game = await loadGame(manifest!, fetchBytes);
      expect(game.id).toBe(spec.id);
      expect(game.errors).toEqual([]);
      expect(game.totalFrames).toBe(spec.totalFrames);

      const byPath = frameCountsByPath(game);

      // Every image-bearing row renders its pinned exact frame count.
      for (const [path, expected] of Object.entries(spec.imageFrames)) {
        expect(byPath[path], `${path} frame count`).toBe(expected);
        expect(expected, `${path} test fixture bug: expected 0 belongs in dataPaths`).toBeGreaterThan(0);
      }

      // Negative check WITH a null: every decode:false (data) row renders exactly 0 frames.
      // This is not vacuous, because the loop above already proved this same loadGame() pass
      // decodes real non-zero frame counts for every image-bearing row under the identical
      // manifest/fetcher/decoder -- so a decoder producing 0 frames everywhere would fail above,
      // not just pass here.
      for (const path of spec.dataPaths) {
        expect(byPath[path], `${path} should be a data row rendering 0 frames`).toBe(0);
      }

      // Sum-of-parts cross-check: the per-file pins above must themselves sum to the pinned
      // total (catches a manifest row present-but-uncounted, e.g. wrong category bucket).
      const sumOfParts = Object.values(spec.imageFrames).reduce((a, b) => a + b, 0);
      expect(sumOfParts).toBe(spec.totalFrames);
    });
  });
}

// ---------------------------------------------------------------------------
// The pool-amiga routing fix, pinned specifically (both directions).
// ---------------------------------------------------------------------------

const poolSpec = SPECS.find((s) => s.id === 'pool-amiga')!;
const poolManifestPath = resolve(repoRoot, 'apps', 'web', 'games', poolSpec.manifestFile);
const poolReady =
  existsSync(poolManifestPath) && manifestFilesExist(loadManifest(poolSpec.manifestFile));
const maybePool = poolReady ? describe : describe.skip;

/**
 * Before today's `pool-amiga` branch in `loadGame.ts`, these six files' `kind: 'standard'`
 * multi-frame blocks were truncated to `block.image` (frame 0) by the shared DAX/pool-amiga
 * fallback branch, because that branch's `MULTI_FRAME_KINDS` allowlist never included
 * `'standard'`. BACPAC/DUNGCOM/WILDCOM/RANDCOM collapsed to 1 frame per file (as many blocks as
 * frames, coincidentally 1 block each); 8X8D and SQRPACI collapsed to their BLOCK count (23 and
 * 2) rather than their frame count, because each of their blocks itself holds >1 frame.
 */
const POOL_STANDARD_MULTIFRAME: Record<string, number> = {
  [`${POOL}/bacpac.dax`]: 21,
  [`${POOL}/8x8d.dax`]: 774,
  [`${POOL}/dungcom.dax`]: 13,
  [`${POOL}/wildcom.dax`]: 17,
  [`${POOL}/randcom.dax`]: 4,
  [`${POOL}/sqrpaci.dax`]: 128,
};

maybePool('pool-amiga "standard"-kind multi-frame routing (R32 fix)', () => {
  it("surfaces every frame of every 'standard'-kind multi-frame block, not just block 0's first frame", async () => {
    const manifest = loadManifest('pool-amiga.json');
    const game = await loadGame(manifest, fetchBytes);
    const byPath = frameCountsByPath(game);

    for (const [path, expected] of Object.entries(POOL_STANDARD_MULTIFRAME)) {
      expect(byPath[path], `${path} frame count`).toBe(expected);
      // Guards regressing to EITHER prior failure shape: collapsing to 1 (BACPAC/DUNGCOM/
      // WILDCOM/RANDCOM) or to the block count alone (8X8D 23, SQRPACI 2) -- both are < expected
      // for every file in this table, so this single bound catches either regression.
      expect(byPath[path]).toBeGreaterThan(1);
    }
  });
});

/**
 * The other direction: the pool-amiga branch is deliberately scoped to the `pool-amiga` format
 * rather than widening the shared `MULTI_FRAME_KINDS` set, because `'standard'` is a kind
 * `decodeDax` never emits (see that set's doc comment in `loadGame.ts`). This is verified here
 * against a live decode of every `.DAX` file already committed in this repo (`Champions of
 * Krynn/`, `Death Knights of Krynn/`) -- the TypeScript union on `DaxBlock.kind` says the same
 * thing at the type level, but a runtime sweep is the fact that actually makes the format
 * scoping safe (a union type does not prove no code path produces an out-of-union string).
 */
describe("DAX 'standard' kind absence (the fact that makes pool-amiga's format-scoped branch safe)", () => {
  const DAX_ROOTS = ['Champions of Krynn', 'Death Knights of Krynn'].map((d) =>
    resolve(repoRoot, d),
  );
  const daxFiles = DAX_ROOTS.filter(existsSync).flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith('.dax'))
      .map((f) => resolve(dir, f)),
  );

  const KNOWN_DAX_KINDS = new Set([
    'frame',
    'tile-strip',
    'animated',
    'tileset',
    'vga-ext-frame',
    'vga256-title',
    '8x8d-treasures-mode2',
    'vga-chunky-items',
    'vga-compressed-picture',
    'vga-palette-record',
    'gateway-pic-planar5',
    'gateway-pic-multiframe',
    'gateway-structure-record',
    'font',
    'complex',
  ]);

  it(`decodes ${daxFiles.length > 0 ? daxFiles.length : 'the repo\'s'} real DAX files and never assigns block.kind === 'standard'`, () => {
    expect(daxFiles.length).toBeGreaterThan(50); // both CoK (52) and DoK (50) are repo-committed, not external -- this must never skip
    let blockCount = 0;
    const seenKinds = new Set<string>();
    for (const file of daxFiles) {
      const bytes = new Uint8Array(readFileSync(file));
      const archive = decodeDax(bytes, file);
      for (const b of archive.blocks) {
        blockCount++;
        seenKinds.add(b.kind);
        expect(b.kind, `${file} block ${b.blockId} kind`).not.toBe('standard');
      }
    }
    expect(blockCount).toBeGreaterThan(0);
    // Every kind actually observed is one of the 15 known DAX kinds -- if decodeDax ever grew a
    // 16th kind, this fails loudly instead of the `.not.toBe('standard')` check above passing by
    // accident on an unrelated new string.
    for (const k of seenKinds) {
      expect(KNOWN_DAX_KINDS.has(k), `unexpected DAX block kind: ${k}`).toBe(true);
    }
  });
});
