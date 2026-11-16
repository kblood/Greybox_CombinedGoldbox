/**
 * Minimal, dependency-free base64 codec (M11.S4). `packages/engine` is kept pure — no DOM/Node
 * libs (ARCHITECTURE.md §"pure fns over Uint8Array") — so the usual `btoa`/`atob`/`Buffer`
 * globals aren't available (or even typed) here. Needed to embed `IndexedImage.indices` byte
 * arrays inside the JSON `.gbmod` portable format (`serialize.ts`).
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    const has1 = i + 1 < bytes.length;
    const has2 = i + 2 < bytes.length;
    out += ALPHABET[b0 >> 2];
    out += ALPHABET[((b0 & 0x03) << 4) | (has1 ? b1 >> 4 : 0)];
    out += has1 ? ALPHABET[((b1 & 0x0f) << 2) | (has2 ? b2 >> 6 : 0)] : '=';
    out += has2 ? ALPHABET[b2 & 0x3f] : '=';
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = ALPHABET.indexOf(clean[i]);
    const c1 = ALPHABET.indexOf(clean[i + 1]);
    const c2 = i + 2 < clean.length ? ALPHABET.indexOf(clean[i + 2]) : -1;
    const c3 = i + 3 < clean.length ? ALPHABET.indexOf(clean[i + 3]) : -1;
    out[o++] = ((c0 << 2) | (c1 >> 4)) & 0xff;
    if (c2 >= 0) out[o++] = (((c1 & 0x0f) << 4) | (c2 >> 2)) & 0xff;
    if (c3 >= 0) out[o++] = (((c2 & 0x03) << 6) | c3) & 0xff;
  }
  return out;
}
