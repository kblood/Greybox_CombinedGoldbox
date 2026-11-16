/**
 * Presentation profiles (phase 1): the DOS-EGA profile carries the existing values, the combat
 * compositor draws identically through it, and a system without a measured profile is refused.
 */
import { describe, it, expect } from 'vitest';
import {
  composeCombatScreen,
  COK_COMBAT_GEOMETRY,
  DOS_EGA_PRESENTATION,
  presentationProfileFor,
  type CombatCellState,
  type IndexedImage,
} from '../src/index.js';

function solid(w: number, h: number, index: number): IndexedImage {
  return {
    width: w,
    height: h,
    indices: new Uint8Array(w * h).fill(index),
    xOffset: 0,
    yOffset: 0,
    transparentIndex: null,
    palette: null,
  };
}

describe('presentation profiles', () => {
  it('DOS-EGA carries the existing native screen and combat grid unchanged', () => {
    expect(DOS_EGA_PRESENTATION.platform.id).toBe('dos-ega');
    expect(DOS_EGA_PRESENTATION.platform.nativeWidth).toBe(320);
    expect(DOS_EGA_PRESENTATION.platform.nativeHeight).toBe(200);
    expect(DOS_EGA_PRESENTATION.combatGrid).toEqual(COK_COMBAT_GEOMETRY);
    expect(DOS_EGA_PRESENTATION.source.length).toBeGreaterThan(0);
  });

  it('is frozen so renderers cannot change presentation data at runtime', () => {
    expect(Object.isFrozen(DOS_EGA_PRESENTATION)).toBe(true);
  });

  it('resolves dos-ega by id and refuses a system with no measured profile', () => {
    expect(presentationProfileFor('dos-ega')).toBe(DOS_EGA_PRESENTATION);
    expect(() => presentationProfileFor('amiga-pal')).toThrow(/no verified presentation profile/);
    expect(() => presentationProfileFor('c64')).toThrow(/no verified presentation profile/);
  });

  it('draws the combat screen identically through the DOS-EGA profile grid', () => {
    const input = {
      backdrop: { tiles: [solid(24, 24, 7)], fillTile: 0 },
      cells: [{ combatantId: 'p1', side: 'party', col: 2, row: 3, icon: solid(8, 8, 14), active: true } as CombatCellState],
    };
    const viaDefault = composeCombatScreen(input);
    const viaProfile = composeCombatScreen({ ...input, geometry: presentationProfileFor('dos-ega').combatGrid });
    expect(viaProfile.width).toBe(viaDefault.width);
    expect(viaProfile.height).toBe(viaDefault.height);
    expect(Buffer.from(viaProfile.indices).equals(Buffer.from(viaDefault.indices))).toBe(true);
  });
});
