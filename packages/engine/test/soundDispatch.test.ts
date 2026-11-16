/**
 * Sound-dispatch layer tests (decompile task #13, seg044) — the event→bank-slot command glue.
 *
 * Pins: every named event maps to its verified bank slot; the raw `PlaySound` ABI (stop-all on
 * 0/0xFF, no-op on 1/15, slot = arg-1 for 2..14); the `SetSound` on/off gate; and unknown /
 * out-of-range handling. A recording sink stands in for the host audio output.
 */
import { describe, it, expect } from 'vitest';
import {
  SoundDispatcher,
  dispatchSound,
  slotForPlaySoundArg,
  SOUND_BANK,
  SOUND_OFF,
  type SoundSink,
  type SoundType,
  type GameSoundEvent,
} from '../src/index.js';

type Played = { slot: number; soundType: SoundType };

/** A sink that records every call for assertions. */
function recordingSink() {
  const played: Played[] = [];
  let stops = 0;
  const sink: SoundSink = {
    playSlot(slot, soundType) {
      played.push({ slot, soundType });
    },
    stopAll() {
      stops++;
    },
  };
  return { sink, played, stops: () => stops };
}

describe('dispatchSound — event → bank slot', () => {
  it('maps each named event to its verified slot', () => {
    expect(dispatchSound('missile')).toBe(1);
    expect(dispatchSound('magic_hit')).toBe(2);
    expect(dispatchSound('death')).toBe(4);
    expect(dispatchSound('hit')).toBe(6);
    expect(dispatchSound('miss')).toBe(8);
    expect(dispatchSound('step')).toBe(9);
    expect(dispatchSound('start')).toBe(12);
    // misc populated-but-unnamed slots
    expect(dispatchSound('misc5')).toBe(5);
    expect(dispatchSound('misc10')).toBe(10);
  });

  it('SOUND_BANK is the source of truth for every event', () => {
    for (const ev of Object.keys(SOUND_BANK) as GameSoundEvent[]) {
      expect(dispatchSound(ev)).toBe(SOUND_BANK[ev]);
    }
  });
});

describe('slotForPlaySoundArg — raw PlaySound ABI', () => {
  it('treats 0 and 0xFF as stop-all (no slot)', () => {
    expect(slotForPlaySoundArg(0)).toBeNull();
    expect(slotForPlaySoundArg(SOUND_OFF)).toBeNull();
  });
  it('treats 1 and 15 as reserved no-ops', () => {
    expect(slotForPlaySoundArg(1)).toBeNull();
    expect(slotForPlaySoundArg(15)).toBeNull();
  });
  it('plays sounds[arg-1] for 2..14', () => {
    expect(slotForPlaySoundArg(2)).toBe(1); // missile
    expect(slotForPlaySoundArg(7)).toBe(6); // hit
    expect(slotForPlaySoundArg(13)).toBe(12); // start
    expect(slotForPlaySoundArg(14)).toBe(13);
  });
  it('ignores out-of-range args', () => {
    expect(slotForPlaySoundArg(16)).toBeNull();
    expect(slotForPlaySoundArg(-1)).toBeNull();
  });
});

describe('SoundDispatcher.playEvent', () => {
  it('emits the resolved slot to the sink with the active sound type', () => {
    const { sink, played } = recordingSink();
    const d = new SoundDispatcher(sink, 'pc');
    d.playEvent('hit');
    d.playEvent('step');
    expect(played).toEqual([
      { slot: 6, soundType: 'pc' },
      { slot: 9, soundType: 'pc' },
    ]);
  });

  it('forwards the configured back-end type', () => {
    const { sink, played } = recordingSink();
    // default type is 'pc'; flip via setSound
    const d = new SoundDispatcher(sink);
    d.playEvent('missile');
    expect(played[0].soundType).toBe('pc');
  });
});

describe('SoundDispatcher.playSound — raw ABI', () => {
  it('stop-all on 0 and 0xFF; no-op on 1/15; slot=arg-1 on 2..14', () => {
    const { sink, played, stops } = recordingSink();
    const d = new SoundDispatcher(sink, 'pc');

    d.playSound(0); // stop all
    d.playSound(SOUND_OFF); // stop all
    expect(stops()).toBe(2);

    d.playSound(1); // reserved
    d.playSound(15); // reserved
    expect(played).toHaveLength(0);

    d.playSound(7); // hit -> slot 6
    d.playSound(10); // step -> slot 9
    expect(played).toEqual([
      { slot: 6, soundType: 'pc' },
      { slot: 9, soundType: 'pc' },
    ]);
  });

  it('ignores unknown / out-of-range args without playing or throwing', () => {
    const { sink, played, stops } = recordingSink();
    const d = new SoundDispatcher(sink, 'pc');
    d.playSound(99);
    d.playSound(-5);
    expect(played).toHaveLength(0);
    expect(stops()).toBe(0);
  });
});

describe('SoundDispatcher.playSlot — direct slot', () => {
  it('plays valid slots and ignores out-of-range', () => {
    const { sink, played } = recordingSink();
    const d = new SoundDispatcher(sink, 'pc');
    d.playSlot(6);
    d.playSlot(12);
    d.playSlot(13); // out of range (size 13 -> 0..12)
    d.playSlot(-1);
    expect(played).toEqual([
      { slot: 6, soundType: 'pc' },
      { slot: 12, soundType: 'pc' },
    ]);
  });
});

describe('SoundDispatcher — SetSound gate', () => {
  it('disabling stops all and silences subsequent plays', () => {
    const { sink, played, stops } = recordingSink();
    const d = new SoundDispatcher(sink, 'pc');
    expect(d.isEnabled()).toBe(true);

    d.setSound(false);
    expect(d.isEnabled()).toBe(false);
    expect(d.getSoundType()).toBe('none');
    expect(stops()).toBe(1); // disabling issues a stop-all

    d.playEvent('hit');
    d.playSound(7);
    d.playSlot(6);
    expect(played).toHaveLength(0); // all gated while disabled
  });

  it('re-enabling restores playback and the back-end type', () => {
    const { sink, played } = recordingSink();
    const d = new SoundDispatcher(sink, 'pc');
    d.setSound(false);
    d.setSound(true);
    expect(d.isEnabled()).toBe(true);
    expect(d.getSoundType()).toBe('pc');
    d.playEvent('death');
    expect(played).toEqual([{ slot: 4, soundType: 'pc' }]);
  });

  it('stopAll is forwarded even when disabled', () => {
    const { sink, stops } = recordingSink();
    const d = new SoundDispatcher(sink, 'pc');
    d.setSound(false); // stop #1
    d.stopAll(); // stop #2 — still forwarded
    expect(stops()).toBe(2);
  });

  it('defaults to a NULL sink that never throws', () => {
    const d = new SoundDispatcher();
    expect(() => {
      d.playEvent('start');
      d.playSound(7);
      d.stopAll();
    }).not.toThrow();
  });
});
