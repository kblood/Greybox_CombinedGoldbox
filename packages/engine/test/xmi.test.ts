/**
 * XMIDI (`.XMI`) container decoder tests (Phase C, C5a).
 *
 * 1) Synthetic: a hand-built FORM XDIR + CAT XMID + FORM XMID round-trips through `decodeXmi` —
 *    the INFO count, TIMB list, and the XMIDI event quirks (summed-byte delay; note-on with an
 *    explicit VLQ duration; meta tempo/end-of-track) all decode as specified.
 * 2) Golden (skips if data absent): real `ADDQ1.XMI` decodes to 1 song, 10 timbres, a 120-BPM
 *    tempo, ~1853 note-ons and a terminating end-of-track; `ADDQ2.XMI` carries 6 songs.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeXmi, sniffXmi } from '../src/index.js';

/** Build a big-endian IFF group chunk: `id` + u32(len) + `formType` + body. */
function group(id: string, formType: string, body: number[]): number[] {
  const payload = [...ascii(formType), ...body];
  return [...ascii(id), ...u32be(payload.length), ...payload];
}
function chunk(id: string, body: number[]): number[] {
  const out = [...ascii(id), ...u32be(body.length), ...body];
  if (body.length & 1) out.push(0); // IFF pad byte
  return out;
}
function ascii(s: string): number[] {
  return [...s].map((c) => c.charCodeAt(0));
}
function u32be(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

describe('decodeXmi — synthetic XMIDI', () => {
  // TIMB: count=2, then (patch,bank) pairs (5,0) and (10,127).
  const timb = chunk('TIMB', [2, 0, 5, 0, 10, 127]);
  // EVNT: delay 0x40, note-on ch1 note=60 vel=100 duration VLQ=0x81 0x00 (=128),
  //       delay 0x7F+0x10, controller ch1 7=90, tempo meta (500000), end-of-track.
  const evnt = chunk('EVNT', [
    0x40, // delay 64
    0x91, 60, 100, 0x81, 0x00, // note-on, duration 128 (VLQ)
    0x7f, 0x10, // delay 127+16 = 143
    0xb1, 7, 90, // controller
    0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, // tempo 500000
    0xff, 0x2f, 0x00, // end of track
  ]);
  const songForm = group('FORM', 'XMID', [...timb, ...evnt]);
  const cat = group('CAT ', 'XMID', songForm);
  const xdir = group('FORM', 'XDIR', chunk('INFO', [1, 0])); // count=1 (u16 LE)
  const file = Uint8Array.from([...xdir, ...cat]);

  it('sniffs as XMIDI', () => {
    expect(sniffXmi(file)).toBe(true);
    expect(sniffXmi(Uint8Array.from(ascii('NOPEnope....')))).toBe(false);
  });

  it('decodes the INFO count, timbres, and events', () => {
    const x = decodeXmi(file);
    expect(x.declaredCount).toBe(1);
    expect(x.songs).toHaveLength(1);
    const s = x.songs[0];
    expect(s.timbres).toEqual([
      { patch: 5, bank: 0 },
      { patch: 10, bank: 127 },
    ]);
    // First event: note-on at tick 64 with the VLQ duration 128.
    expect(s.events[0]).toEqual({ tick: 64, kind: 'noteOn', channel: 1, note: 60, velocity: 100, duration: 128 });
    // Delay accumulates (64 + 143 = 207) before the controller.
    const ctrl = s.events.find((e) => e.kind === 'controller');
    expect(ctrl).toEqual({ tick: 207, kind: 'controller', channel: 1, controller: 7, value: 90 });
    const tempo = s.events.find((e) => e.kind === 'tempo');
    expect(tempo).toEqual({ tick: 207, kind: 'tempo', usPerQuarter: 500000 });
    expect(s.events[s.events.length - 1].kind).toBe('endOfTrack');
    expect(s.durationTicks).toBe(207);
  });

  it('handles a lone FORM XMID (no XDIR/CAT wrapper)', () => {
    const lone = Uint8Array.from(songForm);
    const x = decodeXmi(lone);
    expect(x.declaredCount).toBe(1);
    expect(x.songs[0].timbres).toHaveLength(2);
  });
});

// --- Golden: real DQK ADDQ*.XMI (skips if data absent) -----------------------

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const disk1 = resolve(repoRoot, 'The Dark Queen of Krynn', 'DISK1');
const addq1 = resolve(disk1, 'ADDQ1.XMI');
const addq2 = resolve(disk1, 'ADDQ2.XMI');

describe('decodeXmi — golden DQK ADDQ1.XMI', () => {
  it.skipIf(!existsSync(addq1))('decodes 1 song, 10 timbres, 120 BPM, note-ons + end-of-track', async () => {
    const x = decodeXmi(new Uint8Array(await readFile(addq1)));
    expect(x.declaredCount).toBe(1);
    expect(x.songs).toHaveLength(1);
    const s = x.songs[0];
    expect(s.timbres).toHaveLength(10);
    expect(s.timbres[0]).toEqual({ patch: 117, bank: 0 });
    const notes = s.events.filter((e) => e.kind === 'noteOn');
    expect(notes.length).toBeGreaterThan(1000);
    const tempo = s.events.find((e) => e.kind === 'tempo') as Extract<(typeof s.events)[number], { kind: 'tempo' }>;
    expect(tempo.usPerQuarter).toBe(500000); // 120 BPM
    expect(s.events[s.events.length - 1].kind).toBe('endOfTrack');
  });
});

describe('decodeXmi — golden DQK ADDQ2.XMI (multi-song)', () => {
  it.skipIf(!existsSync(addq2))('decodes 6 songs', async () => {
    const x = decodeXmi(new Uint8Array(await readFile(addq2)));
    expect(x.declaredCount).toBe(6);
    expect(x.songs).toHaveLength(6);
    for (const s of x.songs) expect(s.events.length).toBeGreaterThan(0);
  });
});
