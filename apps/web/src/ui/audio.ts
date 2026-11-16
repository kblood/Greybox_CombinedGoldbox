/**
 * Audio view (`?audio=1`) — the per-platform music & SFX switch, the audible half of the
 * "best-of, switch live" feature. Loads Champions of Krynn's own Amiga sound assets
 * (`Sound/krynn` SMUS title theme + the IFF 8SVX effects) and plays them through the
 * engine's pure decoders + the browser `AudioManager`.
 *
 * Toggling DOS-EGA ↔ Amiga here is the audio twin of the graphics switch: Amiga arms the
 * sampled SFX and the square-wave title theme; DOS honestly reports that its `MIDI.DAX`
 * music driver format is still undecoded (so we never fake DOS audio). A tempo slider
 * exposes the one timing constant the SMUS spec leaves to the player.
 *
 * `window.__audio` is the headless e2e seam.
 */
import type { GraphicSetId } from '@goldbox/engine';
import { assetUrl } from './catalog.js';
import { el } from './render.js';
import { AudioManager } from '../audio/audioManager.js';

const COK_SOUND = 'amiga_extracted/ChampionsOfKrynn/disk1/Sound';
const MUSIC_FILE = 'krynn';
/** A representative set of CoK Amiga SFX (all IFF 8SVX). */
const SFX_FILES = ['arrow', 'hit', 'fireb', 'gate', 'swish', 'dead', 'cast2', 'tuningfork'] as const;

let manager: AudioManager | null = null;

function setStatus(msg: string): void {
  const s = document.querySelector('#status');
  if (s) s.textContent = msg;
}

async function fetchBytes(path: string): Promise<Uint8Array | null> {
  try {
    const resp = await fetch(assetUrl(path));
    if (!resp.ok) return null;
    return new Uint8Array(await resp.arrayBuffer());
  } catch {
    return null;
  }
}

export async function startAudio(): Promise<number> {
  const out = document.querySelector('#output') as HTMLElement;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  out.innerHTML = '';
  setStatus('Loading Champions of Krynn audio (Amiga SMUS + 8SVX)…');

  const musicBytes = await fetchBytes(`${COK_SOUND}/${MUSIC_FILE}`);
  const sfxBytes = await Promise.all(
    SFX_FILES.map(async (name) => ({ name: name as string, bytes: await fetchBytes(`${COK_SOUND}/${name}`) })),
  );
  const sfx = sfxBytes.filter((s): s is { name: string; bytes: Uint8Array } => s.bytes !== null);

  manager = new AudioManager();
  manager.registerDosUndecoded();
  manager.registerAmiga(musicBytes, sfx);
  manager.setPlatform('Amiga');

  // ---- UI ----
  const header = el('div', 'asset-header');
  header.appendChild(el('span', 'badge', 'AUDIO'));
  header.appendChild(el('span', 'asset-name', 'Champions of Krynn — music & sound'));
  header.appendChild(el('span', 'muted', 'Per-platform audio, switched live with the graphics mode.'));
  out.appendChild(header);

  const bar = el('div', 'gswitch-bar');
  const mkPlat = (id: GraphicSetId, text: string): HTMLButtonElement => {
    const b = el('button', 'gswitch-plat', text) as HTMLButtonElement;
    b.type = 'button';
    b.dataset.set = id;
    b.addEventListener('click', () => selectPlatform(id));
    return b;
  };
  bar.appendChild(mkPlat('DOS-EGA', 'DOS · EGA'));
  bar.appendChild(mkPlat('Amiga', 'Amiga · sampled'));
  out.appendChild(bar);

  const transport = el('div', 'gswitch-bar');
  const playBtn = el('button', 'ghost-btn', '▶ Play music') as HTMLButtonElement;
  playBtn.type = 'button';
  playBtn.addEventListener('click', () => {
    if (!manager) return;
    if (manager.isPlayingMusic) {
      manager.stopMusic();
      playBtn.textContent = '▶ Play music';
    } else if (manager.playMusic()) {
      playBtn.textContent = '■ Stop music';
    } else {
      setStatus(manager.musicUnavailableReason() ?? 'No music for this platform.');
    }
  });
  transport.appendChild(playBtn);

  const tempoWrap = el('label', 'audio-tempo');
  tempoWrap.appendChild(el('span', 'muted', 'tempo '));
  const tempo = el('input') as HTMLInputElement;
  tempo.type = 'range';
  tempo.min = '50';
  tempo.max = '200';
  tempo.value = '100'; // percent of the score's own (now correct) tempo
  tempo.addEventListener('input', () => manager?.setTempoScale(Number(tempo.value) / 100));
  tempoWrap.appendChild(tempo);
  transport.appendChild(tempoWrap);
  out.appendChild(transport);

  const sfxBar = el('div', 'gswitch-bar audio-sfx');
  out.appendChild(sfxBar);
  const meta = el('div', 'gswitch-meta muted');
  out.appendChild(meta);

  function refresh(): void {
    if (!manager) return;
    const plat = manager.activePlatform;
    document.querySelectorAll('.gswitch-plat').forEach((b) => {
      b.classList.toggle('active', (b as HTMLElement).dataset.set === plat);
    });
    // SFX buttons for the active platform.
    sfxBar.innerHTML = '';
    const names = manager.sfxNames();
    if (names.length === 0) {
      sfxBar.appendChild(el('span', 'muted', 'No sampled SFX for this platform.'));
    } else {
      sfxBar.appendChild(el('span', 'muted', 'SFX: '));
      for (const n of names) {
        const b = el('button', 'ghost-btn', n) as HTMLButtonElement;
        b.type = 'button';
        b.addEventListener('click', () => manager?.playSfx(n));
        sfxBar.appendChild(b);
      }
    }
    const reason = manager.musicUnavailableReason();
    meta.textContent =
      plat === 'Amiga'
        ? `Amiga — title theme (SMUS, square-wave voices) + ${names.length} sampled effects (8SVX).`
        : `DOS — ${reason ?? 'music available'}. SFX: PC-speaker (custom format, not yet decoded).`;
    setStatus(
      reason
        ? `${plat}: ${reason}. Try the Amiga toggle for working audio.`
        : `${plat}: press Play for the title theme; trigger SFX below.`,
    );
  }

  function selectPlatform(id: GraphicSetId): void {
    if (!manager) return;
    manager.setPlatform(id);
    const playBtnEl = transport.querySelector('button');
    if (playBtnEl) playBtnEl.textContent = manager.isPlayingMusic ? '■ Stop music' : '▶ Play music';
    refresh();
  }

  refresh();

  // Headless e2e seam.
  (window as unknown as { __audio?: Record<string, unknown> }).__audio = {
    platform: () => manager?.activePlatform ?? null,
    setPlatform: (id: GraphicSetId) => selectPlatform(id),
    musicReason: () => manager?.musicUnavailableReason() ?? null,
    sfxCount: () => manager?.sfxNames().length ?? 0,
    sfxNames: () => manager?.sfxNames() ?? [],
    // Does the active platform have a parsed, playable score?
    hasScore: () => manager?.musicUnavailableReason() === null,
  };
  (window as unknown as { __rendered: number }).__rendered = sfx.length;
  return sfx.length;
}
