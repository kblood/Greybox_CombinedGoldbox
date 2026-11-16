import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import manifest from '../src/ui/cokPlayerAppearanceManifest.json' with { type: 'json' };
import policy from '../src/ui/cokPlayerRestyleAdmission.json' with { type: 'json' };
import projection from '../src/ui/cokPlayerCanonicalBindings.json' with { type: 'json' };
import { cokPlayerAppearanceFetchPlan, validateCokPlayerCanonicalBindings,
  tryCokPlayerCanonicalBindings } from '../src/ui/cok-player-canonical-bindings.mjs';
import { cokPlayerAppearancePackagePlan } from '../src/ui/cok-player-restyle-admission.mjs';
import { checkCokPlayerCanonicalBindings } from '../../../tools/cok-player-canonical-bindings.mjs';

test('all six exact selectors resolve eight variants with distinct, archive-qualified IDs', () => {
  const bindings = validateCokPlayerCanonicalBindings(manifest, policy, projection);
  const sourceId = (archive, block) => `cok/dos-ega/install/${archive}.dax/block/${block}/frame/0`;
  const expected = [
    ['05-18-00-02', 5, 24, [0, 2], 2, [69, 197], [88, 216]],
    ['05-01-01-02', 5, 1, [1], 2, [69, 197], [65, 193]],
    ['05-17-04-02', 5, 23, [4, 5], 2, [69, 197], [87, 215]],
    ['03-0b-03-01', 3, 11, [3], 1, [3, 131], [11, 139]],
  ];
  assert.equal(bindings.plans.length, 4);
  const ids = new Set();
  let memberships = 0;
  for (const [id, cHeadRequest, cBodyBlock, slots, suffixCode, heads, bodies] of expected) {
    for (const cBodySlot of slots) {
      const plan = bindings.resolve({ cHeadRequest, cBodyBlock, cBodySlot, suffixCode });
      assert.equal(plan?.appearanceSetId, `cok/dos-ega/appearance/${id}`);
      assert.equal(plan.frames.length, 2);
      assert.deepEqual(plan.frames.map((frame) => [frame.head.sourceId, frame.body.sourceId]),
        heads.map((head, index) => [sourceId('chead', head), sourceId('cbody', bodies[index])]));
    }
    const plan = bindings.resolve({ cHeadRequest, cBodyBlock, cBodySlot: slots[0], suffixCode });
    assert.equal(plan.frames[0].head.original.sha256, plan.frames[1].head.original.sha256);
    for (const { head, body } of plan.frames) { memberships += 2; ids.add(head.sourceId); ids.add(body.sourceId); }
  }
  assert.equal(ids.size, 12);
  assert.equal(memberships, 16);
  assert.equal(bindings.resolve({ cHeadRequest: 5, cBodyBlock: 24, cBodySlot: 1, suffixCode: 2 }), null);
  assert.equal(bindings.resolve({ cHeadRequest: '5', cBodyBlock: 24, cBodySlot: 0, suffixCode: 2 }), null);
});

test('validated fetch requests agree with all 20 package paths; held frames have no Restyle requests', () => {
  const { plans } = validateCokPlayerCanonicalBindings(manifest, policy, projection);
  const paths = new Map();
  for (const plan of plans) {
    function add(kind, part) {
      const dest = `${plan.manifestId}/${kind}/${part.file.split('/').at(-1)}`;
      paths.set(dest, { ...part, dest });
    }
    for (const frame of plan.frames) {
      add('original', frame.head.original);
      add('original', frame.body.original);
      if (frame.restyle) {
        add('restyle', frame.restyle.head);
        add('restyle', frame.restyle.body);
      }
    }
    assert.equal(plan.frames[1].restyle, null);
    assert.equal(plan.frames[1].admission.reason, 'awaiting-prompt-and-composition-review');
  }
  assert.equal(paths.size, 20);
  assert.deepEqual([...paths.values()].sort((a, b) => a.dest.localeCompare(b.dest)),
    cokPlayerAppearancePackagePlan(manifest, policy).sort((a, b) => a.dest.localeCompare(b.dest)));
});

test('equal head pixels cannot substitute a different variant locator', () => {
  for (const setIndex of [0, 3]) {
    const wrong = structuredClone(projection);
    const [first, second] = wrong.appearanceSets[setIndex].variants.map((variant) => variant.components[0]);
    assert.equal(wrong.sources.find((row) => row.id === first.assetId).decoded.sha256,
      wrong.sources.find((row) => row.id === second.assetId).decoded.sha256);
    [first.assetId, second.assetId] = [second.assetId, first.assetId];
    assert.throws(() => validateCokPlayerCanonicalBindings(manifest, policy, wrong), /head locator/);
    assert.equal(tryCokPlayerCanonicalBindings(manifest, policy, wrong), null);
  }
});

test('the loader fetch plan uses canonical requests and removes every optional request on invalid evidence', () => {
  const request = { cHeadRequest: 5, cBodyBlock: 24, cBodySlot: 2, suffixCode: 2 };
  const valid = tryCokPlayerCanonicalBindings(manifest, policy, projection);
  const plan = cokPlayerAppearanceFetchPlan(manifest, valid, request);
  const canonical = valid.resolve(request);
  assert.deepEqual(plan.originalHead, canonical.frames[0].head.original);
  assert.deepEqual(plan.frames.map((frame) => frame.originalBody), canonical.frames.map((frame) => frame.body.original));
  assert.deepEqual(plan.frames.map((frame) => frame.restyle), canonical.frames.map((frame) => frame.restyle));
  assert.equal(plan.frames[0].canonical.bodySourceId, canonical.frames[0].body.sourceId);
  for (const appearance of manifest.appearances) for (const tuple of appearance.sourceTuples) {
    const selected = cokPlayerAppearanceFetchPlan(manifest, valid, tuple);
    assert.equal(selected.frames[0].candidateHeadPath, appearance.head.restyleFile);
    assert.equal(selected.frames[0].candidateBodyPath, appearance.bodyFrames[0].restyleFile);
    assert.equal(Object.hasOwn(selected.frames[1], 'candidateHeadPath'), false);
    assert.equal(Object.hasOwn(selected.frames[1], 'candidateBodyPath'), false);
  }
  const changed = structuredClone(projection);
  changed.appearanceSets[0].variants[0].components[0].assetId =
    changed.appearanceSets[0].variants[1].components[0].assetId;
  const fallback = cokPlayerAppearanceFetchPlan(manifest, tryCokPlayerCanonicalBindings(manifest, policy, changed), request);
  assert.deepEqual(fallback.originalHead, plan.originalHead);
  assert.deepEqual(fallback.frames.map((frame) => frame.originalBody), plan.frames.map((frame) => frame.originalBody));
  assert.ok(fallback.frames.every((frame) => frame.restyle === null && frame.canonical === null
    && !Object.hasOwn(frame, 'candidateHeadPath') && !Object.hasOwn(frame, 'candidateBodyPath')
    && frame.reason === 'player-canonical-binding-unavailable'));
  assert.equal(cokPlayerAppearanceFetchPlan(manifest, valid, { ...request, cBodySlot: 1 }), null);
});

test('DOS fallback planning rejects unsafe mapped source paths with unavailable canonical evidence', () => {
  const request = { cHeadRequest: 5, cBodyBlock: 24, cBodySlot: 2, suffixCode: 2 };
  for (const component of ['head', 'body0', 'body1']) {
    const malformed = structuredClone(manifest), appearance = malformed.appearances[0];
    const part = component === 'head' ? appearance.head : appearance.bodyFrames[component === 'body0' ? 0 : 1];
    part.sourceFile = '../outside.png';
    assert.equal(cokPlayerAppearanceFetchPlan(malformed, null, request), null);
  }
});

test('source, tuple, membership, and output mutations fail closed', () => {
  const altered = [
    (p) => { p.sources[0].archive.sha256 = 'f'.repeat(64); },
    (p) => { p.sources[0].archive.name = 'CHEAD.DAX'; },
    (p) => { p.sources[0].game = 'dok'; },
    (p) => { p.sources[0].platform = 'Amiga'; },
    (p) => { p.sources[0].edition = 'Amiga'; },
    (p) => { p.sources[0].locator.blockId++; },
    (p) => { p.sources[0].locator.frameIndex = 1; },
    (p) => { p.sources[0].decoded.height++; },
    (p) => { p.sources[0].decoded.sha256 = 'f'.repeat(64); },
    (p) => { p.sources[0].id = p.sources[1].id; },
    (p) => { p.sources.pop(); },
    (p) => { p.appearanceSets[0].acceptedTuples[1].cBodySlot = 1; },
    (p) => { p.appearanceSets[0].acceptedTuples.push({ ...p.appearanceSets[0].acceptedTuples[0], cBodySlot: 1 }); },
    (p) => { p.appearanceSets[0].variants[0].components.reverse(); },
    (p) => { p.appearanceSets[0].variants.reverse(); },
    (p) => { p.restyles[0].outputs[0].sha256 = 'f'.repeat(64); },
    (p) => { p.restyles[0].sourceAssetIds = [p.sources.find((row) => !p.restyles[0].sourceAssetIds.includes(row.id)).id]; },
  ];
  for (const mutate of altered) {
    const wrong = structuredClone(projection);
    mutate(wrong);
    assert.throws(() => validateCokPlayerCanonicalBindings(manifest, policy, wrong), /canonical binding/);
  }
  const promoted = structuredClone(policy);
  promoted.frames[1].state = 'admitted';
  assert.throws(() => validateCokPlayerCanonicalBindings(manifest, promoted, projection), /admission pins/);
  const matchingButUnreviewed = { ...projection, admission: promoted.frames };
  assert.throws(() => validateCokPlayerCanonicalBindings(manifest, promoted, matchingButUnreviewed), /policy decision/);
  const changedMask = structuredClone(manifest);
  changedMask.sourceMaskKey = 0;
  assert.throws(() => validateCokPlayerCanonicalBindings(changedMask, policy, projection), /composition settings/);
});

test('checked-in projection is the deterministic projection of the exact pinned inputs', () => {
  checkCokPlayerCanonicalBindings(projection);
  const wrong = structuredClone(projection);
  wrong.appearanceSets[0].evidence.pop();
  assert.throws(() => checkCokPlayerCanonicalBindings(wrong), /differs from the pinned registry/);
});

function coherentMutation(mutate) {
  const m = structuredClone(manifest), p = structuredClone(projection), q = structuredClone(policy);
  mutate(m, p);
  p.inputSha256.manifest = createHash('sha256').update(JSON.stringify(m)).digest('hex');
  for (const set of p.appearanceSets) set.sourceManifest.sha256 = p.inputSha256.manifest;
  for (const frame of q.frames) {
    const a = m.appearances.find((row) => row.appearanceId === frame.appearanceId), body = a.bodyFrames[frame.frameIndex];
    frame.headBlockIds = [...a.head.blockIds]; frame.bodyBlockId = body.blockId;
    for (const [role, part] of [['head', a.head], ['body', body]]) frame[role] = { sourceSha256: part.sourceSha256, restyleSha256: part.restyleSha256 };
  }
  p.admission = structuredClone(q.frames); p.inputSha256.policy = createHash('sha256').update(JSON.stringify(q)).digest('hex');
  return { m, p, q };
}

test('independent reviewed mapping rejects coherently wrong storage arithmetic and aliases', () => {
  const cases = [
    (m, p) => {
      for (const appearance of m.appearances.filter((row) => row.head.blockIds[0] === 69)) {
        appearance.head.blockIds.reverse();
        const set = p.appearanceSets.find((row) => row.manifestId === appearance.appearanceId);
        const [a, b] = set.variants;
        [a.components[0], b.components[0]] = [b.components[0], a.components[0]];
      }
    },
    (m, p) => {
      for (const appearance of m.appearances.filter((row) => row.head.blockIds[0] === 69)) {
        appearance.head.blockIds = [5, 133];
      }
      for (const [oldBlock, block] of [[69, 5], [197, 133]]) {
        const source = p.sources.find((row) => row.archive.name === 'CHEAD.DAX' && row.locator.blockId === oldBlock);
        const oldId = source.id;
        source.id = source.id.replace(`/block/${oldBlock}/`, `/block/${block}/`);
        source.locator.blockId = block;
        for (const set of p.appearanceSets) for (const variant of set.variants) {
          for (const component of variant.components) if (component.assetId === oldId) component.assetId = source.id;
        }
        for (const restyle of p.restyles) restyle.sourceAssetIds = restyle.sourceAssetIds.map((id) => id === oldId ? source.id : id);
      }
    },
    (m, p) => {
      m.appearances[0].sourceTuples[1].cBodySlot = 1;
      p.appearanceSets[0].acceptedTuples[1].cBodySlot = 1;
    },
    (m, p) => {
      const tuples = m.appearances[0].sourceTuples;
      [tuples[0].cBodySlot, tuples[1].cBodySlot] = [tuples[1].cBodySlot, tuples[0].cBodySlot];
      const accepted = p.appearanceSets[0].acceptedTuples;
      [accepted[0].cBodySlot, accepted[1].cBodySlot] = [accepted[1].cBodySlot, accepted[0].cBodySlot];
    },
  ];
  for (const mutate of cases) {
    const { m, p, q } = coherentMutation(mutate);
    assert.throws(() => validateCokPlayerCanonicalBindings(m, q, p), /reviewed selector/);
    assert.equal(tryCokPlayerCanonicalBindings(m, q, p), null);
    for (const request of m.appearances[0].sourceTuples) {
      assert.equal(cokPlayerAppearanceFetchPlan(m, null, request), null);
    }
  }
});

test('fetch plans cannot use wrong or unreviewed manifest selectors even without canonical evidence', () => {
  const valid = validateCokPlayerCanonicalBindings(manifest, policy, projection);
  const request = { cHeadRequest: 5, cBodyBlock: 24, cBodySlot: 0, suffixCode: 2 };
  for (const bindings of [null, valid]) {
    for (const mutate of [
      (m) => { m.appearances[0].head.blockIds = [5, 133]; },
      (m) => { m.appearances[0].bodyFrames[0].blockId = 90; },
      (m) => { m.appearances[0].appearanceId = 'cok-player-05-18-02-02'; },
    ]) {
      const wrong = structuredClone(manifest); mutate(wrong);
      assert.equal(cokPlayerAppearanceFetchPlan(wrong, bindings, request), null);
    }
    const unreviewed = structuredClone(manifest);
    unreviewed.appearances[0].sourceTuples[0].cBodySlot = 1;
    assert.equal(cokPlayerAppearanceFetchPlan(unreviewed, bindings, { ...request, cBodySlot: 1 }), null);
  }
});

function relabelBodies(m, p, pairs) {
  for (const [before, after] of pairs) {
    for (const a of m.appearances) for (const body of a.bodyFrames) if (body.blockId === before) body.blockId = after;
    const source = p.sources.find((row) => row.archive.name === 'CBODY.DAX' && row.locator.blockId === before);
    const oldId = source.id;
    source.id = oldId.replace(`/block/${before}/`, `/block/${after}/`); source.locator.blockId = after;
    for (const set of p.appearanceSets) for (const v of set.variants) for (const c of v.components) {
      if (c.assetId === oldId) c.assetId = source.id;
    }
    for (const r of p.restyles) r.sourceAssetIds = r.sourceAssetIds.map((id) => id === oldId ? source.id : id);
  }
}

test('coherent request, suffix, roster and body mutations fail the independent selector guard', () => {
  const tupleChange = (index, field, value) => (m, p) => {
    for (const t of m.appearances[index].sourceTuples) t[field] = value;
    for (const t of p.appearanceSets[index].acceptedTuples) t[field] = value;
  };
  const aliasChange = (index, value) => (m, p) => {
    m.appearances[index].sourceTuples[1].cBodySlot = value;
    p.appearanceSets[index].acceptedTuples[1].cBodySlot = value;
  };
  const mutations = [
    tupleChange(0, 'cHeadRequest', 6), tupleChange(0, 'cBodyBlock', 25),
    tupleChange(0, 'suffixCode', 1), tupleChange(0, 'suffixCode', 3),
    aliasChange(0, 1), aliasChange(2, 6),
    (m, p) => {
      [m.appearances[0].sourceTuples, m.appearances[2].sourceTuples] =
        [m.appearances[2].sourceTuples, m.appearances[0].sourceTuples];
      [p.appearanceSets[0].acceptedTuples, p.appearanceSets[2].acceptedTuples] =
        [p.appearanceSets[2].acceptedTuples, p.appearanceSets[0].acceptedTuples];
    },
    (m, p) => { m.appearances[0].bodyFrames.reverse(); const [a, b] = p.appearanceSets[0].variants; [a.components[1], b.components[1]] = [b.components[1], a.components[1]]; a.index = 0; b.index = 1; },
    (m, p) => relabelBodies(m, p, [[88, 89], [216, 217]]),
    (m, p) => relabelBodies(m, p, [[216, 217]]),
  ];
  for (const mutate of mutations) {
    const { m, p, q } = coherentMutation(mutate);
    assert.throws(() => validateCokPlayerCanonicalBindings(m, q, p), /reviewed selector/);
    assert.equal(tryCokPlayerCanonicalBindings(m, q, p), null);
    for (const index of [0, 2]) for (const request of m.appearances[index].sourceTuples) {
      const original = manifest.appearances[index];
      if (JSON.stringify(m.appearances[index]) !== JSON.stringify(original)) {
        assert.equal(cokPlayerAppearanceFetchPlan(m, null, request), null);
      }
    }
  }
});
