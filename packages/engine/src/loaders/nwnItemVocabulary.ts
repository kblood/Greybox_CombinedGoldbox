/**
 * Neverwinter Nights (DOS/AOL) item-name vocabulary recovery.
 *
 * NWN's 63-byte `MONITM.DAX` records store three one-byte name codes, but those codes do not use
 * the shorter CoK/DoK vocabulary published in `VOCAB.TXT`.  The title's own code 1..254 table is
 * embedded in `GAME.EXE`.  It starts with `Battle Axe` and uses two record forms:
 *
 * - `[length][ASCII name][7-byte tagged suffix]`; the suffix is
 *   `[opaque, 00, B2, 00, opaque, 00, B0]`.
 * - a Pascal `string[20]`: `[length][ASCII name][zero padding through byte 20]`.
 *
 * Both forms are present in retail bytes.  In particular, long names such as `Bec De Corbin` use
 * the padded form; treating every suffix as a fixed-size stat record is what previously caused the
 * table walk to lose alignment.  Code 0 is the empty/no-component sentinel.  The decoder makes no
 * claim about code 255, which `MONITM.DAX` does not use.
 */

const ASCII_SPACE = 0x20;
const ASCII_TILDE = 0x7e;
const MAX_NAME_LENGTH = 20;
const TAGGED_SUFFIX_SIZE = 7;

/** Number of non-empty vocabulary entries verified through all codes used by retail `MONITM.DAX`. */
export const NWN_ITEM_VOCABULARY_COUNT = 254;

// Unique retail-byte signature at GAME.EXE file offset 0x9B42 (39746).  It includes the complete
// code-1 record plus the start of code 2, so an incidental UI copy of "Battle Axe" cannot match.
const TABLE_SIGNATURE = Uint8Array.from([
  0x0a, 0x42, 0x61, 0x74, 0x74, 0x6c, 0x65, 0x20, 0x41, 0x78, 0x65,
  0x0b, 0x00, 0xb2, 0x00, 0x0a, 0x00, 0xb0,
  0x08, 0x48, 0x61, 0x6e, 0x64, 0x20, 0x41, 0x78, 0x65,
]);

function findBytes(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let offset = 0; offset <= haystack.length - needle.length; offset++) {
    for (let i = 0; i < needle.length; i++) {
      if (haystack[offset + i] !== needle[i]) continue outer;
    }
    return offset;
  }
  return -1;
}

function isAsciiName(bytes: Uint8Array): boolean {
  return bytes.length > 0 && bytes.every((byte) => byte >= ASCII_SPACE && byte <= ASCII_TILDE);
}

function isTaggedSuffix(bytes: Uint8Array): boolean {
  return bytes.length === TAGGED_SUFFIX_SIZE
    && bytes[1] === 0x00
    && bytes[2] === 0xb2
    && bytes[3] === 0x00
    && bytes[5] === 0x00
    && bytes[6] === 0xb0;
}

function ascii(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

/**
 * Decode NWN's executable-resident item vocabulary.  The returned array is indexed directly by a
 * `MONITM.DAX` namenum: index 0 is `''`, index 1 is `Battle Axe`, and index 254 is `Cursed`.
 *
 * The table is located by its retail-byte signature rather than by an absolute MZ file offset, so a
 * relocated executable with the same source table remains decodable.  A different/truncated build
 * fails closed instead of returning shifted or invented names.
 */
export function decodeNwnItemVocabulary(gameExe: Uint8Array): readonly string[] {
  const tableOffset = findBytes(gameExe, TABLE_SIGNATURE);
  if (tableOffset < 0) {
    throw new Error('NWN item vocabulary: retail Battle Axe/Hand Axe table signature not found');
  }

  const vocabulary: string[] = [''];
  let offset = tableOffset;

  while (vocabulary.length <= NWN_ITEM_VOCABULARY_COUNT) {
    const length = gameExe[offset];
    if (length === undefined || length === 0 || length > MAX_NAME_LENGTH) break;

    const nameStart = offset + 1;
    const nameEnd = nameStart + length;
    const nameBytes = gameExe.subarray(nameStart, nameEnd);
    if (nameBytes.length !== length || !isAsciiName(nameBytes)) break;

    const taggedEnd = nameEnd + TAGGED_SUFFIX_SIZE;
    const taggedSuffix = gameExe.subarray(nameEnd, taggedEnd);
    if (isTaggedSuffix(taggedSuffix)) {
      offset = taggedEnd;
    } else {
      const recordEnd = offset + 1 + MAX_NAME_LENGTH;
      const padding = gameExe.subarray(nameEnd, recordEnd);
      if (padding.length !== MAX_NAME_LENGTH - length || !padding.every((byte) => byte === 0)) break;
      offset = recordEnd;
    }

    vocabulary.push(ascii(nameBytes));
  }

  if (vocabulary.length !== NWN_ITEM_VOCABULARY_COUNT + 1) {
    throw new Error(
      `NWN item vocabulary: decoded ${vocabulary.length - 1} entries, expected ${NWN_ITEM_VOCABULARY_COUNT}`,
    );
  }
  return vocabulary;
}
