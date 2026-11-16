/** Return whether a JavaScript string is a valid Unicode scalar sequence rather than containing an
 * unpaired UTF-16 surrogate. `TextEncoder` replaces malformed code units with U+FFFD, which would
 * otherwise make distinct caller values collide in the fingerprinted storage namespace. */
function isWellFormedUtf16(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index++;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

/** Encode one well-formed string as a delimiter-free, injective UTF-8 segment. */
function utf8HexSegment(value: string, label: string): string {
  if (!isWellFormedUtf16(value)) {
    throw new Error(`moduleSaveKey: ${label} must contain well-formed UTF-16`);
  }
  let encoded = '';
  for (const byte of new TextEncoder().encode(value)) encoded += byte.toString(16).padStart(2, '0');
  return encoded;
}

/** Stable browser storage key for one module entrypoint, optionally scoped to an exact artifact.
 *
 * The no-artifact branch is the historical byte-for-byte format. Fingerprinted saves use their own
 * raw-colon namespace: `encodeURIComponent` never emits a raw colon, so no legacy module id can
 * impersonate it. Every variable field is UTF-8 hex (or a validated decimal entrypoint), making the
 * tuple unambiguous even when module/artifact ids themselves contain dots or delimiter-like text. */
export function moduleSaveKey(moduleId: string, entryPointId: number, artifactId?: string): string {
  if (!isWellFormedUtf16(moduleId)) {
    throw new Error('moduleSaveKey: module id must contain well-formed UTF-16');
  }
  if (!Number.isSafeInteger(entryPointId) || entryPointId < 0) {
    throw new Error('moduleSaveKey: entrypoint id must be a non-negative safe integer');
  }
  if (artifactId === undefined) {
    return `greybox.module.save.${encodeURIComponent(moduleId)}.${entryPointId}`;
  }
  return `greybox.module.save.v2:${utf8HexSegment(moduleId, 'module id')}:` +
    `${entryPointId}:${utf8HexSegment(artifactId, 'artifact id')}`;
}
