import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCokPlayerPresentation, presentCokPartyRosterIcon } from '../src/ui/cok-player-presentation.mjs';

const art = (color) => ({ width: 96, height: 96, pixels: new Uint8ClampedArray(96 * 96 * 4).fill(color) });
const appearance = () => ({ id: 'cok-player-05-18-00-02', frames: [88, 216].map((bodyBlockId, i) => ({
  bodyBlockId, canonical: { appearanceSetId: 'cok/dos-ega/appearance/05-18-00-02',
    headSourceId: `cok/dos-ega/install/chead.dax/block/${i ? 197 : 69}/frame/0`,
    bodySourceId: `cok/dos-ega/install/cbody.dax/block/${bodyBlockId}/frame/0` },
  original: art(i + 1), restyle: art(i + 3), pixelScale: 4,
  restyleStatus: { state: i ? 'not-admitted' : 'ready', headPath: '', bodyPath: '' },
})) });
const request = (overrides = {}) => ({ consumer: 'character-sheet', mode: 'DOS-EGA',
  fallback: 'DOS-EGA', playback: 'still', ...overrides });

test('sheet and combat keep source variant0 and their existing admitted Restyle still', () => {
  const a = appearance();
  for (const consumer of ['character-sheet', 'combat-party-icon']) {
    for (const mode of ['DOS-EGA', 'Amiga', 'Restyle']) {
      const result = resolveCokPlayerPresentation(a, request({ consumer, mode }));
      assert.equal(result.state, 'ready');
      assert.equal(result.variantIndex, 0);
      assert.equal(result.frame, a.frames[0]);
      assert.equal(result.art, mode === 'Restyle' ? a.frames[0].restyle : a.frames[0].original);
      assert.equal(result.source, mode === 'Restyle' ? 'Restyle' : 'DOS-EGA');
      assert.equal(result.playback, 'held');
      assert.match(result.label, mode === 'Restyle' ? /^Restyle character icon$/ : /character icon/);
    }
    assert.equal(resolveCokPlayerPresentation(a, request({ consumer, variantIndex: 1 })).art, null);
  }
});

test('all four existing appearance identities retain their exact source locators', () => {
  for (const [suffix, head0, head1, body0, body1] of [
    ['05-18-00-02', 69, 197, 88, 216], ['05-01-01-02', 69, 197, 65, 193],
    ['05-17-04-02', 69, 197, 87, 215], ['03-0b-03-01', 3, 131, 11, 139],
  ]) {
    const a = appearance();
    a.id = `cok-player-${suffix}`;
    a.frames.forEach((frame, i) => {
      frame.bodyBlockId = i ? body1 : body0;
      frame.canonical = { appearanceSetId: `cok/dos-ega/appearance/${suffix}`,
        headSourceId: `cok/dos-ega/install/chead.dax/block/${i ? head1 : head0}/frame/0`,
        bodySourceId: `cok/dos-ega/install/cbody.dax/block/${frame.bodyBlockId}/frame/0` };
    });
    assert.equal(resolveCokPlayerPresentation(a, request({ mode: 'Restyle' })).art, a.frames[0].restyle);
    assert.equal(resolveCokPlayerPresentation(a, request({ consumer: 'creator-preview', mode: 'Restyle', variantIndex: 1 })).art,
      a.frames[1].original);
  }
});

test('creator requires an explicit variant; each preview keeps its own admission', () => {
  const a = appearance();
  for (const variantIndex of [0, 1]) {
    const result = resolveCokPlayerPresentation(a, request({ consumer: 'creator-preview', mode: 'Restyle', variantIndex }));
    assert.equal(result.variantIndex, variantIndex);
    assert.equal(result.art, variantIndex ? a.frames[1].original : a.frames[0].restyle);
    assert.match(result.label, variantIndex ? /DOS character icon.*awaiting review/ : /^Restyle character icon$/);
  }
  for (const variantIndex of [undefined, -1, 2, '0']) {
    assert.equal(resolveCokPlayerPresentation(a, request({ consumer: 'creator-preview', variantIndex })).state, 'held');
  }
  a.frames[1].restyleStatus.state = 'ready';
  const held = resolveCokPlayerPresentation(a, request({ consumer: 'creator-preview', mode: 'Restyle', variantIndex: 1 }));
  assert.equal(held.art, a.frames[1].original);
  assert.match(held.label, /awaiting review/);
});

test('Amiga requests and optional failures truthfully report the selected DOS still', () => {
  const a = appearance();
  for (const state of ['pending', 'failed', 'not-admitted', 'unknown']) {
    a.frames[0].restyleStatus = { state, component: 'head', error: 'fixture failure' };
    const result = resolveCokPlayerPresentation(a, request({ mode: 'Restyle', fallback: 'Amiga' }));
    assert.equal(result.art, a.frames[0].original);
    assert.equal(result.source, 'DOS-EGA');
    assert.match(result.label, /^DOS character icon.*Amiga mapping pending$/);
  }
  a.frames[0].restyleStatus.state = 'ready';
  a.frames[0].restyle = null;
  const noPixels = resolveCokPlayerPresentation(a, request({ mode: 'Restyle' }));
  assert.equal(noPixels.art, a.frames[0].original);
  assert.match(noPixels.label, /Restyle unavailable/);
  a.frames[0].canonical = null;
  a.frames[0].restyle = art(7);
  const noBinding = resolveCokPlayerPresentation(a, request({ mode: 'Restyle' }));
  assert.equal(noBinding.art, a.frames[0].original);
  assert.match(noBinding.label, /Restyle unavailable/);
});

test('unknown appearance, source geometry and identity never admit art', () => {
  const mutations = [
    (a) => { a.id = 'cok/amiga/candidate/chart-head5-body1'; },
    (a) => { a.id = 'unknown'; }, (a) => { a.frames[0].bodyBlockId = 65; },
    (a) => { a.frames[0].original.width = 24; }, (a) => { a.frames[0].pixelScale = 1; },
    (a) => { a.frames[0].original.pixels = new Uint8ClampedArray(4); },
    (a) => { a.frames[0].canonical.headSourceId = 'cok/amiga/disk2/chart.lbm/cell/67'; },
  ];
  for (const mutate of mutations) {
    const a = appearance(); mutate(a);
    const result = resolveCokPlayerPresentation(a, request());
    assert.equal(result.state, 'held');
    assert.equal(result.art, null);
  }
  for (const overrides of [{ mode: 'unknown' }, { fallback: 'unknown' }, { consumer: 'attack' }]) {
    assert.equal(resolveCokPlayerPresentation(appearance(), request(overrides)).art, null);
  }
});

test('all playback requests remain held even with ready previews and chosen variants', () => {
  const a = appearance();
  for (const consumer of ['creator-preview', 'character-sheet', 'combat-party-icon']) {
    for (const mode of ['DOS-EGA', 'Amiga', 'Restyle']) {
      for (const playback of ['playback', 'attack', 'idle', undefined]) {
        const result = resolveCokPlayerPresentation(a, request({ consumer, mode, playback, variantIndex: 0 }));
        assert.equal(result.state, 'held');
        assert.equal(result.reason, 'player-playback-not-admitted');
        assert.equal(result.art, null);
        assert.equal(result.playback, 'held');
      }
    }
  }
});

test('one-frame sheet and combat preparations retain DOS fallback and held playback', () => {
  const a = appearance(); a.frames = a.frames.slice(0, 1);
  for (const consumer of ['character-sheet', 'combat-party-icon']) {
    for (const state of ['ready', 'failed']) {
      a.frames[0].restyleStatus.state = state;
      const result = resolveCokPlayerPresentation(a, request({ consumer, mode: 'Restyle' }));
      assert.equal(result.variantIndex, 0);
      assert.equal(result.art, state === 'ready' ? a.frames[0].restyle : a.frames[0].original);
      assert.equal(result.playback, 'held');
    }
    assert.equal(resolveCokPlayerPresentation(a, request({ consumer, variantIndex: 1 })).art, null);
    assert.equal(resolveCokPlayerPresentation(a, request({ consumer, playback: 'playback' })).art, null);
  }
  assert.equal(resolveCokPlayerPresentation(a, request({ consumer: 'creator-preview', variantIndex: 1 })).art, null);
  assert.equal(a.frames.length, 1);
});

test('one-frame creator preserves variant0 across modes and optional failures while holding variant1/playback', () => {
  const a = appearance(); a.frames = a.frames.slice(0, 1);
  for (const state of ['ready', 'failed']) for (const mode of ['DOS-EGA', 'Amiga', 'Restyle']) {
    a.frames[0].restyleStatus = { state, component: 'head', error: 'synthetic failure' };
    const options = request({ consumer: 'creator-preview', mode, variantIndex: 0 });
    const result = resolveCokPlayerPresentation(a, options);
    const useRestyle = mode === 'Restyle' && state === 'ready';
    assert.equal(result.state, 'ready'); assert.equal(result.variantIndex, 0);
    assert.equal(result.art, useRestyle ? a.frames[0].restyle : a.frames[0].original);
    assert.equal(result.source, useRestyle ? 'Restyle' : 'DOS-EGA');
    assert.equal(result.playback, 'held');
    if (mode === 'Amiga') assert.match(result.label, /Amiga mapping pending/);
    if (mode === 'Restyle' && state === 'failed') assert.match(result.label, /DOS character icon.*Restyle unavailable/);
    const secondary = resolveCokPlayerPresentation(a, { ...options, variantIndex: 1 });
    assert.equal(secondary.state, 'held'); assert.equal(secondary.art, null);
    const playback = resolveCokPlayerPresentation(a, { ...options, playback: 'playback' });
    assert.equal(playback.reason, 'player-playback-not-admitted'); assert.equal(playback.art, null);
  }
  assert.equal(a.frames.length, 1);
});

test('party roster uses primary still only across modes and per-icon optional failures', () => {
  const a = appearance(); a.frames.length = 1;
  for (const mode of ['DOS-EGA', 'Amiga', 'Restyle']) for (const failed of [false, true]) {
    a.frames[0].restyleStatus = { state: failed ? 'failed' : 'ready', component: 'head', error: 'fixture' };
    const result = resolveCokPlayerPresentation(a, request({ consumer: 'party-roster', mode }));
    assert.equal(result.art, mode === 'Restyle' && !failed ? a.frames[0].restyle : a.frames[0].original);
    assert.equal(result.variantIndex, 0); assert.equal(result.playback, 'held');
    if (mode === 'Amiga') assert.match(result.label, /DOS character icon.*Amiga mapping pending/);
    if (mode === 'Restyle' && failed) assert.match(result.label, /DOS character icon.*Restyle unavailable/);
  }
  for (const overrides of [{ variantIndex: 1 }, { playback: 'playback' }])
    assert.equal(resolveCokPlayerPresentation(a, request({ consumer: 'party-roster', ...overrides })).state, 'held');
  assert.equal(resolveCokPlayerPresentation(undefined, request({ consumer: 'party-roster' })).art, null);
  a.id = 'unmapped';
  assert.equal(resolveCokPlayerPresentation(a, request({ consumer: 'party-roster' })).art, null);
});

test('roster completion paints originals before optional art without mutating supplied art or request', async () => {
  const a = appearance(); const paints = []; let finish;
  const optional = new Promise((resolve) => { finish = resolve; });
  const options = { mode: 'Restyle', fallback: 'DOS-EGA' };
  const pending = structuredClone(a); pending.frames[0].restyleStatus.state = 'pending';
  const before = structuredClone({ a, options });
  const done = presentCokPartyRosterIcon(Promise.resolve({ original: pending, restyleReady: optional }),
    options, () => true, (p) => paints.push(p), () => assert.fail('Unexpected failure'));
  await Promise.resolve();
  assert.equal(paints.length, 1); assert.equal(paints[0].art, pending.frames[0].original);
  finish(a); await done;
  assert.equal(paints[1].art, a.frames[0].restyle); assert.deepEqual({ a, options }, before);
});

test('roster ignores stale mandatory/optional success and failure for every invalidation dimension', async () => {
  for (const dimension of ['mount', 'roster', 'member', 'appearance', 'palette', 'pack', 'connected']) {
    for (const phase of ['mandatory', 'optional']) for (const fail of [false, true]) {
      const live = Object.fromEntries(['mount', 'roster', 'member', 'appearance', 'palette', 'pack', 'connected'].map(k => [k, 1]));
      const captured = { ...live }; const paints = []; let release, reject;
      const delayed = new Promise((resolve, no) => { release = resolve; reject = no; });
      const a = appearance();
      const prepared = { original: a, restyleReady: phase === 'optional' ? delayed : Promise.resolve(a) };
      const done = presentCokPartyRosterIcon(phase === 'mandatory' ? delayed : Promise.resolve(prepared),
        { mode: 'Restyle', fallback: 'DOS-EGA' }, () => Object.keys(live).every(k => live[k] === captured[k]),
        (p) => paints.push(p), () => paints.push('unavailable'));
      await Promise.resolve();
      assert.equal(paints.length, phase === 'optional' ? 1 : 0);
      live[dimension]++;
      if (fail) reject(new Error('late source failure')); else release(phase === 'mandatory' ? prepared : a);
      await done; assert.equal(paints.length, phase === 'optional' ? 1 : 0, dimension + '/' + phase);
    }
  }
  let unavailable = 0;
  await presentCokPartyRosterIcon(Promise.reject(new Error('source missing')), { mode: 'DOS-EGA', fallback: 'DOS-EGA' },
    () => true, () => assert.fail('No source pixels'), () => unavailable++);
  assert.equal(unavailable, 1);
});
