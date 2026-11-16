const HASH = /^[a-f0-9]{64}$/i;
const APPEARANCE_ID = /^cok-player-(?:[0-9a-f]{2}-){3}[0-9a-f]{2}$/;
const DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function safePngPath(value) {
  if (typeof value !== 'string' || !value) return false;
  const parts = value.split('/');
  return parts.length > 0 && parts.every((part, index) => {
    const name = index === parts.length - 1 && part.endsWith('.png') ? part.slice(0, -4) : part;
    return /^[A-Za-z0-9_-]+$/.test(name) && !DEVICE_NAME.test(name);
  }) && parts.at(-1).endsWith('.png');
}

function partPins(part) {
  return part && typeof part.sourceSha256 === 'string' && HASH.test(part.sourceSha256)
    && typeof part.restyleSha256 === 'string' && HASH.test(part.restyleSha256)
    ? { sourceSha256: part.sourceSha256.toLowerCase(), restyleSha256: part.restyleSha256.toLowerCase() }
    : null;
}

function admissionRows(manifest, policy) {
  if (policy?.schema !== 'cok-player-restyle-admission-v1' || !Array.isArray(manifest?.appearances)
      || !Array.isArray(policy.frames)) return null;
  const expected = new Map();
  for (const appearance of manifest.appearances) {
    if (!appearance || typeof appearance.appearanceId !== 'string' || !APPEARANCE_ID.test(appearance.appearanceId)
        || expected.has(appearance.appearanceId) || !safePngPath(appearance.head?.sourceFile)
        || !safePngPath(appearance.head?.restyleFile) || !Array.isArray(appearance.bodyFrames)
        || !appearance.bodyFrames.length) return null;
    for (const [frameIndex, body] of appearance.bodyFrames.entries()) {
      const headPins = partPins(appearance.head);
      const bodyPins = partPins(body);
      if (!headPins || !bodyPins || !Number.isInteger(body.blockId)
          || !safePngPath(body.sourceFile) || !safePngPath(body.restyleFile)) return null;
      expected.set(`${appearance.appearanceId}/${frameIndex}`, {
        appearanceId: appearance.appearanceId, frameIndex, headBlockIds: appearance.head.blockIds,
        bodyBlockId: body.blockId,
        head: headPins, body: bodyPins,
      });
    }
  }
  if (!expected.size || policy.frames.length !== expected.size) return null;
  const actual = new Map();
  for (const row of policy.frames) {
    if (!row || typeof row.appearanceId !== 'string' || !Number.isInteger(row.frameIndex) || row.frameIndex < 0
        || !['admitted', 'held'].includes(row.state) || typeof row.reason !== 'string' || !row.reason.trim()) return null;
    const key = `${row.appearanceId}/${row.frameIndex}`;
    const pins = expected.get(key);
    const rowHead = partPins(row.head);
    const rowBody = partPins(row.body);
    if (!pins || actual.has(key) || JSON.stringify(row.headBlockIds) !== JSON.stringify(pins.headBlockIds)
        || row.bodyBlockId !== pins.bodyBlockId
        || !rowHead || !rowBody || JSON.stringify(rowHead) !== JSON.stringify(pins.head)
        || JSON.stringify(rowBody) !== JSON.stringify(pins.body)) return null;
    actual.set(key, row);
  }
  return actual.size === expected.size ? actual : null;
}

export function cokPlayerFrameRestyleAdmission(manifest, policy, appearanceId, frameIndex) {
  const rows = admissionRows(manifest, policy);
  if (!rows) return { state: 'not-admitted', reason: 'player-restyle-admission-policy-invalid' };
  const row = rows.get(`${appearanceId}/${frameIndex}`);
  if (!row) return { state: 'not-admitted', reason: 'player-restyle-frame-not-listed' };
  return { state: row.state === 'admitted' ? 'admitted' : 'not-admitted', reason: row.reason };
}

export function cokPlayerAppearancePackagePlan(manifest, policy) {
  const rows = admissionRows(manifest, policy);
  if (!rows) throw new Error('Invalid or stale CoK player Restyle admission policy');
  const entries = [];
  for (const appearance of manifest.appearances) {
    const id = appearance.appearanceId;
    const head = appearance.head;
    const add = (part, kind) => entries.push({
      file: kind === 'original' ? part.sourceFile : part.restyleFile,
      sha256: kind === 'original' ? part.sourceSha256 : part.restyleSha256,
      width: part.nativeWidth * manifest.pixelScale,
      height: part.nativeHeight * manifest.pixelScale,
      colorType: kind === 'original' ? 2 : 6,
      dest: `${id}/${kind}/${(kind === 'original' ? part.sourceFile : part.restyleFile).split('/').at(-1)}`,
    });
    add(head, 'original');
    if (appearance.bodyFrames.some((_, index) => rows.get(`${id}/${index}`)?.state === 'admitted')) add(head, 'restyle');
    appearance.bodyFrames.forEach((body, index) => {
      add(body, 'original');
      if (rows.get(`${id}/${index}`)?.state === 'admitted') add(body, 'restyle');
    });
  }
  if (entries.length !== 20 || new Set(entries.map((entry) => entry.dest)).size !== entries.length) {
    throw new Error('CoK player Restyle package roster differs from the exact admitted 20-path contract');
  }
  return entries;
}

export function cokPlayerAppearanceHeldRestylePaths(manifest, policy) {
  const rows = admissionRows(manifest, policy);
  if (!rows) throw new Error('Invalid or stale CoK player Restyle admission policy');
  return manifest.appearances.flatMap((appearance) => appearance.bodyFrames.flatMap((body, frameIndex) => {
    if (rows.get(`${appearance.appearanceId}/${frameIndex}`)?.state !== 'held') return [];
    return [`${appearance.appearanceId}/restyle/${body.restyleFile.split('/').at(-1)}`];
  }));
}
