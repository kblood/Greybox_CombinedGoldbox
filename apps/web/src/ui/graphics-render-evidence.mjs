const AUDITED_COK_AMIGA_SPRIT_SHA256 = new Map([
  ['SPRIT1.DAA', '3a851746076c54f097dce925e9866491c754364962754cd1bb663d3d06764694'],
  ['SPRIT2.DAA', 'd962bbb9b86775c996fddd39420e33b87612ec593a58d76ce7bd51dee3973785'],
]);

/** Return source-render evidence only for exact, pinned rendering inputs. */
export function graphicsRenderEvidence(asset) {
  const transform = asset?.decoded?.renderingTransform;
  if (!transform) return null;
  const archiveName = asset.archive?.name?.toUpperCase();
  const archiveHash = asset.archive?.sha256?.toLowerCase();
  if (asset.game === 'cok' && asset.platform === 'Amiga'
      && archiveHash === AUDITED_COK_AMIGA_SPRIT_SHA256.get(archiveName)) {
    return {
      title: 'Audited candidate archive decode',
      label: 'Stored frame decode verified',
      explanation: `All 17 blocks in this exact ${archiveName} archive decode into separate header/frame chunks, and all 51 stored-frame hashes match the pinned decode receipt. This verifies stored-frame extraction only. Tail layout, candidate pixels, frame-0 XOR, in-game selection/timing, and retail archive provenance remain unverified; mirroring is conditional.`,
      status: 'verified-stored-frame-decode',
    };
  }
  if (transform === 'candidate-tail-offset-frame0-xor') {
    return {
      title: 'Candidate source render',
      label: 'Rendering hypothesis',
      explanation: 'Candidate tail-offset + frame-0 XOR preview. No exact native segmented-decode receipt covers this source archive.',
      status: 'hypothesis',
    };
  }
  return {
    title: 'Candidate source render',
    label: 'Rendering hypothesis',
    explanation: 'Experimental tail-offset preview. No exact native segmented-decode receipt covers this source archive.',
    status: 'hypothesis',
  };
}
