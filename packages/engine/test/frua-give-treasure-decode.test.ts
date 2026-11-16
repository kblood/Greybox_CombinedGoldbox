import { describe, expect, it } from 'vitest';
import {
  encodeEclString,
  FRUA_GEO_OFFSETS as O,
  parseFruaGeo,
} from '../src/index.js';

const eventAt = (slot: number): number => O.events + (slot - 1) * 20;

const event46Boxes = [
  'AFTER SHOWING THE PARTY HIS GRATITUDE, THE LEADER SPEAKS UP, ',
  '"THE ROADS HAVE BECOME HAZARDOUS SINCE THE DEATH OF THE ROADWARDEN. I KNOW SIR DUTIOCS IS DOING HIS BEST, BUT THE SITUATION IS GETTING OUT OF CONTROL."',
  '"THE ROADS ARE JUST TOO DANGEROUS TO TRAVEL; I\'M GOING TO HAVE TO HIRE MORE GUARDS AND RAISE MY PRICES AGAIN. FOLKS IN SKULL CRAG AREN\'T GOING TO LIKE THAT VERY MUCH!"',
];

/** Minimal GEO carrying the exact retail HEIRS slots 45/46 and event-46 text references 24..26. */
function heirsRewardFixture(): Uint8Array {
  const packed = event46Boxes.map((text) => encodeEclString(text));
  const buf = new Uint8Array(O.stringData + packed.reduce((sum, bytes) => sum + bytes.length, 0));
  const dv = new DataView(buf.buffer);
  buf[O.height] = 1;
  buf[O.width] = 1;

  buf.set([
    0x03, 0x01, 0x00, 0x2e,
    0x7d, 0x00, 0x00, 0x00,
    0x03, 0x00, 0x05, 0x00,
    0x60, 0xf6, 0x50, 0x50, 0x00, 0x00, 0x00, 0x00,
  ], eventAt(45));
  buf.set([
    0x02, 0x00, 0x00, 0x00,
    0x1e, 0x00, 0x85, 0x98,
    0x18, 0x00, 0x19, 0x00, 0x1a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ], eventAt(46));

  buf.set([0x73, 0x74, 0x72, 0x67], O.stringMarker);
  dv.setUint16(O.stringCount, 26, true);
  let textOffset = O.stringData;
  packed.forEach((bytes, index) => {
    buf[O.stringLengths + 23 + index] = bytes.length;
    buf.set(bytes, textOffset);
    textOffset += bytes.length;
  });
  return buf;
}

describe('FRUA Give Treasure decode', () => {
  it('decodes the exact HEIRS event-45 reward without resolving its one-based item IDs', () => {
    const event = parseFruaGeo(heirsRewardFixture()).events[44];
    expect(event).toMatchObject({
      slot: 45,
      type: 3,
      typeName: 'Give Treasure',
      onceOnly: true,
      chainMode: 'always',
      chainToEvent: 46,
      giveTreasure: {
        platinum: 125,
        gems: 3,
        jewelry: 5,
        items: [96, 246, 80, 80],
        itemsIdentified: false,
      },
    });
    expect(event.raw16).toEqual([
      0x7d, 0x00, 0x00, 0x00, 0x03, 0x00, 0x05, 0x00,
      0x60, 0xf6, 0x50, 0x50, 0x00, 0x00, 0x00, 0x00,
    ]);
  });

  it('keeps byte 8 identification separate from the high platinum amount bits', () => {
    const bytes = heirsRewardFixture();
    bytes[eventAt(45) + 7] = 0x81;
    const reward = parseFruaGeo(bytes).events[44].giveTreasure;
    expect(reward?.platinum).toBe(0x0100007d);
    expect(reward?.itemsIdentified).toBe(true);
  });

  it('retains event 46 as the exact three independently ordered source text boxes', () => {
    const event = parseFruaGeo(heirsRewardFixture()).events[45];
    expect(event).toMatchObject({ slot: 46, type: 2, onceOnly: false, chainToEvent: 0 });
    expect([
      event.strings.statement1,
      event.strings.statement2,
      event.strings.statement3,
    ]).toEqual(event46Boxes);
  });
});
