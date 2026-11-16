import receipt from '../../../../docs/engine/research/cok-restyle-batch02-provenance-v1.json' with { type: 'json' };

const byCard = new Map(receipt.records.map((row) => [row.cardId, row]));

function prompt(row) {
  return {
    batch: row.batch, file: row.file, sha256: row.sha256, text: row.text,
    inputSha256: row.inputSha256, outputSha256: row.outputSha256,
    inputFile: row.inputFile, sourceSha256: row.sourceSha256, transform: structuredClone(row.transform),
  };
}

/** Gallery metadata can only select the receipt row for the exact card, pair and animation. */
export function reviewedCardPrompt(card, animation = null) {
  const row = byCard.get(card.id);
  if (!row || row.sourceSha256 !== card.sourceSha256 || row.outputSha256 !== card.outputSha256
      || row.animationId !== (animation?.id ?? null)) return null;
  if (animation && (animation.basisSourceSha256 !== row.sourceSha256
      || animation.basisOutputSha256 !== row.outputSha256 || animation.frames?.r0?.sha256 !== row.outputSha256)) return null;
  return prompt(row);
}

/** Registry lookup retains every exact locator and Restyle record, including shared outputs. */
export function reviewedSourcePrompt(source, restyle) {
  const matches = receipt.records.filter((row) => row.sourceSha256 === source.decoded?.sha256
    && restyle.sourceAssetIds.includes(source.id)
    && restyle.outputs.some((output) => output.sha256 === row.outputSha256)
    && row.links.some((link) => link.restyleId === restyle.id && link.sourceAssetIds.includes(source.id)
      && (link.system === 'cok-restyle-inventory-v1'
        ? restyle.externalReferences?.some((reference) => reference.system === link.system && reference.id === row.cardId)
        : restyle.prompt?.sha256 === row.sha256 && restyle.prompt?.inputSha256 === row.inputSha256)));
  return matches.length === 1 ? prompt(matches[0]) : null;
}

function equalRecord(expected, current) {
  if (expected === current) return true;
  if (!expected || !current || typeof expected !== 'object' || typeof current !== 'object'
      || Array.isArray(expected) !== Array.isArray(current)) return false;
  const keys = Object.keys(expected);
  return keys.length === Object.keys(current).length
    && keys.every((key) => Object.hasOwn(current, key) && equalRecord(expected[key], current[key]));
}

export function isReviewedCardPrompt(reference, card, animation = null) {
  const expected = reviewedCardPrompt(card, animation);
  return expected !== null && equalRecord(expected, reference);
}

export function paddedInputDescription(reference) {
  const { crop: [x, y, width, height], canvas, nativeSize, sourceScale, inputScale } = reference.transform;
  return `Input ${reference.inputFile} · SHA-256 ${reference.inputSha256}. The ${width}×${height} crop at (${x}, ${y}) on a ${canvas.join('×')} canvas equals the ${nativeSize.join('×')} source enlarged ${inputScale}× with nearest-neighbor. Canonical source PNG: ${sourceScale}× native size · SHA-256 ${reference.sourceSha256}. Output SHA-256 ${reference.outputSha256}.`;
}
