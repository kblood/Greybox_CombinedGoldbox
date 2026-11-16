/**
 * Engine-neutral asset model (layer 3) — the in-memory data model every loader
 * decodes *into* and the engine consumes. No type here references a file format.
 *
 * Shaped after the richest generation (DQK/HLIB — 256-color, per-image palette,
 * per-frame placement offsets, transparency); older EGA (DAX) and Amiga (DAA)
 * formats convert *up* into it losslessly. See docs/web-engine/asset-model.md.
 *
 * Phase 1 implements the graphics-relevant types (Palette, IndexedImage,
 * FrameSet, TileSet, SpriteSet). Non-graphics types (maps, tables, scripts,
 * sound, LoadedGame) are stubbed below with comments for later phases.
 */

// ---------------------------------------------------------------------------
// Core graphics types
// ---------------------------------------------------------------------------

/** An RGB color, 0..255 per channel (already scaled — no DAC/×17/×4 left to do). */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Color-cycling band (HLIB only; empty elsewhere). */
export interface ColorCycle {
  dir: number;
  speed: number;
  start: number;
  count: number;
}

export type PaletteSource =
  | 'ega-fixed'
  | 'amiga-12bit'
  | 'hlib-range'
  | 'iff-cmap'
  /**
   * Gateway to the Savage Frontier's VGA-extended DAX "picture" frame format
   * (`loaders/daxVgaPicture.ts`), where the block's own extended palette could not be
   * read: EGA16 for indices 0..15 plus the two independently-proven DAC registers 16/17,
   * with 18..31 left `null` rather than guessed.
   */
  | 'dax-vga-ext-partial'
  /**
   * The same format with all of 16..31 read from the 24 nibble-packed bytes ending at the
   * block's pixel offset — the DAC contents `GAME.OVR` builds per picture at runtime
   * (resolved 2026-08-11; see `loaders/daxVgaPicture.ts` and
   * `docs/engine/research/gateway-vga-picture-format.md`).
   */
  | 'dax-vga-ext'
  /** Gateway attract-screen DAC values recovered by deterministic native-frame matching. */
  | 'gateway-native-demo'
  | 'gateway-native-combat'
  /**
   * Amiga GLIB colour table (`loaders/glib.ts`): fixed 32-entry, full 8-bit RGB
   * (indices 0..31). See docs/glib-format.md.
   */
  | 'glib-ctab'
  /**
   * Treasures of the Savage Frontier / Pools of Darkness "chunky VGA256 title"
   * DAX picture format (`loaders/daxVga256Title.ts`): a full embedded 256-entry
   * 6-bit-DAC palette, all 256 slots defined. See that module's doc comment and
   * `docs/engine/research/treasures-pools-darkness-scoping.md` §2.
   */
  | 'dax-vga256-title'
  /** Late Gen1 embedded-palette chunky item arrays (UI, pictures, CPIC, DUNGCOM). */
  | 'dax-vga-chunky-items'
  /** Late Gen1 PIC portrait with an embedded DAC range and flat DRAW18 stream. */
  | 'dax-vga-compressed-picture'
  /**
   * Treasures of the Savage Frontier `8X8D1.DAX`-family "mode 2" wall-tile bank
   * (`loaders/daxTreasures8x8dTile.ts`): a partial palette occupying
   * `[firstColor, firstColor+count)` (VGA DAC registers 32..143 for the real
   * retail file), 6-bit DAC scaled to 8-bit. Indices 0..15 are real pixel content
   * (mortar-line bands) whose true color this format does not carry — see that
   * module's doc comment and `docs/engine/research/treasures-8x8d1-thirdformat.md`.
   */
  | 'dax-8x8d-treasures-mode2'
  /**
   * Late Gen1 "palette-only" record (`loaders/daxVgaPaletteRecord.ts`): a fixed 223-colour
   * 6-bit-DAC palette at base 0x20 with zero width/height and no pixel data at all — Treasures
   * of the Savage Frontier `PIC1`/`PIC1A`/`OVER.DAX`. See that module's doc comment.
   */
  | 'dax-vga-palette-record';

/**
 * A 256-entry palette. Entries the source didn't define are null (so a renderer
 * can detect "inherit from previously loaded palette"). EGA loaders fill 0..15;
 * Amiga fill 0..31; HLIB fill only [first_col, first_col+ncolors).
 */
export interface Palette {
  /** 256 slots; null = undefined-by-this-source (inherit at render time). */
  colors: (RGB | null)[];
  /** Optional color-cycling ranges (HLIB only; empty elsewhere). */
  cycles?: ColorCycle[];
  /** Provenance for debugging / layering decisions. */
  source: PaletteSource;
  /** For hlib-range: index of first defined color. */
  firstColor?: number;
  /** For hlib-range: number of defined colors. */
  count?: number;
}

/**
 * One decoded image / frame. Pixels are palette indices, row-major,
 * width*height bytes, top-left origin. Placement offsets are the source's
 * signed hints. Index 255 is the convention for transparent.
 */
export interface IndexedImage {
  width: number;
  height: number;
  /** width*height palette indices, row-major, top-left origin. */
  indices: Uint8Array;
  /** Placement hints from the frame header (default 0). */
  xOffset: number;
  yOffset: number;
  /** Index treated as transparent (default 255). null = fully opaque. */
  transparentIndex: number | null;
  /**
   * Palette to draw this image with. May be partial (inherit nulls). If null,
   * the engine uses the currently-loaded contextual palette.
   */
  palette: Palette | null;
  /** Source drawing method / encoding, kept for diagnostics. */
  encoding?: string;
}

export type AssetKind =
  | 'bigpic'
  | 'pic'
  | 'cpic'
  | 'back'
  | 'sprite'
  | 'comspr'
  | 'tile8x8'
  | 'walldef'
  | 'title'
  | 'frame-ui'
  | 'topview'
  | 'cbody'
  | 'chead'
  | 'cursor'
  | 'sky'
  | 'unknown';

/** A named container of frames, addressed by the source block/image id. */
export interface FrameSet {
  /** Stable id: source filename stem, e.g. "BIGPIC1". */
  name: string;
  /** Keyed by the source's sparse block_id (DAX/DAA) or positional index (HLIB). */
  frames: Map<number, IndexedImage>;
  /** Coarse category from the manifest / filename heuristic. */
  kind: AssetKind;
}

// ---------------------------------------------------------------------------
// Tiles & sprites (engine-level groupings over IndexedImage)
// ---------------------------------------------------------------------------

/**
 * A set of fixed-size tiles (8x8 dungeon tiles, wall textures). DAX/DAA store
 * these as vertical strips that the loader splits into uniform cells.
 * NOTE: 8x8 tile plane-order / shared palette is UNSOLVED for DAX & DAA; the
 * loader still produces correctly-sized cells, only the colors may be wrong.
 */
export interface TileSet {
  name: string;
  /** 8 (or 16-wide DAX strip pairs) / wall width. */
  tileWidth: number;
  tileHeight: number;
  tiles: IndexedImage[];
  palette: Palette | null;
}

/** A logical sprite (one creature/NPC), possibly multiple animation frames. */
export interface Sprite {
  id: number;
  frames: IndexedImage[];
}

export interface SpriteSet {
  name: string;
  sprites: Map<number, Sprite>;
  palette: Palette | null;
}

// ---------------------------------------------------------------------------
// Non-graphics types — STUBBED for later phases (Phase 3+).
// Full interfaces are specified in docs/web-engine/asset-model.md and will be
// implemented when the GEO/MON/ITEM/ECL/sound loaders are ported.
// ---------------------------------------------------------------------------

// --- Maps (GEO) — engine-neutral grid the GEO decoder (M1.S4) decodes *into*
// and the exploration engine (src/world/explorer.ts) walks. Gold Box dungeons are
// square grids (typically 16×16) with a wall value per cell edge; wilderness maps
// reuse the same structure at larger sizes. ---

/** The four cardinal facings, clockwise (turnRight = +1 mod 4). */
export type Direction = 'north' | 'east' | 'south' | 'west';

/** Clockwise order used for turn math and (dx,dy) lookup. */
export const DIRECTIONS: readonly Direction[] = ['north', 'east', 'south', 'west'];

/**
 * Declares that stepping off a cell's edge in a given direction should dispatch a host-level
 * "exit map" trigger — Gold Box's `vm_run_1` "DO YOU WISH TO LEAVE?" prompt (`tried_to_exit_map`,
 * `[0x7ed5]` in CoK's ECL2 block 50) is the first proven case — instead of the plain `blocked:
 * 'edge'` bump `Explorer` has always returned. NOT derived from the GEO decoder: GEO carries no
 * such flag, since the retail engine computes this condition itself, at the host level, whenever a
 * step would leave the map's boundary. A host (a `GameData` profile, in Greybox's browser app)
 * attaches this from out-of-band research into which game/area treats its perimeter this way — see
 * `markMapEdgeExits` for the usual bulk-apply-to-the-whole-perimeter helper. Engine-neutral by
 * design: carries no ECL specifics itself, just an opaque `kind` tag plus a `meta` payload the host
 * defines and reads back off {@link StepResult.edgeExit} — the engine never interprets either.
 */
export interface EdgeExit {
  /** Opaque host-defined tag for what this exit represents, e.g. `'vm_run_1'`. Not interpreted by the engine. */
  kind: string;
  /** Opaque host-defined payload (e.g. ECL `seedMemory` overrides the host should prime its VM with). */
  meta?: Record<string, unknown>;
}

/**
 * One map cell. `walls` holds the edge value in each cardinal direction:
 * 0 = passable; >0 = a wall/door graphic id (the renderer maps it to a wall
 * texture; doors block movement unless the engine opens them). Floor/ceiling/event
 * are optional and filled by the GEO decoder when present.
 */
export interface MapCell {
  walls: Record<Direction, number>;
  /**
   * Per-edge door flag (GEO plane-3, 2 bits/direction): 0 = plain wall/open,
   * 1 = door, 2 = gateway/special door. A non-zero door on a walled edge is a
   * passage the party can step through (the wall slot is the door's graphic).
   */
  doors?: Record<Direction, number>;
  /**
   * Per-edge "door unlocked/open" state, persisted in the GEO cell across re-entry
   * (ovr015 `MapSetDoorUnlocked`: the cell's `x3` byte holds four direction bits
   * `x3_dir_{0,2,4,6}` = N/E/S/W). A bash/pick/knock success sets the matching bit so a
   * now-open locked door stays open when the party leaves and comes back. Absent/false =
   * the door is in its default (closed/locked) state. Sparse — only opened edges appear.
   */
  doorsOpen?: Partial<Record<Direction, boolean>>;
  /** Floor tile id (optional; 0/undefined = default). */
  floor?: number;
  /** Ceiling tile id (optional). */
  ceiling?: number;
  /** Non-zero links this cell to an ECL event/special (GEOEVENT). */
  event?: number;
  /** Raw per-cell flag bits preserved from the source for later interpretation. */
  flags?: number;
  /**
   * Per-edge {@link EdgeExit} declarations — sparse; only cells whose outward edge should dispatch
   * a host-level "exit map" trigger carry an entry (see `markMapEdgeExits`). Every other boundary
   * cell keeps the plain `blocked: 'edge'` bump `Explorer` has always returned.
   */
  edgeExits?: Partial<Record<Direction, EdgeExit>>;
}

/** A named start/teleport position on a map. */
export interface MapEntry {
  id: number;
  x: number;
  y: number;
  facing: Direction;
}

/** An engine-neutral dungeon/wilderness map. Cells are row-major, index = y*width+x. */
export interface GameMap {
  /** Source name/id (e.g. "GEO1#3"). */
  name: string;
  width: number;
  height: number;
  cells: MapCell[];
  /** Known entry points (start squares, stair links). */
  entries: MapEntry[];
  /** True if walls are stored once per edge and shared between adjacent cells. */
  sharedEdges?: boolean;
}

// export interface Monster { ... }        // Monster tables — Phase 5
// export interface Item { ... }           // Item tables — Phase 3
// export interface StringTable { ... }    // 6-bit packed strings — Phase 3
// export interface Script { ... }         // ECL bytecode — Phase 4
// export interface Sound { ... }          // XMI/VOC/DIG4 audio — later

// ---------------------------------------------------------------------------
// Whole-game view (manifest aggregate) — graphics-only for now.
//
// A manifest names a game and groups its asset files by a coarse `category`
// (title/scenes/portraits/backdrops/tiles/sprites/ui/...). `loadGame` fetches
// and `decodeAsset`s each graphics file and assembles the structure below,
// capturing per-file errors and "not decoded" files instead of throwing. The
// engine renders the decoded image frames grouped by category. Non-graphics
// files (maps/monsters/items/scripts) are listed but skipped (decode === false).
// ---------------------------------------------------------------------------

/** The coarse category buckets a manifest groups files into. */
export type GameCategory =
  | 'title'
  | 'scenes'
  | 'portraits'
  | 'backdrops'
  | 'tiles'
  | 'sprites'
  | 'ui'
  | 'data';

/** Display profile: native render size + scaling intent. */
export interface DisplayProfile {
  /** Native framebuffer width (e.g. 320). */
  width: number;
  /** Native framebuffer height (e.g. 200). */
  height: number;
  /** Pixel aspect ratio (≠1 for non-square Amiga/EGA pixels). 1 = square. */
  pixelAspect?: number;
  /** Default integer zoom for the viewer. */
  defaultZoom?: number;
}

/** One decoded image frame within a loaded file, with a stable label. */
export interface GameFrame {
  /** Human label, e.g. "BIGPIC1 · block 114" or "TITLE.TLB · img003". */
  label: string;
  image: IndexedImage;
  /** Source drawing method / encoding diagnostic (e.g. "hlib-method18"). */
  encoding?: string;
}

/** Result of loading one manifest file: either decoded frames, a skip, or an error. */
export interface GameFileResult {
  /** Manifest-relative source path, e.g. "DISK2/BIGPIC.TLB". */
  path: string;
  /** Display name (filename stem). */
  name: string;
  category: GameCategory;
  /** Detected container format ("hlib" | "ilbm" | "daa" | "dax"), or null on skip/error. */
  format: string | null;
  /** Decoded frames (empty when skipped, errored, or genuinely 0-frame). */
  frames: GameFrame[];
  /** Set when the file was intentionally not decoded (decode:false in manifest). */
  skipped?: string;
  /** Set when fetch/decode failed (404, bad format, unsolved encoding, …). */
  error?: string;
}

/** One category bucket: all files of that category and their flattened frames. */
export interface GameCategoryGroup {
  category: GameCategory;
  /** Per-file results, in manifest order. */
  files: GameFileResult[];
  /** Total decoded frames across all files in this category. */
  frameCount: number;
}

/**
 * A `GLBR` music census for a manifest's `MUSIC.DAX`-shaped file(s) (`docs/glbr-format.md`),
 * computed alongside the graphics decode so the dashboard has something to show even though
 * `GLBR` song blocks aren't a `GameCategory` (added round 33 R5 — "solved but unwired",
 * `goldbox-solved-but-unwired.md`).
 */
export interface GameMusicSummary {
  /** Manifest-relative path of the file the census was read from (first score-bearing file). */
  file: string;
  /**
   * Which score format produced the census. Round 34 R4: Matrix Cubed scores with Miles/AIL XMI
   * (`BUCKA/B/C.XMI`), not GLBR, so a census can no longer be labelled "GLBR" unconditionally.
   */
  format: 'glbr' | 'xmi';
  /** GLBR song blocks that decoded cleanly. */
  songs: number;
  /** Total note/rest/control events across every decoded song's every channel. */
  events: number;
  /** Total channel streams across every decoded song. */
  channels: number;
}

/**
 * A DOS `SOUND.DAX` bank census (round 34 R6, `docs/engine/research/cok-dos-sound.md`). CoK and
 * DoK ship a Gen1 DOS sound bank whose block 0 decodes into an event stream that segments at the
 * driver's own stream boundaries. This is a DECODE census only: nothing in the engine plays these
 * events, and R6 found no AdLib or C/MS port immediate in the shipped driver blob, so no claim is
 * made that this bank ever reached sound hardware. The web build's Amiga audio path is unrelated.
 */
export interface GameSoundBankSummary {
  /** Manifest-relative path of the `SOUND.DAX` the census was read from. */
  file: string;
  /** Stream segments the event list split into. */
  segments: number;
  /** Segments passing `isSongLikeSegment` — i.e. plausibly music rather than a one-shot effect. */
  songLike: number;
  /** Total decoded events across the whole bank. */
  events: number;
}

/** The whole-game aggregate the viewer renders. */
export interface LoadedGame {
  id: string;
  title: string;
  platform: string;
  container?: string;
  display: DisplayProfile;
  /** Category groups in canonical display order (only those present). */
  categories: GameCategoryGroup[];
  /** Total decoded frames across every category. */
  totalFrames: number;
  /** Files that errored (404 / decode failure). */
  errors: GameFileResult[];
  /** Files intentionally skipped (decode:false). */
  skipped: GameFileResult[];
  /** `GLBR` music census, present only when a manifest file carried GLBR song blocks. */
  music?: GameMusicSummary;
  /** DOS `SOUND.DAX` bank census, present only when a manifest lists a decodable `SOUND.DAX`. */
  soundBank?: GameSoundBankSummary;
}
