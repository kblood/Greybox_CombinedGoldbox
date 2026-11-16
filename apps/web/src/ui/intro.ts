/**
 * Intro/title archive renderer. Full pictures are decoded unchanged; partial DAX redraws are
 * placed by matching their baked background pixels against the current screen, while HLIB uses
 * the signed placement coordinates stored in each image header. See
 * `docs/engine/research/title-intro-composition.md`.
 */
import { closeDungeon3d } from './dungeon3dHost.js';
import {
  decodeAsset,
  makeEgaPalette,
  createFramebuffer,
  blitIndexed,
  findBestIndexedOverlayPlacement,
  mergePalettes,
  DOS_EGA,
  type DecodedAsset,
  type IndexedImage,
  type IndexedFramebuffer,
  type Palette,
} from '@goldbox/engine';
import { assetUrl } from './catalog.js';
import { el } from './render.js';
import type { AssetSource } from './assetSource.js';
import { createScreenSurface, type ScreenSurface } from '@goldbox/ui-kit';
import { followPresentationScale, presentationFitOptions } from './runtimeGraphicsMode.js';
import { gameAudio, installGameAudioSeam, type AudioGameId } from '../audio/gameAudio.js';
import { COK_TITLE_SOURCE, validateCokTitleSource } from './cokTitleArt.js';
import { createCokTitleRuntime, type CokTitleRuntime } from './cokTitleRuntime.js';
import { loadIntroTitleBytes } from './intro-title-source.mjs';

const EGA_PALETTE: Palette = makeEgaPalette();
const TITLE_PATH = 'Champions of Krynn/TITLE.DAX';
const SCREEN_W = 320;
const SCREEN_H = 200;

// A completed intro still owns its retained Play/Demo backdrop. Replacement/removal owns
// disposal; finishing frame advancement alone must keep graphics switching available.
let introRevision = 0;
let disposeRetainedIntro: (() => void) | null = null;

/** Per-game override for {@link startIntro} — defaults reproduce CoK's own boot exactly. */
export interface IntroConfig {
  /**
   * `'<Game Folder>/TITLE.DAX'` (or `.TLB` for DQK's HLIB title art) — a literal so
   * `scripts/bundle-assets.mjs` ships it.
   */
  titlePath?: string;
  /** User-selected game install. Production title screens never fetch packaged game archives. */
  assetSource?: AssetSource;
  /** Exact candidate paths inside a selected Library install, ordered from most specific. */
  assetRelativePaths?: string[];
  /** Shown in the loading/frame-count status line, e.g. "Death Knights of Krynn". */
  displayName?: string;
  /** Which game's score `gameAudio` arms for the title theme (default `'cok'`). */
  audioGame?: AudioGameId;
}

/** Wrap a decoded frame as a 320×200 indexed framebuffer. */
function frameToScreen(img: IndexedImage): IndexedFramebuffer {
  const fb = createFramebuffer(SCREEN_W, SCREEN_H, 0);
  const dx = img.xOffset || Math.max(0, (SCREEN_W - img.width) >> 1);
  const dy = img.yOffset || Math.max(0, (SCREEN_H - img.height) >> 1);
  blitIndexed(fb, img, dx, dy);
  return fb;
}

/** Some standard-DAX full pictures are narrower than the 320×200 framebuffer. */
const FULL_FRAME_MIN_W = 256;
const FULL_FRAME_MIN_H = 160;

function compositeImages(
  base: IndexedImage,
  overlays: { image: IndexedImage; x: number; y: number }[],
  encoding: string,
): IndexedImage {
  const fb = createFramebuffer(base.width, base.height, 0);
  blitIndexed(fb, base, 0, 0);
  for (const overlay of overlays) blitIndexed(fb, overlay.image, overlay.x, overlay.y);
  return {
    width: fb.width,
    height: fb.height,
    indices: fb.indices,
    xOffset: 0,
    yOffset: 0,
    transparentIndex: null,
    palette: mergePalettes(base.palette, ...overlays.map((o) => o.image.palette)),
    encoding,
  };
}

const isFullFrame = (img: IndexedImage) =>
  img.width >= FULL_FRAME_MIN_W && img.height >= FULL_FRAME_MIN_H;

/** Detect archives like NWN: N top halves followed by N complementary bottom halves. */
function composeSplitScreenPairs(base: IndexedImage, bands: IndexedImage[]): IndexedImage[] | null {
  if (bands.length < 2 || bands.some((b) => b.width !== base.width)) return null;
  const heights = [...new Set(bands.map((b) => b.height))];
  if (heights.length !== 2 || heights[0]! + heights[1]! !== base.height) return null;
  const tops = bands.filter((b) => b.height === heights[0]);
  const bottoms = bands.filter((b) => b.height === heights[1]);
  if (tops.length !== bottoms.length) return null;
  return tops.map((top, i) => {
    const blank: IndexedImage = {
      ...base,
      indices: new Uint8Array(base.width * base.height),
      palette: null,
      encoding: 'title-split-screen-blank',
    };
    return compositeImages(blank, [
      { image: top, x: 0, y: 0 },
      { image: bottoms[i]!, x: 0, y: top.height },
    ], 'title-split-screen');
  });
}

function composeDaxTitle(images: IndexedImage[]): IndexedImage[] {
  const frames: IndexedImage[] = [];
  let segment: IndexedImage[] | null = null;
  const flush = () => {
    if (!segment) return;
    const [background, ...bands] = segment;
    if (bands.length === 0) {
      frames.push(background!);
      return;
    }
    const split = composeSplitScreenPairs(background!, bands);
    if (split) {
      frames.push(background!, ...split);
      return;
    }
    let current = background!;
    for (const band of bands) {
      const placement = findBestIndexedOverlayPlacement(current, band);
      const x = placement?.x ?? band.xOffset;
      const y = placement?.y ?? band.yOffset;
      current = compositeImages(current, [{ image: band, x, y }], 'title-composite-dax');
      frames.push(current);
    }
  };
  for (const image of images) {
    if (isFullFrame(image)) {
      flush();
      segment = [image];
    } else if (segment) {
      segment.push(image);
    }
  }
  flush();
  return frames;
}

function composeHlibTitle(members: { label: string; image: IndexedImage }[]): IndexedImage[] {
  const sets: { label: string; images: IndexedImage[] }[] = [];
  for (const member of members) {
    const label = /^(set\d+)_/.exec(member.label)?.[1] ?? member.label;
    const last = sets[sets.length - 1];
    if (last?.label === label) last.images.push(member.image);
    else sets.push({ label, images: [member.image] });
  }

  const frames: IndexedImage[] = [];
  let background: IndexedImage | null = null;
  let used = false;
  for (const set of sets) {
    const full = set.images.find(isFullFrame);
    if (full) {
      if (background && !used) frames.push(background);
      background = full;
      used = false;
      const extras = set.images.filter((image) => image !== full);
      if (extras.length > 0) {
        frames.push(compositeImages(background, extras.map((image) => ({
          image, x: image.xOffset, y: image.yOffset,
        })), 'title-composite-hlib'));
        used = true;
      }
    } else if (background) {
      frames.push(compositeImages(background, set.images.map((image) => ({
        image, x: image.xOffset, y: image.yOffset,
      })), 'title-composite-hlib'));
      used = true;
    }
  }
  if (background && !used) frames.push(background);
  return frames;
}

function titleScreens(decoded: DecodedAsset): IndexedImage[] {
  if (decoded.format === 'dax') {
    const blocks = decoded.archive.blocks
      .filter((b): b is typeof b & { image: IndexedImage } => !!b.image)
      .sort((a, b) => a.blockId - b.blockId)
      .map((b) => b.image);
    return composeDaxTitle(blocks);
  }
  if (decoded.format === 'hlib') {
    return composeHlibTitle(decoded.archive.images);
  }
  return [];
}

function setStatus(msg: string): void {
  const s = document.querySelector('#status');
  if (s) s.textContent = msg;
}

/**
 * Boot the title sequence. Loads TITLE.DAX, shows each full-screen frame in turn, and calls
 * `onDone` after the last one is dismissed. Returns the number of title frames shown (0 if the
 * asset is missing — the caller can then skip straight to the game).
 *
 * The original's actual "Play"/"Demo" choice (`START.EXE` shows "Champions of Krynn v1.2  Play
 * Demo") is a separate screen shown *after* these boot frames, not a hotkey during them — see
 * `titleMenu.ts`, which `onDone` should lead to.
 */
export async function startIntro(onDone?: () => void, config: IntroConfig = {}): Promise<number> {
  const session = ++introRevision;
  disposeRetainedIntro?.();
  disposeRetainedIntro = null;
  closeDungeon3d();
  const titlePath = config.titlePath ?? TITLE_PATH;
  const displayName = config.displayName ?? 'Champions of Krynn';
  const audioGame = config.audioGame ?? 'cok';

  const out = document.querySelector('#output') as HTMLElement;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  out.innerHTML = '';
  setStatus(`Loading ${displayName} title…`);

  let screens: IndexedImage[];
  let titleBytes: Uint8Array;
  let decoded: DecodedAsset;
  try {
    const hintName = titlePath.slice(titlePath.lastIndexOf('/') + 1);
    titleBytes = await loadIntroTitleBytes({ titlePath, assetRelativePaths: config.assetRelativePaths, assetSource: config.assetSource,
      developmentUrl: import.meta.env.DEV ? assetUrl(titlePath) : null });
    if (session !== introRevision) return 0;
    decoded = decodeAsset(titleBytes, hintName);
    screens = titleScreens(decoded);
  } catch (err) {
    if (session !== introRevision) return 0;
    setStatus(`Could not load title: ${err instanceof Error ? err.message : String(err)}`);
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }
  if (screens.length === 0) {
    (window as unknown as { __rendered: number }).__rendered = 0;
    setStatus(`No title screens found in ${titlePath}`);
    return 0;
  }

  // ---- The emulated title screen (same surface/scaler chrome as the exploration screen).
  const screen = el('div', 'gb-screen');
  const frame = el('div', 'gb-frame');
  const emu = el('div', 'gb-emu');
  // The title follows the shared CoK scale only for CoK (its audio default); DQK and others keep fit.
  const presentationGameId = (config.audioGame ?? 'cok') === 'cok' ? 'cok' : 'dqk';
  const surface: ScreenSurface = createScreenSurface(DOS_EGA, presentationFitOptions(presentationGameId));
  followPresentationScale(surface, presentationGameId);
  emu.appendChild(surface.canvas);
  frame.appendChild(emu);

  const hint = el('div', 'gb-menu gb-intro-hint');
  hint.innerHTML = '<b>Click</b> or press <b>any key</b> to continue';
  frame.appendChild(hint);
  screen.appendChild(frame);
  out.appendChild(screen);

  let index = 0;
  let done = false;
  let disposed = false;
  let graphics: CokTitleRuntime | null = null;
  if (titlePath === COK_TITLE_SOURCE.path) {
    graphics = createCokTitleRuntime(frame, surface, screens.map((image) => ({
      framebuffer: frameToScreen(image), palette: image.palette ?? EGA_PALETTE,
    })), () => validateCokTitleSource(titleBytes, decoded));
  }

  function show(): void {
    if (disposed) return;
    const shown = screens[index]!;
    // Most titles are plain EGA-16 and paint through the shared EGA_PALETTE; Gateway's
    // VGA-extended title art carries its own richer (32-index) palette on the image itself
    // (see daxVgaPicture.ts) — use it when present rather than forcing EGA-16 on top of it.
    if (graphics) graphics.show(index);
    else surface.paint(frameToScreen(shown), shown.palette ?? EGA_PALETTE);
    // The retained backdrop can outlive advancement; Play/Demo owns #status after finish.
    if (!done) setStatus(`${displayName} — title ${index + 1} / ${screens.length}`);
  }

  function finish(): void {
    if (done || disposed) return;
    done = true;
    window.removeEventListener('keydown', onKey);
    surface.canvas.removeEventListener('click', onClick);
    if (onDone) onDone();
  }

  function advance(): void {
    if (done || disposed || !surface.canvas.isConnected) return;
    if (index < screens.length - 1) {
      index++;
      show();
    } else {
      finish();
    }
  }

  function onKey(e: KeyboardEvent): void {
    if (e.target instanceof Element && e.target.closest('[data-cok-title-graphics]')) return;
    // Ignore pure modifier presses; everything else advances.
    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
    e.preventDefault();
    kickAudio();
    advance();
  }

  // This intro may touch the shared game audio only while it is the newest, undisposed view whose
  // canvas is still mounted, and while its game is still the selected audio game. `done` is not
  // part of the check: a finished intro keeps its retained Play/Demo backdrop and its audio.
  const ownsAudio = (): boolean =>
    session === introRevision
    && !disposed
    && surface.canvas.isConnected
    && frame.contains(surface.canvas)
    && gameAudio.gameId === audioGame;

  // In-game audio (A6.2): arm this game's title theme. It only sounds once the player interacts
  // (autoplay policy), so the first click/key both advances the screen and enables + starts the
  // title music.
  gameAudio.setGame(audioGame);
  void gameAudio.ensureLoaded().then(() => {
    if (ownsAudio()) gameAudio.enterScene('title');
  });
  installGameAudioSeam();
  let audioKicked = false;
  function kickAudio(): void {
    if (audioKicked || !ownsAudio()) return;
    audioKicked = true;
    gameAudio.setGame(audioGame);
    void gameAudio.ensureLoaded().then(() => {
      if (!ownsAudio()) return;
      gameAudio.setEnabled(true);
      gameAudio.enterScene('title');
    });
  }

  function onClick(): void { kickAudio(); advance(); }
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    window.removeEventListener('keydown', onKey);
    surface.canvas.removeEventListener('click', onClick);
    observer.disconnect();
    graphics?.dispose();
    surface.dispose();
    if (disposeRetainedIntro === dispose) disposeRetainedIntro = null;
  }
  const observer = new MutationObserver(() => {
    if (!frame.isConnected || !frame.contains(surface.canvas)) dispose();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  disposeRetainedIntro = dispose;
  surface.canvas.addEventListener('click', onClick);
  window.addEventListener('keydown', onKey);
  show();

  // Headless e2e seam.
  (window as unknown as { __intro?: Record<string, unknown> }).__intro = {
    frameCount: screens.length,
    index: () => index,
    advance,
    done: () => done,
    disposed: () => disposed,
    graphics: () => graphics?.status() ?? null,
    displayRect: () => surface.rect(),
  };
  (window as unknown as { __rendered: number }).__rendered = screens.length;
  return screens.length;
}
