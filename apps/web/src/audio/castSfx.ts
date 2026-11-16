/**
 * Cast sound cue (A2.2) — a tiny zero-asset WebAudio "shimmer" played when a spell is cast in camp.
 * It is intentionally lightweight: the full per-platform in-game audio wiring (real CoK/Amiga cast
 * samples following the graphics-mode switch) lands in A6.2; this is just an honest audible cue so
 * casting feels like something happened. Defensive — a no-op when WebAudio is unavailable (headless).
 *
 * `castSfxCount()` lets headless e2e assert a cast triggered the cue without needing real playback.
 */
let ctx: AudioContext | null = null;
let count = 0;

export function playCastSfx(): void {
  count += 1;
  try {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = ctx ?? new AC();
    const now = ctx.currentTime;
    // A quick two-note rising shimmer.
    [660, 990].forEach((freq, i) => {
      const t = now + i * 0.08;
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  } catch {
    /* audio unavailable — keep the count, skip playback */
  }
}

export function castSfxCount(): number {
  return count;
}
