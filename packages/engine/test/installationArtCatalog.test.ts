import { describe, expect, it } from 'vitest';
import { createScopedArtCatalog, type InstallationArtRecord, type RestyledArt } from '../src/index.js';

const cok = { game: 'cok', logicalId: 'scene.cottage', frame: 0 };
const dok = { game: 'dok', logicalId: 'scene.cottage', frame: 0 };
const policies = [
  { game: 'cok', originalPriority: ['Amiga', 'DOS-EGA', 'C64', 'Atari ST', 'Apple II'] },
  { game: 'dok', originalPriority: ['Amiga', 'DOS-EGA'] },
];
function record(sourceId: string, game: string, system: string, ref = cok, asset?: string): InstallationArtRecord<string> {
  return { sourceId, game, system, ref, locator: `${sourceId}/reviewed-frame`, asset };
}
const dos = record('user-cok-dos', 'cok', 'DOS-EGA', cok, 'DOS pixels');
const amiga = record('user-cok-amiga', 'cok', 'Amiga', cok, 'Amiga pixels');
const foreign = record('user-dok-amiga', 'dok', 'Amiga', dok, 'DoK pixels');
const base = { game: 'cok', policies, records: [dos, amiga, foreign], restyles: [] };

const restyle = { ref: cok, comparisonId: 'review-cottage', review: 'pending' as const, asset: 'unapproved RGBA' };

describe('explicit installation art scope', () => {
  it('keeps DOS-only selection honest despite a loaded unselected Amiga source', () => {
    const { resolver, sourceFor } = createScopedArtCatalog({ ...base, allowedSourceIds: ['user-cok-dos'] });
    expect(resolver.availability(cok).originals.slice(0, 2)).toEqual([
      { system: 'Amiga', mapped: false, loaded: false, locator: null },
      { system: 'DOS-EGA', mapped: true, loaded: true, locator: dos.locator },
    ]);
    expect(sourceFor(cok, 'Amiga')).toBeNull();
    expect(sourceFor(cok, 'DOS-EGA')).toBe('user-cok-dos');
    expect(resolver.resolve(cok, { kind: 'restyle' })).toMatchObject({
      status: 'found', asset: 'DOS pixels', effective: { kind: 'original', system: 'DOS-EGA' },
      fallbackReason: 'no-restyle-mapping', triedOriginals: ['Amiga', 'DOS-EGA'],
    });
    expect(resolver.resolve(cok, { kind: 'original', system: 'Amiga' })).toMatchObject({
      asset: 'DOS pixels', fallbackReason: 'original-output-missing',
    });
  });

  it('combines only explicitly selected installations, with game-specific best-original priority', () => {
    const { resolver, sourceFor } = createScopedArtCatalog({ ...base, allowedSourceIds: ['user-cok-dos', 'user-cok-amiga'] });
    expect(resolver.resolve(cok, { kind: 'restyle' })).toMatchObject({
      asset: 'Amiga pixels', locator: amiga.locator, effective: { kind: 'original', system: 'Amiga' },
      triedOriginals: ['Amiga'],
    });
    expect(sourceFor(cok, 'Amiga')).toBe('user-cok-amiga');
    expect(resolver.resolve(cok, { kind: 'original', system: 'DOS-EGA' })).toMatchObject({
      asset: 'DOS pixels', fallbackReason: null,
    });
  });

  it('keeps missing, mapped-unloaded, and approval state distinct', () => {
    const pending = createScopedArtCatalog({ ...base, records: [record('amiga', 'cok', 'Amiga'), dos],
      allowedSourceIds: ['amiga', 'user-cok-dos'], restyles: [restyle] });
    expect(pending.resolver.availability(cok).originals.slice(0, 2)).toMatchObject([
      { mapped: true, loaded: false }, { mapped: true, loaded: true },
    ]);
    expect(pending.resolver.availability(cok).restyle).toMatchObject({ review: 'pending', loaded: true });
    expect(pending.resolver.resolve(cok, { kind: 'restyle' })).toMatchObject({
      asset: 'DOS pixels', fallbackReason: 'restyle-unapproved', triedOriginals: ['Amiga', 'DOS-EGA'],
    });
    const missing = createScopedArtCatalog({ ...base, allowedSourceIds: [], restyles: [
      { ...restyle, review: 'approved', asset: undefined },
    ] });
    expect(missing.resolver.resolve(cok, { kind: 'restyle' })).toMatchObject({
      status: 'missing', fallbackReason: 'restyle-output-missing',
    });
    expect(missing.resolver.availability(cok).originals.every((entry) => !entry.mapped && !entry.loaded)).toBe(true);
    const approved = createScopedArtCatalog({ ...base, allowedSourceIds: [], restyles: [
      { ...restyle, review: 'approved' },
    ] });
    expect(approved.resolver.resolve(cok, { kind: 'restyle' })).toMatchObject({
      asset: 'unapproved RGBA', effective: { kind: 'restyle' }, fallbackReason: null,
    });
  });

  it('supports selected C64, Atari and Apple sources and exact frames, not inferred block positions', () => {
    const frameOne = { ...cok, frame: 1 };
    const records = [
      record('c64', 'cok', 'C64', frameOne),
      record('atari', 'cok', 'Atari ST', frameOne, 'Atari frame 1'),
      record('apple', 'cok', 'Apple II', frameOne, 'Apple frame 1'),
    ];
    const { resolver } = createScopedArtCatalog({ ...base, records,
      allowedSourceIds: ['c64', 'atari', 'apple'] });
    expect(resolver.resolve(frameOne, { kind: 'restyle' })).toMatchObject({
      asset: 'Atari frame 1', effective: { kind: 'original', system: 'Atari ST' },
      triedOriginals: ['Amiga', 'DOS-EGA', 'C64', 'Atari ST'],
    });
    expect(resolver.resolve(frameOne, { kind: 'original', system: 'Apple II' })).toMatchObject({
      asset: 'Apple frame 1', fallbackReason: null,
    });
    expect(resolver.resolve(cok, { kind: 'restyle' })).toMatchObject({ status: 'missing' });
  });

  it('rejects cross-title authorization and does not serve matching names from other games', () => {
    expect(() => createScopedArtCatalog({ ...base, allowedSourceIds: ['user-dok-amiga'] }))
      .toThrow(/foreign-game source ID/);
    const { resolver, sourceFor } = createScopedArtCatalog({ ...base, allowedSourceIds: ['user-cok-dos'],
      restyles: [{ ref: dok, review: 'approved', comparisonId: 'dok-review', asset: 'wrong title RGBA' }] });
    expect(resolver.resolve(cok, { kind: 'restyle' })).toMatchObject({ asset: 'DOS pixels' });
    expect(() => resolver.resolve(dok, { kind: 'restyle' })).toThrow(/unregistered game/);
    expect(() => sourceFor(dok, 'DOS-EGA')).toThrow(/unregistered game/);
  });

  it('rejects unknown/duplicate permissions, conflicting source identities, and ambiguous selected originals', () => {
    expect(() => createScopedArtCatalog({ ...base, allowedSourceIds: ['not-selected'] })).toThrow(/unknown allowed source ID/);
    expect(() => createScopedArtCatalog({ ...base, allowedSourceIds: ['user-cok-dos', 'user-cok-dos'] }))
      .toThrow(/duplicate allowed source ID/);
    expect(() => createScopedArtCatalog({ ...base, records: [dos, { ...amiga, sourceId: dos.sourceId }],
      allowedSourceIds: ['user-cok-dos'] })).toThrow(/conflicting source ID/);
    expect(() => createScopedArtCatalog({ ...base, records: [dos, { ...dos }],
      allowedSourceIds: ['user-cok-dos'] })).toThrow(/duplicate source frame/);
    const duplicateSystem = record('other-dos', 'cok', 'DOS-EGA', cok, 'other pixels');
    expect(() => createScopedArtCatalog({ ...base, records: [dos, duplicateSystem],
      allowedSourceIds: ['user-cok-dos', 'other-dos'] })).toThrow(/ambiguous selected original/);
    expect(createScopedArtCatalog({ ...base, records: [dos, duplicateSystem],
      allowedSourceIds: ['user-cok-dos'] }).resolver.resolve(cok, { kind: 'restyle' }))
      .toMatchObject({ asset: 'DOS pixels' });
    expect(() => createScopedArtCatalog({ ...base, records: [{ ...dos, game: 'dok' }],
      allowedSourceIds: [] })).toThrow(/source\/identity game mismatch/);
    expect(() => createScopedArtCatalog({ ...base, records: [{ ...dos, system: 'unknown' }],
      allowedSourceIds: [] })).toThrow(/unregistered game\/system/);
    expect(() => createScopedArtCatalog({ ...base, records: [{ ...dos, asset: null as never }],
      allowedSourceIds: [] })).toThrow(/invalid original asset/);
  });

  it('snapshots source metadata and review gating for a session', () => {
    const original = { ...dos, ref: { ...cok } };
    const candidate: RestyledArt<string> = { ...restyle };
    const { resolver, sourceFor } = createScopedArtCatalog({ ...base, records: [original],
      allowedSourceIds: ['user-cok-dos'], restyles: [candidate] });
    original.ref.logicalId = 'changed';
    original.locator = 'changed';
    candidate.review = 'approved';
    expect(sourceFor(cok, 'DOS-EGA')).toBe('user-cok-dos');
    expect(resolver.resolve(cok, { kind: 'restyle' })).toMatchObject({
      asset: 'DOS pixels', locator: dos.locator, fallbackReason: 'restyle-unapproved',
    });
  });
});
