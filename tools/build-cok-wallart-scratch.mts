/**
 * CoK wall-art port — scratch build + static verification (cok-m4-fidelity-plan.md §8 residual).
 *
 * Builds a CoK-on-DQK directory the SAME way `build-dqk-dir.mts` does, but with the Gen2 GEO header
 * wall-set ids replaced by CoK's OWN wall art (via `buildCokWallArtPort`/`stampCokWallHeaders`,
 * `packages/engine/src/loaders/cokWallPort.ts`) instead of the fixed DQK-native placeholder every
 * other ported area still carries. This is a STANDALONE script (does not import or modify
 * `build-dqk-dir.mts`) so it can't collide with the live M4 fidelity agent's shared build tooling —
 * per its instructions this writes to its OWN scratch out-dir and never touches
 * `build/cok-on-dqk-m4fidelity` or `docs/engine/research/cok-m4-fidelity-plan.md`.
 *
 * STATIC-ONLY: no DOSBox-X. After writing the directory this re-decodes the emitted `8X8DC.TLB` and
 * `GEO.GLB` straight from disk and checks (a) the wall bank still decodes cleanly with the expected
 * image count, (b) every resolved area's header set ids actually exist in the bank's set-id table,
 * (c) residual areas kept the untouched DQK-native placeholder header.
 *
 * Usage:
 *   npx tsx tools/build-cok-wallart-scratch.mts \
 *     --dqk "The Dark Queen of Krynn" --src "Champions of Krynn" \
 *     --out build/cok-on-dqk-wallart-scratch
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDqkGameDataMulti,
  planDqkBuild,
  readDaxDataBlocks,
  sniffGen1EclBlock,
  decodeHlib,
  decodeHlibSetIdTable,
  buildCokWallArtPort,
  stampCokWallHeaders,
  DQK_GEO_PLACEHOLDER_SET_IDS,
  type DqkGameTarget,
  type CokWallDiskSource,
} from '../packages/engine/src/index.js';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const dqkDir = resolve(repoRoot, arg('dqk', 'The Dark Queen of Krynn'));
const srcDir = resolve(repoRoot, arg('src', 'Champions of Krynn'));
const outDir = resolve(repoRoot, arg('out', 'build/cok-on-dqk-wallart-scratch'));
const target: DqkGameTarget = 'cok';
const rd = (p: string) => new Uint8Array(readFileSync(p));

// --- 1) baseline game data (unchanged pipeline — placeholder headers on every area) ---------------

const collect = (mk: (k: number) => string): Uint8Array[] => {
  const out: Uint8Array[] = [];
  for (let k = 1; ; k++) {
    const p = join(srcDir, mk(k));
    if (!existsSync(p)) break;
    out.push(rd(p));
  }
  return out;
};
const geo = collect((k) => `GEO${k}.DAX`);
const ecl = collect((k) => `ECL${k}.DAX`);
const mon: Uint8Array[] = [];
const maxK = Math.max(geo.length, ecl.length);
for (let k = 1; k <= maxK; k++) {
  const p = join(srcDir, `MON${k}CHA.DAX`);
  if (existsSync(p)) mon.push(rd(p));
}
const game = buildDqkGameDataMulti({ geo, mon, ecl });
console.log(
  `[wallart] baseline: ${game.manifest.geoAreas.length} maps, ${game.manifest.eclAreas.length} scripts, ` +
    `${game.manifest.pairedAreas.length} playable areas (placeholder wall headers on all of them).`,
);

// --- 2) per-disk WALLDEF/8X8D sources + this disk's own ECL area blocks ---------------------------

function eclEntriesFor(diskEcl: Uint8Array): { id: number; block: Uint8Array }[] {
  return readDaxDataBlocks(diskEcl)
    .filter((b) => sniffGen1EclBlock(b.raw))
    .map((b) => ({ id: b.blockId, block: b.raw }));
}

const disks: CokWallDiskSource[] = [];
for (let k = 1; k <= ecl.length; k++) {
  const wdPath = join(srcDir, `WALLDEF${k}.DAX`);
  const tlPath = join(srcDir, `8X8D${k}.DAX`);
  if (!existsSync(wdPath) || !existsSync(tlPath)) {
    console.log(`[wallart] disk ${k}: WALLDEF${k}.DAX/8X8D${k}.DAX not both present — skipping this disk's areas`);
    continue;
  }
  const wd = new Map(readDaxDataBlocks(rd(wdPath)).map((b) => [b.blockId, b.raw]));
  const tl = new Map(readDaxDataBlocks(rd(tlPath)).map((b) => [b.blockId, b.raw]));
  disks.push({
    ecl: eclEntriesFor(ecl[k - 1]),
    walldefBlock: (id) => wd.get(id) ?? null,
    tileBlock: (id) => tl.get(id) ?? null,
  });
}

// --- 3) build the wall-art port + stamp the resolved headers into GEO.GLB -------------------------

// NOTE (2026-07-19): appends to 8X8DC.TLB, NOT 8X8DB.TLB — DQK.EXE's wall-bank-letter selector is
// a hardcoded `id <= 9 ? 'b' : 'c'` threshold (cokWallPort.ts header comment, "Bank routing —
// SOLVED"); every id this port assigns is > 9 (COK_WALL_SET_ID_BASE = 18), so 8X8DC.TLB is the only
// file DQK.EXE will ever look in. This standalone script predates that fix and is superseded by
// tools/build-dqk-dir.mts's --wall-art flag (commit c801066) — kept updated for consistency only.
const wallBankPath = join(dqkDir, 'DISK2', '8X8DC.TLB');
const wallBankOriginal = rd(wallBankPath);
const originalBankImageCount = decodeHlib(wallBankOriginal).images.length;

const port = buildCokWallArtPort(disks, wallBankOriginal);
console.log(
  `[wallart] resolved ${port.resolved.length} area(s) with real CoK wall art, ` +
    `${port.residual.length} residual (kept the DQK-native placeholder), ` +
    `${port.newSets.length} new 8X8DC.TLB set(s).`,
);
for (const s of port.newSets) console.log(`[wallart]   new set id ${s.id}: ${s.label}`);
if (port.residual.length > 0) {
  const byReason = new Map<string, number>();
  for (const r of port.residual) byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + 1);
  for (const [reason, n] of byReason) console.log(`[wallart]   residual x${n}: ${reason}`);
}

const headers = new Map(port.resolved.map((a) => [a.areaId, a.header]));
const { geoGlb: patchedGeoGlb, stamped } = stampCokWallHeaders(game.geoGlb, headers);
console.log(`[wallart] stamped ${stamped.length}/${headers.size} resolved area header(s) into GEO.GLB (the rest of the resolved set had no matching GEO member).`);

const overrides: Record<string, Uint8Array> = {};
if (port.wallBankTlb) overrides['8X8DC.TLB'] = port.wallBankTlb;

// --- 4) plan + write the scratch build directory ----------------------------------------------------

const exe = rd(join(dqkDir, 'DQK.EXE'));
const plan = planDqkBuild({
  gameData: { ...game, geoGlb: patchedGeoGlb },
  exe,
  target,
  overrides,
  conf: { mountPath: '.' },
});

function sourcePathFor(fromName: string, disk: string): string {
  const onDisk = join(dqkDir, disk, fromName);
  if (existsSync(onDisk)) return onDisk;
  throw new Error(`source file ${fromName} not found on ${disk} of ${dqkDir}`);
}

let wrote = 0;
let copied = 0;
for (const f of plan.emit) {
  const dest = join(outDir, f.path);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, f.bytes);
  wrote++;
}
for (const f of plan.copy) {
  const dest = join(outDir, f.path);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(sourcePathFor(f.fromName, f.disk), dest);
  copied++;
}
console.log(`[wallart] wrote ${wrote} generated file(s) + copied ${copied} passthrough file(s) -> ${outDir}`);

// --- 5) static verification: re-decode straight off disk, independent of the in-memory objects ----

let ok = true;
function check(label: string, cond: boolean): void {
  console.log(`[verify] ${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) ok = false;
}

const emittedBank = rd(join(outDir, 'DISK2', '8X8DC.TLB'));
const emittedBankArchive = decodeHlib(emittedBank);
check(
  `emitted 8X8DC.TLB decodes cleanly (${emittedBankArchive.images.length} images, ` +
    `expected ${originalBankImageCount} original + new sets)`,
  emittedBankArchive.images.length > originalBankImageCount || port.newSets.length === 0,
);

const dv = new DataView(emittedBank.buffer, emittedBank.byteOffset, emittedBank.byteLength);
const count = dv.getUint16(8, true) + 1;
const ptrs = Array.from({ length: count }, (_, i) => dv.getUint32(16 + 4 * i, true));
const setIdTable = decodeHlibSetIdTable(emittedBank.subarray(ptrs[0], ptrs[1]));
const bankIds = new Set(setIdTable.map((e) => e.id));
check(
  `emitted 8X8DC.TLB set-id table has ${setIdTable.length} entries (8 native + ${port.newSets.length} new)`,
  setIdTable.length === 8 + port.newSets.length,
);

const emittedGeoGlb = rd(join(outDir, 'DISK3', 'GEO.GLB'));
const geoArchive = decodeHlib(emittedGeoGlb);
const idTableBytes = geoArchive.rawMembers[0];
const idDv = new DataView(idTableBytes.buffer, idTableBytes.byteOffset, idTableBytes.byteLength);
const idCount = idDv.getUint16(0, true);
const memberOf = new Map<number, number>();
for (let i = 0; i < idCount; i++) {
  memberOf.set(idDv.getUint16(2 + 4 * i, true), idDv.getUint16(2 + 4 * i + 2, true));
}

let everyResolvedAreaVerified = true;
for (const area of port.resolved) {
  const memberIdx = memberOf.get(area.areaId);
  if (memberIdx === undefined) continue; // resolved but not actually a GEO area (harmless no-op)
  const member = geoArchive.rawMembers[memberIdx];
  const headerBytes = member.subarray(2, 8);
  if (Array.from(headerBytes).join(',') !== Array.from(area.header).join(',')) {
    console.log(`[verify]   area ${area.areaId}: header mismatch on disk (${Array.from(headerBytes)} != ${Array.from(area.header)})`);
    everyResolvedAreaVerified = false;
    continue;
  }
  for (const id of area.wallSetIds) {
    if (id === null) continue;
    if (!bankIds.has(id)) {
      console.log(`[verify]   area ${area.areaId}: wall set id ${id} NOT found in the emitted bank's set-id table`);
      everyResolvedAreaVerified = false;
    }
  }
}
check(
  `every resolved area's on-disk GEO header matches + every referenced wall set id exists in the emitted bank (${port.resolved.length} area(s) checked)`,
  everyResolvedAreaVerified,
);

let everyResidualAreaUntouched = true;
for (const r of port.residual) {
  const memberIdx = memberOf.get(r.areaId);
  if (memberIdx === undefined) continue; // not a GEO area at all
  const member = geoArchive.rawMembers[memberIdx];
  const headerBytes = Array.from(member.subarray(2, 8));
  if (headerBytes.join(',') !== Array.from(DQK_GEO_PLACEHOLDER_SET_IDS).join(',')) {
    everyResidualAreaUntouched = false;
  }
}
check('every residual area kept the untouched DQK-native placeholder header on disk', everyResidualAreaUntouched);

console.log(`[wallart] ${ok ? 'ALL STATIC CHECKS PASSED' : 'SOME STATIC CHECKS FAILED'}`);
process.exit(ok ? 0 : 1);
