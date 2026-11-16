import assert from 'node:assert/strict';
import test from 'node:test';
import candidate from '../src/ui/cokAmigaPlayerCandidate.json' with { type: 'json' };
import { composeCokAmigaPlayerCandidate, resolveCokAmigaPlayerCandidate,
  validateCokAmigaPlayerCandidate } from '../src/ui/cok-amiga-player-candidate.mjs';

const request = (variant = 0) => ({ candidateId: 'cok/amiga/candidate/chart-head5-body1',
  atlasSelector: 2, headSelector: 5, bodySelector: 1, variant });
const cell = (number, values = []) => {
  const rawIndices = new Uint8Array(576).fill(16);
  rawIndices.set(values);
  return { candidateId: request().candidateId, archiveSha256: candidate.archive.sha256,
    cell: number, width: 24, height: 24, rawIndices };
};

test('the separate charT candidate retains exact cells, local pins and all admission holds', () => {
  validateCokAmigaPlayerCandidate(candidate);
  assert.deepEqual(candidate.cells.map(({ cell, x, y }) => [cell, x, y]), [[67, 144, 120], [1, 0, 0], [32, 168, 48]]);
  assert.equal(candidate.provenance.retailMedia, 'unverified');
  assert.equal(candidate.dosIdentityBridge, null);
  for (const variant of [0, 1]) assert.deepEqual(resolveCokAmigaPlayerCandidate(candidate, request(variant)), {
    candidateId: request().candidateId, headCell: 67, bodyCell: variant ? 32 : 1, variant,
    runtimeAdmission: 'held', playbackAdmission: 'held', compositionStatus: 'hypothesis-only',
  });
});

test('wrong metadata identity, archive hash, selectors, cells and geometry fail closed', () => {
  const mutations = [
    (c) => { c.id = 'cok/dos-ega/appearance/05-01-01-02'; },
    (c) => { c.archive.path = 'disk2/charS.LBM'; },
    (c) => { c.archive.sha256 = 'a'.repeat(64); },
    (c) => { c.archive.planes = 4; },
    (c) => { c.archive.masking = 1; },
    (c) => { c.archive.width = 319; },
    (c) => { c.cellSize.height = 8; },
    (c) => { c.atlasSelector = 1; },
    (c) => { c.headSelector = 6; },
    (c) => { c.bodySelector = 32; },
    (c) => { c.cells[0].cell = 69; },
    (c) => { c.cells[1].x = 24; },
    (c) => { c.cells[2].rawSha256 = 'a'.repeat(64); },
    (c) => { c.cells[0].opaqueSha256 = 'a'.repeat(64); },
    (c) => { c.cells[1].variant = 1; },
    (c) => { c.provenance.retailMedia = 'verified'; },
    (c) => { c.compositionReview.status = 'verified'; },
    (c) => { c.paletteMapping.status = 'verified'; },
    (c) => { c.paletteMapping.bytes = [145, 162, 179, 196, 230, 247]; },
    (c) => { c.dosIdentityBridge = '05-01-01-02'; },
    (c) => { c.runtimeAdmission = 'admitted'; },
    (c) => { c.restyleAdmission = 'admitted'; },
    (c) => { c.playbackAdmission = 'admitted'; },
  ];
  for (const mutate of mutations) {
    const wrong = structuredClone(candidate);
    mutate(wrong);
    assert.throws(() => validateCokAmigaPlayerCandidate(wrong), /candidate/);
    assert.equal(resolveCokAmigaPlayerCandidate(wrong, request()), null);
  }
});

test('DOS tuple equality and unknown selectors never select the candidate', () => {
  for (const wrong of [
    { cHeadRequest: 5, cBodyBlock: 1, cBodySlot: 1, suffixCode: 2 },
    { ...request(), cHeadRequest: 5, cBodyBlock: 1, cBodySlot: 1, suffixCode: 2 },
    { ...request(), candidateId: 'cok-player-05-01-01-02' },
    { ...request(), atlasSelector: 1 }, { ...request(), headSelector: 0 },
    { ...request(), bodySelector: 32 }, { ...request(), variant: 2 }, { ...request(), variant: '0' },
  ]) assert.equal(resolveCokAmigaPlayerCandidate(candidate, wrong), null);
});

test('hand-authored mask golden keeps opaque black/color1 and ignores RGB/key1 guesses', () => {
  // Each pair varies the fifth plane independently from the four color bits.
  const head = cell(67, [0, 1, 16, 17, 16, 16, 0, 16]);
  const body = cell(1, [16, 16, 0, 1, 16, 17, 0, 0]);
  const originalHead = head.rawIndices.slice(), originalBody = body.rawIndices.slice();
  const output = composeCokAmigaPlayerCandidate(candidate, request(), head, body, undefined, false);
  assert.deepEqual([...output.opaque.slice(0, 8)], [1, 1, 1, 1, 0, 0, 1, 1]);
  assert.deepEqual([...output.indices.slice(0, 8)], [0, 1, 0, 1, 0, 1, 0, 0]);
  assert.equal(output.opaque.slice(8).some(Boolean), false);
  assert.equal(output.runtimeAdmission, 'held');
  assert.equal(output.compositionStatus, 'hypothesis-only');
  assert.deepEqual(head.rawIndices, originalHead);
  assert.deepEqual(body.rawIndices, originalBody);
});

test('hand-authored image OR and six-byte palette golden is independent of mask', () => {
  const head = cell(67, [2, 4, 8, 9, 15, 16, 18]);
  const body = cell(32, [1, 2, 1, 2, 0, 16, 17]);
  const palette = [0x20, 0x31, 0x42, 0x53, 0x64, 0x75];
  const mapped = composeCokAmigaPlayerCandidate(candidate, request(1), head, body, palette);
  assert.deepEqual([...mapped.indices.slice(0, 7)], [2, 4, 2, 4, 7, 0, 2]);
  assert.deepEqual([...mapped.opaque.slice(0, 7)], [1, 1, 1, 1, 1, 0, 0]);
  assert.deepEqual([...composeCokAmigaPlayerCandidate(candidate, request(1), head, body, undefined, false)
    .indices.slice(0, 7)], [3, 6, 9, 11, 15, 0, 3]);
});

test('wrong cell identity, geometry, fifth-bit range and palette inputs cannot compose', () => {
  const head = cell(67), body = cell(1);
  for (const wrong of [{ ...head, cell: 1 }, { ...head, candidateId: 'DOS' },
    { ...head, archiveSha256: 'b'.repeat(64) }, { ...head, width: 23 }, { ...head, height: 8 },
    { ...head, rawIndices: new Uint8Array(575) }, { ...head, rawIndices: new Uint8Array(576).fill(32) }]) {
    assert.throws(() => composeCokAmigaPlayerCandidate(candidate, request(), wrong, body), /candidate/);
  }
  assert.throws(() => composeCokAmigaPlayerCandidate(candidate, request(1), head, body), /candidate/);
  for (const palette of [[], [1, 2, 3, 4, 5, -1], [1, 2, 3, 4, 5, 256], [1, 2, 3, 4, 5, 1.5]]) {
    assert.throws(() => composeCokAmigaPlayerCandidate(candidate, request(), head, body, palette), /candidate/);
  }
});
