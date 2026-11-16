import { describe, expect, it } from 'vitest';
import { createArtModeResolver, type ArtIdentity, type OriginalArt, type RestyledArt } from '../src/graphics/artModeResolver.js';

const cok: ArtIdentity = { game: 'cok', logicalId: 'scene.cottage' };
const dok: ArtIdentity = { game: 'dok', logicalId: 'scene.cottage' };
const dqk: ArtIdentity = { game: 'dqk', logicalId: 'scene.cottage' };
const policies = [
  { game: 'cok', originalPriority: ['Amiga', 'DOS-EGA'] },
  { game: 'dok', originalPriority: ['Amiga', 'DOS-EGA'] },
  { game: 'dqk', originalPriority: ['DOS-VGA', 'Amiga'] },
  { game: 'pool', originalPriority: ['DOS-VGA'] },
] as const;

function original(ref: ArtIdentity, system: string, asset: string): OriginalArt<string> {
  return { ref, system, locator: `${ref.game}/${system}/reviewed-source`, asset };
}
function restyle(ref: ArtIdentity, review: RestyledArt<string>['review'], asset?: string): RestyledArt<string> {
  return { ref, review, comparisonId: `${ref.game}-reviewed-comparison`, asset };
}

const originals = [
  original(cok, 'Amiga', 'cok amiga'), original(cok, 'DOS-EGA', 'cok dos'),
  original(dok, 'Amiga', 'dok amiga'), original(dok, 'DOS-EGA', 'dok dos'),
  original(dqk, 'DOS-VGA', 'dqk dos'), original(dqk, 'Amiga', 'dqk amiga'),
];

describe('reviewed cross-system art mode resolution', () => {
  it('uses only the exact approved Restyle identity, preserving provenance', () => {
    const resolver = createArtModeResolver(policies, originals, [restyle(cok, 'approved', 'cok rgba')]);
    expect(resolver.resolve(cok, { kind: 'restyle' })).toEqual({
      status: 'found', requested: { kind: 'restyle' }, effective: { kind: 'restyle' },
      asset: 'cok rgba', fallbackReason: null, locator: 'cok-reviewed-comparison', triedOriginals: [],
    });
    const otherGame = resolver.resolve(dok, { kind: 'restyle' });
    expect(otherGame).toMatchObject({ status: 'found', asset: 'dok amiga',
      effective: { kind: 'original', system: 'Amiga' }, fallbackReason: 'no-restyle-mapping' });
  });

  it('uses configured best-original fallback per game, not the last selected platform', () => {
    const resolver = createArtModeResolver(policies, originals, []);
    expect(resolver.resolve(cok, { kind: 'restyle' })).toMatchObject({ asset: 'cok amiga',
      effective: { kind: 'original', system: 'Amiga' } });
    expect(resolver.resolve(dok, { kind: 'restyle' })).toMatchObject({ asset: 'dok amiga',
      effective: { kind: 'original', system: 'Amiga' } });
    expect(resolver.resolve(dqk, { kind: 'restyle' })).toMatchObject({ asset: 'dqk dos',
      effective: { kind: 'original', system: 'DOS-VGA' } });
    expect(resolver.resolve(cok, { kind: 'original', system: 'DOS-EGA' })).toMatchObject({
      asset: 'cok dos', fallbackReason: null, effective: { kind: 'original', system: 'DOS-EGA' },
    });
  });

  it('never serves pending/rejected art, even if its image is present (CoK PIC1 #58)', () => {
    const scene58 = { game: 'cok', logicalId: 'scene.pic1-58', frame: 0 };
    for (const review of ['pending', 'rejected'] as const) {
      const resolver = createArtModeResolver(policies,
        [original(scene58, 'Amiga', 'approved amiga original')],
        [{ ref: scene58, review, comparisonId: 'scene_cok_dos_pic1_058_f0', asset: 'FLAG image' }]);
      expect(resolver.resolve(scene58, { kind: 'restyle' })).toMatchObject({
        asset: 'approved amiga original', fallbackReason: 'restyle-unapproved',
        effective: { kind: 'original', system: 'Amiga' },
      });
    }
  });

  it('distinguishes mapping, review and actual load state before enabling an image', () => {
    const unavailableAmiga: OriginalArt<string> = {
      ref: cok, system: 'Amiga', locator: 'selected-install/CoK/BIGPIC1.DAA',
    };
    const candidate = restyle(cok, 'pending', 'unreviewed output already loaded');
    const resolver = createArtModeResolver(policies,
      [unavailableAmiga, original(cok, 'DOS-EGA', 'loaded DOS art')], [candidate]);
    expect(resolver.availability(cok)).toEqual({
      originals: [
        { system: 'Amiga', mapped: true, loaded: false, locator: 'selected-install/CoK/BIGPIC1.DAA' },
        { system: 'DOS-EGA', mapped: true, loaded: true, locator: 'cok/DOS-EGA/reviewed-source' },
      ],
      restyle: { comparisonId: 'cok-reviewed-comparison', review: 'pending', loaded: true },
    });
    expect(resolver.resolve(cok, { kind: 'restyle' })).toMatchObject({
      asset: 'loaded DOS art', effective: { kind: 'original', system: 'DOS-EGA' },
      fallbackReason: 'restyle-unapproved', triedOriginals: ['Amiga', 'DOS-EGA'],
    });
    expect(resolver.availability(dok)).toMatchObject({
      originals: [{ mapped: false, loaded: false }, { mapped: false, loaded: false }],
      restyle: { comparisonId: null, review: null, loaded: false },
    });
  });

  it('reports an approved mapping whose output is absent, then falls back to existing source', () => {
    const resolver = createArtModeResolver(policies, originals, [restyle(dqk, 'approved')]);
    expect(resolver.resolve(dqk, { kind: 'restyle' })).toMatchObject({
      asset: 'dqk dos', fallbackReason: 'restyle-output-missing', triedOriginals: ['DOS-VGA'],
    });
  });

  it('tries only the explicitly configured next original, then reports missing honestly', () => {
    const resolver = createArtModeResolver(policies, [original(cok, 'DOS-EGA', 'cok dos')], []);
    expect(resolver.resolve(cok, { kind: 'restyle' })).toMatchObject({
      status: 'found', asset: 'cok dos', effective: { kind: 'original', system: 'DOS-EGA' },
      triedOriginals: ['Amiga', 'DOS-EGA'],
    });
    expect(resolver.resolve(dok, { kind: 'restyle' })).toEqual({
      status: 'missing', requested: { kind: 'restyle' }, fallbackReason: 'no-restyle-mapping',
      triedOriginals: ['Amiga', 'DOS-EGA'],
    });
    expect(resolver.resolve(cok, { kind: 'original', system: 'Amiga' })).toMatchObject({
      status: 'found', fallbackReason: 'original-output-missing', triedOriginals: ['Amiga', 'DOS-EGA'],
    });
    expect(resolver.resolve({ game: 'pool', logicalId: 'title' }, { kind: 'restyle' })).toMatchObject({
      status: 'missing', triedOriginals: ['DOS-VGA'],
    });
  });

  it('supports explicitly registered C64, Atari and Apple art without hard-coded platform cases', () => {
    const ref = { game: 'future', logicalId: 'portrait.hero' };
    const resolver = createArtModeResolver(
      [{ game: 'future', originalPriority: ['C64', 'Atari ST', 'Apple II'] }],
      [original(ref, 'Apple II', 'apple pixels'), original(ref, 'Atari ST', 'atari pixels')],
      [],
    );
    expect(resolver.resolve(ref, { kind: 'restyle' })).toMatchObject({
      asset: 'atari pixels', effective: { kind: 'original', system: 'Atari ST' },
      triedOriginals: ['C64', 'Atari ST'],
    });
    expect(resolver.resolve(ref, { kind: 'original', system: 'Apple II' })).toMatchObject({
      asset: 'apple pixels', effective: { kind: 'original', system: 'Apple II' },
      fallbackReason: null,
    });
  });

  it('does not equate positions, block IDs, or frames across platforms', () => {
    const resolver = createArtModeResolver(policies,
      [original({ game: 'cok', logicalId: 'portrait-15', frame: 1 }, 'Amiga', 'frame 1')],
      [restyle({ game: 'cok', logicalId: 'portrait-15', frame: 0 }, 'approved', 'frame 0')]);
    expect(resolver.resolve({ game: 'cok', logicalId: 'portrait-15', frame: 1 }, { kind: 'restyle' }))
      .toMatchObject({ asset: 'frame 1', fallbackReason: 'no-restyle-mapping' });
    expect(resolver.resolve({ game: 'cok', logicalId: 'portrait-15', frame: 0 }, { kind: 'restyle' }))
      .toMatchObject({ asset: 'frame 0', effective: { kind: 'restyle' } });
    expect(resolver.resolve({ game: 'cok', logicalId: 'portrait-15' }, { kind: 'restyle' }))
      .toMatchObject({ status: 'missing' });
  });

  it('snapshots review state: changing a caller-owned candidate cannot silently approve it', () => {
    const candidate = restyle(cok, 'pending', 'unreviewed pixels');
    const resolver = createArtModeResolver(policies, originals, [candidate]);
    candidate.review = 'approved';
    candidate.asset = 'other pixels';
    expect(resolver.resolve(cok, { kind: 'restyle' })).toMatchObject({
      asset: 'cok amiga', fallbackReason: 'restyle-unapproved',
    });
  });

  it('rejects ambiguous registries and unknown mode/game instead of guessing', () => {
    expect(() => createArtModeResolver(policies, [original(cok, 'Amiga', 'one'), original(cok, 'Amiga', 'two')], []))
      .toThrow(/duplicate original/);
    expect(() => createArtModeResolver(policies, [], [restyle(cok, 'pending'), restyle(cok, 'approved')]))
      .toThrow(/duplicate restyle/);
    expect(() => createArtModeResolver(policies, [], [restyle(cok, 'pending'),
      { ...restyle(dok, 'approved'), comparisonId: 'cok-reviewed-comparison' }]))
      .toThrow(/duplicate comparison ID/);
    expect(() => createArtModeResolver(policies, [original(cok, 'Atari ST', 'pixels')], []))
      .toThrow(/unregistered original system/);
    expect(() => createArtModeResolver(policies, [original(cok, 'Amiga', null as never)], []))
      .toThrow(/invalid original asset/);
    expect(() => createArtModeResolver([{ game: 'cok', originalPriority: ['Amiga', 'Amiga'] }], [], []))
      .toThrow(/duplicate original system/);
    const resolver = createArtModeResolver(policies, originals, []);
    expect(() => resolver.resolve(cok, { kind: 'original', system: 'Atari ST' })).toThrow(/unregistered original system/);
    expect(() => resolver.resolve({ game: 'other', logicalId: 'x' }, { kind: 'restyle' })).toThrow(/unregistered game/);
    expect(() => resolver.resolve({ game: 'cok', logicalId: 'x', frame: -1 }, { kind: 'restyle' }))
      .toThrow(/invalid frame/);
  });
});
