import type { IndexedFramebuffer, Palette, RgbaArt } from '@goldbox/engine';
import type { ScreenSurface } from '@goldbox/ui-kit';
import { COK_TITLE_RESTYLE, COK_TITLE_SCREENS, loadCokTitleRestyle, type CokTitleBlock } from './cokTitleArt.js';
import { readRuntimeGraphicsMode, writeRuntimeGraphicsMode, type RuntimeGraphicsMode } from './runtimeGraphicsMode.js';
import { addLocalAssetPackPicker } from './localAssetPack.js';
import { el } from './render.js';

export interface CokTitleRuntime {
  show(index: number): void;
  dispose(): void;
  status(): { mode: string; rendered: string; state: string; error: string | null; index: number; disposed: boolean };
}

/** Presentation-only controller. Its owner retains it while Play/Demo uses the final backdrop. */
export function createCokTitleRuntime(
  frame: HTMLElement,
  surface: ScreenSurface,
  originals: readonly { framebuffer: IndexedFramebuffer; palette: Palette }[],
  admitSource: () => Promise<void>,
): CokTitleRuntime {
  const controls = el('div', 'gb-menu gb-cok-title-graphics');
  controls.dataset.cokTitleGraphics = 'true';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Title graphics');
  const note = el('div', 'gb-cok-title-graphics-status');
  note.setAttribute('role', 'status');
  const buttons: HTMLButtonElement[] = [];
  for (const [mode, label] of [['DOS-EGA', 'DOS · EGA'], ['Amiga', 'Amiga · DOS title fallback'], ['Restyle', 'Restyle']] as const) {
    const button = el('button', 'gb-btn', label) as HTMLButtonElement;
    button.type = 'button';
    button.dataset.runtimeGraphicsMode = mode;
    button.addEventListener('click', () => writeRuntimeGraphicsMode('cok', mode));
    buttons.push(button);
    controls.appendChild(button);
  }
  addLocalAssetPackPicker(controls, () => {});
  // Space/Enter operate the selector without dismissing a title frame. The Play/Demo capture
  // listener likewise excludes this group, so it never changes highlight or confirms a choice.
  controls.addEventListener('keydown', (event) => event.stopPropagation());
  controls.appendChild(note);
  frame.appendChild(controls);

  let index = 0;
  let disposed = false;
  let revision = 0;
  let mode = readRuntimeGraphicsMode('cok');
  let rendered = 'DOS-EGA';
  let state = 'original';
  let error: string | null = null;
  const abort = new AbortController();
  let source: Promise<void> | undefined;
  const art = new Map<CokTitleBlock, { promise: Promise<RgbaArt>; failed: boolean }>();

  function refreshControls(): void {
    for (const button of buttons) {
      const selected = button.dataset.runtimeGraphicsMode === mode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    note.textContent = mode === 'Amiga' ? 'Amiga selected · DOS title fallback'
      : mode !== 'Restyle' ? 'DOS · EGA title'
      : state === 'ready' ? 'Restyle title'
      : state === 'failed' ? `Restyle unavailable · DOS title fallback (${error})`
      : 'Restyle loading · DOS title fallback';
    controls.dataset.graphicsState = state;
    controls.dataset.renderedGraphicsMode = rendered;
  }

  function load(block: CokTitleBlock): Promise<RgbaArt> {
    let entry = art.get(block);
    if (!entry) {
      const created: { promise: Promise<RgbaArt>; failed: boolean } = {
        failed: false,
        promise: loadCokTitleRestyle(block, abort.signal).catch((failure: unknown) => {
          created.failed = true;
          throw failure;
        }),
      };
      art.set(block, created);
      entry = created;
    }
    return entry.promise;
  }

  function active(request: number): boolean {
    return !disposed && request === revision && surface.canvas.isConnected && frame.contains(surface.canvas);
  }

  function show(nextIndex: number): void {
    if (disposed || !surface.canvas.isConnected) return;
    index = nextIndex;
    const original = originals[index];
    if (!original) return;
    const request = ++revision;
    // Always restore exact native pixels synchronously, including before optional art is fetched.
    surface.paint(original.framebuffer, original.palette);
    rendered = 'DOS-EGA';
    state = mode === 'Restyle' ? 'loading' : 'original';
    error = null;
    refreshControls();
    if (mode !== 'Restyle') return;
    source ??= admitSource();
    const composition = COK_TITLE_SCREENS[index];
    void (async () => {
      await source;
      if (!composition) throw new Error('Title screen has no reviewed Restyle composition');
      if (!active(request)) return;
      const layers = await Promise.all(composition.map(async ({ block, x, y }) => ({
        art: await load(block), x, y, pixelScale: COK_TITLE_RESTYLE[block].pixelScale,
      })));
      if (!active(request)) return;
      // A single paint commits the complete frame. No partial/mixed title and no retained logo.
      surface.paintRgbaLayers(original.framebuffer, original.palette, layers);
      rendered = 'Restyle';
      state = 'ready';
      refreshControls();
    })().catch((failure: unknown) => {
      if (!active(request)) return;
      surface.paint(original.framebuffer, original.palette);
      rendered = 'DOS-EGA';
      state = 'failed';
      error = failure instanceof Error ? failure.message : String(failure);
      refreshControls();
    });
  }

  function onMode(event: Event): void {
    const detail = (event as CustomEvent<{ gameId?: string; mode?: RuntimeGraphicsMode }>).detail;
    if (disposed || detail?.gameId !== 'cok') return;
    mode = detail.mode === 'DOS-EGA' || detail.mode === 'Amiga' || detail.mode === 'Restyle'
      ? detail.mode : readRuntimeGraphicsMode('cok');
    if (mode === 'Restyle') {
      // A deliberate Restyle selection retries failures; advancing/repainting never refetches
      // a failed block. Keep successful and pending requests shared across screens.
      for (const [block, entry] of art) if (entry.failed) art.delete(block);
    }
    show(index);
  }
  function onLocalAssetPack(): void {
    if (disposed) return;
    art.clear();
    show(index);
  }
  window.addEventListener('goldbox:graphics-mode', onMode);
  window.addEventListener('goldbox:local-asset-pack', onLocalAssetPack);

  return {
    show,
    status: () => ({ mode, rendered, state, error, index, disposed }),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      ++revision;
      abort.abort();
      window.removeEventListener('goldbox:graphics-mode', onMode);
      window.removeEventListener('goldbox:local-asset-pack', onLocalAssetPack);
      art.clear();
      controls.remove();
    },
  };
}
