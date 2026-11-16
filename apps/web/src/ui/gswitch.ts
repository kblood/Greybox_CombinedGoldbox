/**
 * Live EGA ↔ Amiga graphics switch (M3.S2) — the project's headline
 * "best-of art, switch live" feature. Demonstrated on Champions of Krynn and Death
 * Knights of Krynn across three art categories: BIGPIC (full-screen scenes), CPIC
 * (combat/character portraits), and BODY (character body paperdolls).
 *
 * Two `GraphicSet`s (DOS-EGA, Amiga) are built from the decoded frames and handed
 * to a `GraphicSetManager`. Toggling the platform is a `setActive()` pointer swap + redraw
 * of the SAME logical asset ref — no reload, no second decode — exactly the runtime
 * mechanism the in-dungeon switch will use once the Amiga 8×8 tile (6-byte sub-frame)
 * format is reversed. Until then this proves the pipeline end-to-end on real best-of art.
 *
 * A `window.__gswitch` seam lets headless e2e flip platforms and confirm the rendered
 * pixels actually change (EGA vs Amiga checksums differ) while the logical id is unchanged.
 */
import {
  decodeDax,
  decodeDaa,
  createGraphicSetManager,
  indexedToRGBA,
  type GraphicSet,
  type GraphicSetManager,
  type GraphicSetId,
  type IndexedImage,
  type AssetKind,
} from '@goldbox/engine';
import { assetUrl } from './catalog.js';
import { el, renderToCanvas } from './render.js';
import { gameAudio } from '../audio/gameAudio.js';

export type CategoryId = 'bigpic' | 'cpic' | 'body';

/** Maps the UI category id to the engine's AssetKind used in GraphicSet.frames. */
const CATEGORY_KIND: Record<CategoryId, AssetKind> = {
  bigpic: 'bigpic',
  cpic: 'cpic',
  body: 'cbody', // engine uses 'cbody' for character body paperdolls
};

/** Per-game, per-category file paths for the live DOS ↔ Amiga switch. */
export type SwitchGameId = 'cok' | 'dok';

interface CategoryPaths {
  /** Short label shown on the category button. */
  label: string;
  dosPath: string;
  /** null = no Amiga archive exists for this game/category combination. */
  amigaPath: string | null;
}

interface SwitchConfig {
  title: string;
  /** Only categories with Amiga source files are listed here. */
  categories: Partial<Record<CategoryId, CategoryPaths>>;
}

const SWITCH_CONFIG: Record<SwitchGameId, SwitchConfig> = {
  cok: {
    title: 'Champions of Krynn',
    categories: {
      bigpic: {
        label: 'BIGPIC',
        // Paths are LITERALS so scripts/bundle-assets.mjs ships them.
        dosPath: 'Champions of Krynn/BIGPIC1.DAX',
        amigaPath: 'amiga_extracted/ChampionsOfKrynn/disk2/BIGPIC1.DAA',
      },
      cpic: {
        label: 'CPIC',
        dosPath: 'Champions of Krynn/CPIC1.DAX',
        amigaPath: 'amiga_extracted/ChampionsOfKrynn/disk2/CPIC1.DAA',
      },
      body: {
        label: 'BODY',
        // CoK DOS ships BODY2/BODY3 but no BODY1; pair with the same-area Amiga counterpart.
        // Amiga disk3/BODY2.DAA is area-2 (same block numbering as BODY2.DAX).
        dosPath: 'Champions of Krynn/BODY2.DAX',
        amigaPath: 'amiga_extracted/ChampionsOfKrynn/disk3/BODY2.DAA',
      },
    },
  },
  dok: {
    title: 'Death Knights of Krynn',
    categories: {
      bigpic: {
        label: 'BIGPIC',
        dosPath: 'Death Knights of Krynn/BIGPIC1.DAX',
        amigaPath: 'amiga_extracted/DeathKnightsOfKrynn/disk1/BIGPIC1.DAA',
      },
      cpic: {
        label: 'CPIC',
        dosPath: 'Death Knights of Krynn/CPIC1.DAX',
        // Amiga extraction preserves the original mixed-case filename (.daa lowercase).
        amigaPath: 'amiga_extracted/DeathKnightsOfKrynn/disk1/CPIC1.daa',
      },
      // DoK has no Amiga BODY archive — category intentionally omitted.
    },
  },
};

/** All category ids the switch supports (superset; individual games may omit some). */
const ALL_CATEGORIES: CategoryId[] = ['bigpic', 'cpic', 'body'];

interface SwitchState {
  manager: GraphicSetManager;
  /** Block ids present in BOTH sets, sorted — the comparable A/B scenes. */
  sharedIds: number[];
  cursor: number;
  canvas: HTMLCanvasElement;
}

let state: SwitchState | null = null;
let currentGameId: SwitchGameId = 'cok';
let currentCategory: CategoryId = 'bigpic';

function setStatus(msg: string, kind: 'info' | 'error' = 'info'): void {
  const s = document.querySelector('#status') as HTMLElement | null;
  if (!s) return;
  s.textContent = msg;
  s.className = kind === 'error' ? 'status error' : 'status';
}

/** A stable checksum of an image's rendered RGBA, so e2e can prove a redraw changed pixels. */
function imageChecksum(image: IndexedImage): number {
  const rgba = indexedToRGBA(image, image.palette ?? null);
  let h = 0x811c9dc5;
  for (let i = 0; i < rgba.length; i += 257) {
    h = (h ^ rgba[i]) >>> 0;
    h = (h * 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Distinct colors actually used by an indexed image (for the "16 vs 32" readout). */
function usedColors(image: IndexedImage): number {
  const seen = new Set<number>();
  for (const idx of image.indices) seen.add(idx);
  return seen.size;
}

/** Build a GraphicSet from a decoded archive's frame map, bucketed under one AssetKind. */
function buildSet(
  id: GraphicSetId,
  label: string,
  frames: Map<number, IndexedImage>,
  display: { width: number; height: number; pixelAspect?: number },
  kind: AssetKind,
): GraphicSet {
  const cat = new Map<number, IndexedImage>(frames);
  return {
    id,
    label,
    display,
    frames: new Map([[kind, cat]]),
    complete: cat.size > 0,
  };
}

async function fetchBytes(path: string): Promise<Uint8Array> {
  const resp = await fetch(assetUrl(path));
  if (!resp.ok) throw new Error(`${path}: HTTP ${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
}

/** Render the currently-selected shared id through the active set and refresh the readouts. */
function redraw(): void {
  if (!state) return;
  const { manager, sharedIds, cursor, canvas } = state;
  const id = sharedIds[cursor];
  const image = manager.resolve({ category: CATEGORY_KIND[currentCategory], index: id });
  if (!image) {
    setStatus(`No frame for ${currentCategory.toUpperCase()} block ${id}`, 'error');
    return;
  }
  renderToCanvas(canvas, image);

  // Toolbar active-state.
  document.querySelectorAll('.gswitch-plat').forEach((b) => {
    b.classList.toggle('active', (b as HTMLElement).dataset.set === manager.active);
  });
  document.querySelectorAll('.gswitch-cat').forEach((b) => {
    b.classList.toggle('active', (b as HTMLElement).dataset.cat === currentCategory);
  });
  const meta = document.querySelector('.gswitch-meta');
  if (meta) {
    const set = manager.activeSet();
    meta.textContent =
      `${set.label} · block ${id} · ${image.width}×${image.height} · ` +
      `${usedColors(image)} colors used · palette ${image.palette?.count ?? 0}`;
  }
  setStatus(
    `Live art switch — ${manager.activeSet().label}, ${currentCategory.toUpperCase()} block ${id} ` +
      `(${cursor + 1}/${sharedIds.length}). Toggle DOS-EGA / Amiga; ‹ › to change scene.`,
  );
}

function setPlatform(id: GraphicSetId): void {
  if (!state) return;
  state.manager.setActive(id);
  gameAudio.setPlatform(id); // A6.2 — audio follows the graphics switch (Amiga = sampled SFX + theme; DOS = silent/undecoded)
  redraw();
}

function step(delta: number): void {
  if (!state) return;
  const n = state.sharedIds.length;
  state.cursor = ((state.cursor + delta) % n + n) % n;
  redraw();
}

/** Switch to a new category for the current game (reloads assets). */
function switchCategory(cat: CategoryId): void {
  void startGraphicSwitch(currentGameId, cat);
}

export async function startGraphicSwitch(
  gameId: SwitchGameId = 'cok',
  category: CategoryId = 'bigpic',
): Promise<number> {
  currentGameId = gameId;
  currentCategory = category;

  const cfg = SWITCH_CONFIG[gameId] ?? SWITCH_CONFIG.cok;
  const catPaths = cfg.categories[category];

  const out = document.querySelector('#output') as HTMLElement;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  out.innerHTML = '';
  setStatus(`Loading ${cfg.title} ${category.toUpperCase()} (DOS EGA + Amiga) for live switch…`);

  if (!catPaths) {
    setStatus(
      `${category.toUpperCase()} is not available for ${cfg.title} — no matching Amiga archive.`,
      'error',
    );
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }

  if (!catPaths.amigaPath) {
    setStatus(
      `${category.toUpperCase()} is not available for ${cfg.title} — no Amiga source file.`,
      'error',
    );
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }

  let manager: GraphicSetManager;
  let sharedIds: number[];
  try {
    const [dosBytes, amigaBytes] = await Promise.all([
      fetchBytes(catPaths.dosPath),
      fetchBytes(catPaths.amigaPath),
    ]);
    const dosName = catPaths.dosPath.split('/').pop() ?? catPaths.dosPath;
    const amigaName = catPaths.amigaPath.split('/').pop() ?? catPaths.amigaPath;
    const dos = decodeDax(dosBytes, dosName);
    const amiga = decodeDaa(amigaBytes, amigaName);

    const kind = CATEGORY_KIND[category];
    const dosSet = buildSet(
      'DOS-EGA',
      'DOS (EGA 16-color)',
      dos.frameSet.frames,
      { width: 320, height: 200 },
      kind,
    );
    const amigaSet = buildSet(
      'Amiga',
      'Amiga (32-color)',
      amiga.frameSet.frames,
      { width: 320, height: 200, pixelAspect: 1 },
      kind,
    );

    // Comparable scenes = block ids present in both containers.
    const dosIds = new Set(dos.frameSet.frames.keys());
    sharedIds = [...amiga.frameSet.frames.keys()].filter((k) => dosIds.has(k)).sort((a, b) => a - b);
    if (sharedIds.length === 0)
      throw new Error(`no ${category.toUpperCase()} block ids common to DOS and Amiga`);

    manager = createGraphicSetManager([dosSet, amigaSet], {
      active: 'DOS-EGA',
      fallback: ['DOS-EGA', 'Amiga'],
    });
  } catch (err) {
    setStatus(
      `Could not load ${category.toUpperCase()} sets: ${err instanceof Error ? err.message : String(err)}`,
      'error',
    );
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }

  // Header.
  const header = el('div', 'asset-header');
  header.appendChild(el('span', 'badge', 'LIVE SWITCH'));
  header.appendChild(el('span', 'asset-name', `${cfg.title} — ${category.toUpperCase()}`));
  header.appendChild(
    el('span', 'muted', 'Same scene, two graphic sets. DOS EGA ↔ Amiga, swapped live with no reload.'),
  );
  out.appendChild(header);

  // Category selector toolbar.
  const catBar = el('div', 'gswitch-bar gswitch-cat-bar');
  const availableCats = ALL_CATEGORIES.filter((c) => cfg.categories[c] != null);
  for (const cat of availableCats) {
    const catLabel = cfg.categories[cat]!.label;
    const b = el('button', 'gswitch-cat', catLabel) as HTMLButtonElement;
    b.type = 'button';
    b.dataset.cat = cat;
    b.classList.toggle('active', cat === category);
    b.addEventListener('click', () => switchCategory(cat));
    catBar.appendChild(b);
  }
  out.appendChild(catBar);

  // Platform toolbar.
  const bar = el('div', 'gswitch-bar');
  const mkPlat = (id: GraphicSetId, text: string): HTMLButtonElement => {
    const b = el('button', 'gswitch-plat', text) as HTMLButtonElement;
    b.type = 'button';
    b.dataset.set = id;
    b.addEventListener('click', () => setPlatform(id));
    return b;
  };
  bar.appendChild(mkPlat('DOS-EGA', 'DOS · EGA'));
  bar.appendChild(mkPlat('Amiga', 'Amiga · 32-color'));
  const spacer = el('span', 'gswitch-spacer');
  bar.appendChild(spacer);
  const prev = el('button', 'ghost-btn', '‹ scene') as HTMLButtonElement;
  prev.type = 'button';
  prev.addEventListener('click', () => step(-1));
  const next = el('button', 'ghost-btn', 'scene ›') as HTMLButtonElement;
  next.type = 'button';
  next.addEventListener('click', () => step(1));
  bar.appendChild(prev);
  bar.appendChild(next);
  out.appendChild(bar);

  // Stage.
  const stage = el('div', 'gswitch-stage');
  const canvas = el('canvas', 'pixelated gswitch-canvas') as HTMLCanvasElement;
  stage.appendChild(canvas);
  out.appendChild(stage);
  out.appendChild(el('div', 'gswitch-meta muted'));

  state = { manager, sharedIds, cursor: 0, canvas };
  redraw();

  // Headless e2e seam.
  (window as unknown as { __gswitch?: Record<string, unknown> }).__gswitch = {
    active: () => state?.manager.active,
    platforms: () => state?.manager.available ?? [],
    sharedIds: () => [...(state?.sharedIds ?? [])],
    currentId: () => (state ? state.sharedIds[state.cursor] : -1),
    setPlatform: (id: GraphicSetId) => setPlatform(id),
    step: (d: number) => step(d),
    // Checksum of the currently-resolved frame's RGBA — must differ between EGA and Amiga.
    checksum: () => {
      if (!state) return 0;
      const id = state.sharedIds[state.cursor];
      const img = state.manager.resolve({ category: CATEGORY_KIND[currentCategory], index: id });
      return img ? imageChecksum(img) : 0;
    },
    // Category seam — e2e can probe which categories are supported and which is active.
    categories: () => ALL_CATEGORIES,
    activeCategory: () => currentCategory,
  };
  (window as unknown as { __rendered: number }).__rendered = sharedIds.length;
  return sharedIds.length;
}
