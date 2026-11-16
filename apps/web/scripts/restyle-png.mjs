// IHDR-only validation, not a full PNG decoder. No generated/local art is needed.
import { closeSync, openSync, readSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { validImageSize } from '../src/ui/restyle-data.mjs';

export function readPngSize(path) {
  const header = Buffer.alloc(33);
  const fd = openSync(path, 'r');
  let length;
  try { length = readSync(fd, header, 0, header.length, 0); } finally { closeSync(fd); }
  if (length !== 33 || !header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      || header.readUInt32BE(8) !== 13 || header.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error(`Invalid PNG IHDR: ${path}`);
  }
  let crc = 0xffffffff;
  for (const byte of header.subarray(12, 29)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  if (((crc ^ 0xffffffff) >>> 0) !== header.readUInt32BE(29)) throw new Error(`Invalid PNG IHDR CRC: ${path}`);
  const width = header.readUInt32BE(16);
  const height = header.readUInt32BE(20);
  if (!validImageSize(width, height)) throw new Error(`Invalid PNG dimensions: ${path}`);
  return [width, height];
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function encodeTestPng(width, height, rgba = [12, 34, 56, 255]) {
  const chunk = (type, data) => {
    const out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const scanline = Buffer.alloc(width * 4 + 1);
  for (let i = 0; i < width; i++) Buffer.from(rgba).copy(scanline, 1 + i * 4);
  const imageData = Buffer.concat(Array.from({ length: height }, () => scanline));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(imageData)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Verify the complete chunk stream, CRCs and DEFLATE scanline envelope. This catches corrupt or
// truncated assets before packaging while keeping the build dependency-free. Pixel reconstruction
// and visual decoding still belong to the browser, not this structural check.
export function validatePng(path) {
  const bytes = readFileSync(path);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(signature)) throw new Error(`Invalid PNG signature: ${path}`);
  let offset = 8;
  let ihdr = null;
  let sawIdat = false;
  let endedIdat = false;
  let sawIend = false;
  let sawPlte = false;
  const idat = [];
  const knownCritical = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND']);
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error(`Truncated PNG chunk: ${path}`);
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error(`Truncated PNG chunk data: ${path}`);
    const chunkData = bytes.subarray(offset + 8, offset + 8 + length);
    const chunkCrc = bytes.readUInt32BE(offset + 8 + length);
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== chunkCrc) throw new Error(`PNG CRC mismatch (${type}): ${path}`);
    if (!ihdr && type !== 'IHDR') throw new Error(`PNG IHDR is not first: ${path}`);
    if (type === 'IHDR') {
      if (ihdr || length !== 13) throw new Error(`Invalid PNG IHDR: ${path}`);
      ihdr = {
        width: chunkData.readUInt32BE(0), height: chunkData.readUInt32BE(4),
        depth: chunkData[8], color: chunkData[9], compression: chunkData[10],
        filter: chunkData[11], interlace: chunkData[12],
      };
    } else if (type === 'PLTE') {
      if (sawIdat || !length || length % 3 || length > 768) throw new Error(`Invalid PNG palette: ${path}`);
      sawPlte = true;
    } else if (type === 'IDAT') {
      if (endedIdat) throw new Error(`Non-consecutive PNG IDAT chunks: ${path}`);
      sawIdat = true;
      idat.push(chunkData);
    } else if (type === 'IEND') {
      if (length !== 0 || !sawIdat || end !== bytes.length) throw new Error(`Invalid PNG IEND: ${path}`);
      sawIend = true;
      offset = end;
      break;
    } else {
      if (sawIdat) endedIdat = true;
      if ((type.charCodeAt(0) & 0x20) === 0 && !knownCritical.has(type)) throw new Error(`Unknown critical PNG chunk ${type}: ${path}`);
      if (type !== 'IDAT' && sawIdat) endedIdat = true;
    }
    if (type !== 'IDAT' && sawIdat) endedIdat = true;
    offset = end;
  }
  if (!ihdr || !sawIend || offset !== bytes.length) throw new Error(`Incomplete PNG: ${path}`);
  const { width, height, depth, color, compression, filter, interlace } = ihdr;
  if (!validImageSize(width, height) || compression !== 0 || filter !== 0 || ![0, 1].includes(interlace)) {
    throw new Error(`Unsupported PNG geometry or method: ${path}`);
  }
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 })[color];
  const allowedDepths = ({ 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] })[color];
  if (!channels || !allowedDepths.includes(depth) || (color === 3 && !sawPlte)) throw new Error(`Unsupported PNG color format: ${path}`);
  let expectedSize = 0;
  const passes = interlace === 0 ? [[0, 0, 1, 1]] : [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];
  const passRows = [];
  for (const [x0, y0, dx, dy] of passes) {
    const passWidth = width <= x0 ? 0 : Math.ceil((width - x0) / dx);
    const passHeight = height <= y0 ? 0 : Math.ceil((height - y0) / dy);
    if (!passWidth || !passHeight) continue;
    const rowBytes = Math.ceil((passWidth * channels * depth) / 8);
    expectedSize += passHeight * (rowBytes + 1);
    passRows.push([rowBytes, passHeight]);
  }
  let inflated;
  try { inflated = inflateSync(Buffer.concat(idat), { maxOutputLength: expectedSize + 1 }); }
  catch (error) { throw new Error(`Invalid PNG image data: ${path} (${error.message})`); }
  if (inflated.length !== expectedSize) throw new Error(`PNG scanline length mismatch: ${path}`);
  let cursor = 0;
  for (const [rowBytes, rows] of passRows) {
    for (let row = 0; row < rows; row++) {
      const method = inflated[cursor];
      if (method > 4) throw new Error(`Invalid PNG row filter: ${path}`);
      cursor += rowBytes + 1;
    }
  }
  return [width, height];
}

export function validateComparisonPng(path, item, original) {
  const [width, height] = readPngSize(path);
  if (original ? width * item.native_h !== height * item.native_w
    : width !== item.native_w * item.k || height !== item.native_h * item.k) {
    throw new Error(`PNG ${original ? 'original aspect' : 'restyle dimensions'} mismatch: ${path} (${width}x${height})`);
  }
  return [width, height];
}
