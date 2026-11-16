// Metadata compatibility only: no image/corpus reads, admission changes or release-readiness claim.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { validateHostedRestyleDescriptor } from './hosted-restyle-pack.mjs';
import { validateCokPlayerCanonicalBindings } from '../src/ui/cok-player-canonical-bindings.mjs';
import { cokPlayerAppearanceHeldRestylePaths, cokPlayerAppearancePackagePlan } from '../src/ui/cok-player-restyle-admission.mjs';

export const RUNTIME_CONTRACT_SHA256 = Object.freeze({
  'apps/web/src/ui/cokPlayerAppearanceManifest.json': '3dad37bc789586ddff083a50a2814339141ccc1692290986ac96ac0c5ceb1bb2',
  'apps/web/src/ui/cokPlayerRestyleAdmission.json': '4910545fed3de4b3b5726b98ec4e1766314af7535adf17489f81872dd8f7898d',
  'apps/web/src/ui/cokPlayerCanonicalBindings.json': '319af29b8ce2b4114d8616a0dd7e235fcc26a971ab4d54fb1682c5dd2d9b1331',
  'apps/web/src/ui/cok-player-restyle-admission.mjs': '15273deaf4574be5607d575e794dba586f86809910580e11c1eb73695ce4cd52',
  'apps/web/src/ui/cok-player-canonical-bindings.mjs': 'fa1bf8595b853131c56189590aa307210dd357c4c2169000cb566e724f7386fc',
  'tools/cok-player-canonical-bindings.mjs': '6b600106c6da920c647fdfad128054189e00152d9dd24819d74cf670269ab8ac',
  'apps/web/src/ui/cokCombatRestyleManifest.json': 'ea88bef9170b4ecfea077e9ca42f052832c752fd50f32196e67e170770892e45',
});
const PATHS = Object.keys(RUNTIME_CONTRACT_SHA256), sha = bytes => createHash('sha256').update(Buffer.from(bytes).toString('utf8').replace(/\r\n/g, '\n')).digest('hex');
const safe = path => typeof path === 'string' && /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.png$/.test(path)
  && !path.split('/').some(p => /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(p));

/** Explicit fixed source reads only; imported validators have no module-load I/O. */
export function readHostedRestyleRuntimeContracts() {
  return Object.fromEntries(PATHS.map(path => [path, readFileSync(new URL(`../../../${path}`, import.meta.url))]));
}

/** Pure bytes-in assessment. Expected contract hashes are trusted caller inputs, like the descriptor pin. */
export function assessHostedRestyleRuntimeContract(descriptor, inventorySha256, contracts, expectedHashes) {
  const rows = validateHostedRestyleDescriptor(descriptor, inventorySha256), contractSha256 = {};
  for (const path of PATHS) {
    if (!(contracts?.[path] instanceof Uint8Array) || !/^[a-f0-9]{64}$/.test(expectedHashes?.[path] ?? '')
        || sha(contracts[path]) !== expectedHashes[path]) throw new Error(`Runtime contract changed: ${path}`);
    contractSha256[path] = expectedHashes[path];
  }
  const json = path => JSON.parse(Buffer.from(contracts[path]).toString('utf8'));
  const manifest = json(PATHS[0]), admission = json(PATHS[1]), bindings = json(PATHS[2]), combat = json(PATHS[6]);
  if (bindings.inputSha256?.manifest !== contractSha256[PATHS[0]] || bindings.inputSha256?.policy !== contractSha256[PATHS[1]]) {
    throw new Error('Stale canonical manifest/admission hashes');
  }
  validateCokPlayerCanonicalBindings(manifest, admission, bindings);
  const required = [], destinations = new Set(), selectors = new Set();
  function add(path, hash, details) {
    if (!safe(path) || !/^[a-f0-9]{64}$/i.test(hash ?? '') || destinations.has(path.toLowerCase())) {
      throw new Error(`Duplicate/conflicting or unsafe runtime destination: ${path}`);
    }
    destinations.add(path.toLowerCase()); required.push({ path, sha256: hash.toLowerCase(), ...details });
  }
  for (const entry of cokPlayerAppearancePackagePlan(manifest, admission)) {
    add(`restyle/cok/player/${entry.dest}`, entry.sha256, { kind: entry.dest.includes('/original/') ? 'player-original' : 'player-restyle' });
  }
  const heldPaths = cokPlayerAppearanceHeldRestylePaths(manifest, admission).map(path => `restyle/cok/player/${path}`);
  if (heldPaths.some(path => destinations.has(path.toLowerCase()))) throw new Error('Held player variant became required');
  if (!Array.isArray(combat.banks) || !combat.banks.length) throw new Error('Invalid combat banks');
  const banks = new Set();
  for (const bank of combat.banks) {
    if (!/^CPIC[123]$/.test(bank.name) || banks.has(bank.name) || bank.disk !== Number(bank.name.slice(-1))
        || !Array.isArray(bank.icons) || !/^[a-f0-9]{64}$/i.test(bank.sourceArchiveSha256 ?? '')) throw new Error('Invalid/duplicate combat bank');
    banks.add(bank.name);
    for (const icon of bank.icons) {
      const key = `${bank.name}/${icon.pictureId}`;
      if (!Number.isSafeInteger(icon.pictureId) || icon.pictureId < 0 || selectors.has(key)
          || (icon.bank !== undefined && icon.bank !== bank.name)
          || !new RegExp(`^${bank.name}_${String(icon.pictureId).padStart(3, '0')}_restyle(?:_[A-Za-z0-9_-]+)?$`).test(icon.stem)) throw new Error('Invalid/duplicate combat selector/stem');
      selectors.add(key); add(`restyle/cok/combat/${icon.stem}.png`, icon.sha256,
        { kind: 'combat-restyle', bank: bank.name, pictureId: icon.pictureId, stem: icon.stem });
    }
  }
  required.sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const unavailable = required.filter(row => rows.get(row.path)?.sha256 !== row.sha256).map(row => ({ ...row,
    reason: rows.has(row.path) ? 'hash-mismatch' : 'missing' }));
  const available = path => destinations.has(path.toLowerCase()) && !unavailable.some(row => row.path === path);
  const variants = admission.frames.map(frame => {
    const appearance = manifest.appearances.find(row => row.appearanceId === frame.appearanceId), body = appearance.bodyFrames[frame.frameIndex];
    const path = (part, kind) => `restyle/cok/player/${frame.appearanceId}/${kind}/${(kind === 'original' ? part.sourceFile : part.restyleFile).split('/').at(-1)}`;
    return { appearanceId: frame.appearanceId, frameIndex: frame.frameIndex, state: frame.state, reason: frame.reason,
      originalFallbackAvailable: available(path(appearance.head, 'original')) && available(path(body, 'original')),
      restyleAvailable: frame.state === 'admitted' && available(path(appearance.head, 'restyle')) && available(path(body, 'restyle')),
      candidatePresent: rows.has(path(appearance.head, 'restyle')) && rows.has(path(body, 'restyle')) };
  });
  return { schema: 'greybox-hosted-restyle-runtime-contract-v1', descriptorInventorySha256: inventorySha256, contractSha256,
    compatible: unavailable.length === 0, required, unavailable, variants, heldPaths,
    playback: 'held', runtimeObservations: 0,
    limitation: 'Exact metadata path/hash compatibility only; pack membership grants no admission, identity, animation or release readiness. DOS/Amiga/Restyle settings and original fallback unchanged.' };
}

/** Production defaults are reviewed fixed files/pins; optional arguments support synthetic-only callers. */
export function verifyHostedRestyleRuntimeContract(descriptor, pin, contracts = readHostedRestyleRuntimeContracts(), hashes = RUNTIME_CONTRACT_SHA256) {
  const result = assessHostedRestyleRuntimeContract(descriptor, pin, contracts, hashes);
  if (!result.compatible) throw new Error(`Hosted runtime contract incompatible: ${result.unavailable.map(row => `${row.reason}:${row.path}`).join(', ')}`);
  return result;
}
