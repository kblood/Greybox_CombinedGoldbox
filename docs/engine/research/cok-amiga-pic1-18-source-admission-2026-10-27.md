# CoK Amiga PIC1 #18 source admission — 2026-10-27

This slice admits the exact Amiga source and validates the approved imported PNG.
It creates no ECL scene binding, gallery entry, runtime loader, build asset or
deployment. DOS `PIC1.DAX` #18 remains a different identity. Generated/reference
images and game archives remain external and are not committed.

## Source and output contract

The source manifest is
`apps/web/src/ui/cokAmigaDialogue18RestyleManifest.json`. Its archive is 165,455
bytes with SHA256 `b3512ed6a030ac27538ae66f6115bdf0bf1f5a78e63eba0d32fef3e32b049687`.
The 27-entry six-byte index starts data at 164. Ordinal 7 is block 18, relative
offset 46,191; compressed bytes `[46355,51114)` are 4,759 bytes and hash to
`f5dc0c21cf16b2c532c1637148e8026844f34e92c327379e9a33909db2966581`.

The corrected single-frame layout is `amiga-sprite-single-frame-tail-v1`:
raw header field 77, actual bitmap start 87, planar bytes 5,280, stride 5,281,
complete decoded bytes 5,368. The frame is opaque 88×88, positioned at 0,0.
The full-stream hash is
`2f09979383ed4d936c3dce1e94499afbe97d64916a46248d24cf4c2f10099704`;
the source identity returned by admission includes this as `blockSha256`.
Independent review pins also cover planar bytes, indices, all 32 RGB colors and
opaque RGBA. They are literal constants in the tests, independently of the
production manifest and the live Python oracle.

External lineage is Batch02 asset
`036_cok_amiga_daa_cok_pic1_pic1_018_f0`: the complete prompt, generation input,
native PNG, raw generation output and approved import hashes are recorded in the
manifest. The approved imported PNG is RGB/type 2, 8-bit, 1408×1408 (scale 16),
2,726,186 bytes, SHA256
`a7d21c06f8c457591a1009c67a1e69c68bc0e0ace99240afee2387643d092cc7`.
`dialogue/AMIGA_PIC1_018_f0_restyle.png` is a reserved destination, not an assertion
that this slice copies, registers or serves that file.

## Pure helper boundaries

`apps/web/src/ui/cokAmigaPortrait18Art.ts` has three asynchronous entry points:

- `admitCokAmigaPortrait18(archiveBytes, requestedIdentity)` checks the exact
  requested Amiga identity, copies the archive synchronously (including Buffer
  aliases), and computes SHA256 internally. Wrong length or hash rejects before
  corrected decoder opt-in. It then checks selected TOC/compressed bytes and
  decoded evidence, returning `{ ok: true, source, original }` on success or
  `{ ok: false, reason }` on failure. Admission does not reject its promise;
  detailed validation/decoder failure reasons are retained. The source is frozen and
  Amiga-qualified; the image is an owned snapshot. Caller-provided digest strings
  cannot establish archive identity.
- `validateCokAmigaPortrait18DecodedEvidence(archive)` validates decoded container,
  ordinal with exactly one #18 entry, source geometry/count, primary frame binding, exact-sized tail metadata,
  complete stream and pixel/palette hashes. It snapshots hashed payloads before
  awaiting and returns an owned image. This validator alone establishes decoded
  evidence, not archive provenance. This validator retains throwing semantics.
- `validateCokAmigaPortrait18ImportedPng(bytes)` checks exact length, PNG signature,
  IHDR length/type, dimensions, bit depth, color type and codec fields, then hashes
  its owned snapshot. It returns the approved byte snapshot; it does not decode,
  fetch, resize or display the PNG. The exact hash binds all remaining PNG bytes.
  This validator retains throwing semantics.

No helper uses fetch, DOM, filesystem, image generation or a browser image API.
Byte-array ownership is enforced by private copies, not by freezing typed arrays.
All public failure messages identify the Amiga #18 admission.

## Focused evidence

`packages/engine/test/cokAmigaPortrait18Admission.test.ts` contains portable
identity/size/hash/PNG guards and explicitly named external-fixture tests.
It checks the whole manifest against independent review constants, source and
output byte mutations, decoded metadata/stream/indices/palette mutations, legacy
decoder rejection, DOS identity rejection, source/native PNG equality and mutation
of caller-owned bytes during hashing. Prompt/input/raw-output lineage files are
hashed without modifying them. A decoder invocation spy proves identity/hash
mismatches return before decoder opt-in, and proves the valid archive invokes it
once with only #18 selected. A mutation relabels a different existing entry #18
without changing the 27-entry array length and is rejected.

Optional paths are `GB_COK_AMIGA_18_ARCHIVE`, `GB_COK_AMIGA_18_NATIVE`,
`GB_COK_AMIGA_18_IMPORT`, `GB_COK_AMIGA_18_PRIOR_IMPORT`, and
`GB_COK_AMIGA_18_LINEAGE_ROOT` (default external
root `{external-workspace}`). Missing fixtures are named SKIPs. Native PNG pixel comparison
also names missing Python/Pillow as a SKIP. Portable guards require no game or
image files. `GB_DAA_TAIL_ORACLE` separately enables the existing corrected Python
DAA oracle test.

Both raw generation output and a previous import were located and rejected by
the approved-import validator. The previous import fixture is
`{external-workspace}/batch03_work/dist-app-b3-cpic-runtime-20261027/restyle/out/036_cok_amiga_daa_cok_pic1_pic1_018_f0.png`,
2,874,782 bytes, SHA256
`255a5fbd5a2650303dc7adb4008e9cb5af0931bd3f0d1b342f76551a3d85c883`.
These fixture rejection tests are named SKIPs when the files are absent.

Measured commands and verdicts:

```powershell
$env:GB_DAA_TAIL_ORACLE='<pinned local PIC1.DAA>'
pnpm --filter @goldbox/engine test -- test/cokAmigaPortrait18Admission.test.ts test/daaSingleFrameTail.test.ts test/daa.test.ts test/daaIndexValidation.test.ts test/daaTileStrip.test.ts
Remove-Item Env:GB_DAA_TAIL_ORACLE
pnpm --filter @goldbox/engine typecheck
pnpm --filter @goldbox/web typecheck
```

The focused five-file run passes **50 tests / 32 prerequisite skips**. All **40
new admission tests** run and pass with the present local fixtures. The 32 skips
are older fixture/holdings-dependent DAA checks, not inferred passes. Both
typechecks pass. With all optional fixture paths pointed at absent locations,
the admission file passes **13 portable guards / 27 named fixture skips**.
No full regression, browser runtime, corpus, build or deployment
claim follows from these source-admission checks.
