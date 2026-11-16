// Build the static viewer app and its metadata-only manifests. Original game
// archives, decoded previews and generated Restyle images are selected from
// user-owned local folders at runtime; they are assembled separately by
// build-local-restyle-pack.mjs. Cross-platform: invokes Vite and each packer via
// the current node binary.

import { spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertFreshHostedPath, hostedArtifactInventory, prepareHostedRestylePack, validateHostedRestyleDescriptor } from './hosted-restyle-pack.mjs';
import { auditPublicArtifacts } from './public-artifact-policy.mjs';
import { verifyHostedRestyleRuntimeContract } from './hosted-restyle-runtime-contract.mjs';
import { validateHostedRestyleMetadata } from './hosted-restyle-metadata.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '..');
function checkedOutputPath(output, path, existingFile) {
  const target = resolve(output, path), rel = relative(output, target);
  if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error('Output path escapes candidate');
  const key = value => process.platform === 'win32' ? value.toLowerCase() : value;
  let current = parse(target).root;
  for (const part of ['', ...relative(current, dirname(target)).split(sep).filter(Boolean)]) {
    current = join(current, part); const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory() || key(realpathSync(current)) !== key(current)) throw new Error('Output symlink/reparse ancestor');
  }
  if (existingFile) { const stat = lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isFile() || key(realpathSync(target)) !== key(target)) throw new Error('Output symlink/reparse file'); }
  return target;
}
function commandRunner(args, label, options) {
  const r = spawnSync(process.execPath, args, { stdio: 'inherit', ...options });
  if (r.error || r.status !== 0) throw new Error(`[build-app] ${label} failed: ${r.error?.message ?? r.status}`);
}

// Hosted mode is explicit; importing this module never builds or reads a pack.
export function buildApp({ env: environment = process.env, runCommand = commandRunner, gitHead, auditOutput = auditPublicArtifacts,
  animationPath = resolve(WEB, 'public/restyle/animations.html'), corePath = resolve(WEB, 'src/ui/localAssetPackCore.mjs'),
  runtimeContractVerifier = verifyHostedRestyleRuntimeContract } = {}) {
  if (runtimeContractVerifier !== verifyHostedRestyleRuntimeContract && runCommand === commandRunner) throw new Error('Runtime verifier override requires an injected command runner');
  const input = { ...environment }, env = { ...input, GOLDBOX_BUILD: 'app', VITE_HOSTED_RESTYLE_INVENTORY_SHA256: '' }, OUTPUT = resolve(WEB, input.GB_APP_OUTPUT ?? 'dist-app');
  const COK_GENERATED_ROOT = input.GB_COK_GENERATED_ROOT ?? 'C:/GoldBoxImg/cok_restyle_work';
  const names = ['GB_HOSTED_RESTYLE_ROOT', 'GB_HOSTED_RESTYLE_DESCRIPTOR', 'GB_HOSTED_RESTYLE_INVENTORY_SHA256',
    'GB_SOURCE_INVENTORY_SHA256', 'GB_CANDIDATE_RECEIPT'];
  let prepared, hostedRestylePack, receiptPath, head, viewerBytes, stampedViewer, moduleBytes, animationModule, runtimeCompatibility, metadataValidation;
  if (names.some((name) => input[name] !== undefined)) {
    if ([...names, 'GB_APP_OUTPUT'].some((name) => typeof input[name] !== 'string' || !input[name].trim())) throw new Error('All hosted candidate inputs required');
    if (!/^[a-f0-9]{64}$/.test(input.GB_SOURCE_INVENTORY_SHA256)) throw new Error('Invalid source inventory SHA-256');
    assertFreshHostedPath(OUTPUT, [input.GB_HOSTED_RESTYLE_ROOT]);
    receiptPath = assertFreshHostedPath(input.GB_CANDIDATE_RECEIPT, [resolve(WEB, '../..'), input.GB_HOSTED_RESTYLE_ROOT, OUTPUT]);
    const wrapper = JSON.parse(readFileSync(input.GB_HOSTED_RESTYLE_DESCRIPTOR, 'utf8'));
    const pin = input.GB_HOSTED_RESTYLE_INVENTORY_SHA256;
    if (wrapper.inventorySha256 !== pin) throw new Error('Descriptor wrapper pin differs');
    validateHostedRestyleDescriptor(wrapper.descriptor, pin);
    runtimeCompatibility = runtimeContractVerifier(wrapper.descriptor, pin);
    if (runtimeCompatibility?.compatible !== true) throw new Error('Hosted runtime compatibility required');
    prepared = prepareHostedRestylePack(input.GB_HOSTED_RESTYLE_ROOT, wrapper.descriptor, pin);
    metadataValidation = validateHostedRestyleMetadata(prepared.descriptor, pin, prepared.metadata());
    env.VITE_HOSTED_RESTYLE_INVENTORY_SHA256 = pin;
    const stat = lstatSync(animationPath);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Invalid app-owned animation viewer');
    viewerBytes = readFileSync(animationPath);
    const marker = 'const HOSTED_RESTYLE = null; /* hosted-restyle-config */', viewerText = viewerBytes.toString('utf8');
    if (viewerText.split(marker).length !== 2) throw new Error('Expected exactly one hosted-restyle-config marker');
    const coreStat = lstatSync(corePath);
    if (coreStat.isSymbolicLink() || !coreStat.isFile()) throw new Error('Invalid animation core module');
    moduleBytes = readFileSync(corePath);
    if (/\bimport\s*(?:[({"'*]|[A-Za-z_$])|\bexport\s+[^;\n]*\bfrom\s*["']/.test(moduleBytes.toString('utf8'))) throw new Error('Animation core must be import-free');
    const moduleSha = createHash('sha256').update(moduleBytes).digest('hex');
    animationModule = { path: `assets/hosted-restyle-core-${moduleSha}.js`, byteLength: moduleBytes.length, sha256: moduleSha };
    stampedViewer = Buffer.from(viewerText.replace(marker, `const HOSTED_RESTYLE = ${JSON.stringify({ pin, module: `../${animationModule.path}` })}; /* hosted-restyle-config */`));
    hostedRestylePack = { descriptor: prepared.descriptor, expectedInventorySha256: pin,
      appOwnedRestyleFiles: [{ path: 'restyle/animations.html', byteLength: stampedViewer.length, sha256: createHash('sha256').update(stampedViewer).digest('hex') }] };
    const viewer = prepared.descriptor.files.find((row) => row.path === 'restyle/animations.html'), appViewer = hostedRestylePack.appOwnedRestyleFiles[0];
    if (viewer && (viewer.byteLength !== appViewer.byteLength || viewer.sha256 !== appViewer.sha256)) throw new Error('App-owned animation viewer collision');
    head = gitHead;
    if (head === undefined) {
      const result = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: WEB, encoding: 'utf8' });
      if (result.error || result.status !== 0) throw new Error('Cannot capture git HEAD');
      head = result.stdout.trim();
    }
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head)) throw new Error('Invalid git HEAD');
    assertFreshHostedPath(OUTPUT, [input.GB_HOSTED_RESTYLE_ROOT]); mkdirSync(OUTPUT);
  }
  const run = (args, label) => runCommand(args, label, { cwd: WEB, env });
run([resolve(WEB, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', OUTPUT], 'vite build');
run([resolve(WEB, 'scripts/copy-public-app-assets.mjs'), OUTPUT], 'copy-public-app-assets');
run([resolve(WEB, 'scripts/bundle-assets.mjs'), OUTPUT, '--metadata-only'], 'bundle-assets');
if (!prepared) {
run([resolve(WEB, 'scripts/bundle-restyle-stills.mjs'), OUTPUT, '--metadata-only'], 'bundle-restyle-stills');
run([resolve(WEB, 'scripts/bundle-cok-title-gallery.mjs'), OUTPUT, '--metadata-only'], 'bundle-cok-title-gallery');
run([resolve(WEB, 'scripts/bundle-restyle-animations.mjs'), OUTPUT, resolve(WEB, '../../renders/restyle-site/restyle/anim'), '--metadata-only'], 'bundle-restyle-animations');
run([resolve(WEB, 'scripts/bundle-cok-combat-restyle.mjs'), OUTPUT, '--metadata-only'], 'bundle-cok-combat-restyle');
run([resolve(WEB, 'scripts/bundle-cok-player-appearance.mjs'), OUTPUT, '--metadata-only'], 'bundle-cok-player-appearance');
run([resolve(WEB, 'scripts/bundle-cok-dialogue-restyle.mjs'), OUTPUT, '--metadata-only'], 'bundle-cok-dialogue-restyle');
run([resolve(WEB, 'scripts/bundle-cok-amiga-dialogue18.mjs'), OUTPUT, '--metadata-only'], 'bundle-cok-amiga-dialogue18');
run([resolve(WEB, 'scripts/bundle-cok-travel-restyle.mjs'), OUTPUT, '--metadata-only'], 'bundle-cok-travel-restyle');
run([resolve(WEB, 'scripts/bundle-cok-generated-inventory.mjs'), OUTPUT, '--source-root', COK_GENERATED_ROOT, '--metadata-only'], 'bundle-cok-generated-inventory');
// DOS source/tile preview PNGs are not public build artifacts. ?graphics=1 decodes
// exact-hash-matched images from the selected local game archives instead.
run([resolve(WEB, 'scripts/bundle-cok-demo-restyle.mjs'), OUTPUT, '--metadata-only'], 'bundle-cok-demo-restyle');
run([resolve(WEB, 'scripts/bundle-cok-amiga-dialogue57.mjs'), OUTPUT, '--metadata-only'], 'bundle-cok-amiga-dialogue57');
run([resolve(WEB, 'scripts/bundle-cok-terrain-restyle.mjs'), OUTPUT, '--metadata-only'], 'bundle-cok-terrain-restyle');
run([resolve(WEB, 'scripts/bundle-cok-wall-restyle.mjs'), OUTPUT, '--metadata-only'], 'bundle-cok-wall-restyle');
run([resolve(WEB, 'scripts/bundle-cok-title-restyle.mjs'), OUTPUT, '--metadata-only'], 'bundle-cok-title-restyle');
}
  if (prepared) {
    const copiedViewer = checkedOutputPath(OUTPUT, 'restyle/animations.html', true);
    if (!readFileSync(copiedViewer).equals(viewerBytes)) throw new Error('Copied animation viewer differs from captured source');
    prepared.integrate(OUTPUT);
    writeFileSync(checkedOutputPath(OUTPUT, 'restyle/animations.html', true), stampedViewer);
    writeFileSync(checkedOutputPath(OUTPUT, animationModule.path, false), moduleBytes, { flag: 'wx' });
    writeFileSync(resolve(OUTPUT, 'hosted-restyle-pack.json'), JSON.stringify({ descriptor: prepared.descriptor,
      inventorySha256: hostedRestylePack.expectedInventorySha256 }) + '\n', { flag: 'wx' });
  }
  const beforeAudit = prepared && hostedArtifactInventory(OUTPUT);
  const audit = auditOutput(OUTPUT, { completeOutput: true, hostedRestylePack });
  if (prepared) {
    const artifact = hostedArtifactInventory(OUTPUT);
    if (artifact.inventorySha256 !== beforeAudit.inventorySha256 || artifact.fileCount !== beforeAudit.fileCount
        || artifact.totalBytes !== beforeAudit.totalBytes) throw new Error('Candidate changed during audit');
    const receipt = { schema: 'greybox-hosted-candidate-v1', gitHead: head, sourceInventorySha256: input.GB_SOURCE_INVENTORY_SHA256,
      packInventorySha256: hostedRestylePack.expectedInventorySha256, packFileCount: prepared.descriptor.fileCount,
      packTotalBytes: prepared.descriptor.totalBytes, finalArtifactInventorySha256: artifact.inventorySha256,
      artifactFileCount: artifact.fileCount, artifactTotalBytes: artifact.totalBytes, descriptor: prepared.descriptor,
      appOwnedRestyleFiles: hostedRestylePack.appOwnedRestyleFiles, hostedAnimationModule: animationModule, runtimeCompatibility, metadataValidation };
    assertFreshHostedPath(receiptPath, [resolve(WEB, '../..'), input.GB_HOSTED_RESTYLE_ROOT, OUTPUT]);
    writeFileSync(receiptPath, JSON.stringify(receipt) + '\n', { flag: 'wx' });
  }
  return { output: OUTPUT, audit };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(`[build-app] done -> ${buildApp().output}/`); }
  catch (error) { console.error(`[build-app] ${error.message}`); process.exitCode = 1; }
}
