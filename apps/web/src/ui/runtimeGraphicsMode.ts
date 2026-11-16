import type { ArtMode, FitOptions, GraphicSetId } from '@goldbox/engine';
import type { ScreenSurface } from '@goldbox/ui-kit';

/** Runtime-wide graphics choice. Restyle is presentation-only and may fall back per asset. */
export type RuntimeGraphicsMode = GraphicSetId | 'Restyle';

/** Graphics preferences are shared; campaign/save/automap route identities remain untouched. */
export function runtimeGraphicsGameId(gameId: string): string {
  return /^cok-natural(?:-[2-6])?$/.test(gameId) ? 'cok' : gameId;
}

/** CoK keeps the requested choice when an individual backdrop falls back to DOS. */
export function resolveCombatGraphicsMode({ gameId, demoMode, restyle, requested, actual }: {
  gameId?: string;
  demoMode?: RuntimeGraphicsMode;
  restyle?: boolean;
  requested?: GraphicSetId;
  actual?: GraphicSetId;
}): RuntimeGraphicsMode {
  const original = runtimeGraphicsGameId(gameId ?? '') === 'cok'
    ? requested ?? actual : actual ?? requested;
  return demoMode ?? (restyle ? 'Restyle' : original ?? 'DOS-EGA');
}

function storageKey(gameId: string): string {
  return `greybox.graphics.${runtimeGraphicsGameId(gameId)}`;
}

function fallbackKey(gameId: string): string {
  return `greybox.graphics-fallback.${runtimeGraphicsGameId(gameId)}`;
}

function storedPreference(gameId: string, fallback: boolean): RuntimeGraphicsMode | null {
  try {
    const prefix = fallback ? 'greybox.graphics-fallback.' : 'greybox.graphics.';
    const key = `${prefix}${runtimeGraphicsGameId(gameId)}`;
    let value = localStorage.getItem(key);
    const valid = (value: string | null): value is RuntimeGraphicsMode =>
      value === 'DOS-EGA' || value === 'Amiga' || (!fallback && value === 'Restyle');
    // Migrate only the entered route, only when absent; retain every legacy key as evidence.
    if (value === null && runtimeGraphicsGameId(gameId) !== gameId) {
      value = localStorage.getItem(`${prefix}${gameId}`);
      if (valid(value)) { try { localStorage.setItem(key, value); } catch { /* optional storage */ } }
    }
    return valid(value) ? value : null;
  } catch { return null; }
}

/** Read the player’s per-game graphics choice; stale values fail back to the original DOS look. */
export function readRuntimeGraphicsMode(gameId: string): RuntimeGraphicsMode {
  return storedPreference(gameId, false) ?? 'DOS-EGA';
}

/** Read the last selected original system for assets without a Restyle replacement. */
export function readRuntimeGraphicsFallback(gameId: string): GraphicSetId {
  return storedPreference(gameId, true) as GraphicSetId | null ?? 'DOS-EGA';
}

/** Persist a per-game choice without making unavailable storage a gameplay failure. */
export function writeRuntimeGraphicsMode(gameId: string, mode: RuntimeGraphicsMode): void {
  const current = readRuntimeGraphicsMode(gameId);
  readRuntimeGraphicsFallback(gameId);
  try {
    const fallback = fallbackKey(gameId);
    if (mode !== 'Restyle') localStorage.setItem(fallback, mode);
    else if (localStorage.getItem(fallback) === null) {
      // Migrate an existing DOS/Amiga choice when Restyle is selected for the first time.
      if (current === 'Amiga' || current === 'DOS-EGA') localStorage.setItem(fallback, current);
    }
    localStorage.setItem(storageKey(gameId), mode);
  } catch { /* storage is optional */ }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('goldbox:graphics-mode', { detail: { gameId: runtimeGraphicsGameId(gameId), mode } }));
  }
}

/**
 * CoK presentation scaling, one shared preference for every CoK surface (exploration, travel, camp,
 * combat, title, companion panels). `integer` is the default: whole-row scaling with letterboxing.
 * `fit` fills the box with a non-integer scale. Stored under its own key, so the graphics choice
 * (`greybox.graphics.*`) and its fallback are untouched. Other games keep their own defaults.
 */
export type PresentationScale = 'integer' | 'fit';
export const PRESENTATION_SCALE_EVENT = 'goldbox:presentation-scale';

function presentationScaleKey(gameId: string): string {
  return `greybox.presentation-scale.${runtimeGraphicsGameId(gameId)}`;
}

function isPresentationScale(value: unknown): value is PresentationScale {
  return value === 'integer' || value === 'fit';
}

/**
 * The latest CoK scale chosen in this module session, per shared key. It survives unavailable or
 * refused storage, so a surface opened later in the session still honours the newest choice.
 */
const sessionPresentationScale = new Map<string, PresentationScale>();

/**
 * Session choice first, then a valid stored value, then the integer default. Absent, unavailable,
 * or corrupt storage (any value other than `integer` or `fit`) reads as `integer`.
 */
export function readPresentationScale(gameId: string): PresentationScale {
  const id = runtimeGraphicsGameId(gameId);
  const session = sessionPresentationScale.get(id);
  if (session) return session;
  let stored: string | null = null;
  try { stored = localStorage.getItem(presentationScaleKey(gameId)); } catch { stored = null; }
  return isPresentationScale(stored) ? stored : 'integer';
}

/**
 * Record and persist the CoK scale, then notify live surfaces with the validated value. Live listeners
 * apply the event value directly, so they never depend on re-reading storage.
 */
export function writePresentationScale(gameId: string, scale: PresentationScale): void {
  if (!isPresentationScale(scale)) return;
  const id = runtimeGraphicsGameId(gameId);
  sessionPresentationScale.set(id, scale);
  try { localStorage.setItem(presentationScaleKey(gameId), scale); } catch { /* storage is optional */ }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PRESENTATION_SCALE_EVENT, { detail: { gameId: id, scale } }));
  }
}

/** Only CoK routes follow the shared CoK presentation preference. */
export function followsCokPresentation(gameId: string): boolean {
  return runtimeGraphicsGameId(gameId) === 'cok';
}

/** FitOptions for a new surface. Non-CoK games get `{}`, the fit default they always had. */
export function presentationFitOptions(gameId: string): FitOptions {
  if (!followsCokPresentation(gameId)) return {};
  return readPresentationScale(gameId) === 'integer' ? { integer: true } : {};
}

/**
 * Keep a CoK surface on the shared preference. A write from any surface applies the event's validated
 * value directly. The listener is released by the returned detach function, which `surface.dispose()`
 * also calls, and when an attached canvas later leaves the DOM. A canvas that was never attached yet
 * keeps its listener until it is attached or disposed.
 */
export function followPresentationScale(surface: ScreenSurface, gameId: string): () => void {
  if (!followsCokPresentation(gameId) || typeof window === 'undefined') return () => {};
  const id = runtimeGraphicsGameId(gameId);
  let listening = true;
  let seenAttached = surface.canvas.isConnected;
  const detach = (): void => {
    if (!listening) return;
    listening = false;
    window.removeEventListener(PRESENTATION_SCALE_EVENT, onChange);
  };
  const onChange = (event: Event): void => {
    if (surface.canvas.isConnected) seenAttached = true;
    else if (seenAttached) { detach(); return; }
    const detail = (event as CustomEvent<{ gameId?: unknown; scale?: unknown }>).detail;
    if (detail?.gameId !== id || !isPresentationScale(detail.scale)) return;
    surface.setFitOptions(detail.scale === 'integer' ? { integer: true } : {});
  };
  window.addEventListener(PRESENTATION_SCALE_EVENT, onChange);
  // Ownership: disposing the surface releases this listener, so a closed surface retains no window reference.
  const disposeSurface = surface.dispose.bind(surface);
  surface.dispose = (): void => { detach(); disposeSurface(); };
  return detach;
}

export function artModeForRuntime(mode: RuntimeGraphicsMode): ArtMode {
  return mode === 'Restyle' ? { kind: 'restyle' } : { kind: 'original', system: mode };
}

/** Town chrome has no admitted Amiga or Restyle replacement; keep its fallback visible. */
export function townGraphicsFallbackMessage(mode: RuntimeGraphicsMode): string | null {
  return mode === 'DOS-EGA' ? null
    : `Town artwork still uses DOS-EGA while ${mode} is selected; alternate Town artwork is not admitted.`;
}

/** The shared Town route serves DQK too; never consult CoK preference for that caller. */
export function townGraphicsMode(
  levelCapRuleset: 'cok' | 'dqk',
  readCokMode: () => RuntimeGraphicsMode,
): RuntimeGraphicsMode | null {
  return levelCapRuleset === 'cok' ? readCokMode() : null;
}
