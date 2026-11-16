// Build-time-only CoK Restyle comparison inventory. It reads the user's external ledgers and
// stages PNGs into a supplied static candidate; no game/generated art is stored in Git.
import { createHash } from 'node:crypto';
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePng } from './restyle-png.mjs';
import { reviewedCardPrompt } from '../src/ui/cok-batch02-prompt-lineage.mjs';

const LEDGERS = [
  ['dos_coverage.json', 'dos'], ['amiga_coverage.json', 'amiga'],
  ['icon_coverage.json', 'icons'], ['amiga_non_picture_coverage.json', 'amiga-non-picture'],
  ['dos_dungcom_coverage.json', 'dos-family'], ['dos_randcom_coverage.json', 'dos-family'],
  ['dos_wildcom_coverage.json', 'dos-family'],
  ['amiga_8x8d2_014_coverage.json', 'amiga-family'], ['amiga_8x8d2_171_coverage.json', 'amiga-family'],
  ['amiga_8x8d2_172_coverage.json', 'amiga-family'], ['amiga_8x8d2_192_coverage.json', 'amiga-family'],
  ['amiga_8x8d2_212_coverage.json', 'amiga-family'], ['amiga_comspr_coverage.json', 'amiga-family'],
  ['CoK_Amiga_8X8D2_011_coverage.json', 'amiga-family'], ['CoK_Amiga_8X8D2_013_coverage.json', 'amiga-family'],
  ['CoK_Amiga_8X8D2_191_coverage.json', 'amiga-family'], ['CoK_Amiga_8X8D2_211_coverage.json', 'amiga-family'],
];
const TILE_ALIAS_LEDGER = 'dos_tile_alias_coverage.json';
const FONT_LEDGER = 'dos_font_coverage.json';
const RETRY_LEDGER = 'CoK_Amiga_8X8D0_032_retry_coverage.json';
const EXCLUDED = new Set(['blank-preserved', 'preserved-empty']);
const RUNTIME_MANIFEST = join(dirname(fileURLToPath(import.meta.url)), '../src/ui/cokTravelRestyleManifest.json');
const RUNTIME_COMBAT_MANIFEST = join(dirname(fileURLToPath(import.meta.url)), '../src/ui/cokCombatRestyleManifest.json');
const RUNTIME_PLAYER_MANIFEST = join(dirname(fileURLToPath(import.meta.url)), '../src/ui/cokPlayerAppearanceManifest.json');
const HUBS = [
  { dir: 'cok_pic1_023_hub', id: 'cok-pic1-023', label: 'PIC1:23 eyes', sourceName: 'PIC1_023_f0.png', order: ['r0', 'r1', 'r0', 'r2', 'r0'], notes: ['eyes closed', 'eyes open, pupils slightly left'] },
  { dir: 'cok_amiga_daa_cok_pic2_pic2_024_f0_hub', id: 'cok-pic2-024', label: 'PIC2:24 skull', sourceName: 'PIC2_024_f0.png', order: ['r0', 'r1', 'r0', 'r2', 'r0', 'r3', 'r0'], notes: ['open mouth wider', 'add a sword in the bottom left corner', 'change red eyes to pink'] },
];

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function safeFile(path, description, cache) {
  if (!path || !existsSync(path) || !statSync(path).isFile()) throw new Error(`Missing ${description}: ${path}`);
  const absolute = resolve(path);
  if (!cache.has(absolute)) cache.set(absolute, { size: validatePng(absolute), hash: hashFile(absolute) });
  return { path: absolute, ...cache.get(absolute) };
}

function exactBatchPrompt(sourceRoot, sourceHash, outputPath, outputHash) {
  const batchRoot = join(dirname(sourceRoot), 'batch02');
  const rel = relative(join(batchRoot, 'done'), outputPath);
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  const match = basename(outputPath).match(/^(.+)_out\.png$/i);
  if (!match) return null;
  const inputPath = join(batchRoot, `${match[1]}_input.png`);
  const promptPath = join(batchRoot, `${match[1]}_prompt.txt`);
  if (!existsSync(inputPath) || !existsSync(promptPath) || hashFile(inputPath) !== sourceHash || hashFile(outputPath) !== outputHash) return null;
  return {
    batch: 'Batch02', file: `${match[1]}_prompt.txt`, sha256: hashFile(promptPath),
    inputSha256: sourceHash, outputSha256: outputHash, text: readFileSync(promptPath, 'utf8'),
  };
}

function classifyOutput(statuses) {
  const normalized = statuses.map((status) => status.toLowerCase());
  const generated = normalized.some((status) => status === 'generated' || status === 'restyled');
  const reused = normalized.some((status) => /covered-reviewed-exact-(archive|pixel)-duplicate|covered-by-reviewed-cross-platform-exact-source/.test(status));
  if (generated && reused) return 'Generated/restyled variant with exact reuse aliases';
  if (generated) return 'Generated/restyled variant';
  if (normalized.some((status) => /covered-reviewed-exact-(archive|pixel)-duplicate/.test(status))) return 'Exact source-image duplicate';
  if (normalized.some((status) => /covered-by-reviewed-cross-platform-exact-source/.test(status))) return 'Reused cross-platform Restyle';
  return 'Reviewed output; origin not specified by ledger';
}

function ledgerRows(sourceRoot) {
  const rows = [];
  const excluded = [];
  const held = [];
  const pngCache = new Map();
  const animations = [];
  let ledgerRecords = 0;
  let eligibleRecords = 0;
  let tileAliasAccepted = 0;
  for (const [ledgerName, kind] of LEDGERS) {
    const ledgerPath = join(sourceRoot, ledgerName);
    if (!existsSync(ledgerPath)) throw new Error(`Missing authoritative ledger: ${ledgerPath}`);
    const data = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    const entries = data.items ?? data.assets ?? data.entries;
    if (!Array.isArray(entries)) throw new Error(`Ledger has no item array: ${ledgerPath}`);
    entries.forEach((entry, index) => {
      ledgerRecords++;
      const status = entry.status ?? entry.restyle_status;
      if (EXCLUDED.has(status)) { excluded.push({ ledger: ledgerName, index, status }); return; }
      if (typeof status !== 'string' || /retry|missing|ambiguous|candidate/i.test(status)) {
        excluded.push({ ledger: ledgerName, index, status: status ?? 'unknown status' }); return;
      }
      eligibleRecords++;

      let original;
      let restyles;
      let platform = kind === 'dos' || kind === 'icons' || kind === 'dos-family' ? 'DOS' : 'Amiga';
      let family = entry.family ?? entry.kind ?? entry.asset_kind ?? 'Unspecified';
      let aliasBasis = null;
      let dimensions = entry.native_size ?? entry.size ?? null;
      if (kind === 'amiga') {
        original = entry.output;
        if (!Array.isArray(entry.restyle_outputs) || !entry.restyle_outputs.length) {
          excluded.push({ ledger: ledgerName, index, status: 'missing restyle output', outputs: 0 });
          return;
        }
        restyles = entry.restyle_outputs;
        family = entry.family ?? entry.file ?? 'Amiga picture';
        dimensions = entry.native_size ?? null;
      } else if (kind === 'amiga-non-picture') {
        const sourceIsArchive = /\.DA[AB]$/i.test(entry.source ?? '');
        original = sourceIsArchive ? (entry.source_render ?? entry.source_pixel_alias) : entry.source;
        if (sourceIsArchive && !entry.source_render && entry.source_pixel_alias) aliasBasis = 'source_pixel_alias (ledger-recorded exact pixel duplicate)';
        restyles = [entry.output];
        family = entry.family ?? 'Amiga non-picture';
      } else if (kind === 'amiga-family') {
        const archiveSource = entry.source ?? '';
        original = /\.DA[AB]$/i.test(archiveSource)
          ? (entry.source_render ?? entry.source_pixel_alias)
          : (entry.source_render ?? entry.source_pixel_alias ?? archiveSource);
        if (!original) {
          excluded.push({ ledger: ledgerName, index, status: 'missing rendered source for archive-backed entry' });
          return;
        }
        restyles = [entry.output];
        if (/\.DA[AB]$/i.test(archiveSource) && !entry.source_render && entry.source_pixel_alias) aliasBasis = 'source_pixel_alias (ledger-recorded exact pixel duplicate)';
      } else {
        original = entry.source;
        restyles = [entry.restyle ?? entry.output];
      }
      if (!original || !restyles?.length || restyles.some((output) => !output)) throw new Error(`Unambiguous source/output missing in ${ledgerName} item ${index}`);
      if (kind === 'amiga-non-picture' && /\.DA[AB]$/i.test(entry.source ?? '') && !entry.source_render && !entry.source_pixel_alias) {
        excluded.push({ ledger: ledgerName, index, status: 'missing rendered source for archive-backed entry' });
        return;
      }
      const sourceFile = safeFile(original, `source PNG (${ledgerName} item ${index})`, pngCache);
      const sourcePath = sourceFile.path;
      const sourceHash = sourceFile.hash;
      const sourceSize = sourceFile.size;
      restyles.forEach((restyle, variant) => {
        const outputFile = safeFile(restyle, `restyle PNG (${ledgerName} item ${index}, variant ${variant})`, pngCache);
        const outputPath = outputFile.path;
        const outputHash = outputFile.hash;
        const key = createHash('sha256').update(`${sourceHash}:${outputHash}`).digest('hex');
        const outputSize = outputFile.size;
        const identity = {
          ledger: ledgerName,
          ledgerKind: kind,
          entry: index,
          platform,
          family,
          status,
          asset: entry.asset_id ?? entry.block_id ?? entry.block ?? null,
          frame: entry.frame ?? null,
          tile: entry.tile_index ?? null,
          ledgerSize: dimensions,
          variant: variant || null,
          variantOutput: restyles.length > 1 ? basename(restyle) : null,
          aliasBasis,
          sourceArchive: basename(entry.source_archive ?? entry.source_rel ?? entry.file
            ?? (/\.DA[AB]$/i.test(entry.source ?? '') ? entry.source : '')),
          sourceAlias: Boolean(aliasBasis),
          sourceName: basename(sourcePath),
          sourceProvenance: relativeOrName(sourcePath, sourceRoot),
          reviewNote: entry.review ?? entry.visual_review?.note ?? null,
          promptReference: exactBatchPrompt(sourceRoot, sourceHash, outputPath, outputHash),
        };
        rows.push({ key, sourcePath, outputPath, sourceHash, outputHash, sourceSize, outputSize, identity });
      });
    });
  }

  const tilePath = join(sourceRoot, TILE_ALIAS_LEDGER);
  if (!existsSync(tilePath)) throw new Error(`Missing tile alias ledger: ${tilePath}`);
  const tileData = JSON.parse(readFileSync(tilePath, 'utf8'));
  if (!Array.isArray(tileData.entries)) throw new Error(`Tile alias ledger has no entries: ${tilePath}`);
  const rowsByPair = new Map(rows.map((row) => [row.key, row]));
  for (const [index, entry] of tileData.entries.entries()) {
    ledgerRecords++;
    const status = entry.status ?? 'unknown status';
    const identity = {
      ledger: TILE_ALIAS_LEDGER, ledgerKind: 'dos-tile-alias', entry: index,
      platform: entry.platform ?? 'DOS', family: entry.family ?? 'DOS tile alias', status,
      asset: entry.block ?? null, tile: entry.tile_index ?? null,
      sourceName: basename(entry.source ?? ''), sourceProvenance: relativeOrName(entry.source ?? '', sourceRoot),
      logicalPixelSha256: entry.logical_pixel_sha256 ?? null,
      restyleAliasFamily: entry.restyle_alias_family ?? null,
      aliasBasis: entry.restyle_source ? 'Matched exact Amiga source/output hashes from restyle_source + restyle_output' : null,
      reviewNote: null,
    };
    if (!entry.restyle_source || !entry.restyle_output) {
      held.push({ ledger: TILE_ALIAS_LEDGER, index, status, reason: 'Missing exact Amiga-side restyle_source/restyle_output identity; held.' });
      continue;
    }
    const sourceFile = safeFile(entry.restyle_source, `Amiga alias source (${index})`, pngCache);
    const outputFile = safeFile(entry.restyle_output, `Amiga alias output (${index})`, pngCache);
    const key = createHash('sha256').update(`${sourceFile.hash}:${outputFile.hash}`).digest('hex');
    const groupRow = rowsByPair.get(key);
    if (!groupRow) {
      held.push({ ledger: TILE_ALIAS_LEDGER, index, status, reason: 'The exact restyle_source/restyle_output hash pair has no admitted Amiga ledger card.' });
      continue;
    }
    // Alias to the ledger's Amiga card; keep the DOS source path and exact tile identity.
    groupRow.identity.aliases ??= [];
    groupRow.identity.aliases.push(identity);
    eligibleRecords++;
    tileAliasAccepted++;
  }

  const fontPath = join(sourceRoot, FONT_LEDGER);
  if (!existsSync(fontPath)) throw new Error(`Missing font ledger: ${fontPath}`);
  const font = JSON.parse(readFileSync(fontPath, 'utf8'));
  ledgerRecords++;
  if (!font.source_sheet || !font.output || !font.status) throw new Error(`Font source/output mapping incomplete: ${fontPath}`);
  const fontSource = safeFile(font.source_sheet, 'DOS font source sheet', pngCache);
  const fontOutput = safeFile(font.output, 'DOS font Restyle atlas', pngCache);
  const fontKey = createHash('sha256').update(`${fontSource.hash}:${fontOutput.hash}`).digest('hex');
  const fontNote = 'Glyph mask review: 175/177 exact; two sparse-detail exceptions. Overall composition not reviewed.';
  rows.push({
    key: fontKey, sourcePath: fontSource.path, outputPath: fontOutput.path,
    sourceHash: fontSource.hash, outputHash: fontOutput.hash, sourceSize: fontSource.size, outputSize: fontOutput.size,
    identity: {
      ledger: FONT_LEDGER, ledgerKind: 'dos-font-atlas', entry: 0,
      platform: 'DOS', family: '8X8D1 font atlas', status: font.status,
      asset: font.source_block ?? null, sourceName: basename(font.source_sheet),
      sourceProvenance: relativeOrName(font.source_sheet, sourceRoot),
      reviewNote: fontNote, maskMatches: 175, maskTotal: 177,
    },
  });
  eligibleRecords++;

  const retryPath = join(sourceRoot, RETRY_LEDGER);
  if (!existsSync(retryPath)) throw new Error(`Missing held retry ledger: ${retryPath}`);
  const retry = JSON.parse(readFileSync(retryPath, 'utf8'));
  for (const rejected of retry.saved_outputs ?? []) {
    if (rejected.status !== 'saved-reviewed-unmatched') continue;
    ledgerRecords++;
    held.push({
      ledger: RETRY_LEDGER, index: rejected.index, status: rejected.status,
      reason: 'Reviewed retry asset remains unmatched to the accepted Amiga source map; held from gallery admission.',
    });
  }
  for (const hub of HUBS) {
    const hubRoot = join(dirname(sourceRoot), 'animation_hubs', hub.dir);
    const playbackPath = join(hubRoot, 'PLAYBACK.md');
    const stepsPath = join(hubRoot, 'steps.json');
    if (!existsSync(playbackPath) || !existsSync(stepsPath)) throw new Error(`Missing hub playback evidence: ${hub.dir}`);
    const playback = readFileSync(playbackPath, 'utf8');
    const steps = JSON.parse(readFileSync(stepsPath, 'utf8'));
    const listedOrder = [...playback.matchAll(/done\/(r\d+)\.png/g)].map((match) => match[1]);
    const changedFrames = new Set(hub.order.filter((frame) => frame !== 'r0')).size;
    const stepCountValid = Array.isArray(steps) ? steps.length === changedFrames
      : steps && typeof steps === 'object' && steps.frames === new Set(hub.order).size;
    if (JSON.stringify(listedOrder) !== JSON.stringify(hub.order) || !stepCountValid) {
      throw new Error(`Unexpected PLAYBACK/steps format: ${hub.dir}`);
    }
    const frameFiles = new Map();
    for (const frame of [...new Set(hub.order)]) {
      frameFiles.set(frame, safeFile(join(hubRoot, 'done', `${frame}.png`), `${hub.dir} ${frame}`, pngCache));
    }
    const base = frameFiles.get('r0');
    const candidates = rows.filter((row) => basename(row.sourcePath).toLowerCase() === hub.sourceName.toLowerCase()
      && row.outputHash === base.hash);
    if (!candidates.length) throw new Error(`No exact accepted base pair for ${hub.dir} r0 (${base.hash})`);
    const pairKeys = new Set(candidates.map((row) => row.key));
    if (pairKeys.size !== 1) throw new Error(`Ambiguous accepted base pair for ${hub.dir} r0: ${pairKeys.size}`);
    const baseRow = candidates[0];
    const animation = {
      id: hub.id, label: hub.label, basisSourceSha256: baseRow.sourceHash,
      basisOutputSha256: base.hash, playbackOrder: [...hub.order],
      frames: Object.fromEntries([...frameFiles].map(([id, file]) => [id, {
        sha256: file.hash, size: imageDimensions(file.path),
        note: id === 'r0' ? 'restyled frame 0; shared basis for every change' : hub.notes[Number(id.slice(1)) - 1],
        promptReference: id === 'r0' ? null : (() => {
          const frameNumber = Number(id.slice(1));
          const promptPath = join(hubRoot, `hub${frameNumber}_prompt.txt`);
          const text = readFileSync(promptPath, 'utf8');
          if (!new RegExp(`\\[SAVE AS\\]\\s*done/${id}\\.png`, 'i').test(text)) {
            throw new Error(`Hub prompt does not name the accepted output ${hub.dir}/${id}.png`);
          }
          return { file: `${hub.dir}/hub${frameNumber}_prompt.txt`, sha256: hashFile(promptPath),
            inputSha256: base.hash, outputSha256: file.hash, text };
        })(),
      }])),
      playbackEvidence: `${hub.dir}/PLAYBACK.md`,
      derivation: 'Each changed frame derives independently from this exact restyled r0 basis.',
    };
    baseRow.identity.animations ??= [];
    baseRow.identity.animations.push(animation);
    animations.push({ animation, frameFiles });
  }
  return { rows, excluded, held, ledgerRecords, eligibleRecords, tileAliasAccepted, animations };
}

function imageDimensions(path) {
  const data = readFileSync(path);
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

function basename(value) { return value.replaceAll('\\', '/').split('/').filter(Boolean).at(-1) ?? ''; }

function isWithin(parent, child) {
  const rel = relative(parent, child);
  return !rel || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function relativeOrName(path, root) {
  const rel = relative(root, path);
  return rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel) ? rel.split(sep).join('/') : basename(path);
}

export function bundleCokGeneratedInventory(sourceRoot, candidateRoot, {
  runtimeManifestPath = RUNTIME_MANIFEST,
  runtimeCombatManifestPath = RUNTIME_COMBAT_MANIFEST,
  runtimePlayerManifestPath = RUNTIME_PLAYER_MANIFEST,
  includeImages = true,
} = {}) {
  sourceRoot = realpathSync(resolve(sourceRoot));
  candidateRoot = resolve(candidateRoot);
  if (!existsSync(candidateRoot) || !statSync(candidateRoot).isDirectory()) {
    throw new Error(`Static candidate directory must already exist: ${candidateRoot}`);
  }
  const target = join(candidateRoot, 'restyle', 'cok-generated');
  if (isWithin(sourceRoot, target) || isWithin(realpathSync(candidateRoot), sourceRoot)) {
    throw new Error('External ledger root and candidate must not overlap');
  }
  if (existsSync(target)) throw new Error(`Refusing to replace existing inventory: ${target}`);

  const { rows, excluded, held, ledgerRecords, eligibleRecords, tileAliasAccepted, animations } = ledgerRows(sourceRoot);
  const groups = new Map();
  for (const row of rows) {
    const members = groups.get(row.key) ?? [];
    members.push(row);
    groups.set(row.key, members);
  }
  const runtimeEvidence = new Map();
  const addRuntimeEvidence = (key, evidence) => {
    const items = runtimeEvidence.get(key) ?? new Set();
    items.add(evidence);
    runtimeEvidence.set(key, items);
  };
  const combat = JSON.parse(readFileSync(runtimeCombatManifestPath, 'utf8'));
  if (!Array.isArray(combat.banks) || !combat.banks.length) throw new Error('CoK CPIC runtime manifest has no banks');
  for (const bank of combat.banks) {
    if (typeof bank.name !== 'string' || !/^[a-f0-9]{64}$/i.test(bank.sourceArchiveSha256 ?? '') || !Array.isArray(bank.icons)) {
      throw new Error('CoK CPIC runtime bank is not archive-hash pinned');
    }
    for (const icon of bank.icons) {
      if (!Number.isInteger(icon.pictureId) || !/^[a-f0-9]{64}$/i.test(icon.sha256 ?? '')) {
        throw new Error(`Invalid CoK CPIC runtime identity in ${bank.name}`);
      }
      const sourceRows = rows.filter(({ identity }) => identity.platform === 'DOS'
        && identity.family === bank.name && Number(String(identity.asset).match(/(\d+)$/)?.[1]) === icon.pictureId);
      let candidates = sourceRows.filter(({ outputHash }) => outputHash === icon.sha256.toLowerCase());
      if (icon.sourceImageSha256) {
        if (!/^[a-f0-9]{64}$/i.test(icon.sourceImageSha256)) {
          throw new Error(`Invalid source image hash for runtime ${bank.name}#${icon.pictureId}`);
        }
        candidates = candidates.filter(({ sourceHash }) => sourceHash === icon.sourceImageSha256.toLowerCase());
      }
      if (candidates.length === 0 && icon.sourceImageSha256 && /^[a-f0-9]{64}$/i.test(icon.sourceImageSha256)
          && typeof icon.stem === 'string' && /^[A-Za-z0-9_-]+$/.test(icon.stem)) {
        const sourceMatches = sourceRows.filter(({ sourceHash }) => sourceHash === icon.sourceImageSha256.toLowerCase());
        if (new Set(sourceMatches.map(({ sourceHash }) => sourceHash)).size !== 1 || sourceMatches.length === 0) {
          throw new Error(`Expected one exact source PNG for runtime ${bank.name}#${icon.pictureId}; found ${new Set(sourceMatches.map(({ sourceHash }) => sourceHash)).size}`);
        }
        const sourceRow = sourceMatches[0];
        const outputFile = safeFile(join(sourceRoot, 'done', `${icon.stem}.png`), `runtime Restyle PNG (${bank.name}#${icon.pictureId})`, new Map());
        if (outputFile.hash !== icon.sha256.toLowerCase()) {
          throw new Error(`Runtime Restyle output hash mismatch for ${bank.name}#${icon.pictureId}`);
        }
        const promptReference = icon.promptReference ?? null;
        if (promptReference && (typeof promptReference.text !== 'string'
            || createHash('sha256').update(promptReference.text).digest('hex') !== promptReference.sha256?.toLowerCase()
            || promptReference.inputSha256?.toLowerCase() !== sourceRow.sourceHash
            || promptReference.outputSha256?.toLowerCase() !== outputFile.hash)) {
          throw new Error(`Runtime prompt provenance mismatch for ${bank.name}#${icon.pictureId}`);
        }
        const key = createHash('sha256').update(`${sourceRow.sourceHash}:${outputFile.hash}`).digest('hex');
        candidates = [{
          ...sourceRow,
          key,
          outputPath: outputFile.path,
          outputHash: outputFile.hash,
          outputSize: outputFile.size,
          identity: {
            ...sourceRow.identity,
            ledger: 'runtime CPIC manifest',
            ledgerKind: 'runtime-cpic',
            entry: null,
            sourceLedger: sourceRow.identity.ledger,
            sourceEntry: sourceRow.identity.entry,
            status: 'restyled',
            sourceName: basename(sourceRow.sourcePath),
            sourceProvenance: relativeOrName(sourceRow.sourcePath, sourceRoot),
            runtimeOutputStem: icon.stem,
            promptReference,
            reviewNote: null,
            aliases: [],
            animations: [],
          },
        }];
        rows.push(candidates[0]);
        const members = groups.get(key) ?? [];
        members.push(candidates[0]);
        groups.set(key, members);
      }
      const candidateKeys = new Set(candidates.map(({ key }) => key));
      if (candidateKeys.size !== 1) {
        throw new Error(`Expected one ledger-pinned image pair for runtime ${bank.name}#${icon.pictureId}; found ${candidateKeys.size}`);
      }
      const key = [...candidateKeys][0];
      const evidence = candidates[0].identity.ledger === 'runtime CPIC manifest'
        ? `Runtime CPIC: ${bank.name}#${icon.pictureId}; archive SHA-256 ${bank.sourceArchiveSha256}; source PNG SHA-256 ${candidates[0].sourceHash} matched the DOS coverage ledger by bank and picture ID; output SHA-256 ${icon.sha256} matched the exact runtime manifest.`
        : `Runtime CPIC: ${bank.name}#${icon.pictureId}; archive SHA-256 ${bank.sourceArchiveSha256}; output SHA-256 ${icon.sha256}; DOS coverage ledger matched by bank, picture ID, and output SHA-256.`;
      addRuntimeEvidence(key, evidence);
    }
  }
  const players = JSON.parse(readFileSync(runtimePlayerManifestPath, 'utf8'));
  if (!Array.isArray(players.appearances) || !players.appearances.length) throw new Error('CoK player appearance runtime manifest has no appearances');
  for (const appearance of players.appearances) {
    if (typeof appearance.appearanceId !== 'string' || !appearance.head || !Array.isArray(appearance.bodyFrames)
        || !appearance.bodyFrames[0]) throw new Error('Invalid presented CoK player appearance runtime identity');
    // Only the head and body frame actually selected by the current compositor are presented.
    for (const [part, reference] of [['head', appearance.head], ['body frame 0', appearance.bodyFrames[0]]]) {
      const sourceHash = reference.sourceSha256?.toLowerCase();
      const outputHash = reference.restyleSha256?.toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(sourceHash ?? '') || !/^[a-f0-9]{64}$/.test(outputHash ?? '')) {
        throw new Error(`Invalid CoK player ${part} hashes for ${appearance.appearanceId}`);
      }
      const key = createHash('sha256').update(`${sourceHash}:${outputHash}`).digest('hex');
      if (!groups.has(key)) throw new Error(`Missing exact CoK player ${part} source/output pair for ${appearance.appearanceId}`);
      addRuntimeEvidence(key, `Runtime player appearance: ${appearance.appearanceId} ${part}; exact source/output SHA-256 pair.`);
    }
  }
  const runtime = JSON.parse(readFileSync(runtimeManifestPath, 'utf8'));
  if (runtime.game !== 'cok' || runtime.blockId !== 121 || !/^[a-f0-9]{64}$/.test(runtime.source?.sha256 ?? '')
      || !/^[a-f0-9]{64}$/.test(runtime.restyle?.sha256 ?? '')) {
    throw new Error('CoK #121 runtime manifest is not source/output hash pinned');
  }
  const runtimeKey = createHash('sha256').update(`${runtime.source.sha256}:${runtime.restyle.sha256}`).digest('hex');
  const runtimeMembers = groups.get(runtimeKey);
  if (!runtimeMembers?.length) throw new Error('The exact source-pinned CoK #121 runtime pair is missing from the generated inventory ledgers');
  groups.delete(runtimeKey);
  const externalComparisons = [{
    id: 'cok_overland_bigpic1_121', stem: '074_cok_overland_bigpic1_121',
    label: 'CoK overland map · BIGPIC1#121',
    sourceSha256: runtime.source.sha256, outputSha256: runtime.restyle.sha256,
    runtimeApproved: true,
    approvalEvidence: 'Exact source and Restyle SHA-256 pair matched apps/web/src/ui/cokTravelRestyleManifest.json; existing Runtime gallery entry.',
    aliases: runtimeMembers.flatMap(({ identity }) => [identity, ...(identity.aliases ?? [])]),
  }];
  const cards = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, members], index) => {
    const primary = members[0];
    const aliases = members.flatMap(({ identity }) => [identity, ...(identity.aliases ?? [])]);
    const platforms = [...new Set(aliases.map((row) => row.platform))].sort();
    const families = [...new Set(aliases.map((row) => row.family))].sort();
    const ledgerStatuses = [...new Set(aliases.map((row) => row.status))].sort();
    const reviewNotes = [...new Set(aliases.map((row) => row.reviewNote).filter(Boolean))];
    const cardAnimations = aliases.flatMap((row) => row.animations ?? []);
    const stem = `asset-${String(index + 1).padStart(4, '0')}-${key.slice(0, 12)}`;
    const asset = {
      id: stem,
      stem,
      kind: 'restyle comparison',
      label: `${platforms.join(' / ')} · ${families.join(', ')} · ${basename(primary.sourcePath)}`,
      family: families.join(' | '),
      families,
      platform: platforms.join(' / '),
      platforms,
      source: `images/${primary.sourceHash}.png`,
      output: `images/${primary.outputHash}.png`,
      sourceName: basename(primary.sourcePath),
      sourceProvenance: relativeOrName(primary.sourcePath, sourceRoot),
      sourceSha256: primary.sourceHash,
      outputSha256: primary.outputHash,
      sourceSize: primary.sourceSize,
      outputSize: primary.outputSize,
      ledgerStatuses,
      aliases,
      reviewNotes,
      outputType: classifyOutput(ledgerStatuses),
      promptReferences: [...new Map(aliases.map((alias) => alias.promptReference).filter(Boolean)
        .map((prompt) => [prompt.sha256, prompt])).values()],
      sourceMatched: true,
      compositionReview: 'not-reviewed',
      runtimeApprovalEvidence: [...(runtimeEvidence.get(key) ?? [])].sort(),
      runtimeApproved: runtimeEvidence.has(key),
      animations: cardAnimations,
      prompt: aliases.some((alias) => alias.promptReference) || cardAnimations.some((animation) => Object.values(animation.frames).some((frame) => frame.promptReference))
        ? 'Exact source/output-pinned prompt references are attached'
        : 'unknown (not recorded or exact source/output mapping unavailable)',
    };
    // Card metadata is additive. The ledger aliases (including nested animation evidence) are
    // fingerprinted separately and must retain their original bytes and fields.
    const batchPrompt = reviewedCardPrompt(asset);
    if (batchPrompt) asset.promptReferences.push(batchPrompt);
    let hasBasePrompt = false;
    asset.animations = cardAnimations.map((animation) => {
      const basePrompt = reviewedCardPrompt(asset, animation);
      if (!basePrompt) return animation;
      hasBasePrompt = true;
      return { ...animation, frames: { ...animation.frames, r0: { ...animation.frames.r0, promptReference: basePrompt } } };
    });
    if (batchPrompt || hasBasePrompt) asset.prompt = 'Exact source/output-pinned prompt references are attached';
    return { key, asset, primary };
  });
  const assets = cards.map(({ asset }) => asset);

  mkdirSync(target, { recursive: true });
  if (includeImages) mkdirSync(join(target, 'images'), { recursive: true });
  const stagedImages = new Map();
  if (includeImages) {
    for (const { asset, primary: sourceRow } of cards) {
      const sourceDest = join(target, asset.source);
      const outputDest = join(target, asset.output);
      if (!stagedImages.has(asset.sourceSha256)) {
        copyFileSync(sourceRow.sourcePath, sourceDest);
        if (hashFile(sourceDest) !== asset.sourceSha256) throw new Error(`Staged source hash mismatch: ${asset.id}`);
        stagedImages.set(asset.sourceSha256, sourceDest);
      }
      if (!stagedImages.has(asset.outputSha256)) {
        copyFileSync(sourceRow.outputPath, outputDest);
        if (hashFile(outputDest) !== asset.outputSha256) throw new Error(`Staged output hash mismatch: ${asset.id}`);
        stagedImages.set(asset.outputSha256, outputDest);
      }
    }
    for (const { animation, frameFiles } of animations) {
      for (const [frame, file] of frameFiles) {
        if (stagedImages.has(file.hash)) continue;
        const destination = join(target, `images/${file.hash}.png`);
        copyFileSync(file.path, destination);
        if (hashFile(destination) !== file.hash) throw new Error(`Staged animation frame hash mismatch: ${animation.id}/${frame}`);
        stagedImages.set(file.hash, destination);
      }
    }
  }
  const manifest = {
    schema: 'cok-restyle-inventory-v1',
    imageMode: includeImages ? 'bundled' : 'local-pack',
    scope: 'CoK Restyle comparison inventory with exact SHA-256 source/output pairs; exact aliases and review status retained',
    batch: 'cok-restyle-ledgers',
    sourceRootName: basename(sourceRoot),
    counts: {
      ledgerRecords, eligibleRecords, sourceOutputEdges: rows.length, tileAliasRows: tileAliasAccepted,
      uniquePairs: assets.length,
      externalComparisonAliases: externalComparisons.length,
      animations: animations.length,
      animationPlaybackSteps: animations.reduce((total, { animation }) => total + animation.playbackOrder.length, 0),
      aliasEdges: assets.reduce((total, asset) => total + asset.aliases.length, 0)
        + externalComparisons.reduce((total, item) => total + item.aliases.length, 0)
        - assets.length - externalComparisons.length,
      excludedRows: excluded.length, heldRows: held.length,
      uniquePngFiles: stagedImages.size,
      uniquePngBytes: [...stagedImages.values()].reduce((total, path) => total + statSync(path).size, 0),
    },
    excluded,
    held,
    externalComparisons,
    assets,
  };
  writeFileSync(join(target, 'manifest.json'), `${JSON.stringify(manifest)}\n`);
  console.log(`[bundle-cok-generated-inventory] ${ledgerRecords} ledger records -> ${rows.length} direct source/output edges + ${tileAliasAccepted} tile aliases -> ${assets.length} unique pairs; ${excluded.length} excluded; ${held.length} held${includeImages ? '' : ' (metadata only)'}; ${target}`);
  return manifest.counts;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const candidate = args.find((value) => value !== '--source-root' && value !== '--candidate') ?? '';
  const sourceIndex = args.indexOf('--source-root');
  const root = sourceIndex >= 0 ? args[sourceIndex + 1] : 'C:/GoldBoxImg/cok_restyle_work';
  if (!candidate) {
    console.error('Usage: node bundle-cok-generated-inventory.mjs <existing-static-candidate> [--source-root C:/GoldBoxImg/cok_restyle_work]');
    process.exitCode = 2;
  } else {
    try { bundleCokGeneratedInventory(root, candidate, { includeImages: !args.includes('--metadata-only') }); }
    catch (error) { console.error(`[bundle-cok-generated-inventory] ${error.message}`); process.exitCode = 1; }
  }
}
