// Read-only worktree source/disposition and static dependency audit. This never builds, tests,
// stages, or deploys. Reports go to stdout unless an external --output is selected.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostname } from 'node:os';
import ts from 'typescript';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, '../../..');
const POLICY = 'docs/engine/data/greybox-release-source-policy-v1.json';
const SNAPSHOTS = ['apps/web/dist-app-cok18/', 'apps/web/dist-app-cok57/'];

function inside(root, path) {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}
const samePath = (left, right) => process.platform === 'win32'
  ? resolve(left).toLowerCase() === resolve(right).toLowerCase() : resolve(left) === resolve(right);

function statIdentity(stat) {
  return [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
}

function inspectPathTree(absolutePath, leafKind) {
  const absolute = resolve(absolutePath), { root: volumeRoot } = parse(absolute);
  const parts = relative(volumeRoot, absolute).split(sep).filter(Boolean);
  const rootStat = lstatSync(volumeRoot, { bigint: true });
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error(`Filesystem root is not an ordinary directory: ${volumeRoot}`);
  let cursor = volumeRoot;
  for (let index = 0; index < parts.length; index++) {
    cursor = resolve(cursor, parts[index]);
    const leaf = index === parts.length - 1;
    let stat;
    try { stat = lstatSync(cursor, { bigint: true }); }
    catch (error) {
      if (leaf && leafKind === 'absent' && error.code === 'ENOENT') return;
      throw new Error(`Path component is missing or inaccessible: ${cursor}`);
    }
    // Node classifies supported Windows junctions as symlinks; it does not expose arbitrary raw reparse tags.
    if (stat.isSymbolicLink()) throw new Error(`Symlink or Windows junction in path: ${cursor}`);
    if (!leaf && !stat.isDirectory()) throw new Error(`Path ancestor is not a directory: ${cursor}`);
    if (leaf && leafKind === 'directory' && !stat.isDirectory()) throw new Error(`Path is not a directory: ${cursor}`);
    if (leaf && leafKind === 'file' && !stat.isFile()) throw new Error(`Path is not an ordinary file: ${cursor}`);
    if (leaf && leafKind === 'absent') throw new Error(`Output already exists: ${cursor}`);
  }
  if (!parts.length && leafKind !== 'directory') throw new Error(`Path is not an ordinary ${leafKind}: ${absolute}`);
}

// Descriptor/path identity checks detect observed replacement, but cannot pin all ancestors atomically.
export function captureFixedPolicy(root) {
  const canonicalRoot = realpathSync(root), policyPath = resolve(canonicalRoot, POLICY);
  if (!inside(canonicalRoot, policyPath)) throw new Error('Policy path escapes repository');
  inspectPathTree(policyPath, 'file');
  if (!samePath(realpathSync(policyPath), policyPath)) throw new Error('Policy path is not canonically contained');
  const before = lstatSync(policyPath, { bigint: true });
  const fd = openSync(policyPath, constants.O_RDONLY | (process.platform === 'win32' ? 0
    : ((constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0))));
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (!opened.isFile() || statIdentity(opened) !== statIdentity(before)) throw new Error('Policy changed before capture');
    if (before.size > 64n * 1024n * 1024n || before.size > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Policy exceeds the capture limit');
    const capture = Buffer.alloc(Number(before.size) + 1);
    let length = 0, count;
    while (length < capture.length && (count = readSync(fd, capture, length, capture.length - length, null))) length += count;
    const after = fstatSync(fd, { bigint: true });
    inspectPathTree(policyPath, 'file');
    const finalPath = realpathSync(policyPath), finalStat = lstatSync(policyPath, { bigint: true });
    if (length !== Number(before.size) || statIdentity(after) !== statIdentity(opened)
        || statIdentity(finalStat) !== statIdentity(opened) || !samePath(finalPath, policyPath)
        || !inside(canonicalRoot, finalPath)) {
      throw new Error('Policy drift or replacement observed during capture');
    }
    return capture.subarray(0, length);
  } finally { closeSync(fd); }
}

function validateExternalOutputPath(root, output) {
  const canonicalRoot = realpathSync(root), target = resolve(output), parent = dirname(target);
  if (inside(canonicalRoot, target)) throw new Error('--output must be outside the repository');
  inspectPathTree(parent, 'directory');
  inspectPathTree(target, 'absent');
  const canonicalParent = realpathSync(parent), canonicalTarget = resolve(canonicalParent, basename(target));
  if (!samePath(canonicalParent, parent)) throw new Error('--output parent is not canonical');
  if (inside(canonicalRoot, canonicalParent) || inside(canonicalRoot, canonicalTarget)) {
    throw new Error('--output resolves inside the repository');
  }
  return { target, canonicalParent };
}

export function writeExternalReport(root, output, serialized) {
  if (typeof serialized !== 'string') throw new Error('Report output must be serialized text');
  const first = validateExternalOutputPath(root, output);
  const final = validateExternalOutputPath(root, output);
  if (first.canonicalParent !== final.canonicalParent) throw new Error('--output parent changed during validation');
  // Revalidation detects observed swaps; Node cannot atomically pin every path ancestor through creation.
  writeFileSync(final.target, serialized, { encoding: 'utf8', flag: 'wx' });
}

function safeRelative(value) {
  return typeof value === 'string' && value.length > 0 && !value.includes('\\')
    && !value.startsWith('/') && !/^[a-z]:/i.test(value)
    && value.split('/').every((part) => part && part !== '.' && part !== '..');
}
const safePrefix = (value) => typeof value === 'string' && value.endsWith('/')
  ? safeRelative(value.slice(0, -1)) : safeRelative(value);
const safePattern = (value) => typeof value === 'string' && value.length > 0 && !value.includes('\\')
  && !value.startsWith('/') && !/^[a-z]:/i.test(value)
  && value.split('/').every((part) => part && part !== '.' && part !== '..');

function validateIoEntry(entry, direction, sourcePath, externalRoots) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`Malformed ${direction} entry for ${sourcePath}`);
  if (entry.location === 'repository-file') {
    if (!safeRelative(entry.path)) throw new Error(`Unsafe repository ${direction} for ${sourcePath}`);
    return;
  }
  if (entry.location === 'external-argument-relative') {
    if (typeof entry.argument !== 'string' || !/^--[a-z0-9][a-z0-9-]*$/.test(entry.argument)
        || !safePattern(entry.pattern)) throw new Error(`Malformed external ${direction} for ${sourcePath}`);
    return;
  }
  if (entry.location === 'external-fixed-root') {
    if (typeof entry.rootId !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(entry.rootId)
        || !externalRoots.has(entry.rootId) || !safePattern(entry.pattern)) {
      throw new Error(`Malformed fixed-external-root ${direction} for ${sourcePath}`);
    }
    return;
  }
  if (entry.location === 'temporary-fixture' || entry.location === 'temporary-file') {
    if (!safePattern(entry.pattern)) throw new Error(`Malformed temporary ${direction} for ${sourcePath}`);
    return;
  }
  if (entry.location === 'unresolved-dynamic' && typeof entry.reason === 'string' && entry.reason.trim()) return;
  throw new Error(`Unknown ${direction} location for ${sourcePath}`);
}

function captureMetadataInputs(policy, root, buffers) {
  const declarations = policy.dependencyDeclarations ?? [], pins = new Map();
  if (!Array.isArray(declarations)) return []; // Preserve existing schema error handling.
  let uniqueBytes = 0;
  for (const declaration of declarations) {
    if (!Object.hasOwn(declaration ?? {}, 'metadataInputs')) continue;
    const inputs = declaration.metadataInputs, seen = new Set();
    if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 8) throw new Error('Invalid metadataInputs roster');
    let declaredBytes = 0;
    for (const pin of inputs) {
      const path = pin?.path;
      if (!pin || Array.isArray(pin) || Object.keys(pin).sort().join(',') !== 'byteLength,path,sha256'
          || !safeRelative(path) || !path.endsWith('.json') || path !== path.normalize('NFC')
          || /[:*?"<>|\u0000-\u001f]/.test(path) || path.split('/').some((part) => /[. ]$/.test(part)
            || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))
          || !Number.isSafeInteger(pin.byteLength) || pin.byteLength < 0 || pin.byteLength > 512 * 1024
          || typeof pin.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(pin.sha256)) throw new Error('Invalid metadata input pin');
      const key = path.toLowerCase();
      if (seen.has(key)) throw new Error('Duplicate metadata input path');
      seen.add(key); declaredBytes += pin.byteLength;
      if (declaredBytes > 1024 * 1024) throw new Error('Metadata declaration byte budget exceeded');
      if (SNAPSHOTS.some((prefix) => key.startsWith(prefix)) || policyDecision(path, policy).disposition !== 'intended-source')
        throw new Error('Metadata input must have intended-source disposition');
      if (!declaration.actions?.some((action) => action.reads?.some((entry) => entry.location === 'repository-file' && entry.path === path)))
        throw new Error('Metadata input requires an exact repository-file read');
      const prior = pins.get(key);
      if (prior && (prior.path !== path || prior.byteLength !== pin.byteLength || prior.sha256 !== pin.sha256))
        throw new Error('Conflicting metadata input pins');
      if (!prior) { uniqueBytes += pin.byteLength; pins.set(key, { ...pin }); }
      if (uniqueBytes > 8 * 1024 * 1024) throw new Error('Metadata run byte budget exceeded');
    }
  }
  const signature = (stat) => [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
  const rows = [...pins.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  for (const pin of rows) {
    const actual = realFile(root, pin.path);
    if (!actual) throw new Error('Metadata input is missing or not an ordinary file: ' + pin.path);
    const before = lstatSync(actual, { bigint: true });
    if (!before.isFile() || before.size !== BigInt(pin.byteLength)) throw new Error('Metadata input byte length differs: ' + pin.path);
    const fd = openSync(actual, constants.O_RDONLY | (process.platform === 'win32' ? 0 : (constants.O_NOFOLLOW ?? 0)));
    try {
      const opened = fstatSync(fd, { bigint: true });
      if (!opened.isFile() || signature(opened) !== signature(before)) throw new Error('Metadata input changed before capture');
      const capture = Buffer.alloc(pin.byteLength + 1);
      let length = 0, count;
      while (length < capture.length && (count = readSync(fd, capture, length, capture.length - length, null))) length += count;
      const after = fstatSync(fd, { bigint: true }), finalPath = realFile(root, pin.path);
      if (length !== pin.byteLength || signature(after) !== signature(opened) || finalPath !== actual
          || signature(lstatSync(actual, { bigint: true })) !== signature(opened)) throw new Error('Metadata input drift/replacement observed');
      const bytes = capture.subarray(0, length);
      if (sha256(bytes) !== pin.sha256) throw new Error('Metadata input SHA-256 differs: ' + pin.path);
      try { JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
      catch { throw new Error('Malformed metadata JSON: ' + pin.path); }
      buffers.set(actual, bytes); // Both declaration passes and provenance reuse this one bounded capture.
    } finally { closeSync(fd); }
  }
  // These checks detect observed changes; they do not promise universal filesystem race immunity.
  return rows;
}

function validateDependencyDeclarations(policy, root, readSource = readFileSync) {
  const declarations = policy.dependencyDeclarations ?? [];
  if (!Array.isArray(declarations)) throw new Error('Dependency declarations must be an array');
  if (!Array.isArray(policy.externalRoots ?? [])) throw new Error('External fixed roots must be an array');
  const externalRootIds = new Set();
  for (const externalRoot of policy.externalRoots ?? []) {
    if (!externalRoot || typeof externalRoot.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(externalRoot.id)
        || externalRootIds.has(externalRoot.id) || typeof externalRoot.description !== 'string'
        || !externalRoot.description.trim()) throw new Error('Malformed or duplicate external fixed root');
    externalRootIds.add(externalRoot.id);
  }
  const paths = new Set();
  const completePaths = new Set();
  const incompletePaths = [];
  for (const declaration of declarations) {
    const sourcePath = declaration?.path;
    if (!safeRelative(sourcePath) || paths.has(sourcePath)) throw new Error(`Unsafe or duplicate dependency declaration path: ${sourcePath}`);
    paths.add(sourcePath);
    if (!/^[a-f0-9]{64}$/.test(declaration.sourceSha256 ?? '') || !Array.isArray(declaration.evidence)
        || !declaration.evidence.length || !Array.isArray(declaration.actions) || !declaration.actions.length
        || typeof declaration.actionInventoryComplete !== 'boolean') {
      throw new Error(`Dependency declaration requires source hash, evidence, actions and completeness: ${sourcePath}`);
    }
    const actualPath = realFile(root, sourcePath);
    if (!actualPath) throw new Error(`Dependency declaration source is missing: ${sourcePath}`);
    const actualHash = sha256(readSource(actualPath));
    if (actualHash !== declaration.sourceSha256) throw new Error(`Stale dependency declaration source hash: ${sourcePath}`);
    if (declaration.evidence.some((row) => !row || typeof row.function !== 'string' || !row.function.trim()
        || row.sourceSha256 !== declaration.sourceSha256)) {
      throw new Error(`Dependency evidence must name reviewed functions and pin the current source hash: ${sourcePath}`);
    }
    const reviewedFunctions = new Set(declaration.evidence.map((row) => row.function));
    const actionIds = new Set();
    let actionsResolved = true;
    for (const action of declaration.actions) {
      if (!action || typeof action.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(action.id)
          || actionIds.has(action.id) || !Array.isArray(action.reads) || !Array.isArray(action.writes)
          || !Array.isArray(action.evidence) || !action.evidence.length
          || action.evidence.some((fn) => typeof fn !== 'string' || !reviewedFunctions.has(fn))) {
        throw new Error(`Malformed or duplicate dependency action for ${sourcePath}`);
      }
      actionIds.add(action.id);
      for (const entry of action.reads) validateIoEntry(entry, 'read', sourcePath, externalRootIds);
      for (const entry of action.writes) validateIoEntry(entry, 'write', sourcePath, externalRootIds);
      if (action.reads.some((row) => row.location === 'unresolved-dynamic')
          || action.writes.some((row) => row.location === 'unresolved-dynamic')) actionsResolved = false;
    }
    if (declaration.actionInventoryComplete && actionsResolved) completePaths.add(sourcePath);
    else incompletePaths.push(sourcePath);
  }
  return { declarations, declaredPaths: paths, completePaths, incompletePaths };
}

export function parsePorcelainZ(input) {
  const fields = Buffer.isBuffer(input) ? input.toString('utf8').split('\0') : String(input).split('\0');
  const records = [];
  for (let i = 0; i < fields.length;) {
    const field = fields[i++];
    if (!field) continue;
    if (field.length < 4 || field[2] !== ' ') throw new Error(`Malformed porcelain status record: ${field}`);
    const code = field.slice(0, 2), path = field.slice(3);
    if (!safeRelative(path.replace(/\/$/, ''))) throw new Error(`Unsafe status path: ${path}`);
    if (code.includes('R') || code.includes('C')) {
      const originalPath = fields[i++];
      if (!originalPath || !safeRelative(originalPath)) throw new Error(`Malformed rename/copy source for ${path}`);
      records.push({ code, path, originalPath, kind: 'rename-or-copy' });
    } else records.push({ code, path, kind: path.endsWith('/') ? 'directory' : 'file' });
  }
  return records;
}

function policyDecision(path, policy) {
  // The retained dist trees and generated review receipts are never candidates for source control.
  if (SNAPSHOTS.some((prefix) => path.startsWith(prefix))) return { disposition: 'excluded', reason: 'retained historical build snapshot' };
  if (path.endsWith('.json') && /(?:^|[-_])review(?:[-_.]|$)/i.test(path)
      && !/\.schema\.json$/i.test(path)) return { disposition: 'excluded', reason: 'generated review receipt' };
  for (const entry of policy.entries ?? []) if (entry.path === path) return entry;
  for (const rule of policy.rules ?? []) {
    const matches = rule.prefix ? path.startsWith(rule.prefix) : rule.suffix ? path.endsWith(rule.suffix) : false;
    if (matches && (!rule.excludeSuffix || !path.endsWith(rule.excludeSuffix))) return rule;
  }
  return { disposition: 'unresolved', reason: 'no explicit source disposition' };
}

function checkPolicy(policy, root, readSource, buffers) {
  if (policy?.schema !== 'greybox-release-source-policy-v1' || policy.version !== 1
      || !Array.isArray(policy.entries) || !Array.isArray(policy.rules) || !Array.isArray(policy.roots)
      || !Array.isArray(policy.changedTestRoots)) {
    throw new Error('Invalid release source policy schema');
  }
  for (const row of [...policy.entries, ...policy.rules, ...policy.roots, ...policy.changedTestRoots]) {
    const validPath = row.path ? safeRelative(row.path)
      : row.prefix ? safePrefix(row.prefix) : row.suffix ? safeRelative(row.suffix) : false;
    if (!validPath) {
      throw new Error('Policy paths must be repository-relative and traversal-free');
    }
    if (row.disposition && !['intended-source', 'excluded', 'unresolved'].includes(row.disposition)) {
      throw new Error(`Invalid policy disposition: ${row.disposition}`);
    }
  }
  const exactPaths = new Set();
  for (const row of policy.entries) {
    if (exactPaths.has(row.path)) throw new Error(`Conflicting or duplicate exact policy entry: ${row.path}`);
    exactPaths.add(row.path);
  }
  for (const edge of policy.pythonImportEdges ?? []) {
    if (!safeRelative(edge.from) || !safeRelative(edge.to) || !Number.isInteger(edge.line) || edge.line < 1) {
      throw new Error('Python import edges require safe repository paths and positive source line numbers');
    }
  }
  if (policy.pythonIoAudit) {
    if (!Array.isArray(policy.pythonIoAudit.reviewedPaths) || !Array.isArray(policy.pythonIoAudit.groups)
        || !Array.isArray(policy.pythonIoAudit.findings)) throw new Error('Invalid Python I/O audit declaration');
    for (const path of policy.pythonIoAudit.reviewedPaths) {
      if (!safeRelative(path)) throw new Error(`Unsafe Python I/O audit path: ${path}`);
    }
  }
  if (/(?:^|[^a-z0-9])[a-z]:[\\/]|\\\\[^\\/\s]+(?:\\+|\/)[^\\/\s]+/i.test(JSON.stringify(policy))) {
    throw new Error('Absolute machine path in release source policy');
  }
  const metadataInputs = captureMetadataInputs(policy, root, buffers);
  validateDependencyDeclarations(policy, root, readSource);
  for (const row of policy.entries) if (row.path) realFile(root, row.path);
  return metadataInputs;
}

function realFile(root, relativePath) {
  if (!safeRelative(relativePath)) throw new Error(`Unsafe dependency path: ${relativePath}`);
  const abs = resolve(root, relativePath);
  if (!inside(root, abs)) throw new Error(`Dependency escapes repository: ${relativePath}`);
  let cursor = root;
  for (const part of relative(root, abs).split(sep).filter(Boolean)) {
    cursor = resolve(cursor, part);
    let stat;
    try { stat = lstatSync(cursor); } catch { return null; }
    if (stat.isSymbolicLink()) throw new Error(`Symlink in source dependency path: ${relativePath}`);
  }
  try {
    const actual = realpathSync(abs);
    if (!inside(root, actual)) throw new Error(`Real path escapes repository: ${relativePath}`);
    if (!lstatSync(actual).isFile()) return null;
    return actual;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function hasSymlink(root, relativePath) {
  if (!safeRelative(relativePath)) return true;
  let cursor = root;
  for (const part of relativePath.split('/')) {
    cursor = resolve(cursor, part);
    try { if (lstatSync(cursor).isSymbolicLink()) return true; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }
  return false;
}

const MODULE_EXTENSIONS = ['', '.ts', '.tsx', '.mts', '.cts', '.mjs', '.js', '.json', '.css', '.svg', '.png'];
function localCandidates(base) {
  const ext = extname(base);
  const alternatives = ext === '.js' ? ['.ts', '.tsx', '.d.ts']
    : ext === '.mjs' ? ['.mts', '.d.mts']
      : ext === '.cjs' ? ['.cts', '.d.cts'] : [];
  return [base, ...alternatives.map((suffix) => `${base.slice(0, -ext.length)}${suffix}`),
    ...(ext ? [] : MODULE_EXTENSIONS.slice(1).map((suffix) => `${base}${suffix}`)),
    ...(ext ? [] : MODULE_EXTENSIONS.slice(1).map((suffix) => resolve(base, `index${suffix}`)))];
}
function resolveLocalModule(root, from, specifier) {
  if (specifier === '@goldbox/engine') return 'packages/engine/src/index.ts';
  if (specifier === '@goldbox/ui-kit') return 'packages/ui-kit/src/index.ts';
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(resolve(root, from)), specifier);
  if (!inside(root, base)) throw new Error(`Import escapes repository: ${from} -> ${specifier}`);
  for (const candidate of localCandidates(base)) {
    if (!inside(root, candidate)) throw new Error(`Import escapes repository: ${from} -> ${specifier}`);
    if (realFile(root, relative(root, candidate).split(sep).join('/'))) return relative(root, candidate).split(sep).join('/');
  }
  return null;
}

function staticReferences(root, path, contents) {
  const refs = [];
  const add = (specifier, kind) => {
    if (!specifier || specifier.endsWith('/')) return; // A directory/base URL is not a file dependency.
    if (specifier.startsWith('.')) {
      const target = resolve(dirname(resolve(root, path)), specifier);
      const rel = relative(root, target).split(sep).join('/');
      if (!inside(root, target)) {
        refs.push({ path: null, kind, specifier, unresolved: 'relative reference escapes repository root' });
        return;
      }
      if (rel.split('/').includes('node_modules')) {
        refs.push({ path: null, kind, specifier, external: true, reason: 'installed package dependency under node_modules' });
        return;
      }
      try {
        if (lstatSync(target).isDirectory()) {
          refs.push({ path: null, kind, specifier, external: true, reason: 'directory data input; contents require separate disposition' });
          return;
        }
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const local = resolveLocalModule(root, path, specifier);
    if (local) refs.push({ path: local, kind, specifier });
    else if (specifier.startsWith('.')) refs.push({ path: null, kind, specifier, unresolved: 'local reference not found' });
  };
  const addRepoPath = (raw, kind) => {
    if (!safeRelative(raw)) { refs.push({ path: null, kind, specifier: raw, unresolved: 'unsafe repository path' }); return; }
    const abs = resolve(root, raw);
    if (!inside(root, abs)) throw new Error(`Static path escapes repository: ${path} -> ${raw}`);
    if (raw.split('/').includes('node_modules')) {
      refs.push({ path: null, kind, specifier: raw, external: true, reason: 'installed package dependency under node_modules' });
      return;
    }
    const found = localCandidates(abs)
      .find((candidate) => realFile(root, relative(root, candidate).split(sep).join('/')));
    if (found) refs.push({ path: relative(root, found).split(sep).join('/'), kind, specifier: raw });
    else refs.push({ path: null, kind, specifier: raw, unresolved: 'static file path not found' });
  };
  const source = ts.createSourceFile(path, contents, ts.ScriptTarget.Latest, true,
    /\.tsx?$/.test(path) ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  const pathVars = new Map();
  const staticPath = (call) => {
    if (!ts.isCallExpression(call) || !['resolve', 'join'].includes(call.expression.getText(source))
        || call.arguments.length < 2 || !ts.isStringLiteralLike(call.arguments.at(-1))) return null;
    const raw = call.arguments.at(-1).text, base = call.arguments[0].getText(source);
    if (base === 'WEB' || base === 'APP_ROOT') {
      if (/^(?:scripts|test|src|node_modules)\//.test(raw)) return `apps/web/${raw}`;
      return null;
    }
    if (['ROOT', 'REPO', 'REPO_ROOT', 'repo'].includes(base)) return raw.replace(/^\.\//, '');
    return null;
  };
  const reads = new Set(['readFileSync', 'readFile', 'existsSync', 'lstatSync', 'statSync', 'readdirSync',
    'openSync', 'accessSync', 'createReadStream']);
  const pathValue = (node) => {
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isIdentifier(node)) return pathVars.get(node.text) ?? null;
    if (ts.isCallExpression(node)) return staticPath(node);
    if (ts.isNewExpression(node) && node.expression.getText(source) === 'URL'
        && node.arguments?.length && ts.isStringLiteralLike(node.arguments[0])
        && node.arguments[1]?.getText(source) === 'import.meta.url') return node.arguments[0].text;
    return null;
  };
  const prewalk = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const value = pathValue(node.initializer);
      if (value !== null) pathVars.set(node.name.text, value);
    }
    ts.forEachChild(node, prewalk);
  };
  prewalk(source);
  if (path.endsWith('.html')) {
    for (const match of contents.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) {
      const value = match[1];
      if (value.startsWith('./')) add(`./public/${value.slice(2)}`, 'html-public-asset');
      else if (value.startsWith('/src/')) add(`.${value}`, 'html-reference');
    }
  }
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier
        && ts.isStringLiteralLike(node.moduleSpecifier)) add(node.moduleSpecifier.text, 'module');
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
        && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) add(node.arguments[0].text, 'dynamic-module');
    if (ts.isNewExpression(node) && node.expression.getText(source) === 'URL'
        && node.arguments?.length && ts.isStringLiteralLike(node.arguments[0])) {
      const base = node.arguments[1]?.getText(source) ?? '';
      if (/\.url\(\)$/.test(base)) refs.push({ path: null, kind: 'browser-url', specifier: node.arguments[0].text,
        external: true, reason: 'browser route URL used by test harness' });
      else add(node.arguments[0].text, 'url-asset');
    }
    // Record statically resolved source files used by the build, packers and local readers.
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(source).split('.').at(-1);
      if (reads.has(callee) && node.arguments.length) {
        const arg = node.arguments[0];
        const value = pathValue(arg);
        if (ts.isStringLiteralLike(arg) && !/^(?:apps|docs|tools|packages|native|renders)\//.test(value)) {
          refs.push({ path: null, kind: 'runtime-file-input', specifier: value, external: true,
            reason: 'relative file path is resolved against the command working directory or a test fixture' });
        } else if (value && safeRelative(value)) addRepoPath(value, 'file-read');
      }
      const value = staticPath(node);
      if (value && node.expression.getText(source) === 'resolve'
          && (node.arguments[0].getText(source) === 'WEB' || node.arguments[0].getText(source) === 'APP_ROOT')
          && /^apps\/web\/scripts\//.test(value) && extname(value)) addRepoPath(value, 'build-tool-input');
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return refs;
}

function auditClosure(root, policy, statusPaths, roots, readSource) {
  const queue = roots.map((path) => ({ path, parent: null, kind: 'root' }));
  const seen = new Set(), rows = [], blockers = [], externalDependencies = [];
  while (queue.length) {
    const item = queue.shift();
    if (seen.has(item.path)) continue;
    seen.add(item.path);
    const abs = realFile(root, item.path);
    if (!abs) { blockers.push({ path: item.path, issue: 'root/dependency is missing' }); continue; }
    const disposition = policyDecision(item.path, policy);
    if (disposition.disposition === 'excluded') blockers.push({ path: item.path, issue: 'excluded file is in active dependency closure', parent: item.parent });
    else if (statusPaths.has(item.path) && disposition.disposition === 'unresolved') blockers.push({ path: item.path, issue: 'changed dependency has no explicit disposition', parent: item.parent });
    rows.push({ path: item.path, disposition: statusPaths.has(item.path) ? disposition.disposition : 'tracked-or-clean-source', parent: item.parent, edge: item.kind });
    const text = readSource(abs).toString('utf8');
    let references;
    try { references = staticReferences(root, item.path, text); }
    catch (error) { throw new Error(`${item.path}: ${error.message}`, { cause: error }); }
    for (const ref of references) {
      if (ref.external) { externalDependencies.push({ path: item.path, specifier: ref.specifier, reason: ref.reason }); continue; }
      if (ref.unresolved) blockers.push({ path: item.path, issue: `${ref.kind} did not resolve`, specifier: ref.specifier });
      else queue.push({ path: ref.path, parent: item.path, kind: ref.kind });
    }
  }
  return { files: rows, blockers, externalDependencies };
}

export function buildReleasePlan({ root, statusBytes, policy, policyBytes, roots, head = null, host = hostname() } = {}) {
  root = realpathSync(resolve(root ?? DEFAULT_ROOT));
  statusBytes = Buffer.from(statusBytes ?? '');
  policyBytes = Buffer.from(policyBytes ?? JSON.stringify(policy));
  policy = JSON.parse(policyBytes.toString('utf8'));
  const buffers = new Map();
  const readSource = (path) => {
    if (!buffers.has(path)) buffers.set(path, readFileSync(path));
    return buffers.get(path);
  };
  const metadataInputs = checkPolicy(policy, root, readSource, buffers);
  const status = parsePorcelainZ(statusBytes);
  const statusPaths = new Set(status.flatMap((row) => row.originalPath ? [row.path, row.originalPath] : [row.path]));
  const dispositions = status.map((row) => {
    const path = row.path.replace(/\/$/, '');
    const decision = hasSymlink(root, path)
      ? { disposition: 'unresolved', reason: 'symlink in status path' }
      : policyDecision(path, policy);
    return { ...row, disposition: decision.disposition, reason: decision.reason ?? null };
  });
  const selectedRoots = roots ?? [...policy.roots.map((row) => row.path),
    ...status.filter((row) => row.path.endsWith('.test.mjs')
      && policy.changedTestRoots.some((rule) => row.path.startsWith(rule.prefix)
        && row.path.endsWith(rule.suffix))).map((row) => row.path)];
  const closure = auditClosure(root, policy, statusPaths, selectedRoots, readSource);
  const validatedDeclarations = validateDependencyDeclarations(policy, root, readSource);
  const reviewedPythonIo = new Set(policy.pythonIoAudit?.reviewedPaths ?? []);
  const changedPython = dispositions.filter((row) => row.path.endsWith('.py')).map((row) => row.path);
  const pythonDependencyCoverage = {
    changedPythonFiles: changedPython.length,
    reviewedIoFiles: changedPython.filter((path) => reviewedPythonIo.has(path)).length,
    actionDeclaredFiles: changedPython.filter((path) => validatedDeclarations.completePaths.has(path)).length,
    filesWithoutActionDeclarations: changedPython.filter((path) => !validatedDeclarations.declaredPaths.has(path)),
    filesWithoutCompleteActionDeclarations: changedPython.filter((path) => !validatedDeclarations.completePaths.has(path)),
    incompleteActionDeclarations: validatedDeclarations.incompletePaths.filter((path) => changedPython.includes(path)),
    unanalysedFiles: changedPython.filter((path) => !reviewedPythonIo.has(path)),
    declarations: policy.dependencyDeclarations ?? [],
    externalFixedRoots: policy.externalRoots ?? [],
    reviewedLocalImportEdges: policy.pythonImportEdges ?? [],
    reviewedLocalImportEdgeCount: (policy.pythonImportEdges ?? []).length,
    importAuditScope: policy.pythonImportAuditScope ?? null,
    ioAudit: policy.pythonIoAudit ?? null,
    limitation: 'Python import and I/O findings are manually reviewed; this is not a static analyzer, and dynamic behavior plus excluded local corpus dependencies prevent a closure claim.',
  };
  const intended = new Set([
    ...policy.entries.filter((row) => policyDecision(row.path, policy).disposition === 'intended-source').map((row) => row.path),
    ...dispositions.filter((row) => row.disposition === 'intended-source').map((row) => row.path),
  ]);
  const paths = new Set([...intended, ...metadataInputs.map((row) => row.path), ...selectedRoots.filter((path) =>
    policyDecision(path, policy).disposition !== 'excluded'), ...closure.files.filter((row) =>
    policyDecision(row.path, policy).disposition !== 'excluded').map((row) => row.path)]);
  const contentInventory = [...paths].sort().map((path) => {
    const pin = metadataInputs.find((row) => row.path === path);
    if (pin) return { path, state: 'present', byteLength: pin.byteLength, sha256: pin.sha256 };
    const abs = realFile(root, path);
    const deleted = status.some((row) => row.path === path && row.code.includes('D'));
    if (!abs) return { path, state: deleted ? 'deleted' : 'missing', byteLength: null, sha256: null };
    const bytes = readSource(abs);
    return { path, state: 'present', byteLength: bytes.length, sha256: sha256(bytes) };
  });
  const provenance = {
    checkoutRoot: root, host, head, statusInputSha256: sha256(statusBytes), policyInputSha256: sha256(policyBytes),
    contentInventory, contentInventorySha256: sha256(Buffer.from(JSON.stringify(contentInventory))),
    ...(metadataInputs.length ? { metadataInputs } : {}),
    limitation: 'Captured local inputs only; fingerprints do not establish dependency completeness or release readiness.',
  };
  return {
    schema: 'greybox-release-source-plan-v1',
    provenance,
    counts: {
      statusRecords: status.length,
      intendedSource: dispositions.filter((row) => row.disposition === 'intended-source').length,
      excluded: dispositions.filter((row) => row.disposition === 'excluded').length,
      unresolved: dispositions.filter((row) => row.disposition === 'unresolved').length,
      dependencyFiles: closure.files.length,
      dependencyBlockers: closure.blockers.length,
      pythonUnanalysedFiles: pythonDependencyCoverage.unanalysedFiles.length,
      pythonFilesWithoutActionDeclarations: pythonDependencyCoverage.filesWithoutActionDeclarations.length,
      pythonFilesWithoutCompleteActionDeclarations: pythonDependencyCoverage.filesWithoutCompleteActionDeclarations.length,
    },
    dispositions,
    dependencyClosure: closure,
    pythonDependencyCoverage,
    dependencyAnalysisComplete: closure.blockers.length === 0
      && pythonDependencyCoverage.unanalysedFiles.length === 0
      && pythonDependencyCoverage.filesWithoutCompleteActionDeclarations.length === 0
      && policy.pythonIoAudit?.dependencyClosureComplete !== false
      && dispositions.every((row) => row.disposition !== 'unresolved'),
  };
}

function main(argv) {
  const args = [...argv];
  let root = DEFAULT_ROOT, output = null;
  while (args.length) {
    const arg = args.shift();
    if (arg === '--root') root = resolve(args.shift() ?? '');
    else if (arg === '--output') output = resolve(args.shift() ?? '');
    else throw new Error(`Unknown option: ${arg}`);
  }
  root = realpathSync(root);
  const policyBytes = captureFixedPolicy(root);
  const headResult = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: root, encoding: 'utf8' });
  if (headResult.error || headResult.status !== 0) throw new Error('git HEAD capture failed');
  const head = headResult.stdout.trim();
  const git = spawnSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {
    cwd: root, encoding: 'buffer', maxBuffer: 32 * 1024 * 1024,
  });
  if (git.error || git.status !== 0) throw new Error(`git status failed: ${git.error?.message ?? git.stderr?.toString('utf8') ?? git.status}`);
  const report = buildReleasePlan({ root, statusBytes: git.stdout, policyBytes, head });
  const serialized = JSON.stringify(report, null, 2) + '\n';
  if (output) {
    writeExternalReport(root, output, serialized);
  } else process.stdout.write(serialized);
  return report.counts.dependencyBlockers || report.counts.unresolved
      || report.counts.pythonUnanalysedFiles || report.counts.pythonFilesWithoutActionDeclarations
      || !report.dependencyAnalysisComplete ? 2 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error(`[release-source-plan] ${error.message}`); process.exitCode = 1; }
}
