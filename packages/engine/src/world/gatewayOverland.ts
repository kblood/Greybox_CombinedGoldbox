/**
 * Gateway to the Savage Frontier's native overland tile compositor.
 *
 * GAME.OVR's non-dungeon branch draws an 11×11 contiguous window from GEO plane 0.  A terrain
 * byte selects one of three directly-loaded 70-tile 8X8D banks; the party arrow is then overlaid
 * from the retained boot/UI bank.  This module intentionally stops at that pure renderer boundary:
 * map-edge transitions, ECL movement dispatch, prompts, and save ownership belong to a controller.
 */
import { decode8x8dBlock } from '../loaders/tiles8x8.js';
import type { IndexedImage, TileSet } from '../model/index.js';
import { blitTile, createFramebuffer, type IndexedFramebuffer } from '../render/screen.js';
import type { Pose } from './explorer.js';

export const GATEWAY_OVERLAND_GRID = 16;
export const GATEWAY_OVERLAND_WINDOW_TILES = 11;
export const GATEWAY_OVERLAND_TILE_PX = 8;
export const GATEWAY_OVERLAND_TILES_PER_BANK = 70;
export const GATEWAY_OVERLAND_BOOT_ARROW_BLOCK_ID = 0xca;
export const GATEWAY_OVERLAND_TRANSPARENT_INDEX = 13;

export interface GatewayOverlandTileSource {
  /** Decompressed block from the selected area's 8X8D archive (ECL6 uses 8X8D6.DAX). */
  areaTileBlock(blockId: number): Uint8Array | null;
  /** Decompressed block from the global boot archive (8X8D1.DAX). */
  bootTileBlock(blockId: number): Uint8Array | null;
}

export interface GatewayOverlandBanks {
  /** Symbol sets 1..3, in order; each contains exactly 70 planar-5 tiles. */
  terrain: readonly [TileSet, TileSet, TileSet];
  /** Retained symbol set 4; local tiles 0..3 are N/E/S/W party arrows. */
  arrows: TileSet;
  terrainBlockIds: readonly [number, number, number];
  arrowBlockId: number;
}

export interface GatewayOverlandWindow {
  framebuffer: IndexedFramebuffer;
  /** Top-left GEO coordinate sampled into framebuffer tile (0,0). */
  originX: number;
  originY: number;
  /** Party-arrow position within the 11×11 framebuffer tile grid. */
  markerCol: number;
  markerRow: number;
}

/** Decode the three direct ECL-selected terrain banks plus Gateway's retained boot arrow bank. */
export function loadGatewayOverlandBanks(
  terrainBlockIds: readonly [number, number, number],
  source: GatewayOverlandTileSource,
): GatewayOverlandBanks {
  const terrain = terrainBlockIds.map((blockId, index) => {
    const raw = source.areaTileBlock(blockId);
    if (!raw) throw new Error(`Gateway overland 8X8D area block ${blockId} (set ${index + 1}) not found`);
    const tiles = decode8x8dBlock(raw, `Gateway overland set ${index + 1} / block ${blockId}`);
    if (tiles.tiles.length !== GATEWAY_OVERLAND_TILES_PER_BANK) {
      throw new Error(
        `Gateway overland 8X8D area block ${blockId} has ${tiles.tiles.length} tiles; expected 70`,
      );
    }
    return tiles;
  }) as [TileSet, TileSet, TileSet];

  const arrowRaw = source.bootTileBlock(GATEWAY_OVERLAND_BOOT_ARROW_BLOCK_ID);
  if (!arrowRaw) {
    throw new Error(`Gateway overland boot arrow block ${GATEWAY_OVERLAND_BOOT_ARROW_BLOCK_ID} not found`);
  }
  const arrows = decode8x8dBlock(arrowRaw, 'Gateway overland arrows');
  if (arrows.tiles.length < 4) {
    throw new Error(`Gateway overland boot arrow block has ${arrows.tiles.length} tiles; expected at least 4`);
  }

  return {
    terrain,
    arrows,
    terrainBlockIds: [...terrainBlockIds],
    arrowBlockId: GATEWAY_OVERLAND_BOOT_ARROW_BLOCK_ID,
  };
}

const FACING_ORDINAL: Readonly<Record<Pose['facing'], number>> = {
  north: 0,
  east: 1,
  south: 2,
  west: 3,
};

function clampOrigin(position: number): number {
  return Math.max(0, Math.min(GATEWAY_OVERLAND_GRID - GATEWAY_OVERLAND_WINDOW_TILES, position - 5));
}

/**
 * Compose the exact native 88×88 overland viewport, excluding its outer screen/frame offset.
 *
 * `terrainPlane` is the selected 16×16 GEO block's raw plane 0.  For byte `t`, GAME.OVR requests
 * global symbol `0x2E+t`: bank `floor(t/70)`, local tile `t%70`.  Retail ECL6 maps use only
 * `0..209`; values outside that proved domain are rejected rather than assigned a fallback.
 */
export function composeGatewayOverlandWindow(
  terrainPlane: Uint8Array,
  pose: Pose,
  banks: GatewayOverlandBanks,
): GatewayOverlandWindow {
  if (terrainPlane.length !== GATEWAY_OVERLAND_GRID * GATEWAY_OVERLAND_GRID) {
    throw new Error(
      `Gateway overland GEO plane must contain 256 bytes, got ${terrainPlane.length}`,
    );
  }
  if (pose.x < 0 || pose.x >= GATEWAY_OVERLAND_GRID || pose.y < 0 || pose.y >= GATEWAY_OVERLAND_GRID) {
    throw new Error(`Gateway overland pose (${pose.x},${pose.y}) is outside the 16x16 GEO grid`);
  }

  const originX = clampOrigin(pose.x);
  const originY = clampOrigin(pose.y);
  const framebuffer = createFramebuffer(
    GATEWAY_OVERLAND_WINDOW_TILES * GATEWAY_OVERLAND_TILE_PX,
    GATEWAY_OVERLAND_WINDOW_TILES * GATEWAY_OVERLAND_TILE_PX,
  );

  for (let row = 0; row < GATEWAY_OVERLAND_WINDOW_TILES; row++) {
    for (let col = 0; col < GATEWAY_OVERLAND_WINDOW_TILES; col++) {
      const terrain = terrainPlane[(originY + row) * GATEWAY_OVERLAND_GRID + originX + col];
      if (terrain >= 3 * GATEWAY_OVERLAND_TILES_PER_BANK) {
        throw new Error(`Gateway overland terrain byte ${terrain} is outside the proved 0..209 domain`);
      }
      const bank = Math.floor(terrain / GATEWAY_OVERLAND_TILES_PER_BANK);
      const localTile = terrain % GATEWAY_OVERLAND_TILES_PER_BANK;
      blitTile(framebuffer, banks.terrain[bank].tiles[localTile], col, row);
    }
  }

  const markerCol = pose.x - originX;
  const markerRow = pose.y - originY;
  const arrow = banks.arrows.tiles[FACING_ORDINAL[pose.facing]];
  // The boot/UI block is normally decoded opaque.  This call is GAME.OVR's overlay form of
  // Put8x8Symbol, whose colour-13 key preserves the already-drawn terrain under the sparse arrow.
  const overlayArrow: IndexedImage = { ...arrow, transparentIndex: GATEWAY_OVERLAND_TRANSPARENT_INDEX };
  blitTile(framebuffer, overlayArrow, markerCol, markerRow);

  return { framebuffer, originX, originY, markerCol, markerRow };
}
