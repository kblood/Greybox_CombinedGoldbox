/**
 * First-person cell-walk — DOS Champions of Krynn (older Gold Box) (M1.S5c).
 *
 * Decides WHICH wall pieces fire for a given party pose: the far→mid→near cell walk that
 * `wallpieces.ts` (the per-piece tile expander) is the load-bearing primitive for. This is a
 * 1:1 clean-room transcription of COAB's `Draw3dWorld` / `Draw3dWorldFar` / `…Mid` / `…Near`
 * (ovr031.cs) — see docs/engine/research/firstperson-wall-walk-cok.md (all CONFIRMED). No
 * COAB code is copied; the loop bodies are re-expressed onto our `expandWallPiece` API.
 *
 * Two layers, so the geometry is unit-testable without a tile pool:
 *   planWallView(map, pose) → WallPiecePlacement[]   (the exact draw_3D_8x8_titles calls)
 *   composeWallView(map, pose, readId) → WallTileBlit[]  (each placement expanded to tiles)
 *
 * Painter order is Far (2 cells ahead) → Mid (1 ahead) → Near (party cell); the returned
 * array is already in that order, so blit it front-to-back and Near overpaints Far.
 */
import type { Direction, GameMap } from '../model/index.js';
import { PIECES, expandWallPiece, type WallTileBlit } from './wallpieces.js';

/** MapDirection{X,Y}Delta — index by dir 0..8 (8 = null/zero). Verbatim Gbl.cs. */
const XD = [0, 1, 1, 1, 0, -1, -1, -1, 0] as const;
const YD = [-1, -1, 0, 1, 1, 1, 0, -1, 0] as const;

/** Even dir (0=N,2=E,4=S,6=W) → engine-neutral cardinal. Walls are only read on even edges. */
const CARDINAL: Record<number, Direction> = { 0: 'north', 2: 'east', 4: 'south', 6: 'west' };

/** True iff (x,y) is inside the 16×16 grid (COAB `MapCoordIsValid`). */
function inMap(y: number, x: number): boolean {
  return x >= 0 && x < 16 && y >= 0 && y < 16;
}

/**
 * The 4-bit wall slot on edge `dir` (0/2/4/6) of cell (x,y) — COAB `getMap_wall_type` ∘
 * `getMap_XXX`. Off-map returns 0 (open) iff the current ECL block is the overland/special
 * block 0 or 10; otherwise the coord clamp-wraps to the opposite edge (>15→0, <0→15) and a
 * real cell is read. Returns 0 for open passages.
 */
export function wallType(
  map: GameMap,
  dir: number,
  y: number,
  x: number,
  eclBlockId: number,
): number {
  if (!inMap(y, x) && (eclBlockId === 0 || eclBlockId === 10)) return 0;
  let wx = x;
  let wy = y;
  if (wx > 15) wx = 0;
  else if (wx < 0) wx = 15;
  if (wy > 15) wy = 0;
  else if (wy < 0) wy = 15;
  const cell = map.cells[wy * 16 + wx];
  return cell ? cell.walls[CARDINAL[dir]] : 0;
}

/** One scheduled wall-piece draw (a `draw_3D_8x8_titles` / `expandWallPiece` call). */
export interface WallPiecePlacement {
  /** Which of the 10 PIECES. */
  pieceIdx: number;
  /** GEO wall slot 1..15 (never 0 — open edges are not scheduled). */
  slot: number;
  /** Draw-grid column anchor (piece colBase + the per-fan lateral shift). */
  colStart: number;
  /** Draw-grid row anchor (piece rowBase). */
  rowStart: number;
}

/** Party pose: map cell (px,py) and even facing (0=N,2=E,4=S,6=W). */
export interface WallPose {
  px: number;
  py: number;
  facing: number;
  /** Current ECL block id — drives the off-map "open vs wrap" rule (block 0/10 = open). */
  eclBlockId: number;
}

/**
 * Plan the wall pieces for one frame: the exact ordered list of `draw_3D_8x8_titles` calls
 * the COAB renderer would make, far→mid→near. Pure; reads only `map` wall slots.
 */
export function planWallView(map: GameMap, pose: WallPose): WallPiecePlacement[] {
  const { px, py, facing, eclBlockId } = pose;
  const left = (facing + 6) % 8;
  const right = (facing + 2) % 8;
  const behind = (facing + 4) % 8;
  const out: WallPiecePlacement[] = [];
  const wt = (dir: number, y: number, x: number) => wallType(map, dir, y, x, eclBlockId);
  const emit = (pieceIdx: number, slot: number, colStart: number, rowStart: number) => {
    if (slot > 0) out.push({ pieceIdx, slot, colStart, rowStart });
  };

  let dx = px + 2 * XD[facing];
  let dy = py + 2 * YD[facing];
  for (let step = 2; step >= 0; step--) {
    if (step === 2) drawFar(facing, left, right, dx, dy, wt, emit);
    else if (step === 1) drawMid(facing, left, right, dx, dy, wt, emit);
    else drawNear(facing, left, right, dx, dy, wt, emit);
    dx += XD[behind];
    dy += YD[behind];
  }
  return out;
}

/**
 * Compose the full first-person wall view: every planned piece expanded into its 8×8 tile
 * blits via `readId` (the WALLDEF reader that returns the relocated tile id for a
 * wallset/slice/pool-column). Returned in painter order (far→near).
 */
export function composeWallView(
  map: GameMap,
  pose: WallPose,
  readId: (wallset: number, slice: number, poolColumn: number) => number,
): WallTileBlit[] {
  const out: WallTileBlit[] = [];
  for (const p of planWallView(map, pose)) {
    out.push(...expandWallPiece(p.pieceIdx, p.slot, p.colStart, p.rowStart, readId));
  }
  return out;
}

type WallRead = (dir: number, y: number, x: number) => number;
type Emit = (pieceIdx: number, slot: number, colStart: number, rowStart: number) => void;

// Column_*/Row_* bases live on PIECES[].colBase/rowBase (research §2.4): A..J = piece 0..9.
const cB = (i: number) => PIECES[i].colBase;
const rB = (i: number) => PIECES[i].rowBase;

/** Draw3dWorldFar (ovr031.cs:373) — 4-cell left/right front fans (+ piece-9 caps) + side walls. */
function drawFar(
  facing: number,
  left: number,
  right: number,
  drawX: number,
  drawY: number,
  wt: WallRead,
  emit: Emit,
): void {
  // LEFT FAN: 4 cells stepping dir_left, Col -= 2; cap colStart = Column_J + Col + 1.
  {
    let tmpX = drawX;
    let tmpY = drawY;
    let col = 0;
    let carry = 0; // var_17: previous cell's facing-wall slot (for the side-cap piece 9)
    for (let n = 0; n < 4; n++) {
      const front = wt(facing, tmpY, tmpX);
      if (!inMap(tmpY, tmpX) && wt(right, tmpY, tmpX) === 0) carry = 0;
      if (front !== 0) {
        if (carry > 0) emit(9, carry, cB(9) + col + 1, rB(9)); // cap before this front
        carry = front;
        emit(0, front, cB(0) + col, rB(0)); // far front
      } else {
        if (
          carry > 0 &&
          wt(left, tmpY - YD[left], tmpX - XD[left]) !== 0
        ) {
          emit(9, carry, cB(9) + col + 1, rB(9)); // cap closing a run
        }
        carry = 0;
      }
      col -= 2;
      tmpX += XD[left];
      tmpY += YD[left];
    }
  }

  // RIGHT FAN: 4 cells stepping dir_right, Col += 2; cap colStart = Column_J + Col - 1.
  {
    let tmpX = drawX;
    let tmpY = drawY;
    let col = 0;
    let carry = 0;
    for (let n = 0; n < 4; n++) {
      const front = wt(facing, tmpY, tmpX);
      if (!inMap(tmpY, tmpX) && wt(left, tmpY, tmpX) === 0) carry = 0;
      if (front !== 0) {
        if (carry > 0) emit(9, carry, cB(9) + col - 1, rB(9));
        carry = front;
        emit(0, front, cB(0) + col, rB(0));
      } else {
        if (
          carry > 0 &&
          wt(right, tmpY - YD[right], tmpX - XD[right]) !== 0
        ) {
          emit(9, carry, cB(9) + col - 1, rB(9));
        }
        carry = 0;
      }
      col += 2;
      tmpX += XD[right];
      tmpY += YD[right];
    }
  }

  // LEFT SIDE walls: 3 cells stepping dir_left, Col -= 2; first cell Col, rest Col-1.
  {
    let tmpX = drawX;
    let tmpY = drawY;
    let col = 0;
    for (let n = 0; n < 3; n++) {
      const side = wt(left, tmpY, tmpX);
      if (side !== 0) emit(1, side, cB(1) + (n === 0 ? col : col - 1), rB(1));
      col -= 2;
      tmpX += XD[left];
      tmpY += YD[left];
    }
  }

  // RIGHT SIDE walls: 3 cells stepping dir_right, Col += 2; first cell Col, rest Col+1.
  {
    let tmpX = drawX;
    let tmpY = drawY;
    let col = 0;
    for (let n = 0; n < 3; n++) {
      const side = wt(right, tmpY, tmpX);
      if (side !== 0) emit(2, side, cB(2) + (n === 0 ? col : col + 1), rB(2));
      col += 2;
      tmpX += XD[right];
      tmpY += YD[right];
    }
  }
}

/** Draw3dWorldMid (ovr031.cs:523) — two 3-cell scans, var_12 ∓6→0 / ±6→0; pieces 3/4 and 3/5. */
function drawMid(
  facing: number,
  left: number,
  right: number,
  vx: number,
  vy: number,
  wt: WallRead,
  emit: Emit,
): void {
  // L→R scan: start 2 cells left of focus, step dir_right, var_12 = -6,-3,0.
  {
    let tmpX = vx + 2 * XD[left];
    let tmpY = vy + 2 * YD[left];
    let v12 = -6;
    for (let n = 0; n < 3; n++) {
      const front = wt(facing, tmpY, tmpX);
      if (front !== 0) emit(3, front, cB(3) + v12, rB(3)); // mid front
      const side = wt(left, tmpY, tmpX);
      if (side !== 0) emit(4, side, cB(4) + v12, rB(4)); // mid left
      v12 += 3;
      tmpX += XD[right];
      tmpY += YD[right];
    }
  }

  // R→L scan: start 2 cells right of focus, step dir_left, var_12 = 6,3,0.
  {
    let tmpX = vx + 2 * XD[right];
    let tmpY = vy + 2 * YD[right];
    let v12 = 6;
    for (let n = 0; n < 3; n++) {
      const front = wt(facing, tmpY, tmpX);
      if (front !== 0) emit(3, front, cB(3) + v12, rB(3)); // mid front (focus drawn twice)
      const side = wt(right, tmpY, tmpX);
      if (side !== 0) emit(5, side, cB(5) + v12, rB(5)); // mid right
      v12 -= 3;
      tmpX += XD[left];
      tmpY += YD[left];
    }
  }
}

/** Draw3dWorldNear (ovr031.cs:580) — two 2-cell scans, var_12 ∓7→0 / ±7→0; pieces 6/7 and 6/8. */
function drawNear(
  facing: number,
  left: number,
  right: number,
  vx: number,
  vy: number,
  wt: WallRead,
  emit: Emit,
): void {
  // L→R: start 1 cell left, step dir_right, var_12 = -7,0.
  {
    let tmpX = vx + XD[left];
    let tmpY = vy + YD[left];
    let v12 = -7;
    for (let n = 0; n < 2; n++) {
      const front = wt(facing, tmpY, tmpX);
      if (front !== 0) emit(6, front, cB(6) + v12, rB(6)); // near front
      const side = wt(left, tmpY, tmpX);
      if (side !== 0) emit(7, side, cB(7) + v12, rB(7)); // near left
      v12 += 7;
      tmpX += XD[right];
      tmpY += YD[right];
    }
  }

  // R→L: start 1 cell right, step dir_left, var_12 = 7,0.
  {
    let tmpX = vx + XD[right];
    let tmpY = vy + YD[right];
    let v12 = 7;
    for (let n = 0; n < 2; n++) {
      const front = wt(facing, tmpY, tmpX);
      if (front !== 0) emit(6, front, cB(6) + v12, rB(6)); // near front (focus drawn twice)
      const side = wt(right, tmpY, tmpX);
      if (side !== 0) emit(8, side, cB(8) + v12, rB(8)); // near right
      v12 -= 7;
      tmpX += XD[left];
      tmpY += YD[left];
    }
  }
}
