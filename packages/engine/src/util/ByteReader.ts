/**
 * A small cursor over a Uint8Array backed by a DataView, with explicit-endian
 * reads. DAX/HLIB are little-endian; DAA is big-endian (needed later). Offsets
 * are relative to the start of the wrapped view.
 */
export class ByteReader {
  readonly bytes: Uint8Array;
  private readonly dv: DataView;
  private pos = 0;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get length(): number {
    return this.bytes.byteLength;
  }

  get offset(): number {
    return this.pos;
  }

  seek(pos: number): this {
    this.pos = pos;
    return this;
  }

  skip(n: number): this {
    this.pos += n;
    return this;
  }

  remaining(): number {
    return this.bytes.byteLength - this.pos;
  }

  // --- sequential reads (advance the cursor) ---

  u8(): number {
    return this.dv.getUint8(this.pos++);
  }

  u16(littleEndian = true): number {
    const v = this.dv.getUint16(this.pos, littleEndian);
    this.pos += 2;
    return v;
  }

  u32(littleEndian = true): number {
    const v = this.dv.getUint32(this.pos, littleEndian);
    this.pos += 4;
    return v;
  }

  /** Read `n` bytes as a subarray view (no copy) and advance. */
  slice(n: number): Uint8Array {
    const out = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  // --- random-access reads (do NOT advance the cursor) ---

  u8At(off: number): number {
    return this.dv.getUint8(off);
  }

  u16At(off: number, littleEndian = true): number {
    return this.dv.getUint16(off, littleEndian);
  }

  u32At(off: number, littleEndian = true): number {
    return this.dv.getUint32(off, littleEndian);
  }

  /** Subarray view (no copy) of [off, off+n). */
  sliceAt(off: number, n: number): Uint8Array {
    return this.bytes.subarray(off, off + n);
  }
}
