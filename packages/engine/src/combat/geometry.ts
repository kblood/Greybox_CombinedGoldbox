/**
 * Combat-map spatial primitives (ovr032/033) — the faithful SSI reach / line-of-sight / turn-order
 * geometry, decompiled in `docs/engine/research/decompile-ovr032-combat-map.md`.
 *
 * These are the byte-faithful upgrades to the simpler Chebyshev / binary-blocker model the tactical
 * engine shipped with. They are pure functions (no engine state, no RNG) so they unit-test directly and
 * the tactical layer can adopt them piecemeal:
 *
 *  • {@link steppingPathDistance} — the SSI `SteppingPath` step metric. Range is counted **in halves**:
 *    an orthogonal hop costs 2, a diagonal hop costs 3 (so a diagonal is genuinely **1.5×**, not the
 *    Chebyshev "diagonal = 1"). `SortedCombatant` documents it verbatim: *"steps counted in 2's, so that
 *    diagonal steps can be 3 (thus 1.5)."*  (spec §1a)
 *  • {@link combatDirection} — the 8-direction code from the 3×3 sign lookup `{7,0,1,6,8,2,5,4,3,8}`
 *    (Gold Box MapDirection convention: 0=N, 2=E, 4=S, 6=W; odd = diagonal; 8 = no move). (spec §1a)
 *  • {@link canReachWithHeight} — reach with **terrain-HEIGHT occlusion**: a wall blocks the shot only
 *    when its height (`BackGroundTiles.field_2`) exceeds the eye-ray elevation, not a binary "blocks
 *    sight" flag — so a low obstacle the ray clears does **not** block. `ignoreWalls` bypasses it for
 *    spells/effects that ignore terrain. (spec §1b)
 *  • {@link sortedCombatants} — the `Rebuild_SortedCombatantList` ordering: footprint-aware nearest
 *    target first (in half-steps), ties broken by facing-code then orthogonal-before-diagonal. (spec §3)
 *
 * Range/step counts here are **half-steps** (the doubled unit); divide by 2 for whole cells. The values
 * `{7,0,1,6,8,2,5,4,3,8}` and the 2/3 step costs are COAB-authoritative constants (the geometry is
 * generation-invariant across CoK/DoK/DQK — spec §7).
 */
import type { GridPos } from './tactical.js';

/** The 3×3 sign → 8-direction lookup `directions[(sign_y+1)*3 + (sign_x+1)]` (SteppingPath, spec §1a). */
const DIR_LOOKUP = [7, 0, 1, 6, 8, 2, 5, 4, 3, 8] as const;

/**
 * The SSI MapDirection code (0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW; **8 = no move**) from `from`
 * toward `to`, via the 3×3 sign lookup. This is the original combat-map facing convention (NOT the
 * `DIR8` east-origin convention `tactical.ts` uses for sprites). `dir % 2 === 0` ⇒ an orthogonal step.
 */
export function combatDirection(from: GridPos, to: GridPos): number {
  const sx = Math.sign(to.col - from.col);
  const sy = Math.sign(to.row - from.row);
  return DIR_LOOKUP[(sy + 1) * 3 + (sx + 1)]!;
}

/**
 * `SteppingPath` distance in **half-steps**: orthogonal hop = 2, diagonal hop = 3 (diagonal ≈ 1.5×).
 * Closed form `2·max(|Δx|,|Δy|) + min(|Δx|,|Δy|)` (each of the `min` diagonal hops adds the extra +1
 * over the `max` orthogonal-equivalent hops). Divide by 2 for the whole-cell range. (spec §1a)
 */
export function steppingPathDistance(a: GridPos, b: GridPos): number {
  const dx = Math.abs(a.col - b.col);
  const dy = Math.abs(a.row - b.row);
  return 2 * Math.max(dx, dy) + Math.min(dx, dy);
}

/**
 * The cells a `SteppingPath` walk crosses from `a` to `b`, **exclusive** of both endpoints — the same
 * major-axis Bresenham `Step` (`sub_7324C`) the reach/LOS test walks. Diagonals are distributed along
 * the major axis. Used by {@link canReachWithHeight} for the per-cell height test.
 */
export function steppingPathCells(a: GridPos, b: GridPos): GridPos[] {
  const cells: GridPos[] = [];
  let cx = a.col;
  let cy = a.row;
  const dx = Math.abs(b.col - a.col);
  const dy = Math.abs(b.row - a.row);
  const sx = Math.sign(b.col - a.col);
  const sy = Math.sign(b.row - a.row);
  if (dx === 0 && dy === 0) return cells;
  if (dx >= dy) {
    let err = Math.floor(dx / 2);
    for (let i = 0; i < dx; i++) {
      cx += sx;
      err -= dy;
      if (err < 0) { cy += sy; err += dx; }
      if (!(cx === b.col && cy === b.row)) cells.push({ col: cx, row: cy });
    }
  } else {
    let err = Math.floor(dy / 2);
    for (let i = 0; i < dy; i++) {
      cy += sy;
      err -= dx;
      if (err < 0) { cx += sx; err += dy; }
      if (!(cx === b.col && cy === b.row)) cells.push({ col: cx, row: cy });
    }
  }
  return cells;
}

/** Terrain whose walls carry a HEIGHT (`BackGroundTiles.field_2`) for the eye-ray occlusion test. */
export interface HeightField {
  /** Wall/obstacle height at a cell (0 = open ground). A cell blocks a ray of elevation `< height`. */
  height: (col: number, row: number) => number;
}

export interface ReachResult {
  /** True when the line from attacker to target is unobstructed at the given eye elevation. */
  reachable: boolean;
  /** Half-step distance walked before stopping (full {@link steppingPathDistance} when reachable). */
  range: number;
  /** The cell the ray was stopped at (the blocking wall's cell), when `!reachable`. */
  stoppedAt?: GridPos;
}

/**
 * Reach with **terrain-HEIGHT occlusion** (`canReachTargetCalc`, sub_733F1; spec §1b). Walks the
 * `SteppingPath` from `from` to `to`; at each intermediate cell the wall height is compared against the
 * eye-ray elevation `eyeHeight` (the flat synthetic ray `var_31` at the attacker's tile height). A wall
 * **taller** than the ray blocks (`height > eyeHeight`); a low obstacle the ray clears does not — unlike
 * the engine's binary `blocksSight`. `ignoreWalls` bypasses the test (spells/effects that ignore terrain).
 * Returns the half-step range and, on a block, the wall cell. Endpoints are never tested (you can stand
 * on/behind your own/target's cell).
 */
export function canReachWithHeight(
  from: GridPos,
  to: GridPos,
  terrain: HeightField,
  eyeHeight = 0,
  ignoreWalls = false,
): ReachResult {
  if (!ignoreWalls) {
    let steps = 0;
    let prev = from;
    for (const cell of steppingPathCells(from, to)) {
      steps += steppingPathDistance(prev, cell);
      if (terrain.height(cell.col, cell.row) > eyeHeight) {
        return { reachable: false, range: steps, stoppedAt: cell };
      }
      prev = cell;
    }
  }
  return { reachable: true, range: steppingPathDistance(from, to) };
}

/** Cells a `size`×`size` figure occupies, anchored top-left (mirror of `tactical.footprintCells`). */
function cellsForSize(pos: GridPos, size = 1): GridPos[] {
  const n = Math.max(1, Math.floor(size));
  if (n === 1) return [pos];
  const out: GridPos[] = [];
  for (let dr = 0; dr < n; dr++) for (let dc = 0; dc < n; dc++) out.push({ col: pos.col + dc, row: pos.row + dr });
  return out;
}

/** A combatant as the ordering pass sees it — just an id, an anchor and a footprint size. */
export interface SortableCombatant {
  id: string;
  pos: GridPos;
  size?: number;
}

/** One ranked entry from {@link sortedCombatants} (mirrors COAB's `SortedCombatant`). */
export interface SortedEntry<T extends SortableCombatant> {
  combatant: T;
  /** Cheapest reachable distance, in **half-steps** (footprint-aware: min over attacker/target cells). */
  steps: number;
  /** Facing code (MapDirection 0–7) of the cheapest attacker-cell → target-cell pair. */
  dir: number;
  /** The target cell of the cheapest pair (the footprint cell the attacker would strike). */
  targetCell: GridPos;
}

/**
 * `Rebuild_SortedCombatantList` (sub_738D8; spec §3) — rank `candidates` for the acting `actor` by the
 * cheapest footprint-cell→footprint-cell reach, then sort:
 *   1. `steps` ascending  — nearest (in half-steps) first.
 *   2. `dir` ascending    — lower facing-code first.
 *   3. `dir % 2`          — even (orthogonal) approach before odd (diagonal).
 * Footprints make a Large (2×2) target reachable from any of its four cells (exact multi-cell reach, not
 * centre-to-centre). The random AI target pick (ovr010) draws from THIS ordered list; the UI walks it to
 * highlight "the nearest enemy." Pure ordering — no height/LOS gate here (callers add reach filtering).
 */
export function sortedCombatants<T extends SortableCombatant>(
  actor: SortableCombatant,
  candidates: readonly T[],
): SortedEntry<T>[] {
  const attackerCells = cellsForSize(actor.pos, actor.size ?? 1);
  const entries: SortedEntry<T>[] = [];
  for (const c of candidates) {
    const targetCells = cellsForSize(c.pos, c.size ?? 1);
    let best = Infinity;
    let bestDir = 8;
    let bestTarget = c.pos;
    for (const tp of targetCells) {
      for (const ap of attackerCells) {
        const r = steppingPathDistance(ap, tp);
        if (r < best) { best = r; bestDir = combatDirection(ap, tp); bestTarget = tp; }
      }
    }
    entries.push({ combatant: c, steps: best, dir: bestDir, targetCell: bestTarget });
  }
  entries.sort((a, b) => a.steps - b.steps || a.dir - b.dir || (a.dir % 2) - (b.dir % 2));
  return entries;
}
