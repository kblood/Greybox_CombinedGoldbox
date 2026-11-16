// Package only the hash-pinned DOS CoK TILES.DAX #1/#2 source and reviewed
// Restyle PNGs. Prompt provenance remains unknown; this is not runtime admission.
import { createHash } from 'node:crypto';
import {
  closeSync, lstatSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePng } from './restyle-png.mjs';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(WEB, '../..');
export const COK_DOS_TILES_001_PREVIEW_CONTRACT = Object.freeze({
  archiveSha256: '9e383adc1638e6202726df41a8c42640e446a17c8a9c1e9df45b8ba0d478b205',
  ledgerSha256: 'd1e307beb41b80725727e9371e17d1aa701be0e1f55e85b51dc6239c4f66d359',
  blockTiles: Object.freeze({ 1: 26, 2: 22 }),
  total: 48,
});
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function contains(root, path) {
  const rel = relative(root, path);
  return !rel || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

// Check all path components; never follow links or consume multiply-linked files.
function ordinary(path, directory, allowMissing = false) {
  const parent = dirname(path);
  if (parent !== path) ordinary(parent, true, allowMissing);
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())
        || (!directory && stat.nlink !== 1)) {
      throw new Error(`Expected unlinked regular ${directory ? 'directory' : 'file'}: ${path}`);
    }
    return stat;
  } catch (error) {
    if (allowMissing && error.code === 'ENOENT') return null;
    throw error;
  }
}

function expectedId(block, tile) { return `cok/dos-ega/tiles.dax/block/${block}/tile/${tile}`; }
function expectedRestyleId(block, tile) { return `restyle/cok-dos-tiles-001-${String(block).padStart(3, '0')}-${String(tile).padStart(3, '0')}`; }
function sourceRelative(block, tile) {
  const bank = `TILES_${String(block).padStart(3, '0')}`;
  return join('dos_tile_render', 'TILES', bank, `${bank}_tile_${String(tile).padStart(3, '0')}.png`);
}
function outputRelative(globalIndex) {
  return join('done', `CoK_DOS_TILES_001_tile_${String(globalIndex).padStart(3, '0')}_restyle.png`);
}
function samePath(actual, expected) {
  return typeof actual === 'string' && resolve(actual).toLowerCase() === resolve(expected).toLowerCase();
}

function validateUnknownPrompt(prompt, restyleId) {
  if (!prompt || prompt.status !== 'unknown'
      || ['batch', 'path', 'sha256', 'textSha256', 'inputPath', 'inputSha256', 'text'].some((key) => prompt[key] != null)
      || !Array.isArray(prompt.references) || prompt.references.length !== 0
      || !Array.isArray(prompt.referenceAssetIds) || prompt.referenceAssetIds.length !== 0) {
    throw new Error(`${restyleId}: prompt provenance must remain explicitly unknown`);
  }
}

/**
 * Validate and package all 48 TILES #1/#2 source/output images into one candidate.
 * contractOverrides only exist for synthetic unit fixtures. The CLI/build uses the
 * immutable production pins and complete 48-locator roster.
 */
export function bundleCokDosTiles001Previews(sourceRoot, candidateRoot, registry, {
  archivePath = resolve(REPO, 'Champions of Krynn/TILES.DAX'),
  ledgerPath = join(resolve(sourceRoot), 'dos_tiles_001_48_provenance.json'),
  contract = COK_DOS_TILES_001_PREVIEW_CONTRACT,
} = {}) {
  const source = resolve(sourceRoot), candidate = resolve(candidateRoot);
  archivePath = resolve(archivePath); ledgerPath = resolve(ledgerPath);
  ordinary(source, true); ordinary(candidate, true);
  if (contains(source, candidate) || contains(candidate, source)) throw new Error('Source and candidate roots must not overlap');
  ordinary(archivePath, false); ordinary(ledgerPath, false);
  const archiveBytes = readFileSync(archivePath);
  if (sha(archiveBytes) !== contract.archiveSha256) throw new Error('TILES.DAX SHA-256 differs from pin');
  const ledgerBytes = readFileSync(ledgerPath);
  if (sha(ledgerBytes) !== contract.ledgerSha256) throw new Error('TILES provenance ledger SHA-256 differs from pin');
  const ledger = JSON.parse(ledgerBytes.toString('utf8'));
  const expectedCounts = contract.blockTiles;
  if (ledger.asset_family !== 'DOS Champions of Krynn TILES.DAX' || ledger.bank !== 'TILES_001'
      || ledger.status !== 'saved-reviewed' || ledger.tile_count !== contract.total
      || JSON.stringify(ledger.source_block_counts) !== JSON.stringify({ 1: expectedCounts[1], 2: expectedCounts[2] })
      || JSON.stringify(ledger.grid) !== '[8,6]' || JSON.stringify(ledger.tile_size) !== '[96,96]'
      || ledger.cell_order !== 'global row-major index: block 1 tiles 000-025, then block 2 tiles 000-021'
      || !Array.isArray(ledger.outputs) || ledger.outputs.length !== contract.total) {
    throw new Error('TILES provenance ledger metadata/roster differs from pinned contract');
  }
  if (!Number.isSafeInteger(expectedCounts[1]) || !Number.isSafeInteger(expectedCounts[2])
      || expectedCounts[1] !== 26 || expectedCounts[2] !== 22 || contract.total !== 48) {
    throw new Error('Invalid expected TILES locator roster');
  }
  if (!Array.isArray(registry?.assets) || !Array.isArray(registry?.restyles)) throw new Error('Missing registry assets/restyles');
  const assetMap = new Map(registry.assets.map((asset) => [asset.id, asset]));
  const restyleMap = new Map(registry.restyles.map((restyle) => [restyle.id, restyle]));
  if (assetMap.size !== registry.assets.length || restyleMap.size !== registry.restyles.length) throw new Error('Duplicate registry asset/Restyle ID');

  const provenanceRef = `${resolve(ledgerPath).replaceAll('\\', '/')}`;
  const previews = new Map(), locators = new Set();
  for (let globalIndex = 0; globalIndex < contract.total; globalIndex++) {
    const block = globalIndex < expectedCounts[1] ? 1 : 2;
    const tile = globalIndex < expectedCounts[1] ? globalIndex : globalIndex - expectedCounts[1];
    const id = expectedId(block, tile), restyleId = expectedRestyleId(block, tile);
    const row = ledger.outputs[globalIndex];
    if (!row || row.global_index !== globalIndex || row.source_block !== block || row.source_tile_index !== tile
        || row.status !== 'saved-reviewed' || JSON.stringify(row.size) !== '[96,96]') {
      throw new Error(`Provenance locator/status/geometry mismatch at row ${globalIndex}`);
    }
    const expectedSource = join(source, sourceRelative(block, tile));
    const expectedOutput = join(source, outputRelative(globalIndex));
    if (!samePath(row.source, expectedSource) || !samePath(row.output, expectedOutput)) {
      throw new Error(`Provenance source/output path mismatch at row ${globalIndex}`);
    }
    const sourcePath = resolve(expectedSource), outputPath = resolve(expectedOutput);
    ordinary(sourcePath, false); ordinary(outputPath, false);
    const sourceBytes = readFileSync(sourcePath), outputBytes = readFileSync(outputPath);
    const sourceHash = sha(sourceBytes), outputHash = sha(outputBytes);
    if (JSON.stringify(validatePng(sourcePath)) !== '[96,96]') throw new Error(`TILES source preview must be 96x96: ${id}`);
    if (JSON.stringify(validatePng(outputPath)) !== '[96,96]') throw new Error(`TILES Restyle preview must be 96x96: ${id}`);

    const asset = assetMap.get(id), locator = asset?.locator, decoded = asset?.decoded;
    if (!asset || asset.game !== 'cok' || asset.edition !== 'DOS install' || asset.platform !== 'DOS-EGA'
        || asset.identityStatus !== 'source-pinned' || asset.archive?.name !== 'TILES.DAX'
        || asset.archive?.path !== 'Champions of Krynn/TILES.DAX' || asset.archive?.sha256 !== contract.archiveSha256
        || locator?.kind !== 'tile' || locator.blockId !== block || locator.entryIndex !== block - 1
        || locator.tileIndex !== tile
        || locator.frameIndex !== null || locator.cellIndex !== null
        || decoded?.sha256 !== sourceHash || decoded?.path !== `external-source/${sourceHash}.png`
        || decoded?.width !== 24 || decoded?.height !== 24 || !/^[a-f0-9]{64}$/.test(decoded?.pixelSha256 ?? '')) {
      throw new Error(`Registry TILES source identity/decoded hash mismatch: ${id}`);
    }
    const restyle = restyleMap.get(restyleId);
    validateUnknownPrompt(restyle?.prompt, restyleId);
    if (!restyle || JSON.stringify(restyle.sourceAssetIds) !== JSON.stringify([id])
        || restyle.sourceRelation !== 'one-to-one' || restyle.reviewStatus !== 'generated'
        || !Array.isArray(restyle.outputs) || restyle.outputs.length !== 1
        || restyle.outputs[0].sha256 !== outputHash || !samePath(restyle.outputs[0].path, expectedOutput)
        || restyle.outputs[0].role !== 'raw-generation') {
      throw new Error(`Registry TILES Restyle mapping/hash/status mismatch: ${restyleId}`);
    }
    const refs = restyle.externalReferences;
    if (!Array.isArray(refs) || refs.length !== 1 || refs[0].system !== 'cok-dos-tiles-provenance-v1'
        || refs[0].id !== `tiles-001-${String(block).padStart(3, '0')}-${String(tile).padStart(3, '0')}`
        || refs[0].reference !== `${provenanceRef}#outputs/${globalIndex}`) {
      throw new Error(`Registry TILES provenance reference mismatch: ${restyleId}`);
    }
    if (locators.has(id)) throw new Error(`Duplicate TILES locator: ${id}`);
    locators.add(id);
    for (const [hash, bytes, reference] of [[sourceHash, sourceBytes, `source:${id}`], [outputHash, outputBytes, `output:${restyleId}`]]) {
      const preview = previews.get(hash) ?? { sha256: hash, bytes, references: [] };
      if (!preview.bytes.equals(bytes)) throw new Error(`Conflicting bytes share TILES preview hash ${hash}`);
      preview.references.push(reference); previews.set(hash, preview);
    }
  }

  if (locators.size !== contract.total) throw new Error(`TILES locator roster is incomplete: ${locators.size}/${contract.total}`);
  const directory = join(candidate, 'restyle', 'cok-generated', 'images');
  ordinary(directory, true, true);
  const plan = [...previews.values()].sort((a, b) => compare(a.sha256, b.sha256)).map((preview) => {
    const path = join(directory, `${preview.sha256}.png`), existing = ordinary(path, false, true);
    if (existing && sha(readFileSync(path)) !== preview.sha256) throw new Error(`Conflicting candidate preview: ${preview.sha256}`);
    return { ...preview, path, existing: Boolean(existing) };
  });
  const created = [];
  try {
    if (plan.some((row) => !row.existing)) mkdirSync(directory, { recursive: true });
    for (const preview of plan) {
      if (preview.existing) continue;
      ordinary(directory, true);
      const fd = openSync(preview.path, 'wx');
      created.push(preview.path);
      try { writeFileSync(fd, preview.bytes); } finally { closeSync(fd); }
      if (sha(readFileSync(preview.path)) !== preview.sha256) throw new Error(`Written TILES preview hash differs: ${preview.sha256}`);
    }
  } catch (error) {
    for (const path of created.reverse()) unlinkSync(path);
    throw error;
  }
  return { sourceRows: locators.size, restyleRows: locators.size, uniquePreviews: plan.length,
    copied: plan.filter((row) => !row.existing).length, skipped: plan.filter((row) => row.existing).length,
    previews: plan.map((row) => ({ sha256: row.sha256, references: row.references.sort(compare),
      destination: `restyle/cok-generated/images/${row.sha256}.png`, status: row.existing ? 'existing' : 'copied' })) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: node bundle-cok-dos-tiles-001-previews.mjs <candidate-root> <source-root>');
    const registryPath = resolve(WEB, '../../docs/engine/research/cok-graphics-identity-registry-v1.json');
    ordinary(registryPath, false);
    const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
    console.log(JSON.stringify(bundleCokDosTiles001Previews(process.argv[3], process.argv[2], registry), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
