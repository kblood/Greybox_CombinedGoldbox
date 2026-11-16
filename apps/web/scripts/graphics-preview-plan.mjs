// Read-only preview coverage audit. Never packages files or starts a server/browser.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCokGeneratedInventory } from '../src/ui/cok-generated-inventory.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const unique = (values) => [...new Set(values)];

// Mirrors graphicsBrowser.ts normalization, including its first matching curated row.
export function normalizeGraphicsSourcePath(path) {
  let value = path.replace(/\\/g, '/').toLocaleLowerCase().replace(/^[a-z]:\//, '');
  const work = value.indexOf('cok_restyle_work/');
  if (work >= 0) value = value.slice(work + 'cok_restyle_work/'.length);
  if (value.startsWith('renders/')) value = value.slice('renders/'.length);
  if (value.startsWith('amiga_render_all/')) value = value.slice('amiga_render_all/'.length);
  return value;
}

function candidates(path, hash) {
  const result = [];
  if (hash) result.push(`restyle/cok-generated/images/${hash}.png`);
  if (path && !/^[A-Za-z]:[\\/]/.test(path)) {
    const value = path.replace(/^\/+/, '');
    result.push(`restyle/${value}`, `restyle/cok/${value}`);
  }
  return unique(result);
}

function safeRelative(path) {
  let decoded;
  try { decoded = decodeURIComponent(path).replace(/\\/g, '/'); }
  catch { return null; }
  // Refuse traversal, URL modifiers and schemes before filesystem access. A browser
  // URL may encode spaces, but a literal percent remains unsafe/ambiguous here.
  if (!decoded || /^[\/]/.test(decoded) || /[:?#%\x00-\x1f]/.test(decoded)
      || decoded.split('/').some((part) => part === '..' || part === '.' || /[. ]$/.test(part))) return null;
  return decoded;
}

function readCandidate(root, path) {
  const safe = safeRelative(path);
  if (!safe) return { state: 'conflicting', reason: 'unsafe-path' };
  const absolute = resolve(root, safe), rel = relative(root, absolute);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return { state: 'conflicting', reason: 'outside-candidate' };
  }
  try {
    let current = root;
    const parts = rel.split(sep);
    for (let i = 0; i < parts.length; i++) {
      current = resolve(current, parts[i]);
      const stat = lstatSync(current);
      if (stat.isSymbolicLink()) return { state: 'conflicting', reason: 'linked-path' };
      if (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile()) {
        return { state: 'conflicting', reason: 'unexpected-file-type' };
      }
    }
    return { bytes: readFileSync(absolute) };
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return { state: 'missing' };
    return { state: 'conflicting', reason: `read-error:${error.code ?? 'unknown'}` };
  }
}

/** One row per expected PNG hash, retaining every source/output reference and its
 * own ordered browser candidates. The first non-missing candidate determines
 * coverage; later conflicts remain diagnostics without overriding an earlier
 * exact match. An unsafe/unreadable earlier path fails closed because its browser
 * result cannot be established. The browser itself does not verify image hashes.
 * Available means byte coverage only, not PNG validity or browser acceptance.
 */
export function planGraphicsPreviews(registry, candidateRoot) {
  const root = resolve(candidateRoot), rootStat = lstatSync(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('Candidate root must be an ordinary directory');
  if (!Array.isArray(registry.assets) || !Array.isArray(registry.restyles)) throw new Error('Invalid registry collections');
  const manifest = readCandidate(root, 'restyle/manifest.json');
  let curated = [], manifestState = manifest.state ?? 'available';
  if (manifest.bytes) {
    try {
      const parsed = JSON.parse(manifest.bytes.toString('utf8'));
      if (!Array.isArray(parsed.items) || parsed.items.some((item) => !item || typeof item !== 'object')) throw new Error('Invalid items');
      curated = parsed.items;
    } catch { manifestState = 'conflicting'; }
  }
  const groups = new Map(), noPreview = [], checks = new Map();
  function add(kind, id, decoded, outputIndex, extraCandidates = []) {
    const reference = { kind, id, ...(outputIndex === undefined ? {} : { outputIndex }) };
    if (!decoded) {
      noPreview.push({ key: `${kind}:${id}`, sha256: null, state: 'unresolved-no-decoded-preview',
        reason: 'no-decoded-image-recorded', references: [{ ...reference, candidates: [] }] });
      return;
    }
    const hash = decoded.sha256;
    if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/i.test(hash)) throw new Error(`Invalid preview SHA-256: ${kind}:${id}`);
    const path = decoded.path ?? '';
    if (typeof path !== 'string') throw new Error(`Invalid preview path: ${kind}:${id}`);
    const paths = candidates(path, hash);
    if (kind === 'source' && path) {
      const match = curated.find((item) => typeof item.src === 'string' && typeof item.stem === 'string' && item.src && item.stem
        && normalizeGraphicsSourcePath(item.src) === normalizeGraphicsSourcePath(path));
      if (match) paths.push(`restyle/orig/${match.stem}.png`);
    }
    paths.push(...extraCandidates);
    const expected = hash.toLowerCase();
    const examined = unique(paths).map((candidate) => {
      if (!checks.has(candidate)) {
        const result = readCandidate(root, candidate);
        checks.set(candidate, result.bytes ? { sha256: sha(result.bytes) } : result);
      }
      const result = checks.get(candidate);
      return { path: candidate, ...(result.sha256
        ? { state: result.sha256 === expected ? 'available' : 'conflicting', actualSha256: result.sha256,
          ...(result.sha256 === expected ? {} : { reason: 'sha256-mismatch' }) }
        : result) };
    });
    const state = examined.find((row) => row.state !== 'missing')?.state ?? 'missing';
    const group = groups.get(expected) ?? { key: `sha256:${expected}`, sha256: expected, references: [] };
    group.references.push({ ...reference, state, candidates: examined });
    groups.set(expected, group);
  }
  for (const asset of registry.assets) add('source', asset.id, asset.decoded);
  const assets = new Map(registry.assets.map((asset) => [asset.id, asset]));
  for (const restyle of registry.restyles) {
    for (const [index, output] of (restyle.outputs ?? []).entries()) {
      // Same join/order as graphicsBrowser.ts: source membership + reference
      // system/output SHA + manifest ID. Do not infer a match from the filename.
      const references = (restyle.sourceAssetIds ?? []).flatMap((id) => assets.get(id)?.galleryReferences ?? [])
        .filter((reference) => reference.system === 'cok-curated-restyle-v1'
          && typeof reference.outputSha256 === 'string' && typeof output.sha256 === 'string'
          && reference.outputSha256.toLowerCase() === output.sha256.toLowerCase())
        .sort((a, b) => compare(a.id, b.id));
      const paths = [];
      for (const reference of references) {
        const match = curated.find((item) => item.id === reference.id);
        if (typeof match?.stem === 'string' && /^[A-Za-z0-9_-]+$/.test(match.stem)) paths.push(`restyle/out/${match.stem}.png`);
      }
      add('restyle-output', restyle.id, output, index, paths);
    }
  }
  const hasGeneratedLinks = registry.restyles.some((restyle) => (restyle.externalReferences ?? [])
    .some((reference) => reference.system === 'cok-restyle-inventory-v1'));
  const generatedManifest = readCandidate(root, 'restyle/cok-generated/manifest.json');
  if (hasGeneratedLinks && !generatedManifest.bytes) {
    throw new Error(`Generated Restyle inventory is required for exact animation preview coverage (${generatedManifest.reason ?? 'missing manifest'})`);
  }
  if (generatedManifest.bytes) {
    let inventory;
    try { inventory = validateCokGeneratedInventory(JSON.parse(generatedManifest.bytes.toString('utf8'))); }
    catch (error) { throw new Error(`Invalid packaged CoK Restyle inventory: ${error instanceof Error ? error.message : String(error)}`); }
    for (const item of inventory.assets) {
      for (const animation of item.animations) {
        for (const [frameId, frame] of Object.entries(animation.frames)) {
          add('animation-frame', `${item.id}/${animation.id}/${frameId}`, {
            path: `images/${frame.sha256}.png`, sha256: frame.sha256,
          });
        }
      }
    }
  }
  const records = [...groups.values()].map((group) => {
    group.references.sort((a, b) => compare(a.kind, b.kind) || compare(a.id, b.id) || (a.outputIndex ?? -1) - (b.outputIndex ?? -1));
    group.state = group.references.some((ref) => ref.state === 'conflicting') ? 'conflicting'
      : group.references.some((ref) => ref.state === 'missing') ? 'missing' : 'available';
    return group;
  }).concat(noPreview).sort((a, b) => compare(a.key, b.key));
  const counts = { available: 0, missing: 0, conflicting: 0, 'unresolved-no-decoded-preview': 0 };
  for (const row of records) counts[row.state]++;
  return { version: 1, candidateRoot: root, curatedManifest: { state: manifestState },
    counts, records, limitations: ['Byte coverage only; no PNG decoding, browser acceptance, runtime admission or release approval.',
      'Missing decoded metadata is reported separately; it is not proof that a preview cannot be produced.'] };
}

/** Fail the package on unresolved exact-byte coverage. Unknown decoded metadata
 * remains explicit and never becomes an available preview or admission claim.
 */
export function requireResolvedGraphicsPreviews(plan) {
  const counts = plan?.counts;
  for (const state of ['available', 'missing', 'conflicting', 'unresolved-no-decoded-preview']) {
    if (!Number.isSafeInteger(counts?.[state]) || counts[state] < 0) throw new Error('Invalid graphics preview coverage counts');
  }
  if (counts.missing || counts.conflicting) {
    throw new Error(`Graphics preview coverage incomplete: ${counts.missing} missing, ${counts.conflicting} conflicting; ${counts['unresolved-no-decoded-preview']} without decoded metadata remain unresolved`);
  }
  return { ...counts };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const required = process.argv[4] === '--require-resolved';
    if (process.argv.length !== 4 && !(process.argv.length === 5 && required)) {
      throw new Error('Usage: node graphics-preview-plan.mjs <registry.json> <candidate-root> [--require-resolved]');
    }
    const registry = JSON.parse(readFileSync(resolve(process.argv[2]), 'utf8'));
    const plan = planGraphicsPreviews(registry, process.argv[3]);
    if (required) {
      console.log(JSON.stringify({ candidateRoot: plan.candidateRoot, counts: plan.counts }));
      requireResolvedGraphicsPreviews(plan);
    } else console.log(JSON.stringify(plan, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
