/**
 * SSI signed-byte run-length decompression (the classic SSI / PCX-family scheme).
 * Shared and byte-order-independent across DAX and DAA.
 *
 *   read control byte c:
 *     c <  0x80 : copy the next (c + 1) bytes literally
 *     c >= 0x80 : repeat the next single byte (256 - c) times
 *
 * When `expected` is given, decode stops as soon as the output reaches that
 * length and the result is exactly `expected` bytes — matching the Python
 * reference `rle_decode` in tools/dax_decode.py. DAX always supplies the
 * decompressed size (raw_size), so the bounded path is the one exercised in
 * practice. The unbounded path grows a buffer and returns all produced bytes.
 *
 * **Writers must stay inside a narrower envelope than this reader accepts** (measured
 * 2026-08-21). Walking every shipped DOS Gen1 `.DAX` we hold — 563 files across all eight DAX
 * titles, 8271 blocks, **2,339,310 control bytes** — SSI's own compressor uses 126 of the 128
 * literal controls and 127 of the 128 repeat controls, but emits `0x7E`, `0x7F` and `0x80`
 * **zero times**. That is a hole, not sparseness: both saturation values spike right beside it
 * (`0x7D`, a 126-byte literal run, appears 11,707 times against ~100 for each of `0x76`..`0x7C`;
 * `0x81`, a 127-byte repeat, appears 15,789 times against 239 for `0x82`). So the longest run
 * SSI ever writes is **126 literals or 127 repeats**, and any encoder of ours should cap there —
 * see `LITERAL_RUN_MAX` in `tools/patch_pool_ecl_transition.py`, whose 128-byte cap emitted
 * control `0x7F` on every chunk of a >=128-byte payload until it was corrected, and
 * `tools/test_gen1_rle_control_envelope.py`, which guards both halves.
 *
 * This decoder is deliberately **left as-is**: it reads `0x7F` as a 128-byte literal and `0x80`
 * as a 128-byte repeat. A sibling finding holds that retail's Gen1 decompressor treats both as
 * dead controls that emit nothing (as DQK's `MONCHA` decompressor verifiably does for `0x80` —
 * see {@link monchaRLE}), which would make our reading wrong. It is not adopted here because it
 * could not be re-derived from the binaries in this repo: CoK/DoK's `START.EXE`, which holds the
 * resident DAX loader, ships EXEPACK-compressed, so the routine is not on disk to disassemble.
 * The distinction is **unobservable on every byte we hold** — 0 occurrences either way — so
 * changing the reader would trade a documented assumption for an undocumented one. Constraining
 * the *writer*, which is what actually reaches a retail decompressor, needs no such claim.
 */
export function signedByteRLE(src: Uint8Array, expected?: number): Uint8Array {
  if (expected !== undefined) {
    const out = new Uint8Array(expected);
    let outLen = 0;
    const n = src.length;
    let i = 0;
    while (i < n && outLen < expected) {
      const c = src[i++];
      if (c < 0x80) {
        // literal run of c+1 bytes
        const cnt = c + 1;
        for (let k = 0; k < cnt && i < n && outLen < expected; k++) {
          out[outLen++] = src[i++];
        }
      } else {
        // repeat next byte (256 - c) times
        const cnt = 256 - c;
        if (i < n) {
          const v = src[i++];
          for (let k = 0; k < cnt && outLen < expected; k++) out[outLen++] = v;
        } else {
          i++;
        }
      }
    }
    return out;
  }

  // Unbounded path (no expected size): collect then materialize.
  const parts: number[] = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i++];
    if (c < 0x80) {
      const cnt = c + 1;
      for (let k = 0; k < cnt && i < n; k++) parts.push(src[i++]);
    } else {
      const cnt = 256 - c;
      if (i < n) {
        const v = src[i++];
        for (let k = 0; k < cnt; k++) parts.push(v);
      } else {
        i++;
      }
    }
  }
  return Uint8Array.from(parts);
}

/**
 * DQK `MONCHA.GLB` run-length variant (documented in hackdocs MONSTDAT.TXT). It is the same
 * signed-byte family as {@link signedByteRLE} but with the boundary **one higher** and the repeat
 * count **one larger**:
 *
 *   read control byte c:
 *     c <  0x80 (≤127) : copy the next (c + 1) bytes literally (1..128)
 *     c == 0x80        : NO-OP — consumes nothing, emits nothing
 *     c >  0x80 (≥129) : repeat the next single byte (257 − c) times (2..128)
 *
 * The `+1` on both the boundary and the repeat count is what distinguishes it from the DAX/DAA
 * scheme: a DQK monster record's all-`0x0a` ability run and its zero padding only decode to the
 * verified fixed-offset layout (name at 24, AC/THAC0 at 107/55) under 257−c, never 256−c. Unbounded
 * only — MONCHA does not store a per-record decompressed size; the caller validates the result.
 */
export function monchaRLE(src: Uint8Array): Uint8Array {
  const parts: number[] = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i++];
    if (c === 0x80) {
      // Engine-exact: DQK's own decompressor (canonical 00d7:0a1c, file 0x3B8C) tests `or al,al /
      // jl` then `cmp al,0x80 / je loop` — so 0x80 consumes nothing and emits nothing. It is NOT a
      // 129-byte literal copy, which is what this decoder did until 2026-08-19 and what the doc
      // comment above claimed. Latent on every corpus we hold: 0 of 6038 control bytes across DQK's
      // 98 `MONCHA.GLB` members and FRUA's 127 `MONST.GLB` members is 0x80 (max literal run seen:
      // 126 and 36), i.e. SSI's own compressor caps literal runs at 128 and never reaches the
      // opcode. `encodeMonchaMember` now caps at 128 for the same reason.
      continue;
    }
    if (c < 0x80) {
      const cnt = c + 1;
      for (let k = 0; k < cnt && i < n; k++) parts.push(src[i++]);
    } else {
      const cnt = 257 - c;
      if (i < n) {
        const v = src[i++];
        for (let k = 0; k < cnt; k++) parts.push(v);
      } else {
        i++;
      }
    }
  }
  return Uint8Array.from(parts);
}
