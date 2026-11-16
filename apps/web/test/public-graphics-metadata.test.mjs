import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { projectPublicGraphicsMetadata, projectPublicRuntimePaths, publicGraphicsMetadataPlugin } from '../scripts/public-graphics-metadata.mjs';

const repo = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const fixtures = [
  'docs/engine/research/cok-graphics-identity-registry-v1.json',
  'docs/engine/research/cok-amiga-atlas-cell-visual-descriptions-v1.json',
  'docs/engine/research/cok-dos-font-glyph-visual-descriptions-v1.json',
  'docs/engine/research/cok-graphics-alias-bindings-v1.json',
  'docs/engine/research/cok-runtime-art-coverage-v2.json',
  'docs/engine/research/cok-runtime-art-combat-sites-v2.json',
  'docs/engine/research/cok-graphics-source-census-v1.json',
  'docs/engine/research/dok-graphics-identity-registry-v1.json',
  'docs/engine/research/dok-graphics-source-roster-v1.json',
  'docs/engine/research/dok-graphics-source-census-v1.json',
  'docs/engine/research/dok-dos-exact-pixel-visual-descriptions-v1.json',
  'docs/engine/research/dok-dos-registry-pixel-visual-descriptions-v1.json',
  'docs/engine/research/cok-graphics-frame-hypotheses-v1.json',
];
const hasMachineRoot = (value) => {
  if (typeof value === 'string') return /(?:^|\s)(?:[a-z]:[\\/]|\\\\|\/(?:Users\/[^/\s]+|home\/[^/\s]+|private\/var\/folders\/[^/\s]+|var\/folders\/[^/\s]+|mnt\/[^/\s]+|Volumes\/[^/\s]+)(?:\/|\b))/i.test(value);
  if (Array.isArray(value)) return value.some(hasMachineRoot);
  if (value && typeof value === 'object') return Object.values(value).some(hasMachineRoot);
  return false;
};
const EXPECTED_PRIVATE_ROOT = /^(?:[a-z]:[\\/]|\\\\|\/(?:Users\/[^/]+|home\/[^/]+|private\/var\/folders\/[^/]+|var\/folders\/[^/]+|mnt\/[^/]+|Volumes\/[^/]+)(?:\/|$))/i;
const EXPECTED_WINDOWS_PATH = /(?<![A-Za-z0-9+./-])(?:[a-z]:[\\/]|\\\\)[^;'"<>]*?\.[a-z0-9]{1,6}(?:#[^\s;'"<>]*)?/gi;
const EXPECTED_POSIX_PATH = /(?<![A-Za-z0-9_.:\/-])\/(?:Users\/[^/;'"<>]+|home\/[^/;'"<>]+|private\/var\/folders\/[^/;'"<>]+|var\/folders\/[^/;'"<>]+|mnt\/[^/;'"<>]+|Volumes\/[^/;'"<>]+)(?:\/[^;'"<>]*)*?\.[a-z0-9]{1,6}(?:#[^\s;'"<>]*)?/gi;
function expectedPublicPath(value) {
  const normalized = value.replace(/\\/g, '/'), at = normalized.indexOf('#');
  const filePath = at < 0 ? normalized : normalized.slice(0, at), fragment = at < 0 ? '' : normalized.slice(at);
  return `${filePath.split('/').filter(Boolean).at(-1) ?? 'local-source'}${fragment}`;
}
function expectedPublicProjection(value) {
  if (typeof value === 'string') return EXPECTED_PRIVATE_ROOT.test(value)
    ? expectedPublicPath(value) : value.replace(EXPECTED_WINDOWS_PATH, expectedPublicPath).replace(EXPECTED_POSIX_PATH, expectedPublicPath);
  if (Array.isArray(value)) return value.map(expectedPublicProjection);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, expectedPublicProjection(child)]));
  }
  return value;
}

test('production graphics metadata projection removes local roots and preserves identity evidence', () => {
  const plugin = publicGraphicsMetadataPlugin(repo);
  for (const relative of fixtures) {
    const path = resolve(repo, relative);
    const source = readFileSync(path, 'utf8');
    const original = JSON.parse(source);
    const transformed = plugin.transform(source, path);
    assert.ok(transformed, `${relative} must be intercepted by the production plugin`);
    assert.equal(transformed.map, null);
    assert.doesNotMatch(transformed.code, /[a-z]:[\\/](?:GoldBoxImg|Modding[\\/]GoldBox|Program Files|Games)[\\/]/i);
    const projected = JSON.parse(transformed.code);
    assert.deepEqual(projected, expectedPublicProjection(original));
    if (/\/(?:cok-graphics-source-census|dok-graphics-[^/]+|(?:cok-dos-font-glyph|dok-dos-exact-pixel)-visual-descriptions)-v1\.json$/.test(relative)) {
      assert.deepEqual(projected, original);
    }
    assert.equal(hasMachineRoot(projected), false);
    if (Array.isArray(original.assets)) {
      assert.equal(projected.assets.length, original.assets.length);
      for (let i = 0; i < original.assets.length; i++) {
        const before = original.assets[i], after = projected.assets[i];
        for (const key of ['id', 'archiveSha256', 'sourceSha256', 'outputSha256', 'locator', 'sha256']) {
          if (Object.hasOwn(before, key)) assert.deepEqual(after[key], before[key], `${relative} assets[${i}].${key}`);
        }
      }
    }
  }
  assert.equal(plugin.transform('{"ok":true}', resolve(repo, 'apps/web/src/other.json')), null);
});

test('absolute source references keep their archive/image basename and locator suffix', () => {
  const projected = projectPublicGraphicsMetadata({
    archive: 'C:/private/install/CPIC1.DAX',
    reference: 'D:\\private\\game\\CPIC1.DAX#57/frame/0',
    webBefore: 'https://example.invalid/home/alice/CPIC1.DAX#57/frame/0',
    posix: '/home/alice/private/game/CPIC1.DAX#57/frame/0',
    evidence: 'Observed at /Users/alice/Library/Gold Box/CPIC1.DAX#57/frame/0 during scan',
    logical: 'relative/CPIC1.DAX#57/frame/0',
    publicUrl: '/assets/CPIC1.DAX#57/frame/0',
    web: 'https://example.invalid/assets/CPIC1.DAX#57/frame/0',
    webPosix: 'https://example.invalid/home/alice/CPIC1.DAX#57/frame/0',
    webHttp: 'http://example.invalid/assets/CPIC1.DAX#57/frame/0',
    embeddedNoBoundary: 'prefix/home/alice/CPIC1.DAX#57/frame/0',
    driveNoBoundary: 'prefixC:/private/install/CPIC1.DAX',
    nested: { locator: '/mnt/c/Users/alice/Gold Box/TITLE.DAX#3' },
  });
  assert.deepEqual(projected, {
    archive: 'CPIC1.DAX',
    reference: 'CPIC1.DAX#57/frame/0',
    webBefore: 'https://example.invalid/home/alice/CPIC1.DAX#57/frame/0',
    posix: 'CPIC1.DAX#57/frame/0',
    evidence: 'Observed at CPIC1.DAX#57/frame/0 during scan',
    logical: 'relative/CPIC1.DAX#57/frame/0',
    publicUrl: '/assets/CPIC1.DAX#57/frame/0',
    web: 'https://example.invalid/assets/CPIC1.DAX#57/frame/0',
    webPosix: 'https://example.invalid/home/alice/CPIC1.DAX#57/frame/0',
    webHttp: 'http://example.invalid/assets/CPIC1.DAX#57/frame/0',
    embeddedNoBoundary: 'prefix/home/alice/CPIC1.DAX#57/frame/0',
    driveNoBoundary: 'prefixC:/private/install/CPIC1.DAX',
    nested: { locator: 'TITLE.DAX#3' },
  });
  const roots = [
    '/Users/alice/Library/CPIC1.DAX#57/frame/0',
    '/home/alice/CPIC1.DAX#57/frame/0',
    '/private/var/folders/ab/CPIC1.DAX#57/frame/0',
    '/var/folders/ab/CPIC1.DAX#57/frame/0',
    '/mnt/c/Users/alice/CPIC1.DAX#57/frame/0',
    '/Volumes/GoldBox/CPIC1.DAX#57/frame/0',
  ];
  for (const path of roots) {
    assert.equal(projectPublicGraphicsMetadata(path), 'CPIC1.DAX#57/frame/0', path);
    assert.equal(projectPublicGraphicsMetadata(`/assets${path}`), `/assets${path}`, `root-relative ${path}`);
    assert.equal(projectPublicGraphicsMetadata(`https://example.invalid${path}`),
      `https://example.invalid${path}`, `HTTP URL ${path}`);
  }
});

test('coverage projection preserves scope, canonical IDs, locators and output evidence', () => {
  const plugin = publicGraphicsMetadataPlugin(repo);
  const path = resolve(repo, 'docs/engine/research/cok-runtime-art-coverage-v2.json');
  const original = JSON.parse(readFileSync(path, 'utf8'));
  const first = original.requests[0];
  first.evidence = 'C:/private/source/cok-ecl-picture-census-2026-11-03.json';
  const transformed = plugin.transform(JSON.stringify(original), path);
  const projected = JSON.parse(transformed.code);
  assert.equal(projected.requests[0].evidence, 'cok-ecl-picture-census-2026-11-03.json');
  assert.equal(projected.runtimeObservation, 'unverified');
  assert.equal(projected.productionPackage, 'unverified');
  assert.equal(projected.summary.combatScan.campaignComplete, false);
  assert.equal(projected.summary.combatScan.variantRetention, 'all-distinct-discovered-rosters');
  assert.equal(projected.summary.combatScan.evidenceScope, 'bounded CoK ECL traversal');
  for (const key of ['inputs', 'sourceAssets', 'mappings', 'outputs', 'frames', 'demoCombat', 'combatEvidence', 'combatBindings']) {
    assert.deepEqual(projected[key], original[key], key);
  }
  assert.equal(projected.requests[0].archiveSha256, first.archiveSha256);
  assert.deepEqual(projected.requests[0].operand, first.operand);
  assert.deepEqual(projected.requests[0].entryWitnesses, first.entryWitnesses);
  assert.equal(hasMachineRoot(projected), false);
  const receiptPath = resolve(repo, original.combatEvidence);
  const rawReceipt = readFileSync(receiptPath, 'utf8');
  const receiptTransform = plugin.transform(rawReceipt, receiptPath);
  assert.deepEqual(JSON.parse(receiptTransform.code), JSON.parse(rawReceipt));
  assert.equal(plugin.transform('{}', resolve(repo, 'docs/engine/research/cok-runtime-art-coverage-v1.json')), null);
});

test('production runtime path projection covers every imported runtime path table', () => {
  const plugin = publicGraphicsMetadataPlugin(repo);
  const modules = [
    'apps/web/src/ui/gameData.ts',
    'apps/web/src/ui/combat.ts',
    'apps/web/src/ui/catalog.ts',
    'apps/web/src/audio/gameAudio.ts',
  ];
  for (const relative of modules) {
    const path = resolve(repo, relative);
    const source = readFileSync(path, 'utf8');
    const transformed = plugin.transform(source, `${path}?v=release-test`);
    assert.ok(transformed, `${relative} must be projected for the app build`);
    const parsed = ts.createSourceFile(relative, transformed.code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    assert.deepEqual(parsed.parseDiagnostics, [], `${relative} must remain parseable TypeScript`);
    const privateLiterals = [];
    const visit = (node) => {
      if (ts.isStringLiteralLike(node) && /^(?:[a-z]:[\\/]|\\\\)/i.test(node.text)) privateLiterals.push(node.text);
      ts.forEachChild(node, visit);
    };
    visit(parsed);
    assert.deepEqual(privateLiterals, [], `${relative} contains a private-root string literal`);
    assert.equal(transformed.code, projectPublicRuntimePaths(source));
  }
  const catalog = plugin.transform(readFileSync(resolve(repo, 'apps/web/src/ui/catalog.ts'), 'utf8'),
    resolve(repo, 'apps/web/src/ui/catalog.ts'));
  assert.match(catalog.code, /id: 'nwn-title',[\s\S]{0,150}path: 'TITLE\.DAX'/);
  assert.match(catalog.code, /id: 'nwn-pic',[\s\S]{0,150}path: 'PIC\.DAX'/);
  assert.match(catalog.code, /id: 'dqk-title',[\s\S]{0,150}path: 'The Dark Queen of Krynn\/DISK1\/TITLE\.TLB'/);

  const audio = plugin.transform(readFileSync(resolve(repo, 'apps/web/src/audio/gameAudio.ts'), 'utf8'),
    resolve(repo, 'apps/web/src/audio/gameAudio.ts'));
  for (const [game, basename] of [['coab', 'SOUNDS.GLB'], ['secret', 'sounds.glb'],
    ['gateway', 'Sounds.glb'], ['treasures', 'Sounds.glb'], ['pools', 'SOUNDS.GLB']]) {
    assert.match(audio.code, new RegExp(`${game}:\\s*'${basename.replace('.', '\\.')}\'`),
      `${game} audio source must remain associated with the same title`);
  }
});

test('runtime path projection handles drive, escaped, UNC, spaced and fragment paths without changing relative URLs', () => {
  const source = String.raw`const forward = 'C:/Gold Box/install/CPIC1.DAX#57/frame/0';
const escaped = "D:\\Games\\Pool with space\\SOUNDS.GLB";
const unc = '\\\\server\\Shared Folder\\TITLE.DAX';
const single = 'E:\\Games\\Legacy\\BIGPIC1.DAX';
const posix = '/home/alice/Gold Box/CPIC1.DAX#57/frame/0';
const rootUrl = '/assets/CPIC1.DAX#57/frame/0';
const embedded = 'evidence at /home/alice/Gold Box/CPIC1.DAX#57/frame/0';
const relative = 'assets/game data/CPIC1.DAX#57/frame/0';
const url = 'https://example.invalid/assets/game.png';
// Keep /home/alice/Gold Box/CPIC1.DAX#57/frame/0 in comments.`;
  const projected = projectPublicRuntimePaths(source);
  assert.match(projected, /forward = 'CPIC1\.DAX#57\/frame\/0'/);
  assert.match(projected, /escaped = "SOUNDS\.GLB"/);
  assert.match(projected, /unc = 'TITLE\.DAX'/);
  assert.match(projected, /single = 'BIGPIC1\.DAX'/);
  assert.match(projected, /posix = 'CPIC1\.DAX#57\/frame\/0'/);
  assert.match(projected, /rootUrl = '\/assets\/CPIC1\.DAX#57\/frame\/0'/);
  assert.match(projected, /embedded = 'evidence at \/home\/alice\/Gold Box\/CPIC1\.DAX#57\/frame\/0'/);
  assert.match(projected, /\/\/ Keep \/home\/alice\/Gold Box\/CPIC1\.DAX#57\/frame\/0 in comments\./i);
  assert.match(projected, /relative = 'assets\/game data\/CPIC1\.DAX#57\/frame\/0'/);
  assert.match(projected, /url = 'https:\/\/example\.invalid\/assets\/game\.png'/);
  const parsed = ts.createSourceFile('fixture.ts', projected, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.deepEqual(parsed.parseDiagnostics, []);
});
