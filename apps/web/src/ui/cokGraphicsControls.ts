import { el } from './render.js';
import { readRuntimeGraphicsMode, writeRuntimeGraphicsMode } from './runtimeGraphicsMode.js';
import { addLocalAssetPackPicker } from './localAssetPack.js';

/** Visible CoK icon selector; the label states the current Amiga icon limitation. `isOwnerCurrent` is forwarded to
 * the local folder picker so a pick that resolves after its owner was retired is dropped (see addLocalAssetPackPicker). */
export function cokGraphicsControls(isOwnerCurrent?: () => boolean): HTMLElement {
  const group = el('div', 'gb-dlg-art-controls');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Character icon graphics');
  for (const [mode, label] of [['DOS-EGA', 'DOS · EGA'], ['Amiga', 'Amiga · DOS icon fallback'], ['Restyle', 'Restyle']] as const) {
    const button = el('button', 'gb-btn', label) as HTMLButtonElement;
    button.type = 'button';
    button.dataset.runtimeGraphicsMode = mode;
    button.addEventListener('click', () => writeRuntimeGraphicsMode('cok', mode));
    group.appendChild(button);
  }
  addLocalAssetPackPicker(group, () => {}, isOwnerCurrent);
  const refresh = (): void => {
    const selected = readRuntimeGraphicsMode('cok');
    group.querySelectorAll<HTMLButtonElement>('button[data-runtime-graphics-mode]').forEach((button) => {
      const active = button.dataset.runtimeGraphicsMode === selected;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  };
  const listener = (event: Event): void => {
    if ((event as CustomEvent<{ gameId?: string }>).detail?.gameId === 'cok') refresh();
  };
  refresh();
  window.addEventListener('goldbox:graphics-mode', listener);
  const cleanup = new MutationObserver(() => {
    if (!group.isConnected) {
      window.removeEventListener('goldbox:graphics-mode', listener);
      cleanup.disconnect();
    }
  });
  cleanup.observe(document.body, { childList: true, subtree: true });
  return group;
}
