/**
 * CoK/DoK M4-style (behavioral-fidelity) — STATIC pre-flight verification.
 *
 * Verifies, without launching DOSBox, that a `*-on-dqk` build directory (as produced by
 * `tools/build-dqk-dir.mts`) contains the exact source-game content the target combat expects.
 * Originally CoK-M4-specific; every check is driven by CLI args (`--src`/`--area`/`--disk`/
 * `--roster`/`--cell`), so it works unchanged for DoK too (2026-07-19, `dok-dqk-release`
 * packaging round) — only the monster-roster check (#3 below) needed a real behavioral fork,
 * not a rename:
 *
 *   1. `DISK3/ECL.GLB` has a member for the target area, and it is byte-identical to the
 *      Gen1→Gen2 TRANSCODE of the source game's own `ECL{n}.DAX` block — magic-strip plus the
 *      operand-frame-drift trampolines of `transcodeGen1EclBlockToGen2` (2026-07-23,
 *      `docs/engine/research/cok-m4-fidelity-plan.md` §25; supersedes the bare `slice(2)` rule
 *      of cok-content-port-plan.md §2 after the SETUP_MONSTER/LOAD_FILES frame drift was proven).
 *   2. `DISK3/GEO.GLB` has a map for the target area, and its selector cell matches the
 *      byte-grounded route (`docs/engine/research/cok-natural-route.md` for CoK,
 *      `docs/engine/research/dok-natural-route.md` for DoK).
 *   3. `DISK2/MONCHA.GLB` resolves the target combat's monster ids to the expected names, via
 *      the id table + `roster[].memberIndex` (name is always decodable). Where the archive's
 *      `byId` map ALSO has the id (full stats decoded), stats are additionally reported — this
 *      is CoK's case (409-byte Gen1 record, `byId` populated). **DoK's 216-byte compact record
 *      has no HP/XP/saves located at all ("gap B5", documented across many audit rounds —
 *      `docs/engine/research/m38-audit.md` etc.) so `decodeMonchaGlb` never produces a `byId`
 *      hit for it** — that is expected, pre-existing behavior, not a packaging defect this tool
 *      should fail on. When `byId` misses, this falls back to the name-only roster lookup and
 *      reports "(name only, no stats — DoK gap B5)" rather than FAIL.
 *   4. `SAVGAMA.QSV` at the build root decodes to the expected resume area/party size.
 *
 * This is Layer-A (data-layer) verification only — it proves the shipped bytes are correct;
 * it does NOT prove the real DQK.EXE executes them faithfully (that is the DOSBox/GameLink
 * run in `tools/cok-m4-gamelink-route.ps1`).
 *
 * Usage:
 *   npx tsx tools/cok_m4_static_verify.mts --build build/cok-dqk-release \
 *       --src "Champions of Krynn" --area 34
 *   npx tsx tools/cok_m4_static_verify.mts --build build/dok-dqk-release \
 *       --src "Death Knights of Krynn" --area 34 --roster "33:SIVAK:15" --cell "11,1,140"
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readDaxDataBlocks,
  decodeEclGlb,
  decodeGeoBlock,
  decodeHlib,
  decodeGen2GeoArchive,
  decodeMonchaGlb,
  decodeDqkSaveHeader,
  decodeDqkSaveResume,
  transcodeGen1EclBlockToGen2,
  ECL_GEN1,
  ECL_GEN1_SHORT,
} from '../packages/engine/src/index.js';

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const buildDir = resolve(repoRoot, arg('build', 'build/cok-on-dqk-m4fidelity'));
const srcDir = resolve(repoRoot, arg('src', 'Champions of Krynn'));
const area = Number(arg('area', '34'));
// disk index the target area's GEO/ECL/MON archives live on (1 for CoK's first area).
const disk = Number(arg('disk', '1'));
// Expected roster: [monsterId, expectedName, expectedCount][]. Defaults to the proven First
// Route (ECL1.DAX#34 selector 28) from docs/engine/research/cok-natural-route.md.
const expectedRosterArg = arg('roster', '13:HOBGOBLIN LDR:8,35:WARRIOR:5,38:BLACK ROBE MAGE:2');
const expectedRoster = expectedRosterArg.split(',').map((s) => {
  const [id, name, count] = s.split(':');
  return { id: Number(id), name, count: Number(count) };
});
const expectedCellArg = arg('cell', '3,15,156'); // x,y,descriptor (0x9c=156, selector 28)
const [expX, expY, expDesc] = expectedCellArg.split(',').map(Number);
// Source ECL dialect for the Gen1→Gen2 operand-frame transcode expectation (2026-07-23,
// cok-m4-fidelity-plan.md §25): 'gen1' = CoK long (default), 'gen1-short' = DoK.
const eclDialect = arg('ecl-dialect', 'gen1') === 'gen1-short' ? ECL_GEN1_SHORT : ECL_GEN1;

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${detail ? ' -- ' + detail : ''}`);
  if (!ok) failures++;
}

console.log(`[cok-m4-static-verify] build=${buildDir} src=${srcDir} area=${area} disk=${disk}`);

// --- 1. ECL.GLB byte-identity -------------------------------------------------------------
const eclGlbPath = resolve(buildDir, 'DISK3', 'ECL.GLB');
check('DISK3/ECL.GLB exists', existsSync(eclGlbPath), eclGlbPath);
if (existsSync(eclGlbPath)) {
  const eclGlb = decodeEclGlb(new Uint8Array(readFileSync(eclGlbPath)));
  const member = eclGlb.blockSourceById(area);
  check(`ECL.GLB has a member for area ${area}`, !!member);
  const eclDaxPath = resolve(srcDir, `ECL${disk}.DAX`);
  if (member && existsSync(eclDaxPath)) {
    const daxBlocks = readDaxDataBlocks(new Uint8Array(readFileSync(eclDaxPath)));
    const srcBlock = daxBlocks.find((b) => b.blockId === area);
    check(`ECL${disk}.DAX has source block ${area}`, !!srcBlock);
    if (srcBlock) {
      // Gen1->Gen2 port rule (2026-07-23, §25): magic-strip + operand-frame transcode — every
      // reachable Gen2-frame-drifted site (CoK: 3-op SETUP_MONSTER, 3-op LOAD_FILES) becomes a
      // GOTO trampoline to an appended stub re-encoded in the frame shape DQK actually parses.
      const { block: expected, report } = transcodeGen1EclBlockToGen2(srcBlock.raw, eclDialect);
      const same = Buffer.from(member).equals(Buffer.from(expected));
      check(
        'ported ECL.GLB member === transcoded source DAX block',
        same,
        `lengths ${member.length} vs ${expected.length}; trampolines ${report.patched.length} (untranslated ${report.untranslated.length})`,
      );
    }
  }
}

// --- 2. GEO.GLB has the target area + selector-28 cell matches ------------------------------
const geoGlbPath = resolve(buildDir, 'DISK3', 'GEO.GLB');
check('DISK3/GEO.GLB exists', existsSync(geoGlbPath), geoGlbPath);
if (existsSync(geoGlbPath)) {
  const geoArch = decodeHlib(new Uint8Array(readFileSync(geoGlbPath)), 'GEO.GLB');
  const maps = decodeGen2GeoArchive(geoArch.rawMembers, 'GEO');
  const map = maps.find((m) => m.id === area);
  check(`GEO.GLB has area ${area}`, !!map, `areas present: ${maps.map((m) => m.id).join(',')}`);
}
// Cross-check the selector cell against the ORIGINAL source GEO (same bytes get ported
// loss-free by encodeGen2GeoArchive -- geoEncode.test.ts already proves this losslessly, so
// checking the source is an equivalent, simpler proof than re-decoding the Gen2 4-plane layout).
const geoDaxPath = resolve(srcDir, `GEO${disk}.DAX`);
if (existsSync(geoDaxPath)) {
  const geoBlocks = readDaxDataBlocks(new Uint8Array(readFileSync(geoDaxPath)));
  const srcGeo = geoBlocks.find((b) => b.blockId === area);
  check(`GEO${disk}.DAX has source block ${area}`, !!srcGeo);
  if (srcGeo) {
    const decoded = decodeGeoBlock(srcGeo.raw, `CoK GEO${disk}#${area} (M4 static verify)`);
    const cell = decoded.map.cells[expY * 16 + expX];
    check(
      `cell (${expX},${expY}) descriptor === ${expDesc} (0x${expDesc.toString(16)})`,
      (cell?.floor ?? -1) === expDesc,
      `actual=${cell?.floor}`,
    );
  }
}

// --- 3. MONCHA.GLB resolves the expected roster by id (via byId when stats decoded, else the
// id table -> roster memberIndex name-only lookup — DoK's 216-byte compact record never
// populates `byId`, "gap B5", see this file's header comment) -------------------------------
/** Local copy of moncha.ts's private `parseIdTable` — member 0: count, then count x
 * {areaId, memberIndex} little-endian. Not worth exporting from the engine for one CLI script. */
function parseMonchaIdTable(idTable: Uint8Array): { areaId: number; memberIndex: number }[] {
  const out: { areaId: number; memberIndex: number }[] = [];
  if (idTable.length < 2) return out;
  const dv = new DataView(idTable.buffer, idTable.byteOffset, idTable.byteLength);
  const count = dv.getUint16(0, true);
  for (let i = 0; i < count; i++) {
    const o = 2 + 4 * i;
    if (o + 4 > idTable.length) break;
    out.push({ areaId: dv.getUint16(o, true), memberIndex: dv.getUint16(o + 2, true) });
  }
  return out;
}

const monchaPath = resolve(buildDir, 'DISK2', 'MONCHA.GLB');
check('DISK2/MONCHA.GLB exists', existsSync(monchaPath), monchaPath);
if (existsSync(monchaPath)) {
  const monchaBytes = new Uint8Array(readFileSync(monchaPath));
  const arch = decodeMonchaGlb(monchaBytes);
  const rawIdTable = decodeHlib(monchaBytes, 'MONCHA.GLB').rawMembers[0];
  const idTable = rawIdTable ? parseMonchaIdTable(rawIdTable) : [];
  for (const { id, name } of expectedRoster) {
    const rec = arch.byId.get(id);
    if (rec) {
      check(`monster id ${id} -> "${name}"`, rec.name === name, `actual="${rec.name}"`);
      console.log(
        `       stats: HP${rec.hitPoints} AC${rec.armorClass} THAC0${rec.thac0} HD${rec.hitDice} ` +
          `dmg ${rec.damage.count}d${rec.damage.sides}${rec.damage.bonus ? '+' + rec.damage.bonus : ''} XP${rec.xp}`,
      );
      continue;
    }
    // No `byId` hit (no full-stat decode) — fall back to the id table -> roster name-only lookup,
    // so a record like DoK's compact 216-byte format (real, present, correctly named, but with no
    // located HP/XP/saves) is verified by NAME rather than reported as a false "MISSING".
    const entry = idTable.find((e) => e.areaId === id);
    const roster = entry ? arch.roster.find((r) => r.memberIndex === entry.memberIndex) : undefined;
    check(
      `monster id ${id} -> "${name}" (name only, no stats — DoK gap B5)`,
      roster?.name === name,
      `actual="${roster?.name ?? 'MISSING'}"`,
    );
  }
}

// --- 4. SAVGAMA.QSV resume state -------------------------------------------------------------
const savePath = resolve(buildDir, 'SAVGAMA.QSV');
check('SAVGAMA.QSV exists at build root', existsSync(savePath), savePath);
if (existsSync(savePath)) {
  const buf = new Uint8Array(readFileSync(savePath));
  const header = decodeDqkSaveHeader(buf);
  const resume = decodeDqkSaveResume(buf);
  check('save partySize > 0 (Begin Adventuring selectable)', header.partySize > 0, `partySize=${header.partySize}`);
  check(`save resumes into area ${area}`, resume.resumeArea === area, `actual=${resume.resumeArea}`);
  check(`save ECL member selector === ${area}`, resume.eclMemberId === area, `actual=${resume.eclMemberId}`);
}

console.log('');
console.log(failures === 0 ? `[cok-m4-static-verify] ALL CHECKS PASSED` : `[cok-m4-static-verify] ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
