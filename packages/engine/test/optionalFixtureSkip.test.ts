import { describe, expect, it } from 'vitest';
import { optionalFixtureSkipTitle } from './optionalFixtureSkip.js';

describe('optionalFixtureSkipTitle', () => {
  it('names the required relative fixture and absence reason for one missing fixture', () => {
    expect(optionalFixtureSkipTitle('CoK retail test', ['Champions of Krynn/ECL1.DAX'])).toBe(
      'CoK retail test [skipped: required fixture absent: Champions of Krynn/ECL1.DAX]',
    );
  });

  it('lists every missing fixture for a multi-file prerequisite', () => {
    expect(optionalFixtureSkipTitle(
      'CoAB route',
      ['ECL5.DAX', 'GEO5.DAX'],
    )).toBe('CoAB route [skipped: required fixtures absent: ECL5.DAX, GEO5.DAX]');
  });

  it('leaves enabled tests without a skip annotation', () => {
    expect(optionalFixtureSkipTitle('DoK retail test', []))
      .toBe('DoK retail test');
  });
});
