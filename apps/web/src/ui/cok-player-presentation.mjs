import manifest from './cokPlayerAppearanceManifest.json' with { type: 'json' };

/** Guard both mandatory and optional completion against discarded roster requests. */
export async function presentCokPartyRosterIcon(preparation, request, isCurrent, paint, unavailable) {
  try {
    const prepared = await preparation;
    if (!isCurrent()) return;
    const show = (appearance) => {
      if (isCurrent()) paint(resolveCokPlayerPresentation(appearance,
        { ...request, consumer: 'party-roster', playback: 'still' }));
    };
    show(prepared?.original);
    if (prepared) show(await prepared.restyleReady);
  } catch {
    if (isCurrent()) unavailable();
  }
}

/** Select one explicit still and its status together. No temporal meaning follows from variants. */
export function resolveCokPlayerPresentation(appearance, request) {
  const held = (reason) => ({ state: 'held', reason, art: null, frame: null, variantIndex: null,
    source: null, playback: 'held', label: 'Character icon unavailable' });
  if (!request || request.playback !== 'still') return held('player-playback-not-admitted');
  if (!['DOS-EGA', 'Amiga', 'Restyle'].includes(request.mode)
      || !['DOS-EGA', 'Amiga'].includes(request.fallback)) return held('unknown-graphics-mode');
  if (!['creator-preview', 'character-sheet', 'combat-party-icon', 'party-roster'].includes(request.consumer)) return held('unknown-player-consumer');
  const preview = request.consumer === 'creator-preview';
  if (preview ? ![0, 1].includes(request.variantIndex)
    : request.variantIndex !== undefined && request.variantIndex !== 0) return held('player-variant-not-admitted');
  const index = preview ? request.variantIndex : 0;
  const entry = manifest.appearances.find((row) => row.appearanceId === appearance?.id);
  const frame = appearance?.frames?.[index];
  const artValid = (art) => art?.width === 96 && art.height === 96
    && art.pixels instanceof Uint8ClampedArray && art.pixels.length === 96 * 96 * 4;
  if (!entry || !frame || frame.bodyBlockId !== entry.bodyFrames[index].blockId
      || frame.pixelScale !== 4 || !artValid(frame.original)) return held('player-source-not-mapped');
  const canonical = frame.canonical;
  const canonicalValid = canonical?.appearanceSetId === `cok/dos-ega/appearance/${entry.appearanceId.slice(11)}`
    && canonical.headSourceId === `cok/dos-ega/install/chead.dax/block/${entry.head.blockIds[index]}/frame/0`
    && canonical.bodySourceId === `cok/dos-ega/install/cbody.dax/block/${frame.bodyBlockId}/frame/0`;
  if (canonical && !canonicalValid) return held('player-source-identity-mismatch');
  const status = frame.restyleStatus;
  const ready = request.mode === 'Restyle' && index === 0 && canonicalValid
    && status?.state === 'ready' && artValid(frame.restyle);
  let label;
  if (ready) label = 'Restyle character icon';
  else {
    const optional = request.mode !== 'Restyle' ? ''
      : index === 1 || status?.state === 'not-admitted' ? ' · Restyle awaiting review'
        : status?.state === 'failed' ? ` · Restyle unavailable (${status.component}: ${status.error})`
          : status?.state === 'pending' ? ' · Restyle loading' : ' · Restyle unavailable';
    const amiga = request.mode === 'Amiga' || (request.mode === 'Restyle' && request.fallback === 'Amiga');
    label = `${request.mode === 'DOS-EGA' ? 'DOS-EGA' : 'DOS'} character icon${optional}${amiga ? ' · Amiga mapping pending' : ''}`;
  }
  return { state: 'ready', reason: ready ? 'admitted-restyle-still' : 'dos-source-still',
    art: ready ? frame.restyle : frame.original, frame, variantIndex: index,
    source: ready ? 'Restyle' : 'DOS-EGA', playback: 'held', label };
}
