/**
 * Sky backdrop tests (ovr028/029 per-area sky colour + ovr030 time-of-day body).
 *
 * Pixel-asserts against the indexed framebuffer like renderWallView.test.ts: the sky band fills
 * with the resolved EGA index, the roof bit flips indoor↔outdoor, and the sun/moon lands on the
 * pinned `row` formula for a couple of hours/facings. A host with no clock gets a plain sky.
 */
import { describe, it, expect } from 'vitest';
import {
  SKY_COLOURS,
  SKY_HORIZON_Y,
  SKY_OUTDOOR_OPEN,
  isIndoorCell,
  selectSkyColour,
  skyBodyPlacement,
  paintSkyBackdrop,
  renderFirstPersonViewWithSky,
  createFramebuffer,
  WALL_VIEW_WIDTH,
  WALL_VIEW_HEIGHT,
  type AreaSky,
  type IndexedFramebuffer,
  type GameMap,
  type IndexedImage,
  type WallPose,
  type WallTileLookup,
} from '../src/index.js';

function px(fb: IndexedFramebuffer, x: number, y: number): number {
  return fb.indices[y * fb.width + x];
}

// An area whose outdoor sky is the open blue (idx 3 → 0x0b) and indoor sky is grey (idx 5 → 0x02).
const AREA: AreaSky = { indoorSkyColour: 5, outdoorSkyColour: 3 };

describe('selectSkyColour (RedrawView per-cell roof bit)', () => {
  it('outdoor (roof bit clear) reads outdoor_sky_colour', () => {
    expect(selectSkyColour(AREA, 0x00)).toBe(SKY_COLOURS[3]); // 0x0b
    expect(selectSkyColour(AREA, 0x7f)).toBe(SKY_COLOURS[3]); // 0x7f is still < 0x80
    expect(isIndoorCell(0x7f)).toBe(false);
  });

  it('indoor (roof bit set, > 0x7F) reads indoor_sky_colour', () => {
    expect(selectSkyColour(AREA, 0x80)).toBe(SKY_COLOURS[5]); // 0x02
    expect(selectSkyColour(AREA, 0xff)).toBe(SKY_COLOURS[5]);
    expect(isIndoorCell(0x80)).toBe(true);
  });

  it('SKY_COLOURS is the 16-entry EGA table (8 distinct ×2)', () => {
    expect(SKY_COLOURS).toHaveLength(16);
    expect(SKY_COLOURS.slice(0, 8)).toEqual(SKY_COLOURS.slice(8, 16));
    expect(SKY_COLOURS[3]).toBe(SKY_OUTDOOR_OPEN);
  });
});

describe('skyBodyPlacement (Draw3dWorldBackground)', () => {
  it('North always shows the sky_dax_250 body', () => {
    for (const hour of [0, 6, 12, 20]) {
      const b = skyBodyPlacement(hour, 0);
      expect(b.visible).toBe(true);
      expect(b.bodyIndex).toBe(0);
    }
  });

  it('East sunrise hours 1..5 rise as row = 7 - hour', () => {
    expect(skyBodyPlacement(1, 2)).toMatchObject({ visible: true, row: 6 });
    expect(skyBodyPlacement(5, 2)).toMatchObject({ visible: true, row: 2 });
    // Higher in the sky as the morning advances (row decreases).
    expect(skyBodyPlacement(5, 2).row).toBeLessThan(skyBodyPlacement(1, 2).row);
  });

  it('West sunset hours 13..18 sink as row = (2+hour) - 13', () => {
    expect(skyBodyPlacement(13, 6)).toMatchObject({ visible: true, row: 2 });
    expect(skyBodyPlacement(18, 6)).toMatchObject({ visible: true, row: 7 });
    expect(skyBodyPlacement(18, 6).row).toBeGreaterThan(skyBodyPlacement(13, 6).row);
  });

  it('off-axis (facing South) only for the later sunrise hours', () => {
    expect(skyBodyPlacement(2, 4).visible).toBe(false); // hour not > 2
    expect(skyBodyPlacement(3, 4).visible).toBe(true);
  });

  it('plain sky when no body is up (East at noon, West at dawn)', () => {
    expect(skyBodyPlacement(12, 2).visible).toBe(false);
    expect(skyBodyPlacement(4, 6).visible).toBe(false);
  });
});

describe('paintSkyBackdrop', () => {
  function fresh(): IndexedFramebuffer {
    return createFramebuffer(WALL_VIEW_WIDTH, WALL_VIEW_HEIGHT, 0);
  }

  it('fills the sky band with the sky index and the floor below the horizon', () => {
    const fb = fresh();
    paintSkyBackdrop(fb, 0x0b, { floorIndex: 8 });
    expect(px(fb, 0, 0)).toBe(0x0b); // top = sky
    expect(px(fb, 80, SKY_HORIZON_Y - 1)).toBe(0x0b); // just above horizon = sky
    expect(px(fb, 80, SKY_HORIZON_Y)).toBe(8); // at horizon = floor
    expect(px(fb, 0, WALL_VIEW_HEIGHT - 1)).toBe(8); // bottom = floor
  });

  it('plain-sky fallback: no clock ⇒ no body drawn', () => {
    const fb = fresh();
    const drawn = paintSkyBackdrop(fb, 0x0b, { floorIndex: 8 }); // no hour/facing
    expect(drawn).toBeNull();
    // Whole sky band is uniform sky colour — nothing stamped.
    for (let x = 0; x < WALL_VIEW_WIDTH; x++) expect(px(fb, x, 8)).toBe(0x0b);
  });

  it('stamps the body at col*8,row*8 for an outdoor open sky', () => {
    const fb = fresh();
    // East, hour 5 → row 2, centre col 10 → buffer (80, 16); default sun colour 0x0e.
    const body = paintSkyBackdrop(fb, SKY_OUTDOOR_OPEN, {
      hour: 5,
      facing: 2,
      skyColour: SKY_OUTDOOR_OPEN,
    });
    expect(body).toMatchObject({ visible: true, col: 10, row: 2 });
    expect(px(fb, 80, 16)).toBe(0x0e); // top-left of the 8×8 body block
    expect(px(fb, 87, 23)).toBe(0x0e); // bottom-right of the block
    expect(px(fb, 79, 16)).toBe(SKY_OUTDOOR_OPEN); // just left of the block = sky
  });

  it('gates the body on the open-sky colour (indoor/closed sky ⇒ no body)', () => {
    const fb = fresh();
    const body = paintSkyBackdrop(fb, 0x02, {
      hour: 5,
      facing: 2,
      skyColour: 0x02, // not SKY_OUTDOOR_OPEN
    });
    expect(body).toBeNull();
    expect(px(fb, 80, 16)).toBe(0x02); // would-be body cell stays sky
  });

  it('stamps an injected sprite instead of the default block', () => {
    const fb = fresh();
    const sprite: IndexedImage = {
      width: 8,
      height: 8,
      indices: new Uint8Array(64).fill(15),
      xOffset: 0,
      yOffset: 0,
      transparentIndex: null,
      palette: null,
    };
    paintSkyBackdrop(fb, SKY_OUTDOOR_OPEN, {
      hour: 13,
      facing: 6, // West sunset → row 2, col 10 → (80,16)
      skyColour: SKY_OUTDOOR_OPEN,
      bodySprite: sprite,
    });
    expect(px(fb, 80, 16)).toBe(15);
  });
});

// ---- composite over the wall renderer ---------------------------------------------------------

function walledMap(): GameMap {
  const cells = Array.from({ length: 16 }, () => ({ walls: { north: 1, east: 1, south: 1, west: 1 } }));
  return { name: 'test', width: 4, height: 4, cells, entries: [] };
}
function solidTile(idx: number): IndexedImage {
  return { width: 8, height: 8, indices: new Uint8Array(64).fill(idx), xOffset: 0, yOffset: 0, transparentIndex: null, palette: null };
}
const WALLS: WallTileLookup = { readId: () => 0x30, lookupTile: () => solidTile(12) };

describe('renderFirstPersonViewWithSky', () => {
  const map = walledMap();
  const pose: WallPose = { px: 1, py: 1, facing: 0, eclBlockId: 34 };

  it('produces a 168×168 indexed buffer with the per-area sky behind the walls', () => {
    const fb = renderFirstPersonViewWithSky(map, pose, WALLS, { area: AREA, roofByte: 0x00 });
    expect(fb.width).toBe(WALL_VIEW_WIDTH);
    expect(fb.height).toBe(WALL_VIEW_HEIGHT);
    // Edge column x<16 is never covered by a wall piece → shows the outdoor sky (0x0b) up top.
    expect(px(fb, 0, 0)).toBe(SKY_COLOURS[3]);
    // Some wall pixels (idx 12) were painted over the backdrop.
    let walls = 0;
    for (let i = 0; i < fb.indices.length; i++) if (fb.indices[i] === 12) walls++;
    expect(walls).toBeGreaterThan(0);
  });

  it('roof bit set switches the sky to the indoor colour', () => {
    const fb = renderFirstPersonViewWithSky(map, pose, WALLS, { area: AREA, roofByte: 0x80 });
    expect(px(fb, 0, 0)).toBe(SKY_COLOURS[5]); // indoor sky = 0x02
  });
});
