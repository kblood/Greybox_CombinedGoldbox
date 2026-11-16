/**
 * `INSTR.AD` — DQK's Miles AIL AdLib (OPL2) timbre bank (Phase C, C5a).
 *
 * The Dark Queen of Krynn's AdLib music (`ADDQ*.XMI`) names its instruments by a General-MIDI
 * `(patch, bank)` key (the `TIMB` chunk); the driver resolves each key to an OPL2 register
 * patch through this global bank file. Layout (verified against the GOG `INSTR.AD`, 3982 B):
 *
 * ```
 * table:  N × { u8 patch, u8 bank, u32 offset(LE) }      ← entries, in record order
 *         u16 0xFFFF                                       ← terminator
 * data:   N × 14-byte instrument records  (at the offsets above)
 * ```
 *
 * Each 14-byte record begins with a `u16(LE)` length (`0x000E` = 14) followed by 12 bytes of
 * OPL2 operator data (modulator + carrier register values + feedback/connection). The precise
 * register-field mapping is pinned in C5b where it is validated by synthesis; C5a decodes the
 * **container** — the `(patch, bank) → record` table and the raw operator bytes — so the bank
 * is addressable by the XMIDI timbre list.
 *
 * Pure (no DOM/Node). See hackdocs `UASOUND.TXT` and the Miles AIL `.AD` bank notes.
 */

/** Bytes per instrument record (`u16 length` + 12 operator bytes). */
export const INSTR_AD_RECORD_BYTES = 14;

/** One resolved bank entry: its `(patch, bank)` key and the raw OPL2 operator record. */
export interface AdLibInstrument {
  /** General-MIDI-ish patch number (0–127 for melodic banks). */
  patch: number;
  /** Bank number (0 = the melodic/GM set; higher banks = percussion / variants). */
  bank: number;
  /** Byte offset of the record within the file (for cross-referencing). */
  offset: number;
  /** The 12 OPL2 operator-data bytes (the record minus its `u16` length prefix). */
  operatorData: Uint8Array;
}

/** A decoded AdLib bank: every `(patch, bank)` timbre and a lookup by packed key. */
export interface AdLibBank {
  instruments: AdLibInstrument[];
  /** `bank * 256 + patch → instrument`, for resolving an XMIDI `TIMB` entry. */
  byKey: Map<number, AdLibInstrument>;
}

/** Read a little-endian unsigned 32-bit integer at `off`. */
function readU32LE(bytes: Uint8Array, off: number): number {
  return (
    (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0
  );
}

/** Read a little-endian unsigned 16-bit integer at `off`. */
function readU16LE(bytes: Uint8Array, off: number): number {
  return bytes[off] | (bytes[off + 1] << 8);
}

/** Pack a `(patch, bank)` pair into a single map key. */
export function adLibKey(patch: number, bank: number): number {
  return (bank << 8) | patch;
}

/**
 * True if `bytes` is a Miles AdLib `.AD` bank: a `0xFFFF`-terminated `{patch, bank, offset}`
 * table whose every entry points at an aligned in-range record carrying the `u16` length 14, and
 * whose entry count matches the number of trailing 14-byte records exactly.
 *
 * The docblock above described that structure from the day this file was written; the check
 * tested only the last clause of it. `firstOffset` in range plus `(len - firstOffset) % 14 === 0`
 * is satisfied by roughly one arbitrary file in fourteen. Across the ten GOG DOS installs and the
 * ten Amiga WHDLoad titles it accepted **40 files, of which 2 were banks** (and those two are the
 * same bytes). The other 38: ten copies of `unins000.exe`, a `.zip`, a `.PCX`, an `.lbm`, a `.sav`,
 * four Amiga `Docs.info` icons, and twenty `.DAX`/`.DAA` game archives — `SKY.DAX`, `ECL1.DAX`,
 * `PIC1.DAX`, `GEO3.DAX`, `pic1.daa` among them.
 *
 * Each added clause, scored against those 38 impostors (2026-08-25):
 *
 * | clause | genuine | impostors still accepted |
 * | --- | --- | --- |
 * | `0xFFFF` terminator immediately before the data | 2/2 | **4** (all four `Docs.info`) |
 * | every table entry in range and 14-aligned | 2/2 | 1 (Gateway `MON2SPC.DAX`) |
 * | every entry's record begins with `u16` 14 | 2/2 | 0 |
 * | table entry count === trailing record count | 2/2 | 0 |
 *
 * Worth saying which is the weak one: the terminator is the obvious check to reach for and is the
 * *least* discriminating of the four. All four are kept because two of them being individually
 * perfect on 38 files is a thin claim, not because the corpus demands all four.
 *
 * One of the five conditions below is provably redundant and is kept anyway: `recordOffset +
 * 14 <= length`. Because `dataLen % 14 === 0` is enforced, the aligned offsets tile the data
 * exactly and the last one ends on EOF, so an aligned offset either fits or starts at/past EOF
 * where the length read returns 0 and the record-length clause rejects it first. No input can
 * isolate it, and deleting it kills no test — that is recorded rather than dressed up as a
 * passing mutation. Same for raising the `firstOffset` floor from 6 to 8. The other four each
 * die to their own single-property perturbation.
 *
 * The positive side needs help, since those 2 genuine files are one file: DQK's and FRUA's
 * `INSTR.AD` are byte-identical (3982 B, 199 instruments). The control is therefore
 * `Azrael's Tear`'s unrelated Miles `SAMPLE.AD` (3622 B, 181 instruments) — a bank from a
 * different developer and a different year, accepted by all four clauses.
 */
export function sniffInstrAd(bytes: Uint8Array): boolean {
  if (bytes.length < 6 + INSTR_AD_RECORD_BYTES) return false;
  const firstOffset = readU32LE(bytes, 2);
  if (firstOffset < 8 || firstOffset > bytes.length) return false;
  // The first record offset marks the end of the table+terminator; the data must divide evenly.
  const dataLen = bytes.length - firstOffset;
  if (dataLen <= 0 || dataLen % INSTR_AD_RECORD_BYTES !== 0) return false;
  // The terminator sits in the two bytes the table gives up to it.
  if (readU16LE(bytes, firstOffset - 2) !== 0xffff) return false;

  let count = 0;
  for (let off = 0; off + 6 <= firstOffset; off += 6) {
    if (bytes[off] === 0xff && bytes[off + 1] === 0xff) break;
    const recordOffset = readU32LE(bytes, off + 2);
    if (recordOffset < firstOffset) return false;
    if (recordOffset + INSTR_AD_RECORD_BYTES > bytes.length) return false;
    if ((recordOffset - firstOffset) % INSTR_AD_RECORD_BYTES !== 0) return false;
    if (readU16LE(bytes, recordOffset) !== INSTR_AD_RECORD_BYTES) return false;
    count++;
  }
  return count > 0 && count === dataLen / INSTR_AD_RECORD_BYTES;
}

/**
 * Decode `INSTR.AD` into an addressable AdLib bank. Reads `{patch, bank, offset}` entries until
 * the `0xFFFF` terminator (or an out-of-range entry), then slices each 14-byte record.
 */
export function decodeInstrAd(bytes: Uint8Array): AdLibBank {
  const instruments: AdLibInstrument[] = [];
  const byKey = new Map<number, AdLibInstrument>();

  let off = 0;
  while (off + 6 <= bytes.length) {
    const patch = bytes[off];
    const bank = bytes[off + 1];
    if (patch === 0xff && bank === 0xff) break; // 0xFFFF terminator
    const recordOffset = readU32LE(bytes, off + 2);
    if (recordOffset + INSTR_AD_RECORD_BYTES > bytes.length) break; // past EOF — stop honestly
    // The leading u16 is the record length (14); the operator data is the remaining 12 bytes.
    const operatorData = bytes.subarray(recordOffset + 2, recordOffset + INSTR_AD_RECORD_BYTES);
    const inst: AdLibInstrument = { patch, bank, offset: recordOffset, operatorData };
    instruments.push(inst);
    const key = adLibKey(patch, bank);
    if (!byKey.has(key)) byKey.set(key, inst);
    off += 6;
  }

  return { instruments, byKey };
}
