/**
 * Whole-game dashboard view. Given a manifest id, it loads the manifest JSON
 * from web-engine/games/, calls `loadGame` (fetching the REAL repo files via the
 * shared `/@fs` fetcher), and renders a per-game dashboard: a title/platform
 * header followed by a collapsible section per category (Title, Scenes,
 * Portraits, Backdrops, Tiles, Sprites, UI, Data), each a thumbnail grid reusing
 * the shared frame→canvas render. Counts per category and notes for
 * undecoded/errored files are shown inline.
 */
import { loadGame } from '@goldbox/engine';
import type {
  GameManifest,
  FetchBytes,
  GameCategory,
  GameCategoryGroup,
  LoadedGame,
} from '@goldbox/engine';
import { assetUrl, manifestUrl } from './catalog.js';
import { el, makeFrameCard, renderNow } from './render.js';

const CATEGORY_TITLE: Record<GameCategory, string> = {
  title: 'Title',
  scenes: 'Scenes',
  portraits: 'Portraits',
  backdrops: 'Backdrops',
  tiles: 'Tiles',
  sprites: 'Sprites',
  ui: 'UI',
  data: 'Data (not yet decoded)',
};

/** Fetch raw bytes for a repo-relative path via Vite /@fs (dev) — used by loadGame. */
const fetchBytes: FetchBytes = async (path: string): Promise<Uint8Array> => {
  const resp = await fetch(assetUrl(path));
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
};

function setStatus(msg: string, kind: 'info' | 'error' = 'info'): void {
  const s = document.querySelector('#status') as HTMLElement;
  if (!s) return;
  s.textContent = msg;
  s.className = kind === 'error' ? 'status error' : 'status';
}

/** Render one collapsible category section. Returns frames eagerly rendered. */
function renderCategory(group: GameCategoryGroup): { node: HTMLElement; eager: number } {
  const section = el('details', 'cat-section');
  // Open by default for graphics categories that have frames.
  if (group.frameCount > 0) section.setAttribute('open', '');

  const summary = el('summary', 'cat-summary');
  summary.appendChild(el('span', 'cat-section-title', CATEGORY_TITLE[group.category] ?? group.category));
  const fileCount = group.files.length;
  summary.appendChild(
    el('span', 'cat-section-count', `${group.frameCount} frame${group.frameCount === 1 ? '' : 's'} · ${fileCount} file${fileCount === 1 ? '' : 's'}`),
  );
  section.appendChild(summary);

  const body = el('div', 'cat-body');
  section.appendChild(body);

  let eager = 0;
  for (const file of group.files) {
    // Per-file note row.
    const fileHead = el('div', 'file-head');
    fileHead.appendChild(el('span', 'file-name', file.name));
    if (file.format) fileHead.appendChild(el('span', 'file-fmt', file.format.toUpperCase()));
    fileHead.appendChild(el('span', 'file-count', `${file.frames.length} frame${file.frames.length === 1 ? '' : 's'}`));
    body.appendChild(fileHead);

    if (file.error) {
      body.appendChild(el('div', 'note small error', `${file.path}: ${file.error}`));
    } else if (file.skipped) {
      body.appendChild(el('div', 'note small', `${file.path}: ${file.skipped}`));
    }

    if (file.frames.length === 0) continue;

    const grid = el('div', 'frame-grid');
    body.appendChild(grid);
    for (let i = 0; i < file.frames.length; i++) {
      const f = file.frames[i];
      // Eagerly render the first frame of each file so headless screenshots
      // capture real art across categories without scroll timing.
      const isFirst = i === 0;
      const card = makeFrameCard(f.image, f.label, { showSwatches: false, eager: isFirst });
      if (isFirst) eager++;
      grid.appendChild(card);
    }
  }

  return { node: section, eager };
}

/** Render the whole-game dashboard into #output. Returns total frames rendered. */
function renderGame(game: LoadedGame): number {
  const out = document.querySelector('#output') as HTMLElement;
  out.innerHTML = '';

  const header = el('div', 'game-header');
  header.appendChild(el('span', 'badge', 'GAME'));
  header.appendChild(el('span', 'asset-name', game.title));
  header.appendChild(el('span', 'muted', `${game.platform}${game.container ? ` · ${game.container}` : ''}`));
  header.appendChild(
    el('span', 'muted', `${game.display.width}×${game.display.height} · ${game.totalFrames} frames · ${game.categories.length} categories`),
  );
  // Round 33 R5: Buck Rogers ships eight GLBR songs in MUSIC.DAX, decoded by already-shipped code
  // that nothing called. `loadGame` now reports a music census for any manifest carrying a score;
  // surfacing it here is what makes that decode reachable rather than merely correct.
  // Round 34 R4: the label is no longer hardcoded to GLBR. Matrix Cubed scores with Miles/AIL XMI
  // (BUCKA/B/C.XMI beside the same FATV9 bank DQK uses), and its MUSIC.DAX is a leftover the
  // manifest-driven suppression in `loadGame` deliberately does not census.
  if (game.music) {
    const m = game.music;
    const label = m.format === 'xmi' ? 'XMI' : 'GLBR';
    header.appendChild(
      el('span', 'muted', `· ${m.songs} ${label} song${m.songs === 1 ? '' : 's'} · ${m.events} events · ${m.channels} channels`),
    );
  }
  // Round 34 R6: the DOS SOUND.DAX bank census. Decode only -- see `GameSoundBankSummary`; the
  // engine plays no DOS sound, and R6 found no AdLib/CMS port immediate in the shipped driver.
  if (game.soundBank) {
    const s = game.soundBank;
    header.appendChild(
      el('span', 'muted', `· SOUND.DAX: ${s.segments} segment${s.segments === 1 ? '' : 's'} (${s.songLike} song-like) · ${s.events} events (decode only)`),
    );
  }
  out.appendChild(header);

  if (game.errors.length) {
    out.appendChild(
      el('div', 'note small error', `${game.errors.length} file(s) failed to decode (see sections below).`),
    );
  }

  for (const group of game.categories) {
    const { node } = renderCategory(group);
    out.appendChild(node);
  }

  // Force-render the first canvas of every open section's grid already handled
  // by eager flag; ensure at least the very first canvas is painted.
  const first = out.querySelector('canvas') as HTMLCanvasElement | null;
  if (first) renderNow(first);

  return game.totalFrames;
}

/**
 * Load and render a game by manifest id. Returns the total decoded frames (which
 * the caller also stores on window.__rendered for headless verification).
 */
export async function loadAndRenderGame(id: string): Promise<number> {
  setStatus(`Loading game "${id}"…`);
  let manifest: GameManifest;
  try {
    const resp = await fetch(manifestUrl(id));
    if (!resp.ok) {
      setStatus(`Manifest fetch ${resp.status} for "${id}".`, 'error');
      return 0;
    }
    manifest = (await resp.json()) as GameManifest;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`Failed to load manifest "${id}": ${msg}`, 'error');
    return 0;
  }

  let game: LoadedGame;
  try {
    game = await loadGame(manifest, fetchBytes);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`Failed to load game "${id}": ${msg}`, 'error');
    return 0;
  }

  const total = renderGame(game);
  const errNote = game.errors.length ? ` · ${game.errors.length} errored` : '';
  setStatus(
    `Loaded ${game.title} (${game.platform}) — ${total} frames across ${game.categories.length} categories${errNote}.`,
  );
  return total;
}

/**
 * List of bundled game manifest ids for the picker.
 *
 * This must name EVERY file in `apps/web/games/`. It drifted once: four manifests
 * (`death-knights-dos`, `pools-of-darkness`, `treasures-of-the-savage-frontier`,
 * `forgotten-realms-unlimited-adventures`) shipped complete and reachable only by typing
 * `?game=<id>` in the URL, because this array is both the sidebar picker AND the gate the Library
 * checks before routing a detected install (`DETECTED_TO_MANIFEST` in `main.ts`). A detected Pools
 * install was told "arrives in a later milestone" while its manifest sat in the bundle.
 * `apps/web/test/e2e.mjs` case `manifest-picker-coverage` now compares the two directions.
 */
export const GAME_IDS: { id: string; label: string }[] = [
  { id: 'champions-dos', label: 'Champions of Krynn (DOS EGA)' },
  { id: 'champions-amiga', label: 'Champions of Krynn (Amiga)' },
  { id: 'death-knights-dos', label: 'Death Knights of Krynn (DOS EGA)' },
  { id: 'death-knights-amiga', label: 'Death Knights of Krynn (Amiga)' },
  { id: 'dark-queen-dos', label: 'The Dark Queen of Krynn (DOS)' },
  { id: 'dark-queen-amiga', label: 'The Dark Queen of Krynn (Amiga)' },
  { id: 'pool-of-radiance', label: 'Pool of Radiance (DOS)' },
  { id: 'pool-amiga', label: 'Pool of Radiance (Amiga)' },
  { id: 'curse-of-the-azure-bonds', label: 'Curse of the Azure Bonds (DOS)' },
  { id: 'curse-amiga', label: 'Curse of the Azure Bonds (Amiga)' },
  { id: 'secret-of-the-silver-blades', label: 'Secret of the Silver Blades (DOS)' },
  { id: 'secret-amiga', label: 'Secret of the Silver Blades (Amiga)' },
  { id: 'pools-of-darkness', label: 'Pools of Darkness (DOS VGA)' },
  { id: 'pools-amiga', label: 'Pools of Darkness (Amiga)' },
  { id: 'gateway-to-the-savage-frontier', label: 'Gateway to the Savage Frontier (DOS)' },
  { id: 'gateway-amiga', label: 'Gateway to the Savage Frontier (Amiga)' },
  { id: 'treasures-of-the-savage-frontier', label: 'Treasures of the Savage Frontier (DOS VGA)' },
  { id: 'treasures-amiga', label: 'Treasures of the Savage Frontier (Amiga)' },
  { id: 'buck-rogers-countdown-to-doomsday', label: 'Buck Rogers: Countdown to Doomsday (DOS VGA)' },
  { id: 'buck-rogers-amiga', label: 'Buck Rogers: Countdown to Doomsday (Amiga)' },
  { id: 'buck-rogers-matrix-cubed', label: 'Buck Rogers: Matrix Cubed (DOS VGA)' },
  { id: 'neverwinter-nights-dos', label: 'Neverwinter Nights (DOS/AOL)' },
  { id: 'forgotten-realms-unlimited-adventures', label: 'Unlimited Adventures (DOS VGA)' },
];
