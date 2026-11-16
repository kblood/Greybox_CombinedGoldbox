/**
 * Browser audio layer — plays the Krynn games' own music and sound effects through the
 * Web Audio API, bound to the same platform identity as the live graphics switch.
 *
 * The engine ships pure *decoders* (`parseSmus`, `decode8svx`); this module is the playback
 * half that may only exist in the browser. Amiga music (IFF SMUS) is sequenced as square-wave
 * voices — the `in3` instrument the Krynn scores reference is the bundled `soundData` square
 * wave, which a Web Audio `'square'` oscillator reproduces faithfully. Amiga SFX (IFF 8SVX)
 * are loaded straight into `AudioBuffer`s and triggered as one-shots.
 *
 * Platform binding mirrors `GraphicSetManager`: `setPlatform('Amiga')` arms the Amiga score
 * and SFX; `setPlatform('DOS-EGA')` reports DOS music as not-yet-decoded (the CoK `MIDI.DAX`
 * driver format is unsolved) so callers can surface that honestly rather than play silence
 * pretending to be DOS audio.
 *
 * The class is created lazily and the `AudioContext` is only constructed/resumed inside a
 * user gesture (browser autoplay policy). A `window`-free path keeps it import-safe for SSR.
 */
import { parseSmus, decode8svx, type SmusScore, type AudioClip, type GraphicSetId } from '@goldbox/engine';

/** Pitch → frequency: equal-tempered MIDI, A4 (note 69) = 440 Hz. */
function midiToHz(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

/**
 * The Krynn SMUS scores name their voices `in1..in7`; the `soundData` instrument library backs each
 * with a 7-octave 8SVX waveform — `in1`=square, `in2`=triangle, `in3..in7`=saw/odd-harmonic. We
 * approximate those with the nearest Web Audio oscillator (a `PeriodicWave` from the real samples is
 * a later enhancement). Playing every voice as a square — as before — is why "the tones are off".
 */
const WAVE_BY_INSTRUMENT: Record<string, OscillatorType> = {
  in1: 'square', in2: 'triangle', in3: 'sawtooth', in4: 'sawtooth', in5: 'sawtooth', in6: 'sawtooth', in7: 'sawtooth',
};
function resolveOscType(register: number, instrumentNames: string[]): OscillatorType {
  return WAVE_BY_INSTRUMENT[instrumentNames[register] ?? ''] ?? 'square';
}

/** A decoded SFX ready to trigger: its name plus a lazily-built AudioBuffer. */
interface SfxEntry {
  clip: AudioClip;
  buffer: AudioBuffer | null;
}

export interface PlatformAudio {
  /** Parsed score for this platform's music, or null if undecoded/unavailable. */
  score: SmusScore | null;
  /** Human note for why music is unavailable (shown in UI), or null when it plays. */
  musicNote: string | null;
  /** name → SFX entry. */
  sfx: Map<string, SfxEntry>;
  /**
   * A pre-rendered PCM music track to loop (DQK's OPL2 mixdown from the engine `renderXmiSong`).
   * Takes precedence over `score`: when present this platform's music plays as a looping buffer
   * rather than a sequenced SMUS line.
   */
  pcmMusic?: AudioClip | null;
  /** Lazily-built AudioBuffer for {@link pcmMusic}. */
  pcmMusicBuffer?: AudioBuffer | null;
  /**
   * Multiple named SMUS scores (Death Knights of Krynn ships action/horror/lordsoth/sorrow/undead/
   * victory + krynn). `score` points at whichever is active; absent for single-track platforms (CoK).
   */
  tracks?: Map<string, SmusScore>;
  /** The currently-selected track name (when `tracks` is present). */
  activeTrack?: string;
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private platforms = new Map<GraphicSetId, PlatformAudio>();
  private active: GraphicSetId | null = null;

  /** Currently-scheduled music nodes, so a platform switch can stop them. */
  private musicNodes: AudioScheduledSourceNode[] = [];
  /**
   * A per-playback submix the whole current score routes through. `stopMusic` **disconnects** it
   * immediately, which silences every voice instantly — even oscillators/buffers whose `start(when)`
   * is still in the future (calling `.stop()` on those throws `InvalidStateError` and would otherwise
   * leak them, so a fast scene/track re-trigger stacked the old score *on top of* the new one).
   */
  private musicBus: GainNode | null = null;
  private playingMusic = false;

  /**
   * Playback-speed multiplier over the score's own tempo (1 = faithful). The note durations now come
   * from the score as real quarter-note beats, so this is just an optional global stretch (the demo
   * tempo slider; a slightly tenser battle theme), not the old guessed ticks-per-quarter.
   */
  private tempoScale = 1;
  /** 0..1 master volume. */
  private volume = 0.6;

  /** Register a platform's decoded audio (score may be null when the format is unsolved). */
  registerPlatform(id: GraphicSetId, audio: PlatformAudio): void {
    this.platforms.set(id, audio);
    if (this.active === null) this.active = id;
  }

  /** Convenience: register an Amiga platform from raw SMUS music + named 8SVX SFX bytes. */
  registerAmiga(musicBytes: Uint8Array | null, sfx: Array<{ name: string; bytes: Uint8Array }>): void {
    let score: SmusScore | null = null;
    let musicNote: string | null = null;
    try {
      score = musicBytes ? parseSmus(musicBytes, 'krynn') : null;
      if (!score) musicNote = 'Amiga music asset not found';
    } catch (e) {
      musicNote = `Amiga music decode failed: ${e instanceof Error ? e.message : String(e)}`;
    }
    const sfxMap = new Map<string, SfxEntry>();
    for (const s of sfx) {
      try {
        sfxMap.set(s.name, { clip: decode8svx(s.bytes, s.name), buffer: null });
      } catch {
        /* skip unreadable SFX */
      }
    }
    this.registerPlatform('Amiga', { score, musicNote, sfx: sfxMap });
  }

  /**
   * Register an Amiga platform that ships SEVERAL named SMUS scores (Death Knights of Krynn:
   * action/horror/krynn/lordsoth/sorrow/undead/victory). All decode up-front; `defaultTrack`
   * (or the first that parses) becomes the active `score`, and `setMusicTrack` swaps between them.
   */
  registerAmigaTracks(
    named: Array<{ name: string; bytes: Uint8Array }>,
    sfx: Array<{ name: string; bytes: Uint8Array }>,
    defaultTrack?: string,
  ): void {
    const tracks = new Map<string, SmusScore>();
    let firstOk: string | null = null;
    for (const t of named) {
      try {
        const s = parseSmus(t.bytes, t.name);
        if (s) {
          tracks.set(t.name, s);
          if (!firstOk) firstOk = t.name;
        }
      } catch {
        /* skip a track that won't decode rather than fail the whole game */
      }
    }
    const activeTrack = defaultTrack && tracks.has(defaultTrack) ? defaultTrack : firstOk ?? undefined;
    const score = activeTrack ? tracks.get(activeTrack)! : null;
    const musicNote = score ? null : 'no Amiga music tracks decoded';
    const sfxMap = new Map<string, SfxEntry>();
    for (const s of sfx) {
      try {
        sfxMap.set(s.name, { clip: decode8svx(s.bytes, s.name), buffer: null });
      } catch {
        /* skip unreadable SFX */
      }
    }
    this.registerPlatform('Amiga', { score, musicNote, sfx: sfxMap, tracks, activeTrack });
  }

  /** Names of the active platform's selectable music tracks (empty for single-track platforms). */
  musicTrackNames(): string[] {
    const pa = this.active ? this.platforms.get(this.active) : null;
    return pa?.tracks ? [...pa.tracks.keys()] : [];
  }

  /** The active platform's currently-selected track name, or null when single-track/undecoded. */
  activeMusicTrack(): string | null {
    const pa = this.active ? this.platforms.get(this.active) : null;
    return pa?.activeTrack ?? null;
  }

  /**
   * Select a named music track on the active platform. Returns false when the platform is
   * single-track or has no track by that name. If music is currently playing it restarts on the
   * new track so a scene/event change is heard immediately.
   */
  setMusicTrack(name: string): boolean {
    const pa = this.active ? this.platforms.get(this.active) : null;
    if (!pa?.tracks?.has(name)) return false;
    if (pa.activeTrack === name) return true;
    pa.score = pa.tracks.get(name)!;
    pa.activeTrack = name;
    if (this.playingMusic) this.playMusic(); // restart on the newly-selected score
    return true;
  }

  /**
   * Register a platform straight from already-decoded {@link AudioClip}s (e.g. DQK's `SFXDQ.VOC`
   * digitized effects, decoded by the engine `decodeVoc`). `musicNote` explains why music is absent
   * (DQK's OPL2 synthesis is a later slice), so the platform honestly plays SFX without faking music.
   */
  registerDigitizedSfx(id: GraphicSetId, clips: AudioClip[], musicNote: string): void {
    const sfx = new Map<string, SfxEntry>();
    for (const clip of clips) sfx.set(clip.name, { clip, buffer: null });
    this.registerPlatform(id, { score: null, musicNote, sfx });
  }

  /**
   * Attach a pre-rendered looping PCM **music** track to a platform (DQK's OPL2 mixdown). Creates
   * the platform if absent; clears the "music unavailable" note so the platform now plays music.
   * The buffer is built lazily on first play.
   */
  setPcmMusic(id: GraphicSetId, clip: AudioClip): void {
    const pa = this.platforms.get(id);
    if (pa) {
      pa.pcmMusic = clip;
      pa.pcmMusicBuffer = null;
      pa.musicNote = null;
    } else {
      this.registerPlatform(id, { score: null, musicNote: null, sfx: new Map(), pcmMusic: clip });
    }
  }

  /**
   * Register the DOS platform: music is blocked, but no longer on an undecoded format. MIDI.DAX's
   * architecture, SAA1099/Game Blaster hardware target, and note-encoding are decoded
   * (docs/midi-dax-format.md); what's still missing is the on-disk location of the actual note
   * timeline (the driver appears to receive it from GAME.OVR/START.EXE at runtime, not from the
   * DAX block itself), so there is nothing to render yet. See docs/midi-dax-format.md §1.6.
   */
  registerDosUndecoded(): void {
    this.registerPlatform('DOS-EGA', {
      score: null,
      musicNote: 'DOS music (MIDI.DAX): format decoded, note timeline location not yet found',
      sfx: new Map(),
    });
  }

  get activePlatform(): GraphicSetId | null {
    return this.active;
  }

  /** Lazily create / resume the AudioContext. Must be called from a user gesture. */
  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!this.ctx) {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Swap the active platform; stops current music (the caller may restart it). */
  setPlatform(id: GraphicSetId): void {
    if (!this.platforms.has(id)) return;
    const wasPlaying = this.playingMusic;
    this.stopMusic();
    this.active = id;
    if (wasPlaying) this.playMusic();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
  }

  /** Set the playback-speed multiplier (1 = the score's own tempo). Clamped to a sane range. */
  setTempoScale(s: number): void {
    this.tempoScale = Math.max(0.25, Math.min(4, s));
    if (this.playingMusic) this.playMusic(); // re-schedule at the new speed
  }

  /** Why is music unavailable for the active platform (or null if it can play)? */
  musicUnavailableReason(): string | null {
    const pa = this.active ? this.platforms.get(this.active) : null;
    if (!pa) return 'no platform selected';
    if (!pa.score && !pa.pcmMusic) return pa.musicNote ?? 'no music';
    return null;
  }

  get isPlayingMusic(): boolean {
    return this.playingMusic;
  }

  /**
   * Schedule the active platform's score as square-wave voices and start it.
   * No-op (returns false) when the platform has no decoded music.
   */
  playMusic(): boolean {
    const pa = this.active ? this.platforms.get(this.active) : null;
    if (!pa || (!pa.score && !pa.pcmMusic)) return false;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return false;

    this.stopMusic();
    // Fresh per-playback submix: stopMusic disconnects this in one call, instantly silencing every
    // voice even if its scheduled start is still in the future (which `.stop()` can't cancel).
    const bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(this.master);
    this.musicBus = bus;
    // A pre-rendered PCM track (DQK OPL2 mixdown) loops as one buffer; takes precedence over SMUS.
    if (pa.pcmMusic) {
      if (!pa.pcmMusicBuffer) {
        const buf = ctx.createBuffer(1, pa.pcmMusic.pcm.length, pa.pcmMusic.sampleRate);
        buf.getChannelData(0).set(pa.pcmMusic.pcm);
        pa.pcmMusicBuffer = buf;
      }
      const src = ctx.createBufferSource();
      src.buffer = pa.pcmMusicBuffer;
      src.loop = true; // the whole mixdown is the loop body
      src.connect(bus);
      src.start(ctx.currentTime + 0.04);
      this.musicNodes.push(src);
      this.playingMusic = true;
      return true;
    }
    const score = pa.score!;
    const t0 = ctx.currentTime + 0.06; // small lead-in
    for (let i = 0; i < score.tracks.length; i++) {
      this.scheduleTrack(ctx, bus, score, i, t0);
    }
    this.playingMusic = true;
    return true;
  }

  /**
   * Schedule one SMUS track from `t0`: real note-value durations (`durationBeats × 60/BPM`), the
   * voice's own waveform (resolved from its instrument), chord-aware timing, and inline tempo
   * changes (SID_Tempo). The voice's instrument defaults to the one named at this track's index and
   * follows any in-stream `instrument` events.
   */
  private scheduleTrack(
    ctx: AudioContext,
    out: GainNode,
    score: SmusScore,
    trackIndex: number,
    t0: number,
  ): void {
    let t = t0;
    let bpm = score.tempoBPM;
    let secPerBeat = 60 / bpm / this.tempoScale;
    let oscType = resolveOscType(trackIndex, score.instruments);
    for (const ev of score.tracks[trackIndex]!) {
      if (ev.kind === 'note') {
        const dur = ev.durationBeats * secPerBeat;
        this.scheduleNote(ctx, out, midiToHz(ev.pitch), t, dur, oscType);
        // A chord note sounds together with the next; only advance time on the last.
        if (!ev.chord) t += dur;
      } else if (ev.kind === 'rest') {
        t += ev.durationBeats * secPerBeat;
      } else if (ev.kind === 'instrument') {
        oscType = resolveOscType(ev.instrument, score.instruments);
      } else if (ev.kind === 'tempo') {
        bpm = ev.bpm;
        secPerBeat = 60 / bpm / this.tempoScale;
      }
    }
  }

  /** One note with the given waveform + a short attack/decay envelope to avoid clicks. */
  private scheduleNote(ctx: AudioContext, out: GainNode, hz: number, when: number, dur: number, oscType: OscillatorType = 'square'): void {
    const osc = ctx.createOscillator();
    osc.type = oscType;
    osc.frequency.value = hz;
    const g = ctx.createGain();
    const peak = 0.22;
    const a = Math.min(0.012, dur * 0.2);
    const sustainEnd = Math.max(when + a, when + dur - 0.03);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + a);
    g.gain.setValueAtTime(peak, sustainEnd);
    g.gain.linearRampToValueAtTime(0, when + dur);
    osc.connect(g);
    g.connect(out);
    osc.start(when);
    osc.stop(when + dur + 0.02);
    this.musicNodes.push(osc);
  }

  /** Stop and discard any scheduled music voices. */
  stopMusic(): void {
    // Disconnect the whole submix FIRST: this silences every voice instantly, including nodes whose
    // `start(when)` is still in the future (those throw on `.stop()` and would otherwise keep playing).
    if (this.musicBus) {
      try {
        this.musicBus.disconnect();
      } catch {
        /* already disconnected */
      }
      this.musicBus = null;
    }
    for (const n of this.musicNodes) {
      try {
        n.stop();
      } catch {
        /* not yet started (future start) — already silenced by the bus disconnect above */
      }
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.musicNodes = [];
    this.playingMusic = false;
  }

  /** Names of the active platform's SFX. */
  sfxNames(): string[] {
    const pa = this.active ? this.platforms.get(this.active) : null;
    return pa ? [...pa.sfx.keys()] : [];
  }

  /** Trigger a one-shot SFX by name. Builds its AudioBuffer on first use. */
  playSfx(name: string): boolean {
    const pa = this.active ? this.platforms.get(this.active) : null;
    const entry = pa?.sfx.get(name);
    if (!entry) return false;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return false;
    if (!entry.buffer) {
      const buf = ctx.createBuffer(1, entry.clip.pcm.length, entry.clip.sampleRate);
      buf.getChannelData(0).set(entry.clip.pcm);
      entry.buffer = buf;
    }
    const src = ctx.createBufferSource();
    src.buffer = entry.buffer;
    const g = ctx.createGain();
    g.gain.value = 0.9;
    src.connect(g);
    g.connect(this.master);
    src.start();
    return true;
  }
}
