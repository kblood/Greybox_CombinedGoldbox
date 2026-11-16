/**
 * Shared viewer rendering helpers — used by both the single-file viewer
 * (main.ts) and the whole-game dashboard (gameview.ts). Pulls the frame→canvas
 * blit, integer zoom, palette swatch strip, lazy IntersectionObserver, and the
 * click-to-enlarge lightbox into one place so neither view duplicates them.
 */
import { indexedToRGBA } from '@goldbox/engine';
import type { IndexedImage, Palette } from '@goldbox/engine';

/** Create an element with optional class + text. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// --- Shared integer zoom state ---------------------------------------------

let currentZoom = 3;

export function getZoom(): number {
  return currentZoom;
}

/** Set the zoom and restyle every already-rendered canvas in #output. */
export function setZoom(z: number): void {
  currentZoom = Math.max(1, z | 0);
  document.querySelectorAll<HTMLCanvasElement>('#output canvas').forEach((c) => {
    c.style.width = `${c.width * currentZoom}px`;
    c.style.height = `${c.height * currentZoom}px`;
  });
}

export function applyZoom(canvas: HTMLCanvasElement, image: IndexedImage): void {
  canvas.style.width = `${image.width * currentZoom}px`;
  canvas.style.height = `${image.height * currentZoom}px`;
}

// --- Frame → canvas ---------------------------------------------------------

export function renderToCanvas(canvas: HTMLCanvasElement, image: IndexedImage): void {
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rgba = indexedToRGBA(image, image.palette ?? null);
  const id = ctx.createImageData(image.width, image.height);
  id.data.set(rgba);
  ctx.putImageData(id, 0, 0);
  applyZoom(canvas, image);
}

// --- Lazy render observer ---------------------------------------------------

type LazyCanvas = HTMLCanvasElement & { __render?: () => void };

export const lazyObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const target = entry.target as LazyCanvas;
        const fn = target.__render;
        if (fn) {
          fn();
          delete target.__render;
          lazyObserver.unobserve(target);
        }
      }
    }
  },
  { rootMargin: '200px' },
);

/** Queue a canvas to render when it scrolls near the viewport. */
export function lazyRender(canvas: HTMLCanvasElement, image: IndexedImage): void {
  (canvas as LazyCanvas).__render = () => renderToCanvas(canvas, image);
  lazyObserver.observe(canvas);
}

/** Force-render a canvas now (e.g. the first frame for screenshots). */
export function renderNow(canvas: HTMLCanvasElement): void {
  const c = canvas as LazyCanvas;
  const fn = c.__render;
  if (fn) {
    fn();
    delete c.__render;
    lazyObserver.unobserve(c);
  }
}

// --- Palette swatch strip ---------------------------------------------------

export function makeSwatchStrip(palette: Palette | null): HTMLElement {
  const strip = el('div', 'swatches');
  if (!palette) {
    strip.appendChild(el('span', 'muted', 'no palette (inherits context)'));
    return strip;
  }
  let drawn = 0;
  for (let i = 0; i < palette.colors.length; i++) {
    const c = palette.colors[i];
    if (!c) continue;
    const sw = el('span', 'swatch');
    sw.style.background = `rgb(${c.r},${c.g},${c.b})`;
    sw.title = `#${i} rgb(${c.r},${c.g},${c.b})`;
    strip.appendChild(sw);
    drawn++;
  }
  if (drawn === 0) strip.appendChild(el('span', 'muted', 'palette empty'));
  return strip;
}

// --- Lightbox ---------------------------------------------------------------

export function openLightbox(image: IndexedImage, title: string): void {
  const overlay = el('div', 'lightbox');
  const inner = el('div', 'lightbox-inner');
  const cap = el('div', 'lightbox-cap', title);
  const canvas = el('canvas', 'pixelated');
  const big = Math.max(
    1,
    Math.floor(
      Math.min(window.innerWidth - 80, window.innerHeight - 120) /
        Math.max(image.width, image.height),
    ),
  );
  renderToCanvas(canvas, image);
  canvas.style.width = `${image.width * big}px`;
  canvas.style.height = `${image.height * big}px`;
  inner.appendChild(cap);
  inner.appendChild(canvas);
  overlay.appendChild(inner);
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

/**
 * Build a thumbnail card for one frame: a pixelated canvas (lazy-rendered),
 * click-to-enlarge lightbox, dimensions label, and optional encoding tag.
 */
export function makeFrameCard(
  image: IndexedImage,
  title: string,
  opts: { showSwatches?: boolean; eager?: boolean } = {},
): HTMLElement {
  const card = el('div', 'frame-card');
  card.appendChild(el('div', 'frame-title', title));
  card.appendChild(
    el(
      'div',
      'dims',
      `${image.width}×${image.height}${image.encoding ? ` · ${image.encoding}` : ''}`,
    ),
  );
  const wrap = el('div', 'canvas-wrap');
  const canvas = el('canvas', 'pixelated');
  canvas.width = image.width;
  canvas.height = image.height;
  applyZoom(canvas, image);
  canvas.addEventListener('click', () => openLightbox(image, title));
  wrap.appendChild(canvas);
  card.appendChild(wrap);
  if (opts.showSwatches) card.appendChild(makeSwatchStrip(image.palette));

  if (opts.eager) {
    (canvas as LazyCanvas).__render = () => renderToCanvas(canvas, image);
    renderNow(canvas);
  } else {
    lazyRender(canvas, image);
  }
  return card;
}
