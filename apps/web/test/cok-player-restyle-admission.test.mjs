import assert from 'node:assert/strict';
import test from 'node:test';
import manifest from '../src/ui/cokPlayerAppearanceManifest.json' with { type: 'json' };
import policy from '../src/ui/cokPlayerRestyleAdmission.json' with { type: 'json' };
import { cokPlayerAppearanceHeldRestylePaths, cokPlayerAppearancePackagePlan,
  cokPlayerFrameRestyleAdmission } from '../src/ui/cok-player-restyle-admission.mjs';

const appearances = new Map(manifest.appearances.map((appearance) => [appearance.appearanceId, appearance]));

test('only the four exact primary composed frames are Restyle-admitted', () => {
  for (const appearance of manifest.appearances) {
    assert.equal(cokPlayerFrameRestyleAdmission(manifest, policy, appearance.appearanceId, 0).state, 'admitted');
    const held = cokPlayerFrameRestyleAdmission(manifest, policy, appearance.appearanceId, 1);
    assert.deepEqual(held, { state: 'not-admitted', reason: 'awaiting-prompt-and-composition-review' });
  }
  assert.equal(cokPlayerFrameRestyleAdmission(manifest, policy, 'unknown', 0).state, 'not-admitted');
  assert.equal(cokPlayerFrameRestyleAdmission(manifest, policy, manifest.appearances[0].appearanceId, 2).state, 'not-admitted');
});

test('policy mutations, omissions, duplicates and new candidate outputs fail closed', () => {
  const changedHash = structuredClone(policy);
  changedHash.frames[0].body.restyleSha256 = 'f'.repeat(64);
  assert.equal(cokPlayerFrameRestyleAdmission(manifest, changedHash, manifest.appearances[0].appearanceId, 0).state, 'not-admitted');
  const changedBlock = structuredClone(policy);
  changedBlock.frames[0].bodyBlockId++;
  assert.equal(cokPlayerFrameRestyleAdmission(manifest, changedBlock, manifest.appearances[0].appearanceId, 0).state, 'not-admitted');
  const changedHeadBlock = structuredClone(policy);
  changedHeadBlock.frames[0].headBlockIds = [69];
  assert.equal(cokPlayerFrameRestyleAdmission(manifest, changedHeadBlock, manifest.appearances[0].appearanceId, 0).state, 'not-admitted');
  const duplicate = structuredClone(policy);
  duplicate.frames.push(structuredClone(duplicate.frames[0]));
  assert.equal(cokPlayerFrameRestyleAdmission(manifest, duplicate, manifest.appearances[0].appearanceId, 0).state, 'not-admitted');
  const missing = structuredClone(policy);
  missing.frames.pop();
  assert.equal(cokPlayerFrameRestyleAdmission(manifest, missing, manifest.appearances[0].appearanceId, 0).state, 'not-admitted');

  const candidateOutputOnly = structuredClone(policy);
  const held = candidateOutputOnly.frames.find((row) => row.frameIndex === 1);
  held.state = 'admitted';
  held.body.restyleSha256 = 'f'.repeat(64);
  assert.equal(cokPlayerFrameRestyleAdmission(manifest, candidateOutputOnly,
    manifest.appearances[0].appearanceId, 1).state, 'not-admitted',
  'changing policy status cannot admit a Restyle output that differs from the pinned manifest');
  assert.equal(appearances.size, 4);
});

test('package plan contains every DOS source and only the eight admitted Restyle files', () => {
  const entries = cokPlayerAppearancePackagePlan(manifest, policy);
  assert.equal(entries.length, 20);
  assert.equal(entries.filter((entry) => entry.dest.includes('/original/')).length, 12);
  assert.equal(entries.filter((entry) => entry.dest.includes('/restyle/')).length, 8);
  for (const row of policy.frames.filter((entry) => entry.state === 'held')) {
    const body = appearances.get(row.appearanceId).bodyFrames[row.frameIndex];
    assert.ok(!entries.some((entry) => entry.file === body.restyleFile), `${body.restyleFile} is held from the runtime package`);
  }
  for (const row of policy.frames.filter((entry) => entry.state === 'admitted')) {
    const body = appearances.get(row.appearanceId).bodyFrames[row.frameIndex];
    assert.ok(entries.some((entry) => entry.file === body.restyleFile));
  }
  assert.deepEqual(cokPlayerAppearanceHeldRestylePaths(manifest, policy), [
    'cok-player-05-18-00-02/restyle/CBODY_216_restyle.png',
    'cok-player-05-01-01-02/restyle/CBODY_193_restyle.png',
    'cok-player-05-17-04-02/restyle/CBODY_215_restyle.png',
    'cok-player-03-0b-03-01/restyle/CBODY_139_restyle.png',
  ]);
});

test('package and held paths reject noncanonical IDs and unsafe PNG segments before output', () => {
  for (const id of ['../escape', 'C:/escape', 'cok-player-..-..-..-..']) {
    const m = structuredClone(manifest), p = structuredClone(policy);
    const original = m.appearances[0].appearanceId;
    m.appearances[0].appearanceId = id;
    p.frames.filter((row) => row.appearanceId === original).forEach((row) => { row.appearanceId = id; });
    assert.throws(() => cokPlayerAppearancePackagePlan(m, p), /Invalid or stale/);
    assert.throws(() => cokPlayerAppearanceHeldRestylePaths(m, p), /Invalid or stale/);
  }
  const unsafe = ['../escape.png', '/absolute.png', 'C:/escape.png', '\\\\server\\share.png',
    'nested\\escape.png', '%2e%2e/escape.png', 'nested/file.png?x', 'nested/file.png#x',
    'nested//file.png', 'nested/./file.png', 'folder./file.png', 'folder /file.png', 'nested/café.png',
    'CON.png', 'nested/LPT1.png'];
  for (const path of unsafe) for (const field of ['sourceFile', 'restyleFile']) {
    for (const component of ['head', 'admitted', 'held']) {
      const m = structuredClone(manifest), appearance = m.appearances[0];
      const part = component === 'head' ? appearance.head : appearance.bodyFrames[component === 'admitted' ? 0 : 1];
      part[field] = path;
      assert.throws(() => cokPlayerAppearancePackagePlan(m, policy), /Invalid or stale/);
      assert.throws(() => cokPlayerAppearanceHeldRestylePaths(m, policy), /Invalid or stale/);
    }
  }
  assert.equal(cokPlayerAppearancePackagePlan(manifest, policy).length, 20);
});
