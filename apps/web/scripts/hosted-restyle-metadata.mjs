// Validate captured JSON against the approved descriptor; never read or decode images.
import { createHash } from 'node:crypto';
import { validateHostedRestyleDescriptor } from './hosted-restyle-pack.mjs';
import { validateRestyleFidelity, validateRestyleManifest } from '../src/ui/restyle-data.mjs';
import { validateCokGeneratedInventory } from '../src/ui/cok-generated-inventory.mjs';

export const HOSTED_METADATA_PATHS = Object.freeze(['restyle/manifest.json', 'restyle/fidelity.json',
  'restyle/anim/index.json', 'restyle/cok-generated/manifest.json']);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const safe = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]*$/.test(value)
  && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(value);

export function validateHostedRestyleMetadata(descriptor, pin, buffers) {
  const rows = validateHostedRestyleDescriptor(descriptor, pin), keys = Object.keys(buffers ?? {});
  if (keys.length !== 4 || HOSTED_METADATA_PATHS.some(path => !Object.hasOwn(buffers, path))
      || descriptor.files.filter(row => /\.json$/i.test(row.path)).some(row => !HOSTED_METADATA_PATHS.includes(row.path))) throw new Error('Expected exactly four hosted metadata buffers/paths');
  const metadata = HOSTED_METADATA_PATHS.map(path => {
    const bytes = buffers[path], row = rows.get(path);
    if (!(bytes instanceof Uint8Array) || !row || bytes.byteLength !== row.byteLength || hash(bytes) !== row.sha256) throw new Error(`Hosted metadata bytes differ: ${path}`);
    return { path, byteLength: row.byteLength, sha256: row.sha256 };
  });
  const [manifest, fidelity, animation, generated] = HOSTED_METADATA_PATHS.map(path => JSON.parse(Buffer.from(buffers[path]).toString('utf8')));
  validateRestyleManifest(manifest); validateRestyleFidelity(fidelity, manifest); validateCokGeneratedInventory(generated);
  const referenced = new Set(); let imageReferenceJoins = 0;
  function image(path, suppliedHash) {
    if (!/^restyle\/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*\.png$/.test(path) || !rows.has(path)
        || (suppliedHash !== undefined && (!/^[a-f0-9]{64}$/i.test(suppliedHash) || rows.get(path).sha256 !== suppliedHash.toLowerCase()))) throw new Error(`Hosted metadata image reference differs: ${path}`);
    referenced.add(path); imageReferenceJoins++;
  }
  for (const item of manifest.items) {
    image(`restyle/orig/${item.stem}.png`, item.sourceSha256); image(`restyle/out/${item.stem}.png`, item.outputSha256);
  }
  if (!Array.isArray(animation.items) || !Array.isArray(animation.problems) || !animation.imageSha256
      || typeof animation.imageSha256 !== 'object' || Array.isArray(animation.imageSha256)) throw new Error('Invalid hosted animation header');
  const ids = new Set();
  for (const item of animation.items) {
    const validFrame = frame => Number.isSafeInteger(frame) && frame >= 0 && frame < item.frames;
    if (!safe(item?.id) || ids.has(item.id) || !Number.isSafeInteger(item.frames) || item.frames < 1
        || !Array.isArray(item.staged) || !item.staged.length || item.staged.some(frame => !validFrame(frame))
        || new Set(item.staged).size !== item.staged.length || !Array.isArray(item.texts)
        || item.texts.some(text => !text || !validFrame(text.frame) || typeof text.what !== 'string' || typeof text.source !== 'string')) throw new Error('Invalid hosted animation ID/order/texts');
    ids.add(item.id);
    for (const frame of item.staged) for (const prefix of ['o', 'r']) {
      const path = `${item.id}/${prefix}${frame}.png`, sha256 = animation.imageSha256[path];
      if (!/^[a-f0-9]{64}$/.test(sha256 ?? '')) throw new Error(`Missing hosted frame hash: ${path}`);
      image(`restyle/anim/${path}`, sha256);
    }
  }
  for (const [path, sha256] of Object.entries(animation.imageSha256)) {
    if (!/^[a-f0-9]{64}$/.test(sha256 ?? '')) throw new Error('Invalid hosted frame hash'); image(`restyle/anim/${path}`, sha256);
  }
  for (const item of generated.assets) {
    image(`restyle/cok-generated/${item.source}`, item.sourceSha256); image(`restyle/cok-generated/${item.output}`, item.outputSha256);
    for (const hub of item.animations) for (const frame of Object.values(hub.frames)) image(`restyle/cok-generated/images/${frame.sha256}.png`, frame.sha256);
  }
  for (const item of generated.externalComparisons) {
    if (!manifest.items.some(row => row.id === item.id && row.stem === item.stem)) throw new Error('Hosted external comparison identity differs');
    image(`restyle/orig/${item.stem}.png`, item.sourceSha256); image(`restyle/out/${item.stem}.png`, item.outputSha256);
  }
  return { schema: 'greybox-hosted-restyle-metadata-v1', descriptorInventorySha256: pin, metadata,
    validation: { comparisons: manifest.items.length, fidelityRows: fidelity.results.length, animations: animation.items.length,
      generatedPairs: generated.assets.length, heldRecords: generated.held.length, generatedImageMode: generated.imageMode ?? 'bundled',
      imageReferenceJoins, uniqueReferencedPaths: referenced.size },
    limitation: 'Metadata schema/reference validation only; descriptor rows pin optional gallery hashes. Provenance is inert text. No image decoding, admission, complete runtime coverage or release-readiness claim.' };
}
