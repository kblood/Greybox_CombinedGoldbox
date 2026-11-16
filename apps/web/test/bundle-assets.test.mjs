import test from 'node:test';
import assert from 'node:assert/strict';
import fs, { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { bundleAssets, preflightAssetDestinations } from '../scripts/bundle-assets.mjs';
import { auditPublicArtifacts, isForbiddenAsset, assertAllowedAsset } from '../scripts/public-artifact-policy.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'goldbox-package-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const app = join(root, 'web'), output = join(root, 'out');
  function put(path, data = 'synthetic') { mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, data); }
  mkdirSync(output);
  put(join(app, 'games/nwn.json'), '{"files":[]}');
  put(join(app, 'src/ui/catalog.ts'), '');
  const options = { app, output, repoRoot: root };
  return { root, app, output, put, options };
}

function denyReads(t) {
  const original = fs.readFileSync, reads = [];
  fs.readFileSync = (path) => { reads.push(String(path)); throw new Error(`Unexpected manifest read: ${path}`); };
  syncBuiltinESMExports();
  t.after(() => { fs.readFileSync = original; syncBuiltinESMExports(); });
  return reads;
}

function denyTargetAccess(t, targets) {
  const blocked = targets.map((target) => resolve(target).toLowerCase());
  const methods = ['existsSync', 'lstatSync', 'statSync', 'realpathSync', 'readFileSync', 'copyFileSync'], saved = [];
  for (const method of methods) {
    const original = fs[method]; saved.push([method, original]);
    fs[method] = function (path, ...args) {
      const value = String(path);
      const resolved = resolve(value).toLowerCase();
      if (blocked.some((prefix) => resolved === prefix || prefix.endsWith('\\') && resolved.startsWith(prefix))) throw new Error(`Unexpected game target access: ${value}`);
      return original.call(this, path, ...args);
    };
  }
  syncBuiltinESMExports();
  t.after(() => { for (const [method, original] of saved) fs[method] = original; syncBuiltinESMExports(); });
}

test('all collection sources, recursive filtering, manifests and allowed NWN data', (t) => {
  const { root, app, output, put, options } = fixture(t);
  const absolute = join(root, 'NWN/TITLE.DAX');
  put(absolute);
  const manifest = { files: [absolute, 'NWN/GEO0.DAX', 'NWN/ECL1.DAX', 'NWN/GAME.EXE', 'NWN/SAVE/art.DAX', 'NWN/SAVGAMA.QSV'].map((path) => ({ path })) };
  const source = JSON.stringify(manifest);
  put(join(app, 'games/nwn.json'), source);
  put(join(app, 'src/ui/catalog.ts'), "path: 'NWN/driver.AdV', companionPath: 'NWN/HERO.WIZ', path: 'NWN/GEO0.DAX'");
  put(join(app, 'src/ui/preview.ts'), "const a = 'Champions of Krynn/loot.COM'; const b = 'Champions of Krynn/bank';");
  for (const path of ['NWN/GEO0.DAX', 'NWN/ECL1.DAX', 'Champions of Krynn/bank/GEO1.DAX', 'Champions of Krynn/bank/deep/SAVGAMZ.DAT', 'Champions of Krynn/bank/save/TITLE.DAX', 'Champions of Krynn/bank/deep/driver.SYS']) put(join(root, path));
  put(join(output, 'assets/index-test.js'), 'application code');
  const stats = bundleAssets(options);
  assert.deepEqual(stats, { skippedCollected: 6, skippedRecursive: 3, skippedManifestEntries: 3 });
  assert.equal(readFileSync(join(app, 'games/nwn.json'), 'utf8'), source);
  const bundled = JSON.parse(readFileSync(join(output, 'games/nwn.json'), 'utf8'));
  assert.equal(bundled.files.length, 3);
  assert.match(bundled.files[0].path, /^external\//);
  for (const entry of bundled.files) assert.ok(existsSync(join(output, 'assets', entry.path)));
  assert.ok(existsSync(join(output, 'assets/Champions of Krynn/bank/GEO1.DAX')));
  assert.equal(auditPublicArtifacts(output).files, 5);
});

test('metadata-only mode copies no game bytes and removes absolute install roots from manifests', (t) => {
  const { root, app, output, put, options } = fixture(t);
  const archive = 'NWN/TITLE.DAX';
  put(join(root, archive), 'user-owned source bytes');
  put(join(app, 'games/nwn.json'), JSON.stringify({ files: [
    { path: archive, category: 'title' },
    { path: 'D:\\Games\\Gold Box\\NWN\\BIGPIC1.DAX', category: 'scenes' },
  ] }));
  put(join(app, 'src/ui/catalog.ts'), "path: 'NWN/TITLE.DAX'");
  const originalManifest = readFileSync(join(app, 'games/nwn.json'), 'utf8');
  const stats = bundleAssets({ ...options, includeGameAssets: false });

  assert.equal(stats.metadataOnly, true);
  assert.equal(stats.normalizedManifestPaths, 1);
  assert.equal(existsSync(join(output, 'assets/NWN/TITLE.DAX')), false);
  const packaged = JSON.parse(readFileSync(join(output, 'games/nwn.json'), 'utf8'));
  assert.equal(packaged.files[0].path, archive);
  assert.equal(packaged.files[1].path, 'BIGPIC1.DAX');
  assert.equal(JSON.stringify(packaged).includes('D:\\\\Games'), false);
  assert.equal(readFileSync(join(app, 'games/nwn.json'), 'utf8'), originalManifest);
  assert.equal(readFileSync(join(root, archive), 'utf8'), 'user-owned source bytes');
  assert.equal(auditPublicArtifacts(output).files, 0);
});

test('metadata-only mode normalizes and audits the top-level GLIB palette fallback', (t) => {
  const { app, output, put, options } = fixture(t);
  const palette = 'D:\\Games\\Gold Box\\Amiga\\disk1\\ALWAYS.TLB';
  put(join(app, 'games/amiga.json'), JSON.stringify({ paletteFrom: palette, files: [] }));
  put(join(app, 'src/ui/catalog.ts'), '');

  const stats = bundleAssets({ ...options, includeGameAssets: false });
  const packaged = JSON.parse(readFileSync(join(output, 'games/amiga.json'), 'utf8'));
  assert.equal(packaged.paletteFrom, 'ALWAYS.TLB');
  assert.equal(stats.normalizedManifestPaths, 1);
  assert.equal(JSON.stringify(packaged).includes('D:\\\\Games'), false);
  assert.equal(auditPublicArtifacts(output).files, 0);

  packaged.paletteFrom = palette;
  writeFileSync(join(output, 'games/amiga.json'), JSON.stringify(packaged));
  assert.throws(() => auditPublicArtifacts(output), /Absolute public game palette path/);
});

test('complete release audit accepts app-owned files and rejects any unlisted output path', (t) => {
  const { root, output, put } = fixture(t);
  assert.throws(() => auditPublicArtifacts(join(root, 'absent'), { completeOutput: true }), /output directory not found/);
  assert.throws(() => auditPublicArtifacts(output, { completeOutput: true }), /Missing required public app file/);
  for (const path of ['index.html', 'dragon.svg', 'assets/index-a.js', 'assets/index-a.css', 'restyle/animations.html']) {
    put(join(output, path), 'app-owned file');
  }
  for (const path of ['games/cok.json', 'restyle/manifest.json', 'restyle/fidelity.json',
    'restyle/anim/index.json', 'restyle/cok-generated/manifest.json']) {
    put(join(output, path), '{}');
  }
  assert.equal(auditPublicArtifacts(output, { completeOutput: true }).files, 10);
  const badRefs = ['../x', 'a/../x', '/x', '//host/share', 'C:/x', 'C:x', 'a\\b', 'a//b', 'a/', './x', 'a/./x', 'a:b', 'a\u0001b', 'a\u0085b'];
  for (const value of badRefs) for (const key of ['paletteFrom', 'files']) {
    const manifest = key === 'files' ? { files: [{ path: value }] } : { paletteFrom: value };
    put(join(output, 'games/cok.json'), JSON.stringify(manifest));
    assert.throws(() => auditPublicArtifacts(output, { completeOutput: true }), /(?:Absolute|Unsafe|Forbidden) public game|Machine-local path literal/);
  }
  put(join(output, 'games/cok.json'), JSON.stringify({ paletteFrom: 'palette files/one.TLB', files: [{ path: 'art files/one.DAX' }] }));
  assert.doesNotThrow(() => auditPublicArtifacts(output, { completeOutput: true }));
  for (const empty of [undefined, null, '']) {
    put(join(output, 'games/cok.json'), JSON.stringify({ paletteFrom: empty, files: [{ path: empty }] }));
    assert.doesNotThrow(() => auditPublicArtifacts(output, { completeOutput: true }));
  }

  put(join(output, 'assets/index-a.js'), 'const art = "data:image/png;base64,iVBORw0KGgo=";');
  assert.throws(() => auditPublicArtifacts(output, { completeOutput: true }), /Embedded public image payload/);
  put(join(output, 'assets/index-a.js'), 'const art = "data:image/svg+xml;charset=utf-8,%3Csvg%3E";');
  assert.throws(() => auditPublicArtifacts(output, { completeOutput: true }), /Embedded public image payload/);
  put(join(output, 'assets/index-a.js'), 'application code');

  put(join(output, 'assets/index-a.js'), 'const local = "C:/Users/example/game.DAX";');
  assert.throws(() => auditPublicArtifacts(output, { completeOutput: true }), /Machine-local path literal/);
  put(join(output, 'assets/index-a.js'), 'const local = "\\\\\\\\server\\\\share\\\\game.DAX";');
  assert.throws(() => auditPublicArtifacts(output, { completeOutput: true }), /Machine-local path literal/);
  put(join(output, 'assets/index-a.js'), 'application code');

  put(join(output, 'restyle/cok/combat/CPIC1_008_restyle.png'));
  assert.throws(() => auditPublicArtifacts(output, { completeOutput: true }), /Unexpected public output path/);
  rmSync(join(output, 'restyle/cok/combat/CPIC1_008_restyle.png'));
  put(join(output, 'unlisted/archive.DAX'));
  assert.throws(() => auditPublicArtifacts(output, { completeOutput: true }), /Unexpected public output path/);
  rmSync(join(output, 'unlisted/archive.DAX'), { recursive: true });
  writeFileSync(join(output, 'games/cok.json'), '{ invalid');
  assert.throws(() => auditPublicArtifacts(output, { completeOutput: true }), /Invalid public game manifest JSON/);
  writeFileSync(join(output, 'games/cok.json'), JSON.stringify({ files: [{ path: 'NWN/GAME.EXE' }] }));
  assert.throws(() => auditPublicArtifacts(output, { completeOutput: true }), /Forbidden bundled manifest path/);
  writeFileSync(join(output, 'games/cok.json'), JSON.stringify({ files: [{ path: 'D:\\Games\\NWN\\CPIC1.DAX' }] }));
  assert.throws(() => auditPublicArtifacts(output, { completeOutput: true }), /(?:Absolute public game manifest path|Machine-local path literal)/);
  writeFileSync(join(output, 'games/cok.json'), JSON.stringify({ files: [{ path: '\\\\server\\share\\NWN\\CPIC1.DAX' }] }));
  assert.throws(() => auditPublicArtifacts(output, { completeOutput: true }), /(?:Machine-local path literal|Unsafe public game manifest path)/);
});

test('case-insensitive save/character and machine-code policy, not all DAX', () => {
  for (const ext of 'EXE COM OVR ADV DLL SYS SAV QSV GAM EFF WIZ CHR CHA CHS CHD JNK BAK PTY CFG INI KEY PEM PFX P12 ENV'.split(' ')) assert.ok(isForbiddenAsset(`NWN/file.${ext.toLowerCase()}`), ext);
  for (const path of ['NWN\\SaVe\\art.DAX', 'NWN/SAVGAMX.DAT', 'NWN/CHRDATA1.ITM', 'NWN/CHRDATJ1.ITM']) assert.ok(isForbiddenAsset(path));
  for (const path of ['NWN/TITLE.DAX', 'NWN/GEO0.DAX', 'NWN/ECL1.DAX', 'index.js']) assert.equal(isForbiddenAsset(path), false);
});

test('Amiga instrument is data, but a forged raw sound bank is not silently accepted', (t) => {
  const { root, put } = fixture(t);
  const inst = join(root, 'cast3');
  put(inst, Buffer.from('FORM0000INSTPTCH', 'ascii'));
  assert.doesNotThrow(() => assertAllowedAsset('amiga_extracted/CoK/Sound/cast3', inst));
  const song = join(root, 'action.smu');
  put(song, Buffer.from('FORM0000SMUS', 'ascii'));
  assert.doesNotThrow(() => assertAllowedAsset('amiga_extracted/DoK/Sound/action.smu', song));
  put(song, Buffer.from('MZ-not-an-iff-score', 'ascii'));
  assert.throws(() => assertAllowedAsset('amiga_extracted/DoK/Sound/action.smu', song), /Unexpected public asset type/);
  const forged = join(root, 'soundData');
  put(forged, Buffer.from('NAME0000fake', 'ascii'));
  assert.throws(() => assertAllowedAsset('amiga_extracted/CoK/Sound/soundData', forged), /Unexpected public asset type/);
});

test('mutation control: stale nested forbidden output fails bundling and audit', (t) => {
  const { output, put, options } = fixture(t);
  put(join(output, 'assets/old/nested/SAVGAMA.QSV'));
  assert.throws(() => auditPublicArtifacts(output), /Forbidden public asset/);
  assert.throws(() => bundleAssets(options), /Forbidden public asset/);
});

test('restyle image audit catches generated images anywhere under its output subtree', (t) => {
  const { output, put } = fixture(t);
  put(join(output, 'restyle/out/generated.png'));
  assert.throws(() => auditPublicArtifacts(output), /Forbidden public game image: restyle\/out\/generated\.png/);
  rmSync(join(output, 'restyle/out/generated.png'));
  put(join(output, 'restyle/proposal/nested/preview.webp'));
  assert.throws(() => auditPublicArtifacts(output), /Forbidden public game image: restyle\/proposal\/nested\/preview\.webp/);
});

test('unexpected types fail closed rather than silently ship', (t) => {
  const { root, app, output, put, options } = fixture(t);
  put(join(app, 'src/ui/catalog.ts'), "path: 'NWN/mystery.bin'");
  put(join(root, 'NWN/mystery.bin'));
  assert.throws(() => bundleAssets(options), /Unexpected public asset type/);
  put(join(output, 'assets/old/mystery.bin'));
  assert.throws(() => auditPublicArtifacts(output), /Unexpected public asset type/);
});

test('explicit installation junction is allowed but a nested link cannot escape it', (t) => {
  const { root, app, output, put, options } = fixture(t);
  const source = join(root, 'verified-installation');
  put(join(source, 'GEO0.DAX'));
  const bank = join(root, 'Champions of Krynn/bank');
  mkdirSync(join(root, 'Champions of Krynn'));
  try { symlinkSync(source, bank, 'junction'); }
  catch (error) {
    if (error.code === 'EPERM') { t.skip('junction creation not permitted'); return; }
    throw error;
  }
  put(join(app, 'src/ui/preview.ts'), "const bank = 'Champions of Krynn/bank';");
  bundleAssets(options);
  assert.ok(existsSync(join(output, 'assets/Champions of Krynn/bank/GEO0.DAX')));
  const nestedTarget = join(root, 'outside');
  put(join(nestedTarget, 'more.DAX'));
  put(join(source, 'AAA.DAX'), 'planned before link');
  symlinkSync(nestedTarget, join(source, 'nested'), 'junction');
  assert.throws(() => bundleAssets(options), /Unexpected nested asset link/);
  assert.equal(existsSync(join(output, 'assets/Champions of Krynn/bank/AAA.DAX')), false);
});

test('manifest output audit catches forbidden entries without any copied file', (t) => {
  const { output, put } = fixture(t);
  put(join(output, 'games/nwn.json'), JSON.stringify({ files: [{ path: 'NWN/GAME.OVR' }] }));
  assert.throws(() => auditPublicArtifacts(output), /Forbidden bundled manifest path/);
});

test('manifest references must be clean relative paths while empty values stay optional', (t) => {
  const { output, put } = fixture(t), manifestPath = join(output, 'games/nwn.json');
  for (const value of ['../x', 'a/../x', '/x', '//host/share', 'C:/x', 'C:x', 'a\\b', 'a//b', 'a/', './x', 'a/./x', 'a:b', 'a\u0001b', 'a\u0085b']) {
    for (const key of ['paletteFrom', 'files']) {
      const manifest = key === 'files' ? { files: [{ path: value }] } : { paletteFrom: value };
      put(manifestPath, JSON.stringify(manifest));
      assert.throws(() => auditPublicArtifacts(output), /(?:Absolute|Unsafe|Forbidden) public game/ , `${key}: ${JSON.stringify(value)}`);
    }
  }
  put(manifestPath, JSON.stringify({ paletteFrom: 'palette files/one.TLB', files: [{ path: 'art files/one.DAX' }] }));
  assert.doesNotThrow(() => auditPublicArtifacts(output));
  for (const empty of [undefined, null, '']) {
    put(manifestPath, JSON.stringify({ paletteFrom: empty, files: [{ path: empty }] }));
    assert.doesNotThrow(() => auditPublicArtifacts(output));
  }
});

test('asset-only and complete audits reject a linked games directory before any read', (t) => {
  const { root, output } = fixture(t), external = join(root, 'external');
  mkdirSync(external);
  writeFileSync(join(external, 'cok.json'), '{ malformed');
  const reads = denyReads(t);
  try { symlinkSync(external, join(output, 'games'), 'junction'); }
  catch (error) { if (error.code === 'EPERM') { t.skip('junction creation not permitted'); return; } throw error; }
  assert.throws(() => auditPublicArtifacts(output), /output directory type\/link/);
  assert.throws(() => auditPublicArtifacts(output, { completeOutput: true }), /output filesystem type/);
  assert.deepEqual(reads, []);

});

test('asset audit rejects a linked manifest leaf before any read', (t) => {
  const { root, output } = fixture(t), external = join(root, 'external.json');
  writeFileSync(external, '{ malformed');
  mkdirSync(join(output, 'games'));
  const reads = denyReads(t);
  try { symlinkSync(external, join(output, 'games/cok.json')); }
  catch (error) { if (error.code === 'EPERM') { t.skip('file symlink creation not permitted'); return; } throw error; }
  assert.throws(() => auditPublicArtifacts(output), /public game manifest type\/link/);
  assert.deepEqual(reads, []);
});

test('asset audit rejects a linked output ancestor before any read', (t) => {
  const { root, output } = fixture(t), alias = join(root, 'output-alias'), reads = denyReads(t);
  try { symlinkSync(output, alias, 'junction'); }
  catch (error) { if (error.code === 'EPERM') { t.skip('junction creation not permitted'); return; } throw error; }
  assert.throws(() => auditPublicArtifacts(alias), /output directory type\/link/);
  assert.deepEqual(reads, []);
});

test('missing game metadata stays optional for asset audits and required for complete outputs', (t) => {
  const { output, put } = fixture(t);
  assert.equal(auditPublicArtifacts(output).files, 0);
  for (const path of ['index.html', 'dragon.svg', 'assets/app.js', 'assets/app.css', 'restyle/animations.html',
    'restyle/manifest.json', 'restyle/fidelity.json', 'restyle/anim/index.json', 'restyle/cok-generated/manifest.json']) put(join(output, path));
  assert.throws(() => auditPublicArtifacts(output, { completeOutput: true }), /Missing public game metadata directory/);
});

test('CoK Amiga travel archive stays user-supplied at collection, recursion and manifest boundaries', (t) => {
  const { root, app, output, put, options } = fixture(t);
  const archive = 'amiga_extracted/ChampionsOfKrynn/disk2/BIGPIC1.DAA';
  for (const path of [archive, archive.toLowerCase(), archive.replaceAll('/', '\\'),
    `./${archive}`, `assets/${archive}`, `external/win/C/GoldBox/${archive}`,
    'amiga_extracted/ChampionsOfKrynn/disk2/../disk2/BIGPIC1.DAA']) {
    assert.ok(isForbiddenAsset(path), path);
    assert.throws(() => assertAllowedAsset(path), /Forbidden public asset/);
  }
  const allowed = ['amiga_extracted/ChampionsOfKrynn/disk2/pic1.daa',
    'amiga_extracted/DeathKnightsOfKrynn/disk1/BIGPIC1.DAA'];
  for (const path of allowed) {
    assert.equal(isForbiddenAsset(path), false, path);
    assert.equal(isForbiddenAsset(`assets/${path}`), false, `assets/${path}`);
    assert.equal(isForbiddenAsset(`external/win/C/GoldBox/${path}`), false, `external/win/C/GoldBox/${path}`);
    assert.doesNotThrow(() => assertAllowedAsset(path));
    put(join(root, path));
  }
  put(join(root, archive)); // Synthetic bytes only; never read or copy a retail archive.
  put(join(app, 'src/ui/catalog.ts'), `path: '${archive}', path: 'amiga_extracted/ChampionsOfKrynn/disk2'`);
  const sourceManifest = JSON.stringify({ files: [archive, ...allowed].map((path) => ({ path })) });
  put(join(app, 'games/nwn.json'), sourceManifest);
  assert.deepEqual(bundleAssets(options), { skippedCollected: 1, skippedRecursive: 1, skippedManifestEntries: 1 });
  assert.equal(existsSync(join(output, 'assets', archive)), false);
  for (const path of allowed) assert.ok(existsSync(join(output, 'assets', path)));
  assert.equal(readFileSync(join(app, 'games/nwn.json'), 'utf8'), sourceManifest, 'Source manifest remains unchanged');
  assert.deepEqual(JSON.parse(readFileSync(join(output, 'games/nwn.json'), 'utf8')).files.map((entry) => entry.path), allowed);
  assert.equal(readFileSync(join(root, archive), 'utf8'), 'synthetic', 'Source input remains unchanged');
});

test('mutation control: excluded CoK archive in stale output or a fileless manifest fails final audit', (t) => {
  const { output, put, options } = fixture(t);
  const archive = 'amiga_extracted/ChampionsOfKrynn/disk2/BIGPIC1.DAA';
  put(join(output, 'games/nwn.json'), JSON.stringify({ files: [{ path: `assets/${archive}` }] }));
  assert.throws(() => auditPublicArtifacts(output), /Forbidden bundled manifest path/);
  put(join(output, 'games/nwn.json'), '{"files":[]}');
  put(join(output, 'assets', archive));
  assert.throws(() => auditPublicArtifacts(output), /Forbidden public asset/);
  assert.throws(() => bundleAssets(options), /Forbidden public asset/);
});

test('relative collected paths cannot escape repoRoot before source probing', (t) => {
  const { root, app, output, put, options } = fixture(t), repoRoot = join(root, 'repo');
  mkdirSync(repoRoot);
  const escaped = join(root, 'escape.DAX');
  put(escaped, 'outside source');
  put(join(app, 'games/nwn.json'), JSON.stringify({ files: [{ path: '../escape.DAX' }] }));
  denyTargetAccess(t, [escaped]);
  assert.throws(() => bundleAssets({ ...options, repoRoot }), /Unsafe collected asset path/);
  assert.equal(existsSync(join(output, 'assets/escape.DAX')), false);
});

test('an installation junction outside the exact repoRoot is not followed', (t) => {
  const { root, app, output, put, options } = fixture(t), repoRoot = join(root, 'repo'), external = join(root, 'unbound-install');
  mkdirSync(repoRoot); put(join(external, 'GAME.DAX'));
  try { symlinkSync(external, join(repoRoot, 'install'), 'junction'); }
  catch (error) { if (error.code === 'EPERM') { t.skip('junction creation not permitted'); return; } throw error; }
  put(join(app, 'games/nwn.json'), JSON.stringify({ files: [{ path: 'install' }] }));
  assert.throws(() => bundleAssets({ ...options, repoRoot }), /Unexpected source link or ancestor/);
  assert.equal(existsSync(join(output, 'assets/install/GAME.DAX')), false);
});

test('late destination junction is rejected before any asset write and keeps its sentinel', (t) => {
  const { root, app, output, put, options } = fixture(t), outside = join(root, 'outside');
  put(join(root, 'A.DAX'), 'first'); put(join(root, 'Z/B.DAX'), 'second');
  put(join(app, 'games/nwn.json'), JSON.stringify({ files: [{ path: 'A.DAX' }, { path: 'Z/B.DAX' }] }));
  mkdirSync(join(output, 'assets')); mkdirSync(outside);
  put(join(outside, 'sentinel.txt'), 'keep');
  try { symlinkSync(outside, join(output, 'assets/Z'), 'junction'); }
  catch (error) { if (error.code === 'EPERM') { t.skip('junction creation not permitted'); return; } throw error; }
  assert.throws(() => bundleAssets(options), /output directory type\/link/);
  assert.equal(existsSync(join(output, 'assets/A.DAX')), false);
  assert.equal(readFileSync(join(outside, 'sentinel.txt'), 'utf8'), 'keep');
});

test('identical destination is preserved and a later conflict fails before mutation', (t) => {
  const { app, output, put, options } = fixture(t), source = join(options.repoRoot, 'A.DAX');
  put(source, 'same bytes');
  put(join(app, 'games/nwn.json'), JSON.stringify({ files: [{ path: 'A.DAX' }] }));
  put(join(output, 'assets/A.DAX'), 'same bytes');
  const original = fs.copyFileSync; let copyCalls = 0;
  fs.copyFileSync = function (...args) { copyCalls++; return original.apply(this, args); };
  syncBuiltinESMExports();
  try { bundleAssets(options); } finally { fs.copyFileSync = original; syncBuiltinESMExports(); }
  assert.equal(copyCalls, 0);
  put(join(output, 'assets/index-test.js'), 'sentinel');
  put(source, 'changed bytes');
  assert.throws(() => bundleAssets(options), /Conflicting existing asset destination/);
  assert.equal(readFileSync(join(output, 'assets/A.DAX'), 'utf8'), 'same bytes');
  assert.equal(readFileSync(join(output, 'assets/index-test.js'), 'utf8'), 'sentinel');
});

test('metadata-only mode normalizes UNC manifest paths without probing their targets', (t) => {
  const { app, output, put, options } = fixture(t);
  const uncFile = '\\\\server\\share\\NWN\\CPIC1.DAX', uncPalette = '\\\\server\\share\\NWN\\ALWAYS.TLB';
  put(join(app, 'games/nwn.json'), JSON.stringify({ paletteFrom: uncPalette, files: [{ path: uncFile }] }));
  denyTargetAccess(t, ['\\\\server\\share\\']);
  const stats = bundleAssets({ ...options, includeGameAssets: false });
  const manifest = JSON.parse(readFileSync(join(output, 'games/nwn.json'), 'utf8'));
  assert.equal(manifest.paletteFrom, 'ALWAYS.TLB');
  assert.equal(manifest.files[0].path, 'CPIC1.DAX');
  assert.equal(stats.normalizedManifestPaths, 2);
});

test('a later copy failure throws without rolling back earlier copies or touching existing files', (t) => {
  const { app, output, put, options } = fixture(t);
  put(join(options.repoRoot, 'A.DAX'), 'first'); put(join(options.repoRoot, 'B.DAX'), 'second');
  put(join(app, 'games/nwn.json'), JSON.stringify({ files: [{ path: 'A.DAX' }, { path: 'B.DAX' }] }));
  put(join(output, 'assets/index-test.js'), 'pre-existing sentinel');
  const original = fs.copyFileSync; let copyCalls = 0;
  fs.copyFileSync = function (...args) {
    if (++copyCalls === 2) throw new Error('injected copy failure');
    return original.apply(this, args);
  };
  syncBuiltinESMExports();
  try { assert.throws(() => bundleAssets(options), /injected copy failure/); }
  finally { fs.copyFileSync = original; syncBuiltinESMExports(); }
  assert.equal(existsSync(join(output, 'assets/A.DAX')), true);
  assert.equal(existsSync(join(output, 'assets/B.DAX')), false);
  assert.equal(readFileSync(join(output, 'assets/index-test.js'), 'utf8'), 'pre-existing sentinel');
});

test('planned file-directory collisions fail before mutation in both plan orders', (t) => {
  for (const reverse of [false, true]) {
    const { output } = fixture(t), file = { destination: join(output, 'assets/collision'), bytes: Buffer.from('file'), kind: 'write' };
    const child = { destination: join(output, 'assets/collision/child.DAX'), bytes: Buffer.from('child'), kind: 'write' };
    assert.equal(existsSync(join(output, 'assets')), false);
    assert.throws(() => preflightAssetDestinations(output, reverse ? [child, file] : [file, child]), /Conflicting planned asset destination/);
    assert.equal(existsSync(join(output, 'assets')), false);
  }
});
