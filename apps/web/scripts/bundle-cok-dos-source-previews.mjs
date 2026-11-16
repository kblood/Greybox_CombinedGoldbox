// Package source previews only. No Restyle admission, game-data mutation or decoding claim.
// Source PNG/archive joins were independently verified by import_cok_dos_tiles_registry.py.
import { createHash } from 'node:crypto';
import { closeSync, lstatSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePng } from './restyle-png.mjs';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = 'dos_tile_alias_coverage.json';
const SCOPE = 'DOS CoK individual 8X8D1/8X8D2/8X8D3 tile renders';
const ALIAS_STATUS = 'covered-by-reviewed-cross-platform-exact-source';
const ALIAS_FAMILIES = new Set(['Amiga CoK 8X8D0', 'Amiga CoK 8X8D2', 'Amiga 8X8D0',
  'Amiga 8X8D2', 'Amiga CoK 8X8D2 block 152']);
const UNALIASED_STATUSES = new Set(['covered-by-reviewed-generated-restyle',
  'covered-by-reviewed-generated-imagegen-restyle']);
const ARCHIVES = Object.freeze({
  '8X8D1': Object.freeze({ disk: 1, sha256: '14fd0bed83d383deca6195e3145145ad0ab4c58a5939a6e6fc0d3efc8c4bc915' }),
  '8X8D2': Object.freeze({ disk: 2, sha256: '0ddd323d8732b5fce0a0f1fdc07f10b0a77bd3709b27d1d0c98f47f487685649' }),
  '8X8D3': Object.freeze({ disk: 3, sha256: '069e54395cc51f705ec5576e9f3d29199f3baf56d5848fb2176d7395897aa2c9' }),
});
export const COK_DOS_SOURCE_PREVIEW_CONTRACT = Object.freeze({
  ledgerSha256: '59f9f9b6fafd64cc61efd2072bcde0ab55d0eb4e82d3967562e702d48b0377c9',
  familyRows: Object.freeze({ '8X8D1': 433, '8X8D2': 630, '8X8D3': 630 }),
});
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function contains(root, path) {
  const rel = relative(root, path);
  return !rel || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

// Inspect every ancestor, including parents above the supplied root. Never follow
// a symlink/junction while reading sources or preparing candidate destinations.
function ordinary(path, directory, allowMissing = false) {
  const parent = dirname(path);
  if (parent !== path) ordinary(parent, true, allowMissing);
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())
        || (!directory && stat.nlink !== 1)) throw new Error(`Expected unlinked regular ${directory ? 'directory' : 'file'}: ${path}`);
    return stat;
  } catch (error) {
    if (allowMissing && error.code === 'ENOENT') return null;
    throw error;
  }
}

function sourcePath(root, value) {
  if (typeof value !== 'string' || !value || /[\x00-\x1f%?#]/.test(value)
      || value.replace(/\\/g, '/').split('/').some((part) => part === '..' || part === '.' || /[. ]$/.test(part))) {
    throw new Error('Unsafe coverage source path');
  }
  const path = resolve(root, value);
  if (!contains(root, path) || path === root) throw new Error('Coverage source path escapes source root');
  ordinary(path, false);
  return path;
}

/** All source and destination validation precedes writes. The optional contract
 * is solely a dependency-injection seam for synthetic fixtures; CLI/build always
 * use the immutable reviewed ledger pin and complete 1,693-row production roster.
 * Archive pins and scope cannot be overridden. Existing files are never replaced.
 */
export function bundleCokDosSourcePreviews(sourceRoot, candidateRoot, registry,
  contract = COK_DOS_SOURCE_PREVIEW_CONTRACT) {
  const source = resolve(sourceRoot), output = resolve(candidateRoot);
  ordinary(source, true); ordinary(output, true);
  if (contains(source, output) || contains(output, source)) throw new Error('Source and candidate roots must not overlap');
  const ledgerPath = join(source, LEDGER); ordinary(ledgerPath, false);
  const ledgerBytes = readFileSync(ledgerPath);
  if (sha(ledgerBytes) !== contract.ledgerSha256) throw new Error('Coverage ledger SHA-256 differs from pin');
  const ledger = JSON.parse(ledgerBytes.toString('utf8'));
  if (ledger.source_scope !== SCOPE) throw new Error('Unexpected coverage ledger scope');
  if (Object.keys(contract.familyRows).sort().join(',') !== Object.keys(ARCHIVES).sort().join(',')
      || Object.values(contract.familyRows).some((count) => !Number.isSafeInteger(count) || count < 0)) throw new Error('Invalid expected family roster');
  const total = Object.values(contract.familyRows).reduce((sum, value) => sum + value, 0);
  if (!Array.isArray(ledger.entries) || ledger.entries.length !== total
      || ledger.total_source_tiles !== total || ledger.covered_source_tiles !== total || ledger.missing_source_tiles !== 0) {
    throw new Error('Coverage ledger totals differ from pinned roster');
  }
  if (!Array.isArray(registry.assets)) throw new Error('Missing registry assets');
  const assets = new Map(registry.assets.map((asset) => [asset.id, asset]));
  if (assets.size !== registry.assets.length) throw new Error('Duplicate registry source ID');
  const seen = new Set(), families = { '8X8D1': 0, '8X8D2': 0, '8X8D3': 0 }, previews = new Map();
  const aliasedSourceAssetIds = [];
  for (const row of ledger.entries) {
    const archive = ARCHIVES[row.family];
    if (!archive || row.platform !== 'DOS CoK' || !Number.isSafeInteger(row.block) || row.block < 0
        || !Number.isSafeInteger(row.tile_index) || row.tile_index < 0
        || JSON.stringify(row.source_size) !== '[32,32]') throw new Error('Invalid coverage tile locator/geometry');
    const id = `cok/dos-ega/disk${archive.disk}/${row.family.toLowerCase()}.dax/block/${row.block}/tile/${row.tile_index}`;
    if (seen.has(id)) throw new Error(`Duplicate coverage locator: ${id}`);
    seen.add(id); families[row.family]++;
    const asset = assets.get(id), locator = asset?.locator, decoded = asset?.decoded;
    if (!asset || asset.game !== 'cok' || asset.platform !== 'DOS-EGA' || asset.identityStatus !== 'source-pinned'
        || asset.archive?.name !== `${row.family}.DAX` || asset.archive?.path !== `Champions of Krynn/${row.family}.DAX`
        || asset.archive?.sha256 !== archive.sha256 || locator?.kind !== 'tile'
        || locator.blockId !== row.block || locator.tileIndex !== row.tile_index
        || locator.frameIndex !== null || locator.cellIndex !== null || locator.entryIndex != null
        || decoded?.width !== 8 || decoded?.height !== 8 || !/^[a-f0-9]{64}$/.test(decoded?.sha256 ?? '')) {
      throw new Error(`Registry source identity/archive/decoded geometry differs: ${id}`);
    }
    if (row.status === ALIAS_STATUS && typeof row.restyle_alias_family === 'string'
        && ALIAS_FAMILIES.has(row.restyle_alias_family)) {
      // These canonical DOS tiles intentionally retain the exact matched gallery
      // preview hash, which need not equal the DOS 32x32 render bytes. The preceding
      // generated-inventory step owns those alias images; never replace their hash
      // with the raw DOS render or count them as newly packaged source previews.
      aliasedSourceAssetIds.push(id);
      continue;
    }
    if (!UNALIASED_STATUSES.has(row.status) || row.restyle_alias_family != null) {
      throw new Error(`Unexpected coverage alias/status combination: ${id}`);
    }
    const path = sourcePath(source, row.source), bytes = readFileSync(path), hash = sha(bytes);
    if (hash !== decoded.sha256) throw new Error(`Source PNG SHA-256 differs from registry: ${id}`);
    if (JSON.stringify(validatePng(path)) !== '[32,32]') throw new Error(`Source PNG is not a 32x32 tile preview: ${id}`);
    const preview = previews.get(hash) ?? { sha256: hash, sourceAssetIds: [], bytes };
    preview.sourceAssetIds.push(id); previews.set(hash, preview);
  }
  if (Object.keys(families).some((family) => families[family] !== contract.familyRows[family])) throw new Error('Coverage family counts differ from pinned roster');

  const directory = join(output, 'restyle', 'cok-generated', 'images');
  ordinary(directory, true, true);
  const plan = [...previews.values()].sort((a, b) => compare(a.sha256, b.sha256)).map((preview) => {
    preview.sourceAssetIds.sort(compare);
    const path = join(directory, `${preview.sha256}.png`), existing = ordinary(path, false, true);
    if (existing && sha(readFileSync(path)) !== preview.sha256) throw new Error(`Conflicting candidate preview: ${preview.sha256}`);
    return { ...preview, path, existing: Boolean(existing) };
  });
  // Nothing is created for an already complete candidate.
  const created = [];
  try {
    if (plan.some((preview) => !preview.existing)) mkdirSync(directory, { recursive: true });
    for (const preview of plan) {
      if (preview.existing) continue;
      ordinary(directory, true);
      // Exclusive creation also refuses a destination introduced after preflight.
      const fd = openSync(preview.path, 'wx');
      created.push(preview.path);
      try { writeFileSync(fd, preview.bytes); } finally { closeSync(fd); }
      if (sha(readFileSync(preview.path)) !== preview.sha256) throw new Error('Written preview hash differs');
    }
  } catch (error) {
    for (const path of created.reverse()) unlinkSync(path);
    throw error;
  }
  return { sourceRows: seen.size, aliasedRowsSkipped: aliasedSourceAssetIds.length,
    aliasedSourceAssetIds: aliasedSourceAssetIds.sort(compare), unaliasedRows: seen.size - aliasedSourceAssetIds.length,
    uniquePreviews: plan.length,
    copied: plan.filter((row) => !row.existing).length, skipped: plan.filter((row) => row.existing).length,
    previews: plan.map((row) => ({ sha256: row.sha256, sourceAssetIds: row.sourceAssetIds,
      destination: `restyle/cok-generated/images/${row.sha256}.png`, status: row.existing ? 'existing' : 'copied' })) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 5 || process.argv[3] !== '--source-root') {
      throw new Error('Usage: node bundle-cok-dos-source-previews.mjs <candidate-root> --source-root <source-root>');
    }
    const path = resolve(WEB, '../../docs/engine/research/cok-graphics-identity-registry-v1.json');
    ordinary(path, false);
    const registry = JSON.parse(readFileSync(path, 'utf8'));
    console.log(JSON.stringify(bundleCokDosSourcePreviews(process.argv[4], process.argv[2], registry), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
