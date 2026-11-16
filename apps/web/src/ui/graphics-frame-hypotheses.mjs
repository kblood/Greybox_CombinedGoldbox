export const FRAME_HYPOTHESIS_SCHEMA = 'cok-graphics-frame-hypotheses-v1';

const validSha = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);

/** Validate open semantic hypotheses without promoting them into animationGroups. */
export function validateGraphicsFrameHypotheses(sidecar, registry) {
  if (sidecar == null) return { status: 'missing', hypotheses: [], error: null };
  if (sidecar.schema !== FRAME_HYPOTHESIS_SCHEMA || !Array.isArray(sidecar.hypotheses)) {
    return { status: 'invalid', hypotheses: [], error: 'Frame hypothesis sidecar schema is invalid.' };
  }
  const assets = new Map((registry?.assets ?? []).map((asset) => [asset.id, asset]));
  const seen = new Set();
  const issues = [];
  for (const hypothesis of sidecar.hypotheses) {
    if (!hypothesis || typeof hypothesis.id !== 'string' || !hypothesis.id.trim() || seen.has(hypothesis.id)) {
      issues.push('Hypothesis IDs must be unique non-empty strings.'); continue;
    }
    seen.add(hypothesis.id);
    if (hypothesis.status !== 'open' || !Array.isArray(hypothesis.sources) || hypothesis.sources.length < 2
      || !Array.isArray(hypothesis.evidence) || !hypothesis.evidence.length || !hypothesis.relationHypothesis) {
      issues.push(`${hypothesis.id}: status, source, relation, or evidence fields are incomplete.`); continue;
    }
    const sourceIds = hypothesis.sources.map((source) => source?.assetId);
    if (sourceIds.some((id) => typeof id !== 'string') || new Set(sourceIds).size !== sourceIds.length) {
      issues.push(`${hypothesis.id}: source IDs are missing or duplicated.`); continue;
    }
    for (const source of hypothesis.sources) {
      const asset = assets.get(source.assetId);
      if (!asset || !validSha(source.pixelSha256) || asset.decoded?.pixelSha256?.toLowerCase() !== source.pixelSha256.toLowerCase()) {
        issues.push(`${hypothesis.id}: source ID or pinned pixel SHA-256 does not match the registry.`); break;
      }
      if (asset.animationGroupId) {
        issues.push(`${hypothesis.id}: source already belongs to canonical animation group ${asset.animationGroupId}.`); break;
      }
    }
    if (hypothesis.evidence.some((item) => !item || typeof item.kind !== 'string' || typeof item.reference !== 'string'
      || !item.reference.trim())) issues.push(`${hypothesis.id}: evidence references must be explicit.`);
  }
  return issues.length ? { status: 'invalid', hypotheses: [], error: issues.join(' ') }
    : { status: 'ready', hypotheses: sidecar.hypotheses, error: null };
}

export function frameHypothesisRows(validation, registry) {
  if (validation.status === 'missing') return [];
  if (validation.status === 'invalid') return [{ key: 'frame-hypotheses/metadata-error', unit: 'metadata', platforms: [],
    sourceIds: [], groupId: null, cardId: null, reasons: ['Frame hypothesis metadata failed validation.'],
    text: validation.error ?? '', details: { state: 'invalid-sidecar', error: validation.error }, evidence: [] }];
  const assets = new Map(registry.assets.map((asset) => [asset.id, asset]));
  return validation.hypotheses.map((hypothesis) => {
    const sourceIds = hypothesis.sources.map((source) => source.assetId);
    const platforms = [...new Set(sourceIds.map((id) => assets.get(id)?.platform).filter(Boolean))].sort();
    return { key: hypothesis.id, unit: 'hypotheses', platforms, sourceIds, groupId: null, cardId: null,
      reasons: ['Open hypothesis only; no animation order, timing, selector, or runtime use is asserted.'],
      text: [hypothesis.id, hypothesis.title, hypothesis.relationHypothesis, ...sourceIds,
        ...hypothesis.sources.map((source) => source.proposedRole)].join(' '),
      details: hypothesis, evidence: hypothesis.evidence };
  });
}
