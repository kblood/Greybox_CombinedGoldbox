/**
 * Sound-effect dispatch layer — the **input side** of the engine's audio (decompile task #13,
 * spec `docs/engine/research/decompile-seg044-sound.md`).
 *
 * This is the command/trigger glue that maps **game events** ("party stepped", "an attack hit",
 * "a spell landed") to a **bank slot** and fires it, mirroring the Krynn `PlaySound` dispatcher
 * (`seg044` / COAB `sub_120E0`) and its `SetSound` on/off gate. It does **not** synthesize audio:
 * the engine stays DOM/Node-free, so a resolved slot/id is emitted to an injected {@link SoundSink}
 * and the host (web `AudioManager`, DOS PC-speaker, …) actually plays it. The codecs that produce
 * the clips already live alongside (`voc.ts`, `dig.ts`, `svx8.ts`, …).
 *
 * ## The `PlaySound` ABI (VERIFIED — spec §"Sound command interface")
 *
 * `gbl.soundType` is `{ None, PC }` (`SetSound(on)` → `PC` / `None`). When `PC`, the dispatcher
 * maps the raw `Sound` argument:
 *
 * | arg              | action                                  |
 * | ---------------- | --------------------------------------- |
 * | `0`              | **stop all** voices                     |
 * | `1`              | reserved / no-op                        |
 * | `2..14`          | **play effect `sounds[arg-1]`** (slot)  |
 * | `15`             | reserved / no-op                        |
 * | `0xFF`           | **stop all** (off)                      |
 *
 * So effect IDs are 1-based into the 13-slot bank (`slot = arg - 1`), with `0` / `0xFF` reserved
 * as stop-all. When `soundType` is `None`, `PlaySound` is a no-op (audio disabled).
 */

/** Sound back-end gate, mirroring `gbl.soundType` (`SetSound`). `'none'` = audio off. */
export type SoundType = 'none' | 'pc';

/**
 * The 13-slot SFX bank (`sounds[13]`, `SoundInit`). Keys are the **named slots** recovered from
 * the decompiled callers; values are the bank index (`slot = PlaySound arg − 1`). Slots `0,3,7,11`
 * are unused by the original; `5` and `10` are populated-but-unnamed "misc" effects.
 *
 * Gen1 (CoK/DoK) plays these as PC-speaker tones; Gen2 (DQK) plays the matching digitized clip
 * (`step↔walk`, `hit↔hit`, `miss↔swing`, `missile↔bow/sling`, `magic_hit↔cast/sorcery/fireball`,
 * `death↔die`) — same event vocabulary, back-end chosen by platform.
 */
export const SOUND_BANK = {
  /** A ranged / thrown attack launches (ovr010/ovr014). */
  missile: 1,
  /** A damaging spell lands. */
  magic_hit: 2,
  /** A combatant dies. */
  death: 4,
  /** Populated-but-unnamed effect (`sound_5`). */
  misc5: 5,
  /** A melee attack connects. */
  hit: 6,
  /** An attack misses. */
  miss: 8,
  /** `MovePartyForward` — the party takes a step (ovr015). */
  step: 9,
  /** Populated-but-unnamed effect (`sound_10`). */
  misc10: 10,
  /** Game / intro start sting. */
  start: 12,
} as const;

/** A named game sound event — the SFX event vocabulary combat/movement code triggers. */
export type GameSoundEvent = keyof typeof SOUND_BANK;

/** Raw `PlaySound` argument that stops every voice (also `0xFF` / `SOUND_OFF`). */
export const SOUND_STOP_ALL = 0;
/** Raw `PlaySound` "turn off / stop all" argument used when disabling sound. */
export const SOUND_OFF = 0xff;
/** Number of slots in the bank (`sounds[13]`); valid slot indices are `0..12`. */
export const SOUND_BANK_SIZE = 13;

/**
 * Resolve a named {@link GameSoundEvent} to its bank slot (`0..12`). Pure — combat/movement code
 * uses this (or {@link SoundDispatcher.playEvent}) instead of hard-coding slot numbers.
 */
export function dispatchSound(event: GameSoundEvent): number {
  return SOUND_BANK[event];
}

/** The bank slot of a raw `PlaySound` argument, or `null` for stop-all / reserved no-op args. */
export function slotForPlaySoundArg(arg: number): number | null {
  if (arg === SOUND_STOP_ALL || arg === SOUND_OFF) return null; // stop-all
  if (arg === 1 || arg === 15) return null; // reserved no-op
  if (arg >= 2 && arg <= 14) return arg - 1; // play sounds[arg-1]
  return null; // anything else: ignored
}

/**
 * Host audio output, injected into {@link SoundDispatcher}. The engine resolves an event to a
 * bank slot and calls these; the host turns the slot into actual sound (PC-speaker tone for Gen1,
 * decoded VOC/DIG4/8SVX clip for Gen2). Keeping output behind this interface is what lets the
 * engine package stay DOM/Node-free.
 */
export interface SoundSink {
  /** Play the effect in `slot` (`0..12`). `soundType` tells the host which back-end to use. */
  playSlot(slot: number, soundType: SoundType): void;
  /** Stop every currently-playing voice (the `PlaySound(0)` / `0xFF` semantics). */
  stopAll(): void;
}

/** A no-op sink — useful as a default and in tests where no real output is wanted. */
export const NULL_SOUND_SINK: SoundSink = {
  playSlot() {
    /* discard */
  },
  stopAll() {
    /* discard */
  },
};

/**
 * Stateful sound-command dispatcher: the engine-side of `seg044`. Holds the `SetSound` on/off gate
 * (`soundType`) and forwards resolved bank slots to an injected {@link SoundSink}. Construct one per
 * game session; have combat/movement call {@link playEvent} (preferred) or the raw {@link playSound}.
 */
export class SoundDispatcher {
  private sink: SoundSink;
  private soundType: SoundType;

  constructor(sink: SoundSink = NULL_SOUND_SINK, soundType: SoundType = 'pc') {
    this.sink = sink;
    this.soundType = soundType;
  }

  /** Current back-end gate. */
  getSoundType(): SoundType {
    return this.soundType;
  }

  /** True when audio is enabled (`soundType !== 'none'`). */
  isEnabled(): boolean {
    return this.soundType !== 'none';
  }

  /**
   * `SetSound(on)` — toggle the audio gate. Turning sound **off** issues a stop-all first (mirrors
   * `PlaySound(0xFF)` on disable). `type` selects the back-end when enabling (defaults to `'pc'`).
   */
  setSound(on: boolean, type: SoundType = 'pc'): void {
    if (!on) {
      this.sink.stopAll();
      this.soundType = 'none';
      return;
    }
    this.soundType = type === 'none' ? 'pc' : type;
  }

  /**
   * Raw `PlaySound(arg)` — the faithful dispatcher ABI. `0` / `0xFF` stop all voices; `1` / `15`
   * are reserved no-ops; `2..14` play bank slot `arg-1`. When sound is disabled, everything is a
   * no-op (the original maps nothing while `soundType == None`).
   */
  playSound(arg: number): void {
    if (this.soundType === 'none') return;
    if (arg === SOUND_STOP_ALL || arg === SOUND_OFF) {
      this.sink.stopAll();
      return;
    }
    const slot = slotForPlaySoundArg(arg);
    if (slot === null) return; // reserved / out-of-range: ignore
    this.sink.playSlot(slot, this.soundType);
  }

  /** Play a named {@link GameSoundEvent} (e.g. `playEvent('hit')`) — resolves it to its bank slot. */
  playEvent(event: GameSoundEvent): void {
    if (this.soundType === 'none') return;
    this.sink.playSlot(SOUND_BANK[event], this.soundType);
  }

  /** Play a bank slot directly (`0..12`); out-of-range slots are ignored. No-op when disabled. */
  playSlot(slot: number): void {
    if (this.soundType === 'none') return;
    if (slot < 0 || slot >= SOUND_BANK_SIZE) return;
    this.sink.playSlot(slot, this.soundType);
  }

  /** Stop every playing voice (`PlaySound(0)`). Always forwarded, even while disabled. */
  stopAll(): void {
    this.sink.stopAll();
  }
}
