const HASH = /^[a-f0-9]{64}$/i;
const ALIAS_IDENTITY_FIELDS = ['ledger', 'ledgerKind', 'entry', 'entryIndex', 'platform', 'family', 'status', 'asset', 'frame', 'tile', 'cell',
  'ledgerSize', 'variant', 'variantOutput', 'aliasBasis', 'sourceArchive', 'sourceAlias'];
const sameHash = (left, right) => typeof left === 'string' && typeof right === 'string'
  && left.toLowerCase() === right.toLowerCase();
const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const no = (reason) => ({ status: 'unresolved', reason, sourceAssetIds: [], sources: [] });
const comparisonHashByUrl = new Map();

async function hashUrl(url, fetchImpl, cryptoImpl) {
  if (!comparisonHashByUrl.has(url)) {
    comparisonHashByUrl.set(url, (async () => {
      const response = await fetchImpl(url);
      if (!response?.ok) throw new Error(`HTTP ${response?.status ?? 'unavailable'} for ${url}`);
      const digest = await cryptoImpl.subtle.digest('SHA-256', await response.arrayBuffer());
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    })().catch((error) => { comparisonHashByUrl.delete(url); throw error; }));
  }
  return comparisonHashByUrl.get(url);
}

async function hashBytes(bytes, cryptoImpl) {
  const digest = await cryptoImpl.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyCurrentComparisonPair({ sourceUrl, outputUrl, sourceBytes, outputBytes, allowFetch = true,
  expectedSourceSha256, expectedOutputSha256, fetchImpl = globalThis.fetch, cryptoImpl = globalThis.crypto }) {
  try {
    const hash = (bytes, url) => bytes != null
      ? hashBytes(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), cryptoImpl)
      : allowFetch && typeof url === 'string' ? hashUrl(url, fetchImpl, cryptoImpl)
        : Promise.reject(new Error('exact local comparison bytes are unavailable'));
    const [sourceSha256, outputSha256] = await Promise.all([
      hash(sourceBytes, sourceUrl), hash(outputBytes, outputUrl),
    ]);
    if (!sameHash(sourceSha256, expectedSourceSha256)) return no('current-source-png-hash-mismatch');
    if (!sameHash(outputSha256, expectedOutputSha256)) return no('current-output-png-hash-mismatch');
    return { status: 'resolved', reason: null, sourceSha256, outputSha256 };
  } catch (error) {
    return no(`current-comparison-png-unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function uniqueById(rows) {
  const ids = new Set();
  return Array.isArray(rows) && rows.every((row) => row && typeof row.id === 'string'
    && !ids.has(row.id) && (ids.add(row.id), true));
}

function exactRestyleBinding(binding, row, registry, external) {
  const source = registry?.assets?.find((asset) => asset.id === binding.sourceAssetId);
  if (!source || !sameHash(source.decoded?.sha256, row.sourceSha256)
    || !sameHash(binding.decodedSourceSha256, row.sourceSha256)) return null;
  if (!sameJson(binding.locator, source.locator)) return null;
  if (!sameHash(binding.archive?.sha256, source.archive?.sha256)) return null;
  if (!sameHash(binding.exactOutputSha256, row.outputSha256)) return null;
  if (!Array.isArray(binding.restyleIdsForExactOutput) || !binding.restyleIdsForExactOutput.length) return null;
  const restyles = registry.restyles ?? [];
  const references = [];
  for (const restyleId of binding.restyleIdsForExactOutput) {
    const restyle = restyles.find((item) => item.id === restyleId);
    if (!restyle || !restyle.sourceAssetIds?.includes(source.id)
      || !restyle.outputs?.some((output) => output.sha256 === row.outputSha256)) return null;
    const system = external ? 'cok-runtime-comparison-v1' : 'cok-restyle-inventory-v1';
    const cardReferences = (restyle.externalReferences ?? []).filter((ref) => ref.system === system
      && ref.id === row.inventoryAssetId
      && (ref.outputSha256 == null || sameHash(ref.outputSha256, row.outputSha256)));
    if (cardReferences.length > 1) return null;
    for (const cardReference of cardReferences) {
      // The exact output hash belongs to the Restyle output row; older registry card references
      // identify the card and path but intentionally do not duplicate that hash.
      references.push({ restyleId, ...cardReference, outputSha256: row.outputSha256 });
    }
  }
  const declaredReferences = binding.matchingCardReferences;
  const referenceKey = (reference) => JSON.stringify([reference.restyleId, reference.system, reference.id,
    reference.reference ?? null, reference.outputSha256?.toLowerCase() ?? null]);
  const currentReferences = references.map(referenceKey).sort();
  const declaredKeys = Array.isArray(declaredReferences) ? declaredReferences.map(referenceKey).sort() : [];
  if (!currentReferences.length || currentReferences.length !== declaredKeys.length
    || currentReferences.some((reference, index) => reference !== declaredKeys[index])) return null;
  return { sourceAssetId: source.id, locator: source.locator, archive: source.archive,
    decodedSourceSha256: source.decoded.sha256, exactOutputSha256: row.outputSha256,
    restyleIds: binding.restyleIdsForExactOutput.slice(), cardReferences: references };
}

function resolveAlias({ card, currentAlias, aliasIndex, aliasFingerprint, sidecar, registry, rows, external = false }) {
  if (!card || typeof card.id !== 'string' || !HASH.test(card.sourceSha256 ?? '') || !HASH.test(card.outputSha256 ?? '')) {
    return no('invalid-current-card-pair');
  }
  if (!aliasFingerprint || !HASH.test(aliasFingerprint.aliasKey ?? '') || !HASH.test(aliasFingerprint.aliasHash ?? '')) {
    return no('invalid-alias-fingerprint');
  }
  if (!currentAlias || typeof currentAlias !== 'object' || !Number.isInteger(aliasIndex) || aliasIndex < 0) {
    return no('invalid-current-alias-identity');
  }
  if (!uniqueById(registry?.assets) || !Array.isArray(registry?.restyles)) return no('invalid-current-registry');
  const matches = (rows ?? []).filter((row) => row.aliasKey === aliasFingerprint.aliasKey
    && row.aliasHash === aliasFingerprint.aliasHash
    && (aliasFingerprint.rowId == null || row.rowId === aliasFingerprint.rowId));
  if (matches.length !== 1) return no('alias-fingerprint-not-unique');
  const row = matches[0];
  const expectedRowId = `${external ? 'external' : 'generated'}/${card.id}/alias/${String(aliasIndex).padStart(3, '0')}`;
  if (row.rowId !== expectedRowId) return no('alias-position-mismatch');
  const currentIdentity = Object.fromEntries(ALIAS_IDENTITY_FIELDS.filter((key) => Object.hasOwn(currentAlias, key))
    .map((key) => [key, currentAlias[key]]));
  const sidecarIdentity = Object.fromEntries(ALIAS_IDENTITY_FIELDS.filter((key) => Object.hasOwn(row.alias ?? {}, key))
    .map((key) => [key, row.alias[key]]));
  if (!sameJson(currentIdentity, sidecarIdentity)) return no('current-alias-identity-mismatch');
  if (row.status !== 'bound') {
    const candidates = row.status === 'unresolved' && row.bindings?.length === 0
      && Array.isArray(row.sourceAssetCandidates) && row.candidateCount === row.sourceAssetCandidates.length
      ? row.sourceAssetCandidates.map((candidate) => candidate?.sourceAssetId) : null;
    const candidateIds = candidates?.every((id) => typeof id === 'string' && id.length > 0)
      && new Set(candidates).size === candidates.length
      && sameJson(row.sourceAssetIds, candidates) ? candidates : [];
    return { ...no('alias-row-not-bound'), candidateSourceAssetIds: candidateIds };
  }
  if (row.inventoryAssetId !== card.id) return no('card-id-mismatch');
  if (!sameHash(row.sourceSha256, card.sourceSha256)) return no('source-hash-mismatch');
  if (!sameHash(row.outputSha256, card.outputSha256)) return no('output-hash-mismatch');
  if (!Array.isArray(row.bindings) || row.bindings.length !== 1
    || !Array.isArray(row.sourceAssetIds) || row.sourceAssetIds.length !== 1
    || row.bindings[0].sourceAssetId !== row.sourceAssetIds[0]) return no('binding-not-single-exact-source');
  const source = exactRestyleBinding(row.bindings[0], row, registry, external);
  if (!source) return no('registry-evidence-mismatch');
  return { status: 'resolved', reason: null, sourceAssetIds: [source.sourceAssetId], sources: [source], rowId: row.rowId };
}

export function resolveGeneratedAliasBinding({ card, currentAlias, aliasIndex, aliasFingerprint, sidecar, registry }) {
  return resolveAlias({ card, currentAlias, aliasIndex, aliasFingerprint, sidecar, registry, rows: sidecar?.generatedAliasRows });
}

export function resolveExternalComparisonBinding({ card, currentAlias, aliasIndex, aliasFingerprint, sidecar, registry }) {
  return resolveAlias({ card, currentAlias, aliasIndex, aliasFingerprint, sidecar, registry, rows: sidecar?.externalComparisonAliases, external: true });
}

export function requireExactRestyleBinding(result, { sourceAssetId, restyleId, outputSha256 }) {
  if (result?.status !== 'resolved' || typeof sourceAssetId !== 'string' || typeof restyleId !== 'string'
      || !HASH.test(outputSha256 ?? '')) return no('invalid-expected-restyle-binding');
  const matchingSource = result.sources?.find((source) => source.sourceAssetId === sourceAssetId
    && source.restyleIds?.includes(restyleId) && sameHash(source.exactOutputSha256, outputSha256));
  if (!matchingSource || !result.sourceAssetIds?.includes(sourceAssetId)) return no('gallery-card-does-not-match-current-restyle-output');
  return result;
}

export function resolveCuratedCardSources({ cardId, sourceSha256, outputSha256, sidecar, registry }) {
  if (typeof cardId !== 'string' || !HASH.test(sourceSha256 ?? '') || !HASH.test(outputSha256 ?? '')) {
    return no('invalid-current-curated-pair');
  }
  if (!uniqueById(registry?.assets)) return no('invalid-current-registry');
  const cards = (sidecar?.curatedCards ?? []).filter((card) => card.cardId === cardId);
  if (cards.length !== 1 || cards[0].status !== 'exact') return no('curated-card-not-exact');
  const card = cards[0];
  const links = card.sourceLinks.filter((link) => sameHash(link.sourceSha256, sourceSha256)
    && sameHash(link.outputSha256, outputSha256));
  if (!links.length) return no('curated-pair-mismatch');
  const sources = [];
  for (const link of links) {
    if (link.status !== 'exact' || !link.exactSourceFileMatch || !link.exactOutputFileMatch
      || !sameHash(link.decodedSourceSha256, link.sourceSha256)
      || link.galleryReference?.system !== 'cok-curated-restyle-v1'
      || link.galleryReference.id !== cardId || !HASH.test(link.galleryReference.manifestSha256 ?? '')) {
      return no('curated-link-evidence-mismatch');
    }
    const source = registry.assets.find((asset) => asset.id === link.sourceAssetId);
    if (!source || !sameHash(source.decoded?.sha256, link.sourceSha256)
      || !sameHash(link.sourceSha256, sourceSha256)
      || !sameHash(link.outputSha256, outputSha256)
      || !sameJson(source.locator, link.locator)
      || !sameHash(source.archive?.sha256, link.archive?.sha256)
      || !source.galleryReferences?.some((ref) => ref.system === link.galleryReference.system
        && ref.id === cardId && ref.manifestSha256 === link.galleryReference.manifestSha256
        && sameHash(ref.sourceSha256, sourceSha256) && sameHash(ref.outputSha256, outputSha256))) {
      return no('registry-curated-reference-mismatch');
    }
    sources.push({ sourceAssetId: source.id, locator: source.locator, archive: source.archive,
      decodedSourceSha256: source.decoded.sha256, exactOutputSha256: outputSha256,
      galleryReference: link.galleryReference });
  }
  return { status: 'resolved', reason: null, sourceAssetIds: sources.map((source) => source.sourceAssetId), sources, cardId };
}
