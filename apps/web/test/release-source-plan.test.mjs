import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import fs, { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import { buildReleasePlan, captureFixedPolicy, parsePorcelainZ, writeExternalReport } from '../scripts/release-source-plan.mjs';

function policy({ entries = [], rules = [], roots = ['app/main.ts'] } = {}) {
  return { schema: 'greybox-release-source-policy-v1', version: 1,
    entries: [{ path: 'app/main.ts', disposition: 'intended-source', reason: 'fixture source' }, ...entries], rules,
    roots: roots.map((path) => ({ path, reason: 'synthetic root' })), changedTestRoots: [] };
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'gb-release-source-plan-'));
  mkdirSync(join(root, 'app'), { recursive: true });
  writeFileSync(join(root, 'app/main.ts'), '');
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function pyDeclaration(path, sourceText, actions = [{ id: 'report', reads: [], writes: [], evidence: ['main'] }], actionInventoryComplete = true) {
  const sourceSha256 = createHash('sha256').update(sourceText).digest('hex');
  return { path, sourceSha256, actionInventoryComplete, evidence: [{ function: 'main', sourceSha256 }],
    actions: actions.map((row) => ({ ...row, evidence: row.evidence ?? ['main'] })) };
}

test('porcelain parser preserves Unicode, spaces, renames, and collapsed directories', () => {
  const parsed = parsePorcelainZ(Buffer.from(' M docs/naïve notes.md\0R  new name.mjs\0old—name.mjs\0?? folder/\0'));
  assert.deepEqual(parsed, [
    { code: ' M', path: 'docs/naïve notes.md', kind: 'file' },
    { code: 'R ', path: 'new name.mjs', originalPath: 'old—name.mjs', kind: 'rename-or-copy' },
    { code: '??', path: 'folder/', kind: 'directory' },
  ]);
  assert.throws(() => parsePorcelainZ(Buffer.from('?? ../escape\0')), /Unsafe status path/);
});

test('absolute or traversal paths cannot enter the source policy', () => {
  const f = fixture();
  try {
    assert.throws(() => buildReleasePlan({ root: f.root, statusBytes: Buffer.alloc(0),
      policy: policy({ entries: [{ path: 'C:/Users/example/secret.json', disposition: 'intended-source', reason: 'bad' }] }) }), /repository-relative/);
    assert.throws(() => buildReleasePlan({ root: f.root, statusBytes: Buffer.alloc(0),
      policy: policy({ entries: [{ path: '../outside.json', disposition: 'intended-source', reason: 'bad' }] }) }), /repository-relative/);
  } finally { f.cleanup(); }
});

test('unlisted changed metadata stays unresolved and blocks dependency closure until explicitly dispositioned', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, 'app/main.ts'), "import facts from './facts.json' with { type: 'json' };\n");
    writeFileSync(join(f.root, 'app/facts.json'), '{"ok":true}\n');
    const status = Buffer.from(' M app/main.ts\0?? app/facts.json\0');
    const plan = buildReleasePlan({ root: f.root, statusBytes: status, policy: policy() });
    assert.equal(plan.counts.unresolved, 1);
    assert.ok(plan.dependencyClosure.blockers.some(({ path }) => path === 'app/facts.json'));
    const allowed = buildReleasePlan({ root: f.root, statusBytes: status,
      policy: policy({ entries: [{ path: 'app/facts.json', disposition: 'intended-source', reason: 'reviewed fixture' }] }) });
    assert.equal(allowed.dependencyClosure.blockers.length, 0);
  } finally { f.cleanup(); }
});

test('an actual import of a generated review receipt is blocked, while a review schema is eligible', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, 'app/main.ts'), "import receipt from './sample-review.json' with { type: 'json' };\n");
    writeFileSync(join(f.root, 'app/sample-review.json'), '{}');
    writeFileSync(join(f.root, 'app/sample-review-v1.schema.json'), '{}');
    let plan = buildReleasePlan({ root: f.root, statusBytes: Buffer.from('?? app/sample-review.json\0'), policy: policy() });
    assert.equal(plan.dispositions[0].disposition, 'excluded');
    assert.ok(plan.dependencyClosure.blockers.some(({ issue }) => issue.includes('excluded')));
    writeFileSync(join(f.root, 'app/main.ts'), "import schema from './sample-review-v1.schema.json' with { type: 'json' };\n");
    plan = buildReleasePlan({ root: f.root, statusBytes: Buffer.from('?? app/sample-review-v1.schema.json\0'),
      policy: policy({ rules: [{ suffix: '.schema.json', disposition: 'intended-source', reason: 'review schema' }] }) });
    assert.equal(plan.dispositions[0].disposition, 'intended-source');
    assert.equal(plan.dependencyClosure.blockers.length, 0);
  } finally { f.cleanup(); }
});

test('hard snapshot and generated review exclusions cannot be overridden by exact entries', () => {
  const f = fixture();
  try {
    mkdirSync(join(f.root, 'apps/web/dist-app-cok18'), { recursive: true });
    mkdirSync(join(f.root, 'app'), { recursive: true });
    writeFileSync(join(f.root, 'apps/web/dist-app-cok18/index.html'), 'snapshot');
    writeFileSync(join(f.root, 'app/receipt-review.json'), '{}');
    const plan = buildReleasePlan({ root: f.root,
      statusBytes: Buffer.from('?? apps/web/dist-app-cok18/index.html\0?? app/receipt-review.json\0'),
      policy: policy({ entries: [
        { path: 'apps/web/dist-app-cok18/index.html', disposition: 'intended-source', reason: 'must not override' },
        { path: 'app/receipt-review.json', disposition: 'intended-source', reason: 'must not override' },
      ] }) });
    assert.deepEqual(plan.dispositions.map(({ disposition }) => disposition), ['excluded', 'excluded']);
    assert.deepEqual(plan.provenance.contentInventory.map((row) => row.path), ['app/main.ts']);
  } finally { f.cleanup(); }
});

test('historical path mentions do not become dependency edges', () => {
  const f = fixture();
  try {
    mkdirSync(join(f.root, 'docs'), { recursive: true });
    writeFileSync(join(f.root, 'docs/history.md'), 'Old report referenced ./sample-review.json for historical provenance.');
    const plan = buildReleasePlan({ root: f.root, statusBytes: Buffer.from('?? docs/history.md\0'), policy: policy() });
    assert.equal(plan.dispositions[0].disposition, 'unresolved');
    assert.equal(plan.dependencyClosure.files.some(({ path }) => path === 'docs/history.md'), false);
    assert.equal(plan.dependencyClosure.blockers.length, 0);
  } finally { f.cleanup(); }
});

test('symlink and module traversal escapes fail closed', (t) => {
  const f = fixture();
  const external = mkdtempSync(join(tmpdir(), 'gb-release-source-outside-'));
  try {
    writeFileSync(join(external, 'escaped.mjs'), 'export {};');
    try { symlinkSync(external, join(f.root, 'app/external'), 'junction'); }
    catch { t.skip('Windows does not allow creating a temporary directory junction here'); return; }
    writeFileSync(join(f.root, 'app/main.ts'), "import './external/escaped.mjs';\n");
    assert.throws(() => buildReleasePlan({ root: f.root, statusBytes: Buffer.alloc(0), policy: policy() }), /Symlink/);
    assert.throws(() => buildReleasePlan({ root: f.root, statusBytes: Buffer.alloc(0),
      policy: policy({ entries: [{ path: 'app/external/escaped.mjs', disposition: 'intended-source', reason: 'bad' }] }) }), /Symlink/);
  } finally { f.cleanup(); rmSync(external, { recursive: true, force: true }); }
});

test('report construction does not write files or start subprocesses', (t) => {
  const f = fixture();
  let writes = 0, spawns = 0;
  try {
    t.mock.method(fs, 'writeFileSync', () => { writes++; throw new Error('unexpected write'); });
    t.mock.method(childProcess, 'spawnSync', () => { spawns++; throw new Error('unexpected subprocess'); });
    syncBuiltinESMExports();
    const plan = buildReleasePlan({ root: f.root, statusBytes: Buffer.alloc(0), policy: policy() });
    assert.equal(plan.schema, 'greybox-release-source-plan-v1');
    assert.equal(plan.counts.statusRecords, 0);
    assert.equal(writes, 0);
    assert.equal(spawns, 0);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); f.cleanup(); }
});

function fixedPolicyPath(root) { return join(root, 'docs/engine/data/greybox-release-source-policy-v1.json'); }
function prepareFixedPolicy(root, bytes) {
  mkdirSync(join(root, 'docs/engine/data'), { recursive: true });
  writeFileSync(fixedPolicyPath(root), bytes);
}

test('fixed policy capture reads the exact ordinary file bytes', () => {
  const f = fixture(), bytes = Buffer.from('{"schema":"fixture-policy"}\n');
  try {
    prepareFixedPolicy(f.root, bytes);
    assert.deepEqual(captureFixedPolicy(f.root), bytes);
  } finally { f.cleanup(); }
});

test('fixed policy leaf symlink is rejected before reading', (t) => {
  const f = fixture(), external = mkdtempSync(join(tmpdir(), 'gb-policy-link-'));
  const originalRead = fs.readSync; let reads = 0;
  try {
    const externalPolicy = join(external, 'policy.json');
    writeFileSync(externalPolicy, '{"external":true}');
    prepareFixedPolicy(f.root, '{}');
    rmSync(fixedPolicyPath(f.root));
    try { symlinkSync(externalPolicy, fixedPolicyPath(f.root), 'file'); }
    catch { t.skip('File symlink fixture unavailable; linked policy leaf control unverified'); return; }
    t.mock.method(fs, 'readSync', (...args) => { reads++; return originalRead(...args); });
    syncBuiltinESMExports();
    assert.throws(() => captureFixedPolicy(f.root), /Symlink or Windows junction/);
    assert.equal(reads, 0);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); f.cleanup(); rmSync(external, { recursive: true, force: true }); }
});

test('fixed policy ancestor junction is rejected before reading', (t) => {
  const f = fixture(), external = mkdtempSync(join(tmpdir(), 'gb-policy-junction-'));
  const originalRead = fs.readSync; let reads = 0;
  try {
    writeFileSync(join(external, 'policy.json'), '{"external":true}');
    try { symlinkSync(external, join(f.root, 'docs'), 'junction'); }
    catch { t.skip('Directory junction fixture unavailable; linked policy ancestor control unverified'); return; }
    t.mock.method(fs, 'readSync', (...args) => { reads++; return originalRead(...args); });
    syncBuiltinESMExports();
    assert.throws(() => captureFixedPolicy(f.root), /Symlink or Windows junction/);
    assert.equal(reads, 0);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); f.cleanup(); rmSync(external, { recursive: true, force: true }); }
});

test('external report writer creates a new external leaf and rejects repository paths', () => {
  const f = fixture(), external = mkdtempSync(join(tmpdir(), 'gb-report-output-'));
  try {
    const bytes = '{"report":true}\n', target = join(external, 'report.json');
    writeExternalReport(f.root, target, bytes);
    assert.equal(readFileSync(target, 'utf8'), bytes);
    assert.throws(() => writeExternalReport(f.root, join(f.root, 'report.json'), bytes), /outside the repository/);
    assert.equal(readFileSync(target, 'utf8'), bytes);
  } finally { f.cleanup(); rmSync(external, { recursive: true, force: true }); }
});

test('external report writer rejects junction parents targeting repository or external folders', (t) => {
  const f = fixture(), external = mkdtempSync(join(tmpdir(), 'gb-report-junction-'));
  try {
    const targets = [f.root, external];
    for (const [index, target] of targets.entries()) {
      const alias = join(external, `parent-${index}`);
      try { symlinkSync(target, alias, 'junction'); }
      catch { t.skip('Directory junction fixture unavailable; external parent link controls unverified'); return; }
      assert.throws(() => writeExternalReport(f.root, join(alias, 'report.json'), 'x'), /Symlink or Windows junction/);
      assert.equal(fs.existsSync(join(target, 'report.json')), false);
      fs.rmdirSync(alias); // removes the junction only; rmSync treats it as a directory on Windows
    }
  } finally { f.cleanup(); rmSync(external, { recursive: true, force: true }); }
});

test('external report writer rejects existing or linked leaves and leaves their targets unchanged', (t) => {
  const f = fixture(), external = mkdtempSync(join(tmpdir(), 'gb-report-leaf-'));
  try {
    const existing = join(external, 'existing.json'), target = join(external, 'target.json'), link = join(external, 'link.json');
    writeFileSync(existing, 'keep'); writeFileSync(target, 'target');
    assert.throws(() => writeExternalReport(f.root, existing, 'replace'), /already exists/);
    assert.equal(readFileSync(existing, 'utf8'), 'keep');
    try { symlinkSync(target, link, 'file'); }
    catch { t.skip('File symlink fixture unavailable; linked output leaf control unverified'); return; }
    assert.throws(() => writeExternalReport(f.root, link, 'replace'), /Symlink or Windows junction/);
    assert.equal(readFileSync(target, 'utf8'), 'target');
  } finally { f.cleanup(); rmSync(external, { recursive: true, force: true }); }
});

test('external report writer rejects non-directory and missing parents without creating them', () => {
  const f = fixture(), external = mkdtempSync(join(tmpdir(), 'gb-report-parent-'));
  try {
    const fileParent = join(external, 'file'); writeFileSync(fileParent, 'keep');
    const missing = join(external, 'missing');
    assert.throws(() => writeExternalReport(f.root, join(fileParent, 'report.json'), 'x'), /not a directory/);
    assert.throws(() => writeExternalReport(f.root, join(missing, 'report.json'), 'x'), /missing or inaccessible/);
    assert.equal(fs.existsSync(missing), false);
    assert.equal(readFileSync(fileParent, 'utf8'), 'keep');
  } finally { f.cleanup(); rmSync(external, { recursive: true, force: true }); }
});

test('missing Python action declarations keep dependency analysis incomplete without JS blockers', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, 'app/inspected.py'), '# reviewed import and I/O notes, no action declaration\n');
    const path = 'app/inspected.py';
    const plan = buildReleasePlan({ root: f.root, statusBytes: Buffer.from(`?? ${path}\0`),
      policy: { ...policy({ entries: [{ path, disposition: 'intended-source', reason: 'audited fixture' }] }),
        dependencyDeclarations: [],
        pythonIoAudit: { reviewedPaths: [path], groups: [], findings: [], dependencyClosureComplete: true } } });
    assert.equal(plan.counts.dependencyBlockers, 0);
    assert.equal(plan.counts.pythonUnanalysedFiles, 0);
    assert.equal(plan.counts.pythonFilesWithoutActionDeclarations, 1);
    assert.equal(plan.counts.pythonFilesWithoutCompleteActionDeclarations, 1);
    assert.equal(plan.dependencyAnalysisComplete, false);
  } finally { f.cleanup(); }
});

test('action declarations reject duplicate paths and duplicate action IDs', () => {
  const f = fixture();
  try {
    const path = 'app/inspected.py', source = '# source\n';
    writeFileSync(join(f.root, path), source);
    const declaration = pyDeclaration(path, source);
    const base = { ...policy({ entries: [{ path, disposition: 'intended-source', reason: 'fixture' }] }),
      dependencyDeclarations: [declaration, structuredClone(declaration)] };
    assert.throws(() => buildReleasePlan({ root: f.root, statusBytes: Buffer.alloc(0), policy: base }), /duplicate dependency declaration path/);
    const duplicateAction = pyDeclaration(path, source, [
      { id: 'report', reads: [], writes: [], evidence: ['main'] },
      { id: 'report', reads: [], writes: [], evidence: ['main'] },
    ]);
    assert.throws(() => buildReleasePlan({ root: f.root, statusBytes: Buffer.alloc(0),
      policy: { ...base, dependencyDeclarations: [duplicateAction] } }), /duplicate dependency action/);
  } finally { f.cleanup(); }
});

test('action I/O requires explicit arrays and safe repository, external-argument, or temporary locations', () => {
  const f = fixture();
  try {
    const path = 'app/inspected.py', source = '# source\n';
    writeFileSync(join(f.root, path), source);
    const run = (declaration) => buildReleasePlan({ root: f.root, statusBytes: Buffer.alloc(0),
      policy: { ...policy({ entries: [{ path, disposition: 'intended-source', reason: 'fixture' }] }), dependencyDeclarations: [declaration] } });
    for (const row of [
      { location: 'repository-file', path: '../outside' },
      { location: 'repository-file', path: 'C:/outside' },
      { location: 'external-argument-relative', argument: '--input', pattern: '../escape' },
      { location: 'external-argument-relative', argument: '--input', pattern: 'images/./file.png' },
      { location: 'external-argument-relative', argument: 'input', pattern: 'images/*.png' },
      { location: 'temporary-fixture', pattern: '../escape' },
    ]) {
      const declaration = pyDeclaration(path, source, [{ id: 'report', reads: [row], writes: [], evidence: ['main'] }]);
      assert.throws(() => run(declaration));
    }
    const missingArrays = pyDeclaration(path, source);
    delete missingArrays.actions[0].writes;
    assert.throws(() => run(missingArrays), /Malformed or duplicate dependency action/);
    const unreviewedAction = pyDeclaration(path, source, [{ id: 'report', reads: [], writes: [], evidence: ['unreviewed'] }]);
    assert.throws(() => run(unreviewedAction), /Malformed or duplicate dependency action/);
    assert.doesNotThrow(() => run(pyDeclaration(path, source, [{ id: 'report',
      reads: [{ location: 'external-argument-relative', argument: '--images-dir', pattern: 'images/<sha256>.png' }],
      writes: [{ location: 'temporary-fixture', pattern: 'temporary-root/**' }], evidence: ['main'] }])));
    const fixedRootDecl = pyDeclaration(path, source, [{ id: 'report',
      reads: [{ location: 'external-fixed-root', rootId: 'local-image-corpus', pattern: 'rendered/PIC1_001.png' }],
      writes: [], evidence: ['main'] }]);
    assert.doesNotThrow(() => buildReleasePlan({ root: f.root, statusBytes: Buffer.alloc(0),
      policy: { ...policy({ entries: [{ path, disposition: 'intended-source', reason: 'fixture' }] }),
        externalRoots: [{ id: 'local-image-corpus', description: 'External data root not checked by planner' }],
        dependencyDeclarations: [fixedRootDecl] } }));
    assert.throws(() => run(fixedRootDecl), /Malformed fixed-external-root/);
  } finally { f.cleanup(); }
});

test('stale source hashes fail closed and incomplete inventories cannot count as fully declared', () => {
  const f = fixture();
  try {
    const path = 'app/inspected.py', source = '# reviewed source\n';
    writeFileSync(join(f.root, path), source);
    const entry = [{ path, disposition: 'intended-source', reason: 'fixture' }];
    const stale = pyDeclaration(path, source); stale.sourceSha256 = '0'.repeat(64);
    stale.evidence[0].sourceSha256 = stale.sourceSha256;
    assert.throws(() => buildReleasePlan({ root: f.root, statusBytes: Buffer.alloc(0),
      policy: { ...policy({ entries: entry }), dependencyDeclarations: [stale] } }), /Stale dependency declaration source hash/);

    const partial = pyDeclaration(path, source, [{ id: 'report', reads: [], writes: [], evidence: ['main'] }], false);
    const plan = buildReleasePlan({ root: f.root, statusBytes: Buffer.from(` M ${path}\0`),
      policy: { ...policy({ entries: entry }), dependencyDeclarations: [partial],
        pythonIoAudit: { reviewedPaths: [path], groups: [], findings: [], dependencyClosureComplete: true } } });
    assert.equal(plan.counts.pythonFilesWithoutActionDeclarations, 0);
    assert.equal(plan.counts.pythonFilesWithoutCompleteActionDeclarations, 1);
    assert.deepEqual(plan.pythonDependencyCoverage.incompleteActionDeclarations, [path]);
    assert.equal(plan.dependencyAnalysisComplete, false);

    const unresolved = pyDeclaration(path, source, [{ id: 'report',
      reads: [{ location: 'unresolved-dynamic', reason: 'fixture path is computed reflectively' }],
      writes: [], evidence: ['main'] }], true);
    const unresolvedPlan = buildReleasePlan({ root: f.root, statusBytes: Buffer.from(` M ${path}\0`),
      policy: { ...policy({ entries: entry }), dependencyDeclarations: [unresolved],
        pythonIoAudit: { reviewedPaths: [path], groups: [], findings: [], dependencyClosureComplete: true } } });
    assert.equal(unresolvedPlan.counts.pythonFilesWithoutActionDeclarations, 0);
    assert.equal(unresolvedPlan.counts.pythonFilesWithoutCompleteActionDeclarations, 1);
    assert.equal(unresolvedPlan.dependencyAnalysisComplete, false);
  } finally { f.cleanup(); }
});

test('checked-in report and check actions declare no repository writes', () => {
  const policy = JSON.parse(readFileSync(new URL('../../../docs/engine/data/greybox-release-source-policy-v1.json', import.meta.url), 'utf8'));
  const declarations = new Map(policy.dependencyDeclarations.map((row) => [row.path, row]));
  for (const [path, actionIds] of [
    ['tools/cok_graphics_alias_bindings.py', ['report', 'check']],
    ['apps/web/test/build-intro-fixture-manifest.py', ['report']],
    ['tools/cok_ui202_panel_consumers.py', ['check']],
    ['tools/test_cok_ui202_panel_consumers.py', ['unittest']],
    ['tools/import_cok_amiga_pic_registry.py', ['report']],
    ['tools/import_cok_amiga_sprit_registry.py', ['report']],
    ['tools/import_cok_amiga_com_registry.py', ['report']],
  ]) {
    const declaration = declarations.get(path);
    assert.ok(declaration, `${path} has a declaration`);
    for (const id of actionIds) {
      const action = declaration.actions.find((row) => row.id === id);
      assert.ok(action, `${path} has action ${id}`);
      assert.deepEqual(action.writes.filter((row) => row.location === 'repository-file'), [],
        `${path}:${id} does not write repository files`);
    }
  }
});


test('source fingerprints distinguish bytes with identical status and preserve incomplete verdicts', () => {
  const f = fixture();
  try {
    const options = { root: f.root, statusBytes: Buffer.from(' M app/main.ts\0'),
      policy: { ...policy(), pythonIoAudit: { reviewedPaths: [], groups: [], findings: [], dependencyClosureComplete: false } },
      head: 'a'.repeat(40), host: 'fixture-host' };
    writeFileSync(join(f.root, 'app/main.ts'), 'export const value = 1;\n');
    const first = buildReleasePlan(options);
    writeFileSync(join(f.root, 'app/main.ts'), 'export const value = 2;\n');
    const second = buildReleasePlan(options);
    assert.deepEqual(first.counts, second.counts);
    assert.equal(first.provenance.statusInputSha256, second.provenance.statusInputSha256);
    assert.notEqual(first.provenance.contentInventorySha256, second.provenance.contentInventorySha256);
    const bytes = readFileSync(join(f.root, 'app/main.ts'));
    assert.deepEqual(second.provenance.contentInventory, [{ path: 'app/main.ts', state: 'present',
      byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }]);
    assert.equal(first.dependencyAnalysisComplete, false);
    assert.equal(second.dependencyAnalysisComplete, false);
    const policyBytes = Buffer.from(JSON.stringify(options.policy) + '\n');
    const changed = buildReleasePlan({ ...options, policyBytes, head: 'b'.repeat(40) });
    assert.notEqual(changed.provenance.policyInputSha256, second.provenance.policyInputSha256);
    assert.equal(changed.provenance.policyInputSha256, createHash('sha256').update(policyBytes).digest('hex'));
    assert.notEqual(changed.provenance.head, second.provenance.head);
    const headOnly = buildReleasePlan({ ...options, head: 'd'.repeat(40) });
    assert.equal(headOnly.provenance.policyInputSha256, second.provenance.policyInputSha256);
    assert.notEqual(headOnly.provenance.head, second.provenance.head);
    assert.equal(headOnly.provenance.contentInventorySha256, second.provenance.contentInventorySha256);
    assert.equal(changed.provenance.contentInventorySha256, second.provenance.contentInventorySha256);
    assert.equal(changed.dependencyAnalysisComplete, false);
  } finally { f.cleanup(); }
});

test('equal source inventories retain distinct checkout context and deterministic path order', () => {
  const a = fixture(), b = fixture();
  try {
    const options = { statusBytes: Buffer.alloc(0), policy: policy(), head: 'c'.repeat(40), host: 'host' };
    const left = buildReleasePlan({ ...options, root: a.root });
    const right = buildReleasePlan({ ...options, root: b.root });
    assert.equal(left.provenance.contentInventorySha256, right.provenance.contentInventorySha256);
    assert.notEqual(left.provenance.checkoutRoot, right.provenance.checkoutRoot);
    assert.equal(left.provenance.host, 'host');
    for (const path of ['z.ts', 'a.ts']) writeFileSync(join(a.root, 'app', path), 'export {};');
    const roots = ['app/z.ts', 'app/main.ts', 'app/a.ts'];
    const forward = buildReleasePlan({ ...options, root: a.root, roots });
    const reverse = buildReleasePlan({ ...options, root: a.root, roots: roots.toReversed() });
    assert.deepEqual(forward.provenance.contentInventory.map((row) => row.path), ['app/a.ts', 'app/main.ts', 'app/z.ts']);
    assert.equal(forward.provenance.contentInventorySha256, reverse.provenance.contentInventorySha256);
  } finally { a.cleanup(); b.cleanup(); }
});

test('deleted and missing sources remain explicit while excluded image trees stay outside inventory', () => {
  const f = fixture();
  try {
    rmSync(join(f.root, 'app/main.ts'));
    const options = { root: f.root, statusBytes: Buffer.from(' D app/main.ts\0?? images/art.png\0'),
      policy: policy({ rules: [{ prefix: 'images/', disposition: 'excluded', reason: 'external image corpus' }] }) };
    const deleted = buildReleasePlan(options);
    assert.deepEqual(deleted.provenance.contentInventory, [{ path: 'app/main.ts', state: 'deleted', byteLength: null, sha256: null }]);
    assert.equal(deleted.counts.excluded, 1);
    assert.equal(deleted.counts.dependencyBlockers, 1);
    assert.equal(deleted.dependencyAnalysisComplete, false);
    const missing = buildReleasePlan({ ...options, statusBytes: Buffer.alloc(0) });
    assert.equal(missing.provenance.contentInventory[0].state, 'missing');
    assert.equal(missing.dependencyAnalysisComplete, false);
  } finally { f.cleanup(); }
});

function metadataFixture() {
  const f = fixture(), source = '# synthetic source\n', path = 'app/tool.py', metadata = 'meta/facts.json';
  mkdirSync(join(f.root, 'meta')); writeFileSync(join(f.root, path), source);
  const bytes = Buffer.from('{"reference":"unopened/never-read.png"}');
  writeFileSync(join(f.root, metadata), bytes);
  const pin = { path: metadata, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  const declaration = { ...pyDeclaration(path, source, [{ id: 'report', reads: [{ location: 'repository-file', path: metadata }], writes: [] }]), metadataInputs: [pin] };
  const p = { ...policy({ entries: [{ path, disposition: 'intended-source', reason: 'fixture' }],
    rules: [{ prefix: 'meta/', disposition: 'intended-source', reason: 'synthetic metadata' }] }), dependencyDeclarations: [declaration],
    pythonIoAudit: { reviewedPaths: [path], groups: [], findings: [], dependencyClosureComplete: true } };
  return { ...f, p, pin, declaration, bytes, metadata, run: () => buildReleasePlan({ root: f.root, statusBytes: Buffer.from(' M app/tool.py\0'), policy: p }) };
}

test('metadata pins capture clean inputs once for provenance without following JSON references or clearing gaps', (t) => {
  const f = metadataFixture(), original = fs.readSync;
  let metadataBytes = 0;
  try {
    writeFileSync(join(f.root, 'app/second.py'), '# synthetic source\n');
    f.p.entries.push({ path: 'app/second.py', disposition: 'intended-source', reason: 'same metadata pin' });
    f.p.dependencyDeclarations.push({ ...structuredClone(f.declaration), path: 'app/second.py' });
    t.mock.method(fs, 'readSync', (...args) => {
      const count = original(...args);
      if (args[1].length === f.bytes.length + 1) metadataBytes += count;
      return count;
    });
    syncBuiltinESMExports();
    const plan = f.run();
    assert.equal(metadataBytes, f.bytes.length);
    f.p.dependencyDeclarations.pop();
    assert.deepEqual(plan.provenance.metadataInputs, [f.pin]);
    assert.deepEqual(plan.provenance.contentInventory.find((row) => row.path === f.metadata), { ...f.pin, state: 'present' });
    assert.equal(plan.dependencyAnalysisComplete, true);
    f.declaration.actions.push({ id: 'unrelated', reads: [{ location: 'unresolved-dynamic', reason: 'still unresolved' }], writes: [], evidence: ['main'] });
    assert.equal(f.run().counts.pythonFilesWithoutCompleteActionDeclarations, 1);
    assert.equal(f.run().dependencyAnalysisComplete, false);
    delete f.declaration.metadataInputs;
    const legacy = f.run();
    assert.equal('metadataInputs' in legacy.provenance, false);
    assert.equal(legacy.provenance.contentInventory.some((row) => row.path === f.metadata), false);
    assert.equal(legacy.counts.pythonFilesWithoutCompleteActionDeclarations, 1);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); f.cleanup(); }
});

test('metadata capture rejects same-length changed bytes, wrong length, missing and malformed JSON', () => {
  const f = metadataFixture();
  try {
    writeFileSync(join(f.root, f.metadata), Buffer.alloc(f.bytes.length, 32));
    assert.throws(f.run, /Metadata input SHA-256/);
    writeFileSync(join(f.root, f.metadata), Buffer.concat([f.bytes, Buffer.from(' ')]));
    assert.throws(f.run, /Metadata input byte length/);
    rmSync(join(f.root, f.metadata)); assert.throws(f.run, /Metadata input is missing/);
    const bad = Buffer.from('{"broken":'); writeFileSync(join(f.root, f.metadata), bad);
    Object.assign(f.pin, { byteLength: bad.length, sha256: createHash('sha256').update(bad).digest('hex') });
    assert.throws(f.run, /Malformed metadata JSON/);
  } finally { f.cleanup(); }
});

test('metadata pin schema and byte budgets reject invalid, duplicate and conflicting records', () => {
  const f = metadataFixture();
  try {
    for (const inputs of [[], Array(9).fill(f.pin), [{ ...f.pin, extra: true }], [{ ...f.pin, byteLength: -1 }],
      [{ ...f.pin, byteLength: 1.5 }], [{ ...f.pin, byteLength: 524289 }], [{ ...f.pin, sha256: f.pin.sha256.toUpperCase() }],
      [{ ...f.pin, sha256: [f.pin.sha256] }], [f.pin, { ...f.pin }], [f.pin, { ...f.pin, path: 'meta/FACTS.json' }]]) {
      f.declaration.metadataInputs = inputs; assert.throws(f.run, /metadata/i);
    }
    const roster = (count, length) => Array.from({ length: count }, (_, i) => ({ ...f.pin, path: 'meta/file' + i + '.json', byteLength: length }));
    const readsFor = (rows) => [{ id: 'report', reads: rows.map(({ path }) => ({ location: 'repository-file', path })), writes: [], evidence: ['main'] }];
    f.declaration.metadataInputs = roster(3, 400000); f.declaration.actions = readsFor(f.declaration.metadataInputs);
    assert.throws(f.run, /declaration byte budget/);
    f.declaration.metadataInputs = [f.pin]; f.declaration.actions = readsFor([f.pin]);
    f.p.dependencyDeclarations.push({ ...structuredClone(f.declaration), path: 'app/other.py', metadataInputs: [{ ...f.pin, sha256: '0'.repeat(64) }] });
    assert.throws(f.run, /Conflicting metadata/);
    f.p.dependencyDeclarations = roster(17, 524288).map((pin, i) => ({ ...structuredClone(f.declaration), path: 'app/tool' + i + '.py', metadataInputs: [pin], actions: readsFor([pin]) }));
    assert.throws(f.run, /run byte budget/);
  } finally { f.cleanup(); }
});

test('metadata paths require exact declared reads and intended non-snapshot JSON disposition', () => {
  const f = metadataFixture();
  try {
    for (const path of ['../escape.json', '/absolute.json', 'C:/absolute.json', 'meta/facts.json:stream', 'meta\\facts.json', 'meta/./facts.json', 'meta/facts.txt']) {
      f.declaration.metadataInputs = [{ ...f.pin, path }];
      assert.throws(f.run, /metadata|Absolute machine path in release source policy/i);
    }
    f.declaration.metadataInputs = [f.pin]; f.declaration.actions[0].reads = [];
    assert.throws(f.run, /exact repository-file read/);
    f.declaration.actions[0].reads = [{ location: 'repository-file', path: f.metadata }];
    for (const disposition of ['excluded', 'unresolved']) {
      f.p.rules[0].disposition = disposition; assert.throws(f.run, /intended-source disposition/);
    }
    f.p.rules[0].disposition = 'intended-source';
    f.pin.path = 'apps/web/dist-app-cok57/facts.json'; f.declaration.actions[0].reads[0].path = f.pin.path;
    f.p.entries.push({ path: f.pin.path, disposition: 'intended-source', reason: 'cannot override snapshot exclusion' });
    assert.throws(f.run, /intended-source disposition/);
  } finally { f.cleanup(); }
});

test('metadata rejects ordinary-directory substitutes and junction escapes', (t) => {
  const f = metadataFixture(), external = mkdtempSync(join(tmpdir(), 'gb-metadata-outside-'));
  try {
    rmSync(join(f.root, f.metadata)); mkdirSync(join(f.root, f.metadata));
    assert.throws(f.run, /missing or not an ordinary file/);
    rmSync(join(f.root, 'meta'), { recursive: true, force: true });
    writeFileSync(join(external, 'facts.json'), f.bytes);
    try { symlinkSync(external, join(f.root, 'meta'), 'junction'); }
    catch { t.skip('Junction creation unavailable; metadata link control unverified'); return; }
    assert.throws(f.run, /Symlink/);
    assert.deepEqual(readFileSync(join(external, 'facts.json')), f.bytes);
  } finally { f.cleanup(); rmSync(external, { recursive: true, force: true }); }
});

test('metadata captures detect a file growing during the bounded read', (t) => {
  const f = metadataFixture(), original = fs.readSync;
  let changed = false;
  try {
    t.mock.method(fs, 'readSync', (...args) => {
      const count = original(...args);
      if (!changed) { changed = true; writeFileSync(join(f.root, f.metadata), Buffer.concat([f.bytes, Buffer.from(' ')])); }
      return count;
    });
    syncBuiltinESMExports();
    assert.throws(f.run, /Metadata input drift/);
    assert.equal(changed, true);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); f.cleanup(); }
});
