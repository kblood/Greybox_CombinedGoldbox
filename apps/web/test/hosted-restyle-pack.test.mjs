import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { prepareHostedRestylePack, stageHostedRestylePack, validateHostedRestyleDescriptor, verifyHostedRestylePack } from '../scripts/hosted-restyle-pack.mjs';
import { auditPublicArtifacts } from '../scripts/public-artifact-policy.mjs';
import { buildApp } from '../scripts/build-app.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const put = (path, bytes) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); };
const packFiles = {
  'manifest.json': JSON.stringify({ batch: 'synthetic', items: [{ id: 'card', stem: 'card', kind: 'scene', src: '../inert-source', native_w: 1, native_h: 1, k: 1 }] }),
  'fidelity.json': JSON.stringify({ results: [{ id: 'card', stem: 'card', size: [1,1], verdict: 'ok', edge_corr: 1, hist_dist: 0, aspect_dev: 0 }] }),
  'anim/index.json': '{"items":[],"problems":[],"imageSha256":{}}', 'animations.html': '<html>synthetic</html>',
  'orig/card.png': 'source', 'out/card.png': 'output',
  'cok/test.png': 'synthetic image bytes; never decoded',
};
const sourceHash = hash('source'), outputHash = hash('output');
packFiles[`cok-generated/images/${sourceHash}.png`] = 'source'; packFiles[`cok-generated/images/${outputHash}.png`] = 'output';
packFiles['cok-generated/manifest.json'] = JSON.stringify({ schema: 'cok-restyle-inventory-v1', imageMode: 'bundled', excluded: [], held: [], externalComparisons: [],
  counts: { uniquePairs: 1, sourceOutputEdges: 1, tileAliasRows: 0, externalComparisonAliases: 0, aliasEdges: 0, ledgerRecords: 1, eligibleRecords: 1, excludedRows: 0, heldRows: 0, uniquePngFiles: 2, uniquePngBytes: 12 },
  assets: [{ id: 'asset-0001-abcdef123456', stem: 'asset-0001-abcdef123456', sourceSha256: sourceHash, outputSha256: outputHash,
    source: `images/${sourceHash}.png`, output: `images/${outputHash}.png`, sourceSize: [1,1], outputSize: [1,1], platform: 'DOS', platforms: ['DOS'], family: 'PIC', families: ['PIC'],
    aliases: [{ ledger: 'synthetic', status: 'restyled', family: 'PIC', platform: 'DOS' }], ledgerStatuses: ['restyled'], outputType: 'Generated/restyled variant', promptReferences: [],
    sourceMatched: true, compositionReview: 'not-reviewed', runtimeApproved: false, runtimeApprovalEvidence: [], prompt: '', animations: [] }] });
// Independent expected inventory: no helper is used to derive the trusted pin.
function expected(files) {
  const rows = Object.keys(files).sort().map((p) => ({ path: `restyle/${p}`,
    byteLength: Buffer.byteLength(files[p]), sha256: hash(files[p]) }));
  const descriptor = { schema: 'greybox-hosted-restyle-pack-v1', fileCount: rows.length,
    totalBytes: rows.reduce((n, f) => n + f.byteLength, 0), files: rows };
  return { descriptor, expectedInventorySha256: hash(JSON.stringify(descriptor)) };
}
function fixture(t, files = packFiles) {
  const root = mkdtempSync(join(tmpdir(), 'hosted-restyle-synthetic-'));
  t.after(() => { assert.equal(dirname(root), tmpdir()); rmSync(root, { recursive: true, force: true }); });
  const source = join(root, 'source'), output = join(root, 'fresh');
  mkdirSync(source);
  for (const [path, bytes] of Object.entries(files)) put(join(source, path), bytes);
  return { root, source, output, ...expected(files) };
}
function application(output) {
  for (const [path, bytes] of Object.entries({ 'index.html': '<html/>', 'dragon.svg': '<svg/>',
    'assets/app.js': 'void 0;', 'assets/app.css': 'body{}', 'games/cok.json': '{"files":[]}' })) put(join(output, path), bytes);
}
function publish(f) { put(join(f.output, 'hosted-restyle-pack.json'), JSON.stringify({ descriptor: f.descriptor, inventorySha256: f.expectedInventorySha256 })); }

test('explicit digest verifies a complete synthetic inventory and stages captured exact bytes', (t) => {
  const f = fixture(t);
  assert.deepEqual(verifyHostedRestylePack(f.source, f.expectedInventorySha256), f.descriptor);
  const descriptor = stageHostedRestylePack(f.source, f.output, f.expectedInventorySha256);
  assert.deepEqual(descriptor, f.descriptor);
  assert.ok(Object.isFrozen(descriptor) && Object.isFrozen(descriptor.files) && Object.isFrozen(descriptor.files[0]));
  for (const [path, bytes] of Object.entries(packFiles)) assert.equal(readFileSync(join(f.output, 'restyle', path), 'utf8'), bytes);
  application(f.output);
  publish(f);
  assert.throws(() => auditPublicArtifacts(f.output, { completeOutput: true }), /Unexpected public output path|Forbidden public game image/);
  assert.equal(auditPublicArtifacts(f.output, { completeOutput: true, hostedRestylePack: f }).files, Object.keys(packFiles).length + 6);
  assert.equal(auditPublicArtifacts(f.output, { hostedRestylePack: f }).files, Object.keys(packFiles).length + 2);
  put(join(f.output, 'Restyle/extra.json'), '{}');
  assert.throws(() => auditPublicArtifacts(f.output, { completeOutput: true, hostedRestylePack: f }), /Unlisted/);
});

test('missing external pins fail before attempting any source access', () => {
  assert.throws(() => verifyHostedRestylePack('does-not-exist'), /expected inventory/);
  assert.throws(() => stageHostedRestylePack('does-not-exist', 'also-absent'), /expected inventory/);
});

test('same-length changed bytes, extra files and missing files reject without creating stage', (t) => {
  const f = fixture(t);
  const original = packFiles['cok/test.png'];
  put(join(f.source, 'cok/test.png'), 'X' + original.slice(1));
  assert.throws(() => stageHostedRestylePack(f.source, f.output, f.expectedInventorySha256), /mismatch/);
  assert.equal(existsSync(f.output), false);
  put(join(f.source, 'cok/test.png'), original);
  put(join(f.source, 'extra.json'), '{}');
  assert.throws(() => verifyHostedRestylePack(f.source, f.expectedInventorySha256), /mismatch/);
  rmSync(join(f.source, 'extra.json')); rmSync(join(f.source, 'cok/test.png'));
  assert.throws(() => verifyHostedRestylePack(f.source, f.expectedInventorySha256), /mismatch/);
});

test('descriptor rejects traversal, absolute paths, Windows aliases, case and file/directory collisions', (t) => {
  const f = fixture(t);
  for (const path of ['../x.png', '/restyle/x.png', 'restyle/../x.png', 'restyle/a\\x.png',
    'restyle/x:.png', 'restyle/NUL.png', 'restyle/a./x.png', 'restyle/SAVE/x.png', 'assets/x.png']) {
    const d = structuredClone(f.descriptor); d.files[0].path = path;
    assert.throws(() => validateHostedRestyleDescriptor(d, f.expectedInventorySha256));
  }
  for (const paths of [['restyle/A.png', 'restyle/a.png'], ['restyle/A/x.png', 'restyle/a/y.png'],
    ['restyle/a.json', 'restyle/a.json/b.png']]) {
    const files = paths.map((path) => ({ path, byteLength: 0, sha256: hash('') }));
    assert.throws(() => validateHostedRestyleDescriptor({ schema: f.descriptor.schema, fileCount: 2, totalBytes: 0, files }, '0'.repeat(64)), /collision/);
  }
});

test('unexpected source types and forbidden directories reject even with a matching external digest', (t) => {
  for (const path of ['unexpected.exe', 'archive.dax', 'hidden.js', 'other.html', 'SAVE/test.png']) {
    const f = fixture(t, { ...packFiles, [path]: 'synthetic' });
    assert.throws(() => stageHostedRestylePack(f.source, f.output, f.expectedInventorySha256), /Unexpected|Unsafe/);
    assert.equal(existsSync(f.output), false);
  }
});

test('fresh stage cannot replace an existing directory or overlap source', (t) => {
  const f = fixture(t);
  mkdirSync(f.output); put(join(f.output, 'keep'), 'owned fixture');
  assert.throws(() => stageHostedRestylePack(f.source, f.output, f.expectedInventorySha256), /EEXIST/);
  assert.equal(readFileSync(join(f.output, 'keep'), 'utf8'), 'owned fixture');
  assert.throws(() => stageHostedRestylePack(f.source, join(f.source, 'nested'), f.expectedInventorySha256), /overlap/);
});

test('directory symlinks or Windows junctions reject as source, child and staging ancestor', (t) => {
  const f = fixture(t), alias = join(f.root, 'alias');
  symlinkSync(f.source, alias, 'junction');
  assert.throws(() => verifyHostedRestylePack(alias, f.expectedInventorySha256), /Symlink|reparse/);
  symlinkSync(f.source, join(f.source, 'loop'), 'junction');
  assert.throws(() => verifyHostedRestylePack(f.source, f.expectedInventorySha256), /Symlink|reparse/);
  const other = fixture(t);
  assert.throws(() => stageHostedRestylePack(other.source, join(alias, 'nested'), other.expectedInventorySha256), /Symlink|reparse|overlap/);
});


test('integration preflights late linked ancestors before creating any pending parents', (t) => {
  const files = { 'a/early.png': 'early', 'z/link/missing/late.png': 'late' }, f = fixture(t, files);
  const outside = join(f.root, 'outside'); put(join(outside, 'keep.txt'), 'untouched');
  mkdirSync(join(f.output, 'restyle/z'), { recursive: true });
  symlinkSync(outside, join(f.output, 'restyle/z/link'), 'junction');
  const prepared = prepareHostedRestylePack(f.source, f.descriptor, f.expectedInventorySha256);
  assert.throws(() => prepared.integrate(f.output), /Symlink|reparse/);
  assert.deepEqual(readdirSync(outside), ['keep.txt']);
  assert.equal(readFileSync(join(outside, 'keep.txt'), 'utf8'), 'untouched');
  assert.equal(existsSync(join(f.output, 'restyle/a')), false, 'earlier pending parent was not created');
  assert.equal(existsSync(join(outside, 'missing')), false, 'no external descendant was created');
});

test('integration rejects intermediate files, linked leaves and conflicts before earlier copies', (t) => {
  for (const fault of ['intermediate-file', 'linked-leaf', 'conflict']) {
    const f = fixture(t, { 'a/early.png': 'early', 'z/late.png': 'late' });
    const outside = join(f.root, 'outside'); put(join(outside, 'keep.txt'), 'untouched');
    const leaf = join(f.output, 'restyle/z/late.png');
    if (fault === 'intermediate-file') put(dirname(leaf), 'not a directory');
    else if (fault === 'linked-leaf') { mkdirSync(dirname(leaf), { recursive: true }); symlinkSync(outside, leaf, 'junction'); }
    else put(leaf, 'conflicting bytes');
    const prepared = prepareHostedRestylePack(f.source, f.descriptor, f.expectedInventorySha256);
    assert.throws(() => prepared.integrate(f.output), /special|Symlink|reparse|collision/);
    assert.equal(existsSync(join(f.output, 'restyle/a')), false, fault);
    assert.deepEqual(readdirSync(outside), ['keep.txt']);
    assert.equal(readFileSync(join(outside, 'keep.txt'), 'utf8'), 'untouched');
    if (fault === 'conflict') assert.equal(readFileSync(leaf, 'utf8'), 'conflicting bytes');
  }
});

test('integration preserves identical collisions and creates only checked missing directories', (t) => {
  const files = { 'a/early.png': 'early', 'z/new/deep/late.png': 'late' }, f = fixture(t, files);
  put(join(f.output, 'restyle/a/early.png'), 'early'); mkdirSync(join(f.output, 'restyle/z'));
  const prepared = prepareHostedRestylePack(f.source, f.descriptor, f.expectedInventorySha256);
  prepared.integrate(f.output);
  for (const [path, bytes] of Object.entries(files)) assert.equal(readFileSync(join(f.output, 'restyle', path), 'utf8'), bytes);
  const staged = join(f.root, 'staged'); stageHostedRestylePack(f.source, staged, f.expectedInventorySha256);
  for (const [path, bytes] of Object.entries(files)) assert.equal(readFileSync(join(staged, 'restyle', path), 'utf8'), bytes);
});

test('a late linked integration destination leaves earlier pack images absent and no success receipt', (t) => {
  const f = candidate(t, { ...packFiles, 'zzz/link/missing/late.png': 'late' });
  const outside = join(f.root, 'outside'); put(join(outside, 'keep.txt'), 'untouched');
  f.afterCommand = label => { if (label === 'bundle-assets') {
    mkdirSync(join(f.output, 'restyle/zzz'), { recursive: true });
    symlinkSync(outside, join(f.output, 'restyle/zzz/link'), 'junction');
  } };
  assert.throws(() => buildApp(f.options), /Symlink|reparse/);
  assert.equal(existsSync(f.env.GB_CANDIDATE_RECEIPT), false);
  assert.equal(existsSync(join(f.output, 'restyle/orig')), false, 'no earlier pending image was copied');
  assert.deepEqual(readdirSync(outside), ['keep.txt']);
  assert.equal(readFileSync(join(outside, 'keep.txt'), 'utf8'), 'untouched');
  assert.equal(existsSync(join(outside, 'missing')), false);
});

test('audit allowlist rejects changed, missing and unlisted output and requires independent pin', (t) => {
  const f = fixture(t);
  stageHostedRestylePack(f.source, f.output, f.expectedInventorySha256);
  assert.throws(() => auditPublicArtifacts(f.output, { hostedRestylePack: { descriptor: f.descriptor } }), /expected inventory/);
  const bad = structuredClone(f); bad.descriptor.files[0].byteLength++;
  assert.throws(() => auditPublicArtifacts(f.output, { hostedRestylePack: bad }), /mismatch/);
  put(join(f.output, 'restyle/cok/test.png'), 'changed');
  assert.throws(() => auditPublicArtifacts(f.output, { hostedRestylePack: f }), /bytes differ/);
  put(join(f.output, 'restyle/cok/test.png'), packFiles['cok/test.png']);
  put(join(f.output, 'restyle/extra.json'), '{}');
  assert.throws(() => auditPublicArtifacts(f.output, { hostedRestylePack: f }), /Unlisted/);
  rmSync(join(f.output, 'restyle/extra.json')); rmSync(join(f.output, 'restyle/cok/test.png'));
  assert.throws(() => auditPublicArtifacts(f.output, { hostedRestylePack: f }), /Missing hosted/);
});

test('descriptor permission never bypasses machine-path, embedded-image or forbidden manifest checks', (t) => {
  for (const text of ['{"path":"Q:/synthetic/file"}', '{"path":"data:image/png;base64,AA=="}']) {
    const f = fixture(t, { ...packFiles, 'manifest.json': text });
    stageHostedRestylePack(f.source, f.output, f.expectedInventorySha256);
    assert.throws(() => auditPublicArtifacts(f.output, { hostedRestylePack: f }), /Machine-local|Embedded/);
  }
  const f = fixture(t); stageHostedRestylePack(f.source, f.output, f.expectedInventorySha256); application(f.output);
  publish(f);
  put(join(f.output, 'games/cok.json'), '{"files":[{"path":"START.EXE"}]}');
  assert.throws(() => auditPublicArtifacts(f.output, { completeOutput: true, hostedRestylePack: f }), /Forbidden bundled/);
});

function candidate(t, files = packFiles) {
  files = { ...files }; delete files['animations.html']; // Viewer belongs to the application, not the pack.
  const f = fixture(t, files), descriptorPath = join(f.root, 'descriptor.json');
  f.animationPath = join(f.root, 'viewer.html'); put(f.animationPath, '<script>const HOSTED_RESTYLE = null; /* hosted-restyle-config */</script>');
  f.corePath = join(f.root, 'core.mjs'); put(f.corePath, 'export const synthetic = 1;');
  put(descriptorPath, JSON.stringify({ descriptor: f.descriptor, inventorySha256: f.expectedInventorySha256 }));
  f.env = { GB_HOSTED_RESTYLE_ROOT: f.source, GB_HOSTED_RESTYLE_DESCRIPTOR: descriptorPath,
    GB_HOSTED_RESTYLE_INVENTORY_SHA256: f.expectedInventorySha256, GB_SOURCE_INVENTORY_SHA256: '2'.repeat(64),
    GB_CANDIDATE_RECEIPT: join(f.root, 'receipt.json'), GB_APP_OUTPUT: f.output };
  f.commands = []; f.runCommand = (args, label, options) => {
    assert.equal(options.env.VITE_HOSTED_RESTYLE_INVENTORY_SHA256, options.env.GB_HOSTED_RESTYLE_ROOT ? f.expectedInventorySha256 : '');
    f.commands.push(label); assert.equal(options.env.GOLDBOX_BUILD, 'app');
    assert.equal(existsSync(join(f.output, 'restyle/cok/test.png')), false, 'pack integration follows all build commands');
    if (label.startsWith('bundle-')) assert.ok(args.includes('--metadata-only'));
    if (label === 'vite build') { application(f.output); for (const [p, b] of Object.entries(files)) if (p.endsWith('.json')) put(join(f.output, 'restyle', p), b);
      put(join(f.output, 'restyle/animations.html'), readFileSync(f.animationPath)); }
    f.afterCommand?.(label);
  };
  f.options = { env: f.env, runCommand: f.runCommand, runtimeContractVerifier: () => ({ compatible: true }), gitHead: '1'.repeat(40), animationPath: f.animationPath, corePath: f.corePath };
  return f;
}

test('Gate 1 requires every opt-in input and valid descriptor pins before commands', (t) => {
  const f = candidate(t);
  for (const name of Object.keys(f.env)) { const env = { ...f.env }; delete env[name];
    assert.throws(() => buildApp({ ...f.options, env }), /inputs required/); assert.equal(f.commands.length, 0); }
  const wrapper = JSON.parse(readFileSync(f.env.GB_HOSTED_RESTYLE_DESCRIPTOR)); wrapper.inventorySha256 = '0'.repeat(64);
  put(f.env.GB_HOSTED_RESTYLE_DESCRIPTOR, JSON.stringify(wrapper));
  assert.throws(() => buildApp(f.options), /wrapper pin/); assert.equal(f.commands.length, 0); assert.equal(existsSync(f.output), false);
  wrapper.inventorySha256 = f.expectedInventorySha256; wrapper.descriptor.fileCount++; put(f.env.GB_HOSTED_RESTYLE_DESCRIPTOR, JSON.stringify(wrapper));
  assert.throws(() => buildApp(f.options), /mismatch/); assert.equal(f.commands.length, 0);
});

test('Gate 1 verifies pack and fresh paths before commands and preserves existing candidates', (t) => {
  const f = candidate(t); mkdirSync(f.output); put(join(f.output, 'keep'), 'preserved');
  assert.throws(() => buildApp(f.options), /already exists/); assert.equal(f.commands.length, 0);
  assert.equal(readFileSync(join(f.output, 'keep'), 'utf8'), 'preserved');
  const g = candidate(t); put(join(g.source, 'cok/test.png'), 'tampered');
  assert.throws(() => buildApp(g.options), /mismatch/); assert.equal(g.commands.length, 0); assert.equal(existsSync(g.output), false);
  const h = candidate(t); put(h.env.GB_CANDIDATE_RECEIPT, 'existing receipt');
  assert.throws(() => buildApp(h.options), /already exists/); assert.equal(h.commands.length, 0);
});

test('Gate 1 default stays metadata-only and rejects a generated image', (t) => {
  const f = candidate(t); const options = { ...f.options, env: { GB_APP_OUTPUT: f.output, VITE_HOSTED_RESTYLE_INVENTORY_SHA256: 'f'.repeat(64) } };
  buildApp(options); assert.equal(existsSync(join(f.output, 'hosted-restyle-pack.json')), false);
  assert.equal(readFileSync(join(f.output, 'restyle/animations.html'), 'utf8'), readFileSync(f.animationPath, 'utf8'));
  assert.equal(existsSync(f.env.GB_CANDIDATE_RECEIPT), false);
  const g = candidate(t); g.afterCommand = (label) => { if (label === 'bundle-cok-title-restyle') put(join(g.output, 'restyle/cok/test.png'), 'synthetic'); };
  assert.throws(() => buildApp({ ...g.options, env: { GB_APP_OUTPUT: g.output } }), /Unexpected public output path|Forbidden public game image/);
});

test('Gate 1 exact integration publishes descriptor and distinct external candidate digests', (t) => {
  const f = candidate(t); buildApp(f.options);
  assert.deepEqual(f.commands, ['vite build', 'copy-public-app-assets', 'bundle-assets']);
  const receipt = JSON.parse(readFileSync(f.env.GB_CANDIDATE_RECEIPT)), published = JSON.parse(readFileSync(join(f.output, 'hosted-restyle-pack.json')));
  assert.equal(receipt.gitHead, '1'.repeat(40)); assert.equal(receipt.sourceInventorySha256, '2'.repeat(64));
  assert.equal(receipt.packInventorySha256, f.expectedInventorySha256); assert.equal(receipt.packFileCount, f.descriptor.fileCount);
  assert.equal(receipt.packTotalBytes, f.descriptor.totalBytes); assert.ok(receipt.artifactFileCount > receipt.packFileCount);
  assert.notEqual(receipt.finalArtifactInventorySha256, receipt.packInventorySha256); assert.deepEqual(published.descriptor, receipt.descriptor);
  assert.equal(published.inventorySha256, f.expectedInventorySha256);
  const module = receipt.hostedAnimationModule, viewer = readFileSync(join(f.output, 'restyle/animations.html'));
  assert.equal(module.path, `assets/hosted-restyle-core-${hash(readFileSync(f.corePath))}.js`);
  assert.equal(hash(readFileSync(join(f.output, module.path))), module.sha256);
  assert.equal(hash(viewer), receipt.appOwnedRestyleFiles[0].sha256);
  assert.ok(viewer.toString().includes(JSON.stringify({ pin: f.expectedInventorySha256, module: `../${module.path}` })));
  published.descriptor.files[0].sha256 = '0'.repeat(64); put(join(f.output, 'hosted-restyle-pack.json'), JSON.stringify(published));
  assert.throws(() => auditPublicArtifacts(f.output, { completeOutput: true, hostedRestylePack: f }), /mismatch/);
});

test('Gate 1 metadata collision aborts before pack copy or candidate receipt', (t) => {
  const f = candidate(t); f.afterCommand = (label) => { if (label === 'bundle-assets') put(join(f.output, 'restyle/manifest.json'), '{"different":1}'); };
  assert.throws(() => buildApp(f.options), /metadata collision/);
  assert.equal(existsSync(join(f.output, 'restyle/cok/test.png')), false); assert.equal(existsSync(f.env.GB_CANDIDATE_RECEIPT), false);
});

test('Gate 1 exact app-owned viewer exception allows no other unlisted HTML or JSON', (t) => {
  const files = { ...packFiles }; delete files['animations.html']; const f = candidate(t, files); buildApp(f.options);
  const receipt = JSON.parse(readFileSync(f.env.GB_CANDIDATE_RECEIPT));
  const options = { completeOutput: true, hostedRestylePack: { ...f, appOwnedRestyleFiles: receipt.appOwnedRestyleFiles } };
  assert.ok(auditPublicArtifacts(f.output, options).files > 0);
  for (const p of ['other.html', 'other.json']) { put(join(f.output, 'restyle', p), '{}');
    assert.throws(() => auditPublicArtifacts(f.output, options), /Unlisted|Unexpected public output path/); rmSync(join(f.output, 'restyle', p)); }
  put(join(f.output, 'restyle/animations.html'), '<html>changed</html>');
  assert.throws(() => auditPublicArtifacts(f.output, options), /bytes differ/);
});

test('Gate 1 refuses a candidate mutation during audit without writing provenance', (t) => {
  const f = candidate(t);
  assert.throws(() => buildApp({ ...f.options, auditOutput(output, options) {
    const result = auditPublicArtifacts(output, options);
    put(join(output, 'assets/app.js'), 'void 1;'); // Valid artifact bytes that were not audited.
    return result;
  } }), /Candidate changed during audit/);
  assert.equal(existsSync(f.env.GB_CANDIDATE_RECEIPT), false);
});

test('Gate 3 rejects missing/duplicate markers, imported core, copied mismatch and module collision', (t) => {
  for (const text of ['no marker', 'const HOSTED_RESTYLE = null; /* hosted-restyle-config */'.repeat(2)]) {
    const f = candidate(t); put(f.animationPath, text);
    assert.throws(() => buildApp(f.options), /exactly one/); assert.equal(f.commands.length, 0);
  }
  const imported = candidate(t); put(imported.corePath, 'import "./other.mjs";');
  assert.throws(() => buildApp(imported.options), /import-free/); assert.equal(imported.commands.length, 0);
  for (const fault of ['viewer', 'module']) { const f = candidate(t);
    f.afterCommand = label => { if (label === 'bundle-assets') put(join(f.output, fault === 'viewer'
      ? 'restyle/animations.html' : `assets/hosted-restyle-core-${hash(readFileSync(f.corePath))}.js`), 'changed'); };
    assert.throws(() => buildApp(f.options), fault === 'viewer' ? /Copied animation/ : /EEXIST/);
    assert.equal(existsSync(f.env.GB_CANDIDATE_RECEIPT), false);
  }
  const f = candidate(t);
  assert.throws(() => buildApp({ ...f.options, auditOutput(output, options) { const result = auditPublicArtifacts(output, options);
    put(join(output, `assets/hosted-restyle-core-${hash(readFileSync(f.corePath))}.js`), 'void 0;'); return result;
  } }), /changed during audit/); assert.equal(existsSync(f.env.GB_CANDIDATE_RECEIPT), false);
});

test('Gate 3 rejects copied viewer symlinks and viewer/module-parent junctions without external writes', (t) => {
  for (const target of ['viewer-file', 'viewer-parent', 'module-parent']) { const f = candidate(t), outside = join(f.root, 'outside');
    put(join(outside, 'animations.html'), readFileSync(f.animationPath)); put(join(outside, 'keep'), 'preserved');
    f.afterCommand = label => { if (label !== 'bundle-assets') return;
      const path = join(f.output, target === 'module-parent' ? 'assets' : target === 'viewer-parent' ? 'restyle' : 'restyle/animations.html');
      rmSync(path, { recursive: true }); symlinkSync(target === 'viewer-file' ? join(outside, 'animations.html') : outside, path,
        target === 'viewer-file' ? 'file' : 'junction'); };
    assert.throws(() => buildApp(f.options), /symlink|reparse/);
    assert.equal(readFileSync(join(outside, 'animations.html'), 'utf8'), readFileSync(f.animationPath, 'utf8'));
    assert.equal(readFileSync(join(outside, 'keep'), 'utf8'), 'preserved');
    assert.equal(existsSync(join(outside, `hosted-restyle-core-${hash(readFileSync(f.corePath))}.js`)), false);
    assert.equal(existsSync(f.env.GB_CANDIDATE_RECEIPT), false);
  }
});
