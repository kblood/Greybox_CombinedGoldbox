/**
 * Dungeon step events — DOS Champions of Krynn (M2.S3).
 *
 * Wires the ECL `SearchLocation` handler (the 2nd far pointer in the 22-byte header) into the
 * walk loop. On each step the COAB engine runs SearchLocation, which dispatches on the current
 * cell's **wall/roof** value (`mapWallRoof`, the GEO plane-2 backdrop byte = `MapCell.floor`)
 * through an `ON_GOTO` jump table — index 0 (open floor) is the wandering-monster check, other
 * indices are per-cell event scripts (teleports, text, traps, combat). VERIFIED against ECL1
 * block 34: `AND mapWallRoof & 63 → ON_GOTO [0x8287, …]` at vaddr 0x81EF/0x81F8.
 *
 * `primeSearchLocation` returns a VM positioned at the SearchLocation entry with `mapWallRoof`
 * pre-set, so the host owns the run/resume lifecycle (an event may PRINT, then COMBAT or await
 * a menu, then continue). Returns null when the block has no SearchLocation handler. Pure —
 * pass a persistent `memory` map to carry area state across steps.
 */
import { EclVm, type EclVmOptions } from '../ecl/vm.js';
import { parseEclHeader, ECL_GEN1, type EclDialect } from '../ecl/disassemble.js';
import type { Direction } from '../model/index.js';

/**
 * Absolute game-data address of `mapWallRoof` — a scratch the **Gen1** (CoK/DoK) SearchLocation
 * handler dispatches an `ON_GOTO` on, but which the ECL itself *derives* from the cell-descriptor
 * byte: ECL1 block 34's `AND 0xc04f, #63, 0x7f79` writes `[0x7f79] = [0xc04f] & 63` then
 * `ON_GOTO [0x7f79]` (byte-verified from the block-34 disassembly @0x81EF/0x81F8). So the host must
 * seed the cell byte at {@link MAP_CELL_BYTE_ADDR}; we ALSO write it here for any block that reads
 * `[0x7f79]` directly without the AND.
 */
export const MAP_WALL_ROOF_ADDR = 0x7f79;

/**
 * Absolute game-data address of the **Gen1 cell-descriptor byte** — the real per-cell value the
 * engine populates from the GEO before SearchLocation runs, and the ECL masks down to the event
 * index. Byte-verified: ECL1 block 34 reads it at `AND 0xc04f, #63, 0x7f79`. (This is the Gen1
 * analogue of DQK Gen2's {@link DQK_CELL_DESC_ADDR}.) Discovered while fixing the arithmetic
 * operand order (`execArith`): with the COAB-correct `dest = last operand`, the ON_GOTO index is
 * derived from `[0xc04f]`, so seeding only `[0x7f79]` no longer reaches the per-cell rooms.
 */
export const MAP_CELL_BYTE_ADDR = 0xc04f;

/**
 * Absolute game-data address of the **Gen1 map direction** byte/word. Pool's retail
 * `vm_GetMemoryValue` switch maps `0xC04D` to its DGROUP direction byte at `0x6AAF`;
 * `0xC04E` is the wall type and `0xC04F` is the current GEO descriptor.
 *
 * **The ECL-visible value is the HALF-direction ordinal `0=N, 1=E, 2=S, 3=W`** — the host
 * STORES even Gold Box direction codes (`0/2/4/6`) in DGROUP, but the `vm_GetMemoryValue`
 * read path halves it before the script sees it ("direction (`0/2/4/6`; ECL reads
 * half-direction)", `docs/engine/research/gen1-dosbox-runtime-trace.md`), and DoK's own
 * position-setter disassembly shows the mirror-image write path (ECL `0/1/2/3` remapped to
 * stored `0/2/4/6`, `tools/trace_dok_position_setter.ps1`). The retail ECL corpus is
 * unanimous on the 0..3 model: across all five Gen1 DAX titles every `SAVE`-immediate to
 * `[0xC04D]` is 0..3, every facing `COMPARE` immediate is 0..3, and Pool/CoAB both dispatch
 * `ON_GOTO [0xC04D], #4` — a 4-way jump that would be out of range under stored `0/2/4/6`
 * (2026-07-22 census over every statically reachable `[0xC04D]` reference; see
 * `docs/engine/research/dok-natural-route.md` Update 14).
 */
export const MAP_DIRECTION_ADDR = 0xc04d;

/** Low 6 bits of the backdrop byte select the event; the high 2 bits are unrelated flags. */
export const EVENT_INDEX_MASK = 0x3f;

/**
 * Map a host {@link Direction} to the Gen1 **ECL-visible** map-direction ordinal
 * (`0=N,1=E,2=S,3=W`) seeded at {@link MAP_DIRECTION_ADDR}.
 *
 * Until 2026-07-22 this returned the host's STORED even codes (`0/2/4/6`) — a real fidelity
 * bug in the ECL-visible memory space (the VM's memory models what `vm_GetMemoryValue`
 * RETURNS to the script, which is the halved ordinal — see {@link MAP_DIRECTION_ADDR}'s doc).
 * Under the old values every retail facing gate except north (identical in both models) could
 * never fire: e.g. DoK `ECL2.DAX#67`'s town-square ambush (`COMPARE #1, [0xC04D]` = "facing
 * east") was unreachable through the production `facing:` option.
 */
export function gen1MapDirectionValue(facing: Direction): number {
  const map: Record<Direction, number> = { north: 0, east: 1, south: 2, west: 3 };
  return map[facing] ?? 0;
}

/**
 * DQK (Gen2) **cell-descriptor** + facing data addresses the SearchLocation / vmRun1 dispatch reads.
 *
 * **Corrected model (C4.2b-2b-2c-iii(b), byte-verified from `ECL.GLB`):** DQK does NOT dispatch on
 * party coordinates. Its per-cell events are selected from the packed cell-descriptor byte
 * `[0x002d]` (the engine populates it from the GEO backdrop plane each step). The script masks it —
 * e.g. area 18 `AND 0x002d, #127, 0x00bf` then dispatches on `[0xbf]`, and a `group =
 * ([0x002d] & 0x70) / 16` / `index = [0x002d] & 0x0F` two-level ON_GOTO; area 30 does
 * `GOSUB …; ON_GOTO [0x00ca]` where `[0xca]` derives from `[0x002d]`. `[0x002d]` is only ever READ
 * by ECL (52 reads, 0 writes across all 47 area blocks), confirming it is host-populated. Facing
 * `[0x0011]` is a RAW ORDINAL (area 18 `COMPARE_AND … [0x0011], #2` = south). `0x1B` = area number.
 *
 * The earlier "coordinate dispatch" (`0xBF`=X / `0xC0`=Y) was an **artifact of the buggy `execArith`
 * operand order** — with it fixed, `0xBF`/`0xC0` are revealed as plain scratch the ON_GOTO chains
 * reuse, not the party pose. See `docs/engine/research/dqk-vmrun1-cooldown-c4.2b-2b-2c-iii.md`.
 */
export const DQK_CELL_DESC_ADDR = 0x002d;
export const DQK_FACING_ADDR = 0x0011;
export const DQK_AREA_ADDR = 0x1b;
/** @deprecated Scratch, not the party pose — kept only so old seeds don't error. */
export const DQK_PARTY_X_ADDR = 0xbf;
/** @deprecated Scratch, not the party pose — see {@link DQK_CELL_DESC_ADDR}. */
export const DQK_PARTY_Y_ADDR = 0xc0;

/** Map a host {@link Direction} to the raw ordinal the DQK ECL stores in {@link DQK_FACING_ADDR}
 * (north=0, east=1, south=2, west=3 — byte-verified: area 18 tests `[0x0011] == #2` for south). */
export function dqkFacingValue(facing: Direction): number {
  const map: Record<Direction, number> = { north: 0, east: 1, south: 2, west: 3 };
  return map[facing] ?? 0;
}

/**
 * Build the Gen2 `seedMemory` for the cell the party stands on: the **cell-descriptor byte**
 * `[0x002d]` (from the GEO backdrop plane), facing `[0x0011]`, and the area number `[0x1b]`. This
 * is what the corrected vmRun1 / SearchLocation dispatch actually reads. `areaId` defaults are
 * masked to a byte. (The old name `dqkPositionSeed` is kept as a thin alias below.)
 */
export function dqkVmRun1Seed(
  cellDesc: number,
  facing: Direction,
  areaId: number,
): Record<number, number> {
  return {
    [DQK_CELL_DESC_ADDR]: cellDesc & 0xff,
    [DQK_FACING_ADDR]: dqkFacingValue(facing),
    [DQK_AREA_ADDR]: areaId & 0xff,
  };
}

/**
 * @deprecated The DQK dispatch is cell-descriptor based, not coordinate based (see
 * {@link DQK_CELL_DESC_ADDR}). Retained for callers/tests that still pass (x,y); it now only seeds
 * the area number (the X/Y addresses are scratch). Prefer {@link dqkVmRun1Seed}.
 */
export function dqkPositionSeed(_x: number, _y: number, areaId: number): Record<number, number> {
  return { [DQK_AREA_ADDR]: areaId & 0xff };
}

export interface SearchLocationOptions extends Omit<EclVmOptions, 'entry'> {
  /** Current party facing for host-populated direction state. Gen1 seeds `[0xc04d]`; Gen2 callers
   * should prefer {@link dqkVmRun1Seed}, which writes `[0x0011]` directly. */
  facing?: Direction;
  /**
   * Extra game-data addresses to pre-seed before the run, `{ address: value }`. Used by the Gen2
   * (DQK) path to write the party's position/area into the script's data segment so its
   * coordinate dispatch sees where the party is. Values are masked to 16 bits.
   */
  seedMemory?: Record<number, number>;
}

/**
 * Position a VM at `block`'s SearchLocation handler for the cell the party just entered. The
 * caller drives it (`vm.run()`, then `resume()` on combat/menu pauses) and reads the emitted
 * effects.
 *
 * Dialect-aware: with the default Gen1 dialect the cell `backdrop` byte (GEO plane-2 /
 * `MapCell.floor`) is written to `mapWallRoof` (the byte the CoK/DoK handler dispatches on);
 * with the Gen2 (DQK) dialect — pass `opts.dialect = ECL_GEN2` — `backdrop` is ignored and the
 * party position/area is supplied through `opts.seedMemory` instead. The header length and
 * virtual base both follow the dialect.
 *
 * Returns null when the block exposes no SearchLocation (the header pointer is absent or out of
 * range) — i.e. a non-dungeon block with no per-step events.
 */
export function primeSearchLocation(
  block: Uint8Array,
  backdrop: number,
  opts: SearchLocationOptions = {},
): EclVm | null {
  const dialect: EclDialect = opts.dialect ?? ECL_GEN1;
  if (block.length < dialect.headerLen) return null;
  const { searchLocation } = parseEclHeader(block, dialect);
  // Both dialects dispatch the per-cell event off a host-populated cell-descriptor byte. Gen1
  // (CoK/DoK): seed the cell byte at 0xc04f (the ECL derives 0x7f79 via AND #63); also seed 0x7f79
  // directly for blocks that read it without the AND. Gen2 (DQK): seed the packed descriptor at
  // 0x002d. The caller may still pass position/facing/area via seedMemory (applied after `extra`).
  const extra: Record<number, number> = dialect.hasMagic
    ? {
        [MAP_DIRECTION_ADDR]: gen1MapDirectionValue(opts.facing ?? 'north'),
        [MAP_CELL_BYTE_ADDR]: backdrop & 0xff,
        [MAP_WALL_ROOF_ADDR]: backdrop & EVENT_INDEX_MASK,
        // Titles whose host registers live in the low window read facing from their own address
        // (Treasures: [0x0011]) — see EclDialect.facingAddr. A no-op extra write for every dialect
        // that leaves it undefined, and it never displaces the 0xc04d seed above.
        ...(dialect.facingAddr !== undefined
          ? { [dialect.facingAddr]: gen1MapDirectionValue(opts.facing ?? 'north') }
          : {}),
        // Treasures' own dialect (ECL_GEN1_SHORT_TREASURES) reads its descriptor from a different
        // address entirely — see EclDialect.cellDescAddr's doc comment. A no-op extra write for
        // every dialect that leaves it undefined.
        ...(dialect.cellDescAddr !== undefined ? { [dialect.cellDescAddr]: backdrop & 0xff } : {}),
      }
    : { [DQK_CELL_DESC_ADDR]: backdrop & 0xff };
  return primeHandler(block, dialect, searchLocation, opts, extra);
}

/**
 * Position a VM at `block`'s **vmRun1** handler — the per-step *main loop* (the 1st far pointer in
 * the header), which the COAB engine runs every walk step *before* SearchLocation. Unlike
 * SearchLocation, vmRun1 dispatches on the packed GEO cell-descriptor word `[0x002d]` and facing
 * `[0x0011]` (plus the area's encounter tickers / cooldown `[0x0097]`) rather than a single
 * backdrop byte, so there is no `backdrop` parameter — the caller supplies position/facing/cell
 * through `opts.seedMemory`. Confirmed against the real `ECL.GLB`: areas 5/18/22/23/30/66 all expose
 * an in-range vmRun1 pointer (e.g. area 66 @ 0x8592, area 18 @ 0x833e, area 5 @ 0x8429 — matching
 * `docs/engine/research/combat-trigger-c4.2b-2b-2b.md` §5/§6) and run to a clean `exited`/`halted`
 * under naive position seeding (no spurious combat).
 *
 * Returns null when the block exposes no vmRun1 (pointer absent or out of range).
 */
export function primeVmRun1(block: Uint8Array, opts: SearchLocationOptions = {}): EclVm | null {
  const dialect: EclDialect = opts.dialect ?? ECL_GEN1;
  if (block.length < dialect.headerLen) return null;
  const { vmRun1 } = parseEclHeader(block, dialect);
  return primeHandler(block, dialect, vmRun1, opts);
}

/**
 * Shared primer: range-check a header far-pointer `vaddr`, seed the shared memory map (the
 * dialect-specific `extra` writes first, then the caller's `seedMemory`), and build the VM at that
 * entry. Returns null when the entry is out of range. Used by both {@link primeSearchLocation} and
 * {@link primeVmRun1} so they carry identical seeding/lifecycle semantics.
 */
function primeHandler(
  block: Uint8Array,
  dialect: EclDialect,
  vaddr: number,
  opts: SearchLocationOptions,
  extra?: Record<number, number>,
): EclVm | null {
  const entry = vaddr - dialect.vbase;
  if (entry < dialect.headerLen || entry >= block.length) return null;

  const memory = opts.memory ?? new Map<number, number>();
  if (extra) {
    for (const key of Object.keys(extra)) memory.set(Number(key), extra[Number(key)] & 0xffff);
  }
  if (opts.seedMemory) {
    for (const key of Object.keys(opts.seedMemory)) {
      memory.set(Number(key), opts.seedMemory[Number(key)] & 0xffff);
    }
  }
  return new EclVm(block, { ...opts, memory, entry });
}
