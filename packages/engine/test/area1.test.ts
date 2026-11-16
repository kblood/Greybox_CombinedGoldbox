import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  COAB_AREA1_OFFSETS,
  COAB_AREA1_SIZE,
  COAB_AREA2_OFFSETS,
  COAB_AREA2_SIZE,
  coabArea1OffsetForEclMemory,
  COAB_SAVGAMA_AREA1_OFFSET,
  COAB_SAVGAMA_AREA2_OFFSET,
  coabWildernessCombatHostFromArea1,
  decodeCoabArea1EclMemory,
  decodeCoabArea1HostState,
  decodeCoabSavgamaEclMemory,
  decodeCoabSavgamaArea1HostState,
  patchCoabArea1HostState,
  patchCoabSavgamaArea1HostState,
} from '../src/index.js';

const repoRoot = resolve(__dirname, '..', '..', '..');
const freshCokSavgama = resolve(repoRoot, 'Champions of Krynn', 'SAVE', 'SAVGAMA.DAT');
const cloudCokSavgama = resolve(
  repoRoot,
  'The Dark Queen of Krynn',
  'cloud_saves',
  'SAVE',
  'More',
  '1 - Champions of Krynn',
  'SAVE',
  'SAVGAMA.DAT',
);
const freshCokSavgamaFixture = 'Champions of Krynn/SAVE/SAVGAMA.DAT';
const cloudCokSavgamaFixture =
  'The Dark Queen of Krynn/cloud_saves/SAVE/More/1 - Champions of Krynn/SAVE/SAVGAMA.DAT';
const hasFreshCokSavgama = existsSync(freshCokSavgama);
const hasCloudCokSavgama = existsSync(cloudCokSavgama);
const optionalFixtureTitle = (title: string, fixture: string, present: boolean) =>
  present ? title : `${title} [skipped: required fixture ${fixture} is absent]`;

function putU16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
}

describe('CoAB/CoK persistent ECL memory window', () => {
  it('names the required save fixture when an optional test is skipped', () => {
    expect(optionalFixtureTitle('played CoK save', cloudCokSavgamaFixture, false)).toBe(
      'played CoK save [skipped: required fixture The Dark Queen of Krynn/cloud_saves/SAVE/More/1 - Champions of Krynn/SAVE/SAVGAMA.DAT is absent]',
    );
    expect(optionalFixtureTitle('fresh CoK save', freshCokSavgamaFixture, false)).toBe(
      'fresh CoK save [skipped: required fixture Champions of Krynn/SAVE/SAVGAMA.DAT is absent]',
    );
  });

  it('maps the VM 0x4b00..0x4eff word window onto the complete Area1 record', () => {
    const b = new Uint8Array(COAB_AREA1_SIZE);
    putU16(b, coabArea1OffsetForEclMemory(0x4b00), 0x1234);
    putU16(b, coabArea1OffsetForEclMemory(0x4c37), 1);
    putU16(b, coabArea1OffsetForEclMemory(0x4eff), 0xabcd);

    expect(coabArea1OffsetForEclMemory(0x4b00)).toBe(0);
    expect(coabArea1OffsetForEclMemory(0x4eff)).toBe(0x7fe);
    expect(() => coabArea1OffsetForEclMemory(0x4aff)).toThrow(/outside/);
    expect([...decodeCoabArea1EclMemory(b)]).toEqual([
      [0x4b00, 0x1234], [0x4c37, 1], [0x4eff, 0xabcd],
    ]);
  });

  it.skipIf(!hasCloudCokSavgama)(
    optionalFixtureTitle(
      'recovers played CoK landmark words from the real SAVGAMA.DAT wrapper',
      cloudCokSavgamaFixture,
      hasCloudCokSavgama,
    ),
    () => {
      const memory = decodeCoabSavgamaEclMemory(new Uint8Array(readFileSync(cloudCokSavgama)));

      // These are the actual retail prerequisites for ECL1#17's landmark loop,
      // not browser-only seeds: the saved campaign has already found the Outpost.
      expect(memory.get(0x4c26)).toBe(1);
      expect(memory.get(0x4c29)).toBe(0x1f);
      expect(memory.get(0x4c37)).toBe(1);
      expect(memory.get(0x4c5c)).toBe(0xff);
      expect(memory.get(0x4c7d)).toBe(0xff);
      expect(memory.get(0x4bc3)).toBe(10);
      expect(memory.get(0x4bc4)).toBe(13);
    },
  );
});

describe('decodeCoabArea1HostState', () => {
  it('reads source-anchored Area1 host fields, including current_city at 0x342', () => {
    const b = new Uint8Array(COAB_AREA1_SIZE + 8);
    const base = 4;
    b[base + COAB_AREA1_OFFSETS.current3DMapBlockId] = 34;
    putU16(b, base + COAB_AREA1_OFFSETS.inDungeon, 0);
    putU16(b, base + COAB_AREA1_OFFSETS.lastXPos, 0xfffe);
    putU16(b, base + COAB_AREA1_OFFSETS.lastYPos, 12);
    putU16(b, base + COAB_AREA1_OFFSETS.lastEclBlockId, 0x1234);
    putU16(b, base + COAB_AREA1_OFFSETS.blockAreaView, 0xffff);
    putU16(b, base + COAB_AREA1_OFFSETS.outdoorSkyColour, 9);
    putU16(b, base + COAB_AREA1_OFFSETS.indoorSkyColour, 4);
    b[base + COAB_AREA1_OFFSETS.canCastSpells] = 1;
    b[base + COAB_AREA1_OFFSETS.currentCity] = 30;

    const area = decodeCoabArea1HostState(b, base);

    expect(area).toMatchObject({
      byteLength: COAB_AREA1_SIZE,
      current3DMapBlockId: 34,
      inDungeon: 0,
      lastPos: { x: -2, y: 12 },
      lastEclBlockId: 0x1234,
      blockAreaView: -1,
      outdoorSkyColour: 9,
      indoorSkyColour: 4,
      canCastSpells: true,
      currentCity: 30,
    });
    expect(coabWildernessCombatHostFromArea1(area)).toEqual({ currentCity: 30 });
  });

  it('does not produce a wilderness combat host from dungeon Area1 records', () => {
    const b = new Uint8Array(COAB_AREA1_SIZE);
    putU16(b, COAB_AREA1_OFFSETS.inDungeon, 1);
    b[COAB_AREA1_OFFSETS.currentCity] = 30;

    const area = decodeCoabArea1HostState(b);

    expect(area.inDungeon).toBe(1);
    expect(coabWildernessCombatHostFromArea1(area)).toBeNull();
  });

  it('rejects short buffers and invalid offsets', () => {
    expect(() => decodeCoabArea1HostState(new Uint8Array(COAB_AREA1_SIZE - 1))).toThrow(/need 2048/);
    expect(() => decodeCoabArea1HostState(new Uint8Array(COAB_AREA1_SIZE), -1)).toThrow(/invalid offset/);
  });
});

describe('patchCoabArea1HostState', () => {
  it('patches source-anchored Area1 host fields without mutating the input buffer', () => {
    const b = new Uint8Array(COAB_AREA1_SIZE);
    putU16(b, COAB_AREA1_OFFSETS.inDungeon, 1);
    b[COAB_AREA1_OFFSETS.currentCity] = 2;

    const patched = patchCoabArea1HostState(b, {
      inDungeon: 0,
      currentCity: 30,
      lastPos: { x: -3, y: 9 },
      lastEclBlockId: 77,
      canCastSpells: true,
    });

    expect(decodeCoabArea1HostState(b)).toMatchObject({ inDungeon: 1, currentCity: 2 });
    expect(decodeCoabArea1HostState(patched)).toMatchObject({
      inDungeon: 0,
      currentCity: 30,
      lastPos: { x: -3, y: 9 },
      lastEclBlockId: 77,
      canCastSpells: true,
    });
    expect(coabWildernessCombatHostFromArea1(decodeCoabArea1HostState(patched))).toEqual({ currentCity: 30 });
  });
});

describe('decodeCoabSavgamaArea1HostState', () => {
  it('reads an Area1 record from the CoK SAVGAMA.DAT save wrapper offset', () => {
    const b = new Uint8Array(COAB_SAVGAMA_AREA2_OFFSET + COAB_AREA2_SIZE);
    const base = COAB_SAVGAMA_AREA1_OFFSET;
    b[0] = 3;
    b[base + COAB_AREA1_OFFSETS.current3DMapBlockId] = 97;
    putU16(b, base + COAB_AREA1_OFFSETS.inDungeon, 0);
    putU16(b, base + COAB_AREA1_OFFSETS.lastXPos, 4);
    putU16(b, base + COAB_AREA1_OFFSETS.lastYPos, 5);
    putU16(b, base + COAB_AREA1_OFFSETS.lastEclBlockId, 98);
    b[base + COAB_AREA1_OFFSETS.currentCity] = 1;
    b[COAB_SAVGAMA_AREA2_OFFSET + COAB_AREA2_OFFSETS.gameArea] = 3;

    const decoded = decodeCoabSavgamaArea1HostState(b);

    expect(decoded.gameArea).toBe(3);
    expect(decoded.area2GameArea).toBe(3);
    expect(decoded.offset).toBe(COAB_SAVGAMA_AREA1_OFFSET);
    expect(decoded.area).toMatchObject({
      current3DMapBlockId: 97,
      inDungeon: 0,
      lastPos: { x: 4, y: 5 },
      lastEclBlockId: 98,
      currentCity: 1,
    });
    expect(coabWildernessCombatHostFromArea1(decoded.area)).toEqual({ currentCity: 1 });
  });

  it('decodes dungeon saves but does not treat them as wilderness-combat hosts', () => {
    const b = new Uint8Array(COAB_AREA1_SIZE + COAB_SAVGAMA_AREA1_OFFSET);
    const base = COAB_SAVGAMA_AREA1_OFFSET;
    putU16(b, base + COAB_AREA1_OFFSETS.inDungeon, 1);
    b[base + COAB_AREA1_OFFSETS.currentCity] = 30;

    const decoded = decodeCoabSavgamaArea1HostState(b);

    expect(decoded.gameArea).toBe(0);
    expect(decoded.area2GameArea).toBeUndefined();
    expect(decoded.area.inDungeon).toBe(1);
    expect(decoded.area.currentCity).toBe(30);
    expect(coabWildernessCombatHostFromArea1(decoded.area)).toBeNull();
  });

  it('rejects raw Area1 offsets because SAVGAMA has a game_area prefix byte', () => {
    expect(() => decodeCoabSavgamaArea1HostState(new Uint8Array(COAB_AREA1_SIZE), 0)).toThrow(/prefix byte/);
  });

  it('patches the source-backed SAVGAMA wrapper into a wilderness-mode host fixture', () => {
    const b = new Uint8Array(COAB_AREA1_SIZE + COAB_SAVGAMA_AREA1_OFFSET);
    b[0] = 1;
    putU16(b, COAB_SAVGAMA_AREA1_OFFSET + COAB_AREA1_OFFSETS.inDungeon, 1);
    b[COAB_SAVGAMA_AREA1_OFFSET + COAB_AREA1_OFFSETS.currentCity] = 2;

    const patched = patchCoabSavgamaArea1HostState(b, {
      gameArea: 3,
      inDungeon: 0,
      currentCity: 30,
    });

    expect(decodeCoabSavgamaArea1HostState(b)).toMatchObject({
      gameArea: 1,
      area: { inDungeon: 1, currentCity: 2 },
    });
    const decoded = decodeCoabSavgamaArea1HostState(patched);
    expect(decoded).toMatchObject({
      gameArea: 3,
      offset: 1,
      area: { inDungeon: 0, currentCity: 30 },
    });
    expect(coabWildernessCombatHostFromArea1(decoded.area)).toEqual({ currentCity: 30 });
  });

  it('patches Area2.game_area when a full SAVGAMA wrapper is available', () => {
    const b = new Uint8Array(COAB_SAVGAMA_AREA2_OFFSET + COAB_AREA2_SIZE);
    b[0] = 1;
    b[COAB_SAVGAMA_AREA2_OFFSET + COAB_AREA2_OFFSETS.gameArea] = 1;
    putU16(b, COAB_SAVGAMA_AREA1_OFFSET + COAB_AREA1_OFFSETS.inDungeon, 1);

    const patched = patchCoabSavgamaArea1HostState(b, {
      gameArea: 3,
      inDungeon: 0,
      currentCity: 30,
    });
    const decoded = decodeCoabSavgamaArea1HostState(patched);

    expect(decoded.gameArea).toBe(3);
    expect(decoded.area2GameArea).toBe(3);
    expect(decoded.area.inDungeon).toBe(0);
    expect(decoded.area.currentCity).toBe(30);
  });

  it.skipIf(!hasFreshCokSavgama)(
    optionalFixtureTitle(
      'decodes the local fresh CoK SAVGAMA.DAT as one dungeon-mode Area1 record',
      freshCokSavgamaFixture,
      hasFreshCokSavgama,
    ),
    () => {
      const decoded = decodeCoabSavgamaArea1HostState(new Uint8Array(readFileSync(freshCokSavgama)));

      expect(decoded).toMatchObject({
        gameArea: 1,
        area2GameArea: 1,
        offset: 1,
        area: {
          inDungeon: 1,
          currentCity: 0,
          current3DMapBlockId: 0,
          lastPos: { x: 0, y: 0 },
          lastEclBlockId: 0,
        },
      });
      expect(coabWildernessCombatHostFromArea1(decoded.area)).toBeNull();
    },
  );

  it.skipIf(!hasCloudCokSavgama)(
    optionalFixtureTitle(
      'decodes the local played CoK SAVGAMA.DAT Area1 at source-backed offset 1',
      cloudCokSavgamaFixture,
      hasCloudCokSavgama,
    ),
    () => {
      const decoded = decodeCoabSavgamaArea1HostState(new Uint8Array(readFileSync(cloudCokSavgama)));

      expect(decoded).toMatchObject({
        gameArea: 3,
        area2GameArea: 3,
        offset: 1,
        area: {
          current3DMapBlockId: 97,
          inDungeon: 1,
          lastPos: { x: 4, y: 5 },
          lastEclBlockId: 98,
          outdoorSkyColour: 11,
          indoorSkyColour: 10,
          currentCity: 1,
        },
      });
      expect(coabWildernessCombatHostFromArea1(decoded.area)).toBeNull();
    },
  );

  it.skipIf(!hasFreshCokSavgama)(
    optionalFixtureTitle(
      'can derive a wilderness-mode SAVGAMA host fixture from the local CoK save wrapper',
      freshCokSavgamaFixture,
      hasFreshCokSavgama,
    ),
    () => {
      const original = new Uint8Array(readFileSync(freshCokSavgama));
      const patched = patchCoabSavgamaArea1HostState(original, {
        gameArea: 3,
        inDungeon: 0,
        currentCity: 30,
      });

      expect(decodeCoabSavgamaArea1HostState(original)).toMatchObject({
        gameArea: 1,
        area: { inDungeon: 1, currentCity: 0 },
      });
      const decoded = decodeCoabSavgamaArea1HostState(patched);
      expect(decoded).toMatchObject({
        gameArea: 3,
        area2GameArea: 3,
        offset: 1,
        area: { inDungeon: 0, currentCity: 30 },
      });
      expect(coabWildernessCombatHostFromArea1(decoded.area)).toEqual({ currentCity: 30 });
    },
  );
});
