import assert from 'node:assert/strict';
import test from 'node:test';
import { graphicsRenderEvidence } from '../src/ui/graphics-render-evidence.mjs';

const audited = {
  game: 'cok', platform: 'Amiga', archive: { name: 'SPRIT1.DAA',
    sha256: '3a851746076c54f097dce925e9866491c754364962754cd1bb663d3d06764694' },
  decoded: { renderingTransform: 'candidate-tail-offset-frame0-xor' },
};

test('exact audited CoK Amiga SPRIT1 archive verifies stored-frame decode but not candidate rendering', () => {
  const evidence = graphicsRenderEvidence(audited);
  assert.equal(evidence.status, 'verified-stored-frame-decode');
  assert.equal(evidence.label, 'Stored frame decode verified');
  assert.match(evidence.explanation, /all 17 blocks/i);
  assert.match(evidence.explanation, /all 51 stored-frame hashes match the pinned decode receipt/i);
  assert.match(evidence.explanation, /frame-0 XOR.*remain unverified/i);
  assert.match(evidence.explanation, /mirroring is conditional/);
});

test('exact audited CoK Amiga SPRIT2 archive uses the same stored-frame decode evidence', () => {
  const evidence = graphicsRenderEvidence({ ...audited, archive: { name: 'SPRIT2.DAA',
    sha256: 'd962bbb9b86775c996fddd39420e33b87612ec593a58d76ce7bd51dee3973785' } });
  assert.equal(evidence.status, 'verified-stored-frame-decode');
  assert.match(evidence.explanation, /SPRIT2\.DAA/);
  assert.match(evidence.explanation, /all 51 stored-frame hashes match the pinned decode receipt/);
});

test('same name with a different archive hash stays a rendering hypothesis', () => {
  const evidence = graphicsRenderEvidence({ ...audited,
    archive: { ...audited.archive, sha256: '0'.repeat(64) } });
  assert.equal(evidence.status, 'hypothesis');
  assert.match(evidence.explanation, /No exact native segmented-decode receipt/);
});

test('unrelated sprite archives and source images without transforms stay separate', () => {
  assert.equal(graphicsRenderEvidence({ ...audited, archive: { ...audited.archive, name: 'SPRIT2.DAA' } }).status,
    'hypothesis');
  assert.equal(graphicsRenderEvidence({ ...audited, decoded: {} }), null);
});
