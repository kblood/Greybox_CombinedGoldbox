/**
 * Whole-game manifest loader (Phase 3).
 *
 * A per-game manifest JSON (see web-engine/games/*.json and
 * docs/web-engine/manifest.md) names one game and lists its asset files grouped
 * by a coarse `category` (title/scenes/portraits/backdrops/tiles/sprites/ui/data).
 *
 * `loadGame(manifest, fetchBytes)` fetches each referenced file via the injected
 * `fetchBytes` (so it's testable with a Node fs fetcher and runnable in the
 * browser with a `/@fs` fetcher), `decodeAsset`s the graphics ones, and assembles
 * a `LoadedGame` grouping the decoded frames by category. Per-file errors (404,
 * unrecognized container, unsolved encoding) and intentionally-skipped non-graphics
 * files (decode:false) are captured on the result instead of throwing.
 */
import { decodeAsset, type DecodedAsset } from '../index.js';
import { isDaaTileStrip, decodeDaaTileStrip } from '../loaders/daa.js';
import { decodeGlib, sniffGlib, firstGlibPalette } from '../loaders/glib.js';
import { renderHlibComposite } from '../loaders/hlib.js';
import { readDaxDataBlocks } from '../loaders/dax.js';
import { sniffGlbr, decodeGlbrSong } from '../audio/glbr.js';
import { sniffXmi, decodeXmi } from '../audio/xmi.js';
import { decodeCokSoundBank, isSongLikeSegment } from '../audio/dosSong.js';
import type {
  GameCategory,
  GameFrame,
  GameFileResult,
  GameCategoryGroup,
  GameMusicSummary,
  GameSoundBankSummary,
  LoadedGame,
  DisplayProfile,
  Palette,
} from '../model/index.js';

// ---------------------------------------------------------------------------
// Manifest schema (the on-disk JSON shape)
// ---------------------------------------------------------------------------

/** One asset file entry in a manifest. */
export interface ManifestFile {
  /** Repo-root-relative path to the real game file. Casing matters. */
  path: string;
  /** Category bucket. */
  category: GameCategory;
  /** Optional display label (defaults to the filename). */
  label?: string;
  /**
   * Whether the engine should decode this file now. Defaults to true for
   * graphics categories; set false for not-yet-decoded data (maps/monsters/…).
   */
  decode?: boolean;
  /** Free-form note shown in the UI (e.g. "unsolved sub-frame index"). */
  note?: string;
  /**
   * Per-file override of the manifest-level `paletteFrom` (below). Only consulted for a GLIB
   * (`.TLB`/`.GLB`, big-endian Amiga DataLib) file — resolved through the same `fetchBytes` as
   * `path`, its first embedded colour table (`firstGlibPalette`) is passed as `decodeGlib`'s
   * `fallbackPalette` for THIS file only.
   */
  paletteFrom?: string;
}

/** A complete per-game manifest. */
export interface GameManifest {
  id: string;
  title: string;
  platform: string;
  /** Container family + endianness, e.g. "DAA (big-endian planar)". Informational. */
  container?: string;
  endianness?: 'little' | 'big';
  display: DisplayProfile;
  /**
   * Default GLIB fallback-palette source for every file in this manifest that doesn't set its
   * own `paletteFrom` (a `ManifestFile.paletteFrom` always wins over this). Path resolved the
   * same way as any `files[].path` — same fetcher, same root convention. Typically the game's
   * `ALWAYS.TLB`, which every held Amiga GLIB-era title embeds a real colour table in. Ignored
   * for non-GLIB files (decoded via `decodeAsset` as before).
   */
  paletteFrom?: string;
  files: ManifestFile[];
}

/** Injected fetcher: resolve a manifest path to its raw bytes (throws/rejects on 404). */
export type FetchBytes = (path: string) => Promise<Uint8Array>;

/** Canonical display order for category sections. */
export const CATEGORY_ORDER: GameCategory[] = [
  'title',
  'scenes',
  'portraits',
  'backdrops',
  'tiles',
  'sprites',
  'ui',
  'data',
];

// ---------------------------------------------------------------------------
// Frame extraction from a DecodedAsset (mirrors the single-file viewer's logic
// but returns plain GameFrame[] keyed by stable labels).
// ---------------------------------------------------------------------------

function stem(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.replace(/\.[^.]+$/, '');
}

/**
 * Flatten a decoded container into renderable frames. Returns the frames plus an
 * optional `note` describing why some content wasn't rendered (unsolved variants).
 */
/**
 * DAX block kinds whose every frame is surfaced, not just `block.image`.
 *
 * `vga-compressed-picture` joined `animated` on 2026-08-26, when late-Gen1 `SPRIT` blocks started
 * decoding: each is a near/mid/far view-size triple and showing frame 0 alone would have quietly
 * dropped two thirds of them.
 *
 * `vga-chunky-items` joined them later the same day, after the disclosure that it was still
 * truncated forced the re-measurement. Its blocks are fixed-size tile arrays — DUNGCOM/WILDCOM
 * combat backdrops and the BORD/BORDERS frame art — and frame 0 alone hid **716 frames across 33
 * blocks** in the bundled manifests (Treasures 409 in 20 blocks, Pools 307 in 13). The parser
 * already required an exact `pixelStart + itemBytes * count === rawSize` fit, so `count` was never
 * a guess; only the consumer was dropping the tail.
 *
 * That number began life as "5,344 across 52" and was wrong, because it counted the `8X8D*`
 * family from the Python decoder's chunky reading of those bytes. `decodeDax` never sends them
 * here: `parseTreasures8x8dTile` claims them first and reads each block as one tall tile SHEET,
 * which is the GAME.EXE-derived reading and is correct. Two valid readings of the same bytes, and
 * only the routing decides which one a title gets — the browser case pins `8X8D1` at 6 images for
 * 6 blocks precisely so the sheet reading cannot be quietly swapped for the tile one.
 */
const MULTI_FRAME_KINDS: ReadonlySet<string> = new Set([
  'animated',
  'vga-compressed-picture',
  'vga-chunky-items',
]);

/**
 * Round 35 R3 — `bytes` is the file's own on-disk buffer, needed ONLY by the HLIB method-25
 * composite pass: `renderHlibComposite` resolves each part's source through the leaf's pointer
 * table, which lives in the file, not in the decoded archive. Every other branch ignores it.
 *
 * (The GLIB side needs no equivalent argument because an Amiga leaf may be LZW/LZ77-compressed —
 * its members only exist in the decompressed buffer `decodeGlib` builds internally — so
 * `glib.ts` assembles its composites during the walk and hands back the finished image.)
 */
function framesFromDecoded(
  decoded: DecodedAsset,
  name: string,
  bytes: Uint8Array,
): { frames: GameFrame[]; note?: string } {
  const frames: GameFrame[] = [];

  if (decoded.format === 'hlib') {
    const a = decoded.archive;
    if (a.nonImage) {
      return {
        frames,
        note: `non-image HLIB library (tag "${a.tag}") — payload not decoded`,
      };
    }
    for (const m of a.images) {
      frames.push({
        label: `${name} · ${m.label}`,
        image: m.image,
        encoding: m.image.encoding,
      });
    }
    // Method-25 composites (`hackdocs`: "image-id list"). They are deliberately kept out of
    // `archive.images` so positional member indices never shift, so every consumer that wants
    // them has to add this pass explicitly — and until round 35 exactly one did (`main.ts`'s
    // single-file asset browser). `?game=dark-queen-dos` and
    // `?game=forgotten-realms-unlimited-adventures` therefore dropped every composite their
    // manifests reach: 3 in DQK's DISK3/FRAME.TLB, and 9 across FRUA's PICA/PICD/FRAME.
    let skippedComposites = 0;
    for (const [ci, c] of a.composites.entries()) {
      const image = renderHlibComposite(bytes, c);
      if (!image) {
        skippedComposites++;
        continue;
      }
      frames.push({
        label: `${name} · composite ${ci} (method 25, ${c.parts.length} part(s))`,
        image,
        encoding: image.encoding,
      });
    }
    return {
      frames,
      note: skippedComposites
        ? `${skippedComposites} method-25 composite(s) could not be assembled`
        : undefined,
    };
  }

  if (decoded.format === 'ilbm') {
    frames.push({ label: name, image: decoded.image.image, encoding: 'ilbm' });
    return { frames };
  }

  if (decoded.format === 'glib') {
    // GLIB is the big-endian Amiga sibling of HLIB and carries the same member shape, so the
    // handling is the HLIB branch above with `nonImage` replaced by "no images at all". Reaching
    // this branch at all is new as of 2026-08-22: `decodeAsset` did not sniff GLIB, so every
    // Amiga container from Curse/Secret/Pools/Gateway/Treasures/DQK threw before it got here.
    const a = decoded.archive;
    for (const m of a.images) {
      frames.push({ label: `${name} · ${m.label}`, image: m.image, encoding: m.image.encoding });
    }
    // Amiga method-0x19 composites, the big-endian twin of the HLIB pass above. Assembled inside
    // `decodeGlib` (a compressed leaf's members do not exist in these `bytes`), so all that is
    // needed here is to surface them. Only one file in the whole WHDLoad corpus carries any:
    // Amiga DQK `Disk3/FRAME.TLB`, 3 of them, matching its DOS twin's 3.
    for (const [ci, c] of a.composites.entries()) {
      if (!c.image) continue;
      frames.push({
        label: `${name} · composite ${ci} (method 0x19, ${c.parts.length} part(s))`,
        image: c.image,
        encoding: c.image.encoding,
      });
    }
    const rawBytes = a.rawMembers.reduce((acc, m) => acc + m.byteLength, 0);
    return {
      frames,
      note: frames.length === 0
        ? `non-image GLIB library (tag "${a.tag}") — ${rawBytes} byte(s) of payload not decoded`
        : rawBytes > 0
          ? `${rawBytes} byte(s) in ${a.rawMembers.length} member region(s) not decoded as images`
          : undefined,
    };
  }

  if (decoded.format === 'daa') {
    const a = decoded.archive;
    if (a.kind === 'index') {
      // 6-byte sub-frame index (SPRIT/PIC/HEAD): surface each stored frame in order.
      // The decoder does not infer whether a family uses these frames for animation,
      // distance selection or another selector.
      let skipped = 0;
      for (const sf of a.subFrames) {
        if (sf.frames.length > 0) {
          sf.frames.forEach((img, fi) => {
            frames.push({
              label: `${name} · block ${sf.blockId} (sub-frame) f${fi}`,
              image: img,
              encoding: img.encoding,
            });
          });
        } else {
          skipped++;
        }
      }
      return {
        frames,
        note: skipped
          ? `${skipped} sub-frame entr${skipped === 1 ? 'y' : 'ies'} failed to decode`
          : undefined,
      };
    }
    let skipped = 0;
    for (const b of a.blocks) {
      if (b.image) {
        frames.push({
          label: `${name} · block ${b.blockId}`,
          image: b.image,
          encoding: b.image.encoding,
        });
      } else if (isDaaTileStrip(b.raw)) {
        const tiles = decodeDaaTileStrip(b.raw);
        tiles.forEach((tile, ti) => {
          frames.push({
            label: `${name} · block ${b.blockId} tile ${ti}`,
            image: tile,
            encoding: 'daa-tile8x8',
          });
        });
      } else {
        skipped++;
      }
    }
    return {
      frames,
      note: skipped ? `${skipped} non-image block(s) skipped` : undefined,
    };
  }

  if (decoded.format === 'pool-amiga') {
    // Pool of Radiance's Amiga container is NOT routed through the DAX catch-all below, even
    // though it shares the block/frames shape. `MULTI_FRAME_KINDS` deliberately encodes a DAX
    // routing decision (see its doc comment), and pool-amiga's multi-frame blocks carry
    // `kind: 'standard'` — a kind `decodeDax` never emits. Widening that shared set to admit
    // 'standard' would therefore be a no-op for DAX today but would silently change DAX
    // rendering the moment a 'standard' kind appeared there, so the reading is scoped to the
    // format that means it. poolAmiga.ts's own docblock states that BOTH 'standard' (bacpac,
    // 8x8d, dungcom, wildcom, randcom, sqrpaci) and 'animated' (pic, final, sprit) blocks carry
    // a full `frames` array; before this branch existed, `?game=pool-amiga` surfaced 744 of the
    // archive's 1672 frames, hiding 928 across those six 'standard' families.
    const a = decoded.archive;
    let skipped = 0;
    for (const b of a.blocks) {
      if (b.frames && b.frames.length > 0) {
        b.frames.forEach((img, fi) => {
          frames.push({
            label: `${name} · block ${b.blockId} (${b.kind}) f${fi}`,
            image: img,
            encoding: img.encoding,
          });
        });
      } else if (b.image) {
        frames.push({
          label: `${name} · block ${b.blockId} (${b.kind})`,
          image: b.image,
          encoding: b.image.encoding,
        });
      } else {
        skipped++;
      }
    }
    return {
      frames,
      note: skipped ? `${skipped} non-image block(s) skipped` : undefined,
    };
  }

  // dax
  const a = decoded.archive;
  let skipped = 0;
  for (const b of a.blocks) {
    if (b.kind === 'font') {
      // Gen1 text-glyph sheet (`8X8D*.DAX` block 201) — not a dungeon tile/sprite, so it is
      // excluded from the positional GraphicSet categories (see dax.ts's 'font' kind doc
      // comment). It still surfaces in the raw per-file asset browser: `main.ts` reads
      // `DaxBlock.image` directly, bypassing this flattening.
      skipped++;
    } else if (MULTI_FRAME_KINDS.has(b.kind) && b.frames && b.frames.length > 0) {
      // Multi-frame picture (SPRIT/PIC): surface every frame.
      b.frames.forEach((img, fi) => {
        frames.push({
          label: `${name} · block ${b.blockId} (${b.kind}) f${fi}`,
          image: img,
          encoding: img.encoding,
        });
      });
    } else if (b.image) {
      frames.push({
        label: `${name} · block ${b.blockId} (${b.kind})`,
        image: b.image,
        encoding: b.image.encoding,
      });
    } else {
      skipped++;
    }
  }
  return {
    frames,
    note: skipped ? `${skipped} complex/transparent block(s) unsolved & skipped` : undefined,
  };
}

// ---------------------------------------------------------------------------
// loadGame
// ---------------------------------------------------------------------------

function isGraphicsCategory(c: GameCategory): boolean {
  return c !== 'data';
}

/**
 * `GLBR` music census for one manifest file's raw bytes (round 33 R5 —
 * `docs/glbr-format.md` §6, `goldbox-solved-but-unwired.md`). Every current manifest lists its
 * `MUSIC.DAX` with `decode: false` (it's DAX-shaped `data`, not a graphics category), so this
 * runs independently of `isGraphicsCategory`/`wantDecode` below, gated on the filename rather
 * than the category — the same "MUSIC.DAX" name `gameAudio.ts`'s own `GLBR_MUSIC_GAMES` map
 * keys off. Never throws: a file that isn't DAX-shaped, or whose blocks aren't GLBR songs,
 * or whose song blocks fail to decode, contributes nothing (an honest zero, not a crash).
 */
/**
 * Round 34 R6 — CoK/DoK `SOUND.DAX`: a combined SFX + song bank, entered through a single
 * driver-verified start pointer at `byte[0:2]` (both block 1 and block 3 seed their cursor from
 * `ES:[0]` at install). Counted here the same way GLBR and XMI music are, and for the same reason:
 * so a decode that stops working shows up as a moved number instead of a silent absence.
 *
 * This is a CENSUS, not playback, and the distinction is load-bearing. Round 33 published this
 * buffer as a measured negative ("SFX bank, not songs"); round 34 narrowed rather than overturned
 * that -- the bank holds BOTH short SFX fragments and song-shaped passages, so both answers are
 * correct for the question each asked. Nothing here claims the DOS driver reaches sound hardware.
 */
function cokSoundBankCensus(bytes: Uint8Array): { segments: number; songLike: number; events: number } | null {
  try {
    const bank = decodeCokSoundBank(bytes);
    if (!bank.segments.length) return null;
    return {
      segments: bank.segments.length,
      songLike: bank.segments.filter((s) => isSongLikeSegment(s)).length,
      events: bank.events.length,
    };
  } catch {
    return null;
  }
}

function glbrMusicCensus(bytes: Uint8Array): { format: 'glbr' | 'xmi'; songs: number; events: number; channels: number } | null {
  let blocks: ReturnType<typeof readDaxDataBlocks>;
  try {
    blocks = readDaxDataBlocks(bytes);
  } catch {
    return null; // not a DAX-shaped file at all
  }
  let songs = 0;
  let events = 0;
  let channels = 0;
  for (const blk of blocks) {
    if (!sniffGlbr(blk.raw)) continue; // e.g. the driver-code block (id 0/1) isn't a song
    try {
      const song = decodeGlbrSong(blk.raw);
      songs++;
      channels += song.channels.length;
      for (const ch of song.channels) events += ch.events.length;
    } catch {
      // one malformed song block shouldn't sink the whole file's census
    }
  }
  return songs > 0 ? { format: 'glbr', songs, events, channels } : null;
}

/**
 * XMI music census (round 34 R4 — `docs/engine/research/matrix-cubed-audio.md`,
 * `docs/glbr-format.md` §4a/§6). The counterpart to {@link glbrMusicCensus} for a title whose
 * loader plays Miles AIL `.XMI` files rather than a `GLBR` `MUSIC.DAX` — round 33 wired Matrix
 * Cubed's `MUSIC.DAX` on the strength of it decoding to 8 `GLBR` songs byte-identical to
 * Countdown's; round 34 found Matrix's own unpacked loader never opens `MUSIC.DAX` by name and
 * instead names `BUCKA/B/C.XMI` (`tools/matrix_music_strings.py`). Reuses the exact
 * `{songs,events,channels}` shape `GameMusicSummary` already declares rather than adding a new
 * field: `songs` is the file's `XmiFile.songs.length`, `events` sums every song's event count,
 * `channels` sums each song's own count of distinct MIDI channel numbers actually used (the XMI
 * analogue of a GLBR song's channel-stream count — XMI has no separate per-channel stream
 * container the way GLBR does, so this is the closest honest equivalent, not a literal one).
 * Never throws: a file that isn't XMI-shaped, or a decode failure, contributes nothing.
 */
function xmiMusicCensus(bytes: Uint8Array): { format: 'glbr' | 'xmi'; songs: number; events: number; channels: number } | null {
  if (!sniffXmi(bytes)) return null;
  let file: ReturnType<typeof decodeXmi>;
  try {
    file = decodeXmi(bytes);
  } catch {
    return null; // one malformed XMI file shouldn't sink the whole title's music census
  }
  let events = 0;
  let channels = 0;
  for (const song of file.songs) {
    events += song.events.length;
    const channelsUsed = new Set<number>();
    for (const ev of song.events) {
      if ('channel' in ev) channelsUsed.add(ev.channel);
    }
    channels += channelsUsed.size;
  }
  return file.songs.length > 0 ? { format: 'xmi', songs: file.songs.length, events, channels } : null;
}

/**
 * Load a whole game from its manifest. Fetches + decodes each graphics file via
 * the injected `fetchBytes`, groups decoded frames by category, and never throws
 * for a single bad file — fetch/decode failures and skipped data files are
 * recorded on the result.
 */
export async function loadGame(
  manifest: GameManifest,
  fetchBytes: FetchBytes,
): Promise<LoadedGame> {
  // `paletteFrom` sources are fetched+decoded at most once per manifest, however many files
  // reference the same one (every GLIB file in a manifest typically shares one ALWAYS.TLB).
  const paletteCache = new Map<string, Promise<Palette | null>>();
  function resolveGlibFallback(path: string): Promise<Palette | null> {
    let p = paletteCache.get(path);
    if (!p) {
      p = fetchBytes(path).then(
        (bytes) => firstGlibPalette(bytes),
        () => null, // fetch failure here must not fail the FILE that asked for the fallback
      );
      paletteCache.set(path, p);
    }
    return p;
  }

  // A `GLBR` (`MUSIC.DAX`-shaped) or XMI music census, keyed by manifest path, collected
  // alongside the graphics decode below — see `glbrMusicCensus`'s doc comment for why this runs
  // independently of `wantDecode`.
  const musicByPath = new Map<
    string,
    { format: 'glbr' | 'xmi'; songs: number; events: number; channels: number }
  >();

  // Round 34 R6: the DOS `SOUND.DAX` bank census, same keying and the same reason for running
  // outside `wantDecode` — the bank is not a `GameCategory`, so without this it decodes for its
  // own unit test and nothing else.
  const soundBankByPath = new Map<string, { segments: number; songLike: number; events: number }>();

  // Round 34 R4: a manifest that lists its own `.XMI` file(s) is an XMI-scored title (Matrix
  // Cubed, once Phase B adds its BUCKA/B/C.XMI entries) — its `MUSIC.DAX` (if any) is presumed a
  // leftover and is NOT censused as GLBR, so the two counts can never both be nonzero for one
  // title. A manifest with no `.XMI` entries (every other GLBR title, Countdown included) is
  // completely unaffected: this is `false` and every line below behaves exactly as before.
  const hasXmiSiblings = manifest.files.some((f) => /\.xmi$/i.test(f.path.split(/[\\/]/).pop() ?? f.path));

  // Decode every file concurrently; capture each outcome as a GameFileResult.
  const results: GameFileResult[] = await Promise.all(
    manifest.files.map(async (mf): Promise<GameFileResult> => {
      const fileName = mf.path.split(/[\\/]/).pop() ?? mf.path;
      const name = mf.label ?? stem(mf.path);
      const base: GameFileResult = {
        path: mf.path,
        name,
        category: mf.category,
        format: null,
        frames: [],
      };

      // Intentionally not decoded yet (non-graphics data, or decode:false).
      const wantDecode = mf.decode ?? isGraphicsCategory(mf.category);
      if (!wantDecode) {
        if (/music\.dax$/i.test(fileName) && !hasXmiSiblings) {
          try {
            const musicBytes = await fetchBytes(mf.path);
            const census = glbrMusicCensus(musicBytes);
            if (census) musicByPath.set(mf.path, census);
          } catch {
            // fetch failure for the census probe must not affect the file's own (skipped) result
          }
        } else if (/\.xmi$/i.test(fileName)) {
          try {
            const xmiBytes = await fetchBytes(mf.path);
            const census = xmiMusicCensus(xmiBytes);
            if (census) musicByPath.set(mf.path, census);
          } catch {
            // fetch failure for the census probe must not affect the file's own (skipped) result
          }
        } else if (/sound\.dax$/i.test(fileName)) {
          try {
            const soundBytes = await fetchBytes(mf.path);
            const blocks = readDaxDataBlocks(soundBytes);
            const census = blocks.length ? cokSoundBankCensus(blocks[0].raw) : null;
            if (census) soundBankByPath.set(mf.path, census);
          } catch {
            // fetch failure for the census probe must not affect the file's own (skipped) result
          }
        }
        return { ...base, skipped: mf.note ?? 'not decoded yet (non-graphics data)' };
      }

      let bytes: Uint8Array;
      try {
        bytes = await fetchBytes(mf.path);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ...base, error: `fetch failed: ${msg}` };
      }

      if (/music\.dax$/i.test(fileName) && !hasXmiSiblings) {
        const census = glbrMusicCensus(bytes);
        if (census) musicByPath.set(mf.path, census);
      } else if (/\.xmi$/i.test(fileName)) {
        const census = xmiMusicCensus(bytes);
        if (census) musicByPath.set(mf.path, census);
      }

      let decoded: DecodedAsset;
      try {
        // `decodeAsset` (index.ts) does not accept a fallback palette, so a manifest asking for
        // one on a GLIB file is served by calling `decodeGlib` directly here rather than through
        // the generic dispatcher — the sniff itself (`sniffGlib`) is the same one `decodeAsset`
        // uses, so this only changes behaviour for files that both ARE GLIB and asked for a
        // fallback; every other file (and every GLIB file with no `paletteFrom`) is byte-for-byte
        // on the same `decodeAsset` path as before.
        const paletteFromPath = mf.paletteFrom ?? manifest.paletteFrom;
        if (paletteFromPath && sniffGlib(bytes)) {
          const fallback = await resolveGlibFallback(paletteFromPath);
          decoded = { format: 'glib', archive: decodeGlib(bytes, fileName, fallback) };
        } else {
          decoded = decodeAsset(bytes, fileName);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ...base, error: `decode failed: ${msg}` };
      }

      const { frames, note } = framesFromDecoded(decoded, name, bytes);
      const out: GameFileResult = {
        ...base,
        format: decoded.format,
        frames,
      };
      if (note && frames.length === 0) out.error = note;
      else if (note) out.skipped = note; // partial: some frames + a note
      else if (mf.note) out.skipped = mf.note;
      return out;
    }),
  );

  // Group into category buckets in canonical order.
  const groups = new Map<GameCategory, GameCategoryGroup>();
  for (const c of CATEGORY_ORDER) groups.set(c, { category: c, files: [], frameCount: 0 });
  for (const r of results) {
    let g = groups.get(r.category);
    if (!g) {
      g = { category: r.category, files: [], frameCount: 0 };
      groups.set(r.category, g);
    }
    g.files.push(r);
    g.frameCount += r.frames.length;
  }

  const categories: GameCategoryGroup[] = [];
  for (const [, g] of groups) {
    if (g.files.length > 0) categories.push(g);
  }

  const totalFrames = categories.reduce((s, g) => s + g.frameCount, 0);
  const errors = results.filter((r) => r.error && r.frames.length === 0);
  const skipped = results.filter((r) => r.skipped && r.frames.length === 0);

  // Aggregate the GLBR music census across every manifest file that carried song blocks (in
  // practice, at most one `MUSIC.DAX` per manifest today) into a single summary, named by the
  // first contributing file.
  let music: GameMusicSummary | undefined;
  for (const [path, census] of musicByPath) {
    if (!music) {
      music = { file: path, ...census };
    } else {
      music.songs += census.songs;
      music.events += census.events;
      music.channels += census.channels;
    }
  }

  // Same aggregation shape as the music census: at most one `SOUND.DAX` per manifest in
  // practice, so this is a fold over a one-element map in every shipped case.
  let soundBank: GameSoundBankSummary | undefined;
  for (const [path, census] of soundBankByPath) {
    if (!soundBank) {
      soundBank = { file: path, ...census };
    } else {
      soundBank.segments += census.segments;
      soundBank.songLike += census.songLike;
      soundBank.events += census.events;
    }
  }

  return {
    id: manifest.id,
    title: manifest.title,
    platform: manifest.platform,
    container: manifest.container,
    display: manifest.display,
    categories,
    totalFrames,
    errors,
    skipped,
    music,
    soundBank,
  };
}
