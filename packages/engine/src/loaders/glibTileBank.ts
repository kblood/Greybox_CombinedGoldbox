/**
 * Amiga GLIB 8X8D tile banks — adapt a decoded {@link GlibArchive} into the per-block-id
 * {@link TileSet} shape `loadDungeonWalls` consumes, so a DataLib-era Amiga port's wall art can
 * drive the SAME dungeon geometry its DOS counterpart does.
 *
 * A DOS `8X8D{area}.DAX` hands out one self-contained compressed bank per block id. An Amiga
 * `8X8D.TLB` GLIB master instead holds N leaf sets walked in order, whose members are only
 * meaningful in the context of the master's header and colour tables — so the adapter decodes the
 * master once and answers by set, via `DungeonWallSources.tileSetForBlock`.
 *
 * Two things map the sets onto DOS block ids:
 *
 *   1. The master's **id table** (member 0 when `magic === 1`): big-endian `uint16 count` followed
 *      by `count` big-endian `(blockId, setIndex)` pairs. Pools of Darkness's is
 *      `06 | (1,1) (2,2) (3,3) (4,4) (5,5) (6,6)`, i.e. exactly the DOS `8X8D1.DAX` block ids.
 *   2. Failing that, positional order: `set01` is the lowest DOS block id present, and so on. This
 *      is a fallback, and `idTableUsed` on the result records which of the two applied so a caller
 *      never has to guess which mapping it got.
 *
 * WHY this is a faithful swap and not an approximation, measured on Pools of Darkness:
 *   - Amiga `WALLDEF.GLB`'s 6 records are BYTE-IDENTICAL to DOS `WALLDEF1.DAX` blocks 1..6
 *     (2340 bytes each), so the tile *indices* the geometry names are the same numbers.
 *   - Both platforms' banks hold 256 tiles of 8x8, so an index valid on one is valid on the other.
 * Where a title does NOT satisfy that, `glibTileBanks` still returns what it found and the caller
 * is expected to check `tileCount` before offering an art toggle — a bank of the wrong size would
 * index off the end and render garbage rather than fail loudly.
 */
import type { IndexedImage, Palette, TileSet } from '../model/index.js';
import type { GlibArchive } from './glib.js';

/** One Amiga tile bank, keyed by the DOS 8X8D block id it stands in for. */
export interface GlibTileBanks {
  /** Decoded banks by DOS block id. */
  banks: Map<number, TileSet>;
  /** True when the master's own id table supplied the mapping (rather than positional order). */
  idTableUsed: boolean;
  /** Set labels seen in walk order, e.g. `['set01', 'set02']` — for diagnostics. */
  setLabels: string[];
}

const SET_LABEL = /^(set\d+)_/;

/**
 * Read a GLIB master's leading id table: BE `uint16 count`, then `count` BE `(id, index)` pairs.
 * Returns null when `raw` is not that shape, which is the signal to fall back to positional order.
 */
export function readGlibIdTable(raw: Uint8Array): Map<number, number> | null {
  if (raw.length < 2) return null;
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const count = view.getUint16(0, false);
  if (count === 0 || 2 + count * 4 > raw.length) return null;
  const out = new Map<number, number>();
  for (let i = 0; i < count; i++) {
    const id = view.getUint16(2 + i * 4, false);
    const index = view.getUint16(4 + i * 4, false);
    out.set(id, index);
  }
  return out;
}

/**
 * Group a decoded GLIB tile master's images into per-DOS-block-id {@link TileSet}s.
 *
 * `idTable` is the master's raw member 0 when the caller has it (see {@link readGlibIdTable});
 * pass null to force positional mapping against `fallbackBlockIds`, which must then be the DOS
 * block ids in ascending order.
 */
export function glibTileBanks(
  archive: GlibArchive,
  idTable: Uint8Array | null,
  fallbackBlockIds: readonly number[] = [],
  fallbackPalette: Palette | null = null,
): GlibTileBanks {
  const bySet = new Map<string, IndexedImage[]>();
  const setLabels: string[] = [];
  for (const member of archive.images) {
    const m = SET_LABEL.exec(member.label);
    // A leaf (non-master) TILE container has no set prefix; treat the whole file as one set.
    const key = m ? m[1] : 'set01';
    if (!bySet.has(key)) {
      bySet.set(key, []);
      setLabels.push(key);
    }
    // Some wall masters carry no colour table at all: Pools' `8X8D.TLB` embeds one per set, but
    // Gateway's `Walls.tlb` is 5-plane art with the game palette living in a different container
    // (`Always.tlb`). `decodeGlib`'s own `fallbackPalette` deliberately only covers 4-plane sets,
    // so the caller supplies it here instead. Only fills a genuine absence — a set that ships its
    // own table always keeps it.
    const image =
      fallbackPalette && !member.image.palette ? { ...member.image, palette: fallbackPalette } : member.image;
    bySet.get(key)!.push(image);
  }

  const parsed = idTable ? readGlibIdTable(idTable) : null;
  const banks = new Map<number, TileSet>();

  const makeSet = (name: string, tiles: IndexedImage[]): TileSet => ({
    name,
    tileWidth: tiles[0]?.width ?? 8,
    tileHeight: tiles[0]?.height ?? 8,
    tiles,
    palette: firstPalette(tiles),
  });

  if (parsed && parsed.size > 0) {
    for (const [blockId, setIndex] of parsed) {
      // The id table indexes MEMBERS of the master, whose member 0 is the id table itself, so
      // set N is `setLabels[N - 1]`. Guard rather than trust: a master whose table points past
      // its own sets is malformed, and silently binding the wrong art would be worse than a gap.
      const label = setLabels[setIndex - 1];
      const tiles = label ? bySet.get(label) : undefined;
      if (tiles && tiles.length) banks.set(blockId, makeSet(`${archive.name}#${blockId}`, tiles));
    }
    if (banks.size > 0) return { banks, idTableUsed: true, setLabels };
  }

  const ids = [...fallbackBlockIds].sort((a, b) => a - b);
  setLabels.forEach((label, i) => {
    const blockId = ids[i];
    if (blockId === undefined) return;
    const tiles = bySet.get(label)!;
    if (tiles.length) banks.set(blockId, makeSet(`${archive.name}#${blockId}`, tiles));
  });
  return { banks, idTableUsed: false, setLabels };
}

function firstPalette(tiles: readonly IndexedImage[]): Palette | null {
  for (const t of tiles) if (t.palette) return t.palette;
  return null;
}

/** Verdict from {@link bankSwapParity}. `reason` is non-null exactly when `ok` is false. */
export interface BankSwapParity {
  ok: boolean;
  reason: string | null;
}

/**
 * A tile of one flat colour — how BOTH platforms pad a wall-piece slot the geometry never uses.
 *
 * Deliberately transparency-agnostic. The obvious version of this predicate ("every pixel is 0 or
 * `transparentIndex`") is wrong here, because the two platforms do not share a transparency
 * convention: DOS Pools banks report `transparentIndex` 13, DOS Gateway banks report null, and
 * every Amiga GLIB bank reports 255. Measuring "blank" that way compares a different thing on each
 * side — it reported 4 phantom mismatches on Pools (a swap this engine has shipped and verified)
 * and inflated Gateway's real 4-slot disagreement into a claimed 45-72. Flatness is a property of
 * the pixels alone, so it means the same thing on both platforms.
 *
 * Flat pads are not necessarily black-on-black, and they do not need to be: Gateway's DOS banks pad
 * with index 0 and its Amiga banks pad with index 19, and `Always.tlb`'s palette resolves 19 to
 * #000000 — the same pixel the DOS pad produces.
 */
function isFlatTile(t: IndexedImage): boolean {
  const px = t.indices;
  for (let i = 1; i < px.length; i++) if (px[i] !== px[0]) return false;
  return true;
}

function flatSlots(tiles: readonly IndexedImage[], upTo: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < upTo; i++) if (isFlatTile(tiles[i])) out.push(i);
  return out;
}

/**
 * Can `amiga` stand in for `dos` slot-for-slot under the SAME WALLDEF geometry?
 *
 * A byte-identical WALLDEF proves both platforms name the same tile *numbers*; it does not prove
 * those numbers select corresponding tiles. That only holds when the two banks agree on shape and
 * on which slots are padding rather than art.
 *
 * Two allowances come straight from the retail bytes:
 *
 *   - **A trailing pad tile is fine.** Gateway's four big Amiga banks hold 211 tiles against DOS's
 *     210, and tile 210 is flat padding in all four. A 210-tile geometry never names index 210, so
 *     the excess cannot reach the screen. Excess tiles that are NOT flat are rejected — those would
 *     mean the two banks are differently structured, not merely differently padded.
 *   - **Alignment is checked implicitly.** A bank whose art were shifted by a slot would scatter its
 *     flat-slot signature, which this comparison rejects. Measured directly for Gateway: shift 0
 *     agrees 210/210 on banks 30/31/36 while ±1 agrees 203-209.
 *
 * What it still catches is Gateway's bank 15, where DOS pads slots 186-189 flat and the Amiga master
 * has real art there. That is only four slots, but a swap would paint wall where the DOS build paints
 * none — art that looks plausible rather than failing, so nothing downstream would notice. Because
 * `LOAD_PIECES (7,15,30)` mounts bank 15, this is what keeps the Gateway campaign areas on DOS art.
 * The check is deliberately conservative there: it does not ask whether the geometry actually names
 * slots 186-189, only whether the bank is a proven stand-in.
 *
 * This is a NECESSARY condition, not a sufficient one: it cannot detect a bank that is the right
 * shape but the wrong art. Callers should pair it with evidence that the mapping itself is right
 * (an id table, or tiles that survive the port byte-identically).
 */
export function bankSwapParity(dos: TileSet, amiga: TileSet): BankSwapParity {
  if (dos.tileWidth !== amiga.tileWidth || dos.tileHeight !== amiga.tileHeight) {
    return {
      ok: false,
      reason: `tile size ${amiga.tileWidth}x${amiga.tileHeight} vs DOS ${dos.tileWidth}x${dos.tileHeight}`,
    };
  }
  const n = dos.tiles.length;
  if (amiga.tiles.length < n) {
    return { ok: false, reason: `${amiga.tiles.length} tiles vs DOS ${n}` };
  }
  for (let i = n; i < amiga.tiles.length; i++) {
    if (!isFlatTile(amiga.tiles[i])) {
      return { ok: false, reason: `${amiga.tiles.length - n} extra tiles past DOS ${n} are not padding` };
    }
  }
  const d = flatSlots(dos.tiles, n);
  const a = flatSlots(amiga.tiles, n);
  if (d.length !== a.length || d.some((v, i) => v !== a[i])) {
    const only = d.filter((i) => !a.includes(i)).concat(a.filter((i) => !d.includes(i))).sort((x, y) => x - y);
    return { ok: false, reason: `padding slots differ at [${only.slice(0, 8).join(',')}] (${only.length} total)` };
  }
  return { ok: true, reason: null };
}
