# Production intro fixture manifest

`e2e:intros` now loads title archives from external fixture files through the real Library folder
input and `AssetSource`. The archives remain outside the static candidate. The script requires both
`GB_INTRO_FIXTURE_MANIFEST` (absolute path to a JSON file) and
`GB_INTRO_FIXTURE_MANIFEST_SHA256` (independent SHA-256 pin for the exact manifest bytes).

The JSON contract is:

```json
{
  "schema": "goldbox-intro-fixture-manifest-v1",
  "version": 1,
  "reviewReference": "independent archive pin review or inventory reference",
  "fixtures": {
    "1": {
      "profileId": "champions-of-krynn",
      "platform": "DOS",
      "archivePath": "C:/external-fixtures/cok/TITLE.DAX",
      "archiveRelativePath": "TITLE.DAX",
      "byteLength": 57528,
      "sha256": "...64 lowercase hex characters...",
      "pinReference": "docs/engine/research/cok-graphics-source-roster-v1.json",
      "pinManifestPath": "C:/external-fixtures/GOG-GoldBox.manifest.json",
      "pinManifestSha256": "...64 lowercase hex characters...",
      "pinArchivePath": "C:/external-fixtures/GOG-GoldBox.zip",
      "pinArchiveSha256": "...64 lowercase hex characters...",
      "pinArchiveEntry": "Games/Champions of Krynn/TITLE.DAX"
    }
  }
}
```

`fixtures` must contain exactly the ten routes configured in `intro-composition.mjs`. Each row must
include its expected `profileId`, `platform: DOS`, absolute external archive path, relative path in
the selected fixture install, exact byte length and SHA-256, and independent pin-reference metadata.
The runner verifies the external reference-manifest SHA, source-archive ZIP SHA, and exact title-file
row in that independent manifest. CoK and DoK also retain their in-code archive pins. Marker files
used for Library detection are synthesized empty files; title archive bytes are the actual fixture
bytes. DQK and Pool of Radiance keep their nested `DISK1/TITLE.TLB` and `POOLRAD/TITLE.DAX` paths.

Run the no-browser preflight with the external manifest and its separately recorded digest:

```powershell
$env:GB_INTRO_FIXTURE_MANIFEST = 'C:\GoldBoxImg\batch03_work\intro-fixture-manifest-v1\goldbox-intro-fixtures.json'
$env:GB_INTRO_FIXTURE_MANIFEST_SHA256 = '5c34de5810c67b0e2a08679b1e874dab7d94c8be29dfa6f3365f31f6f5745610'
node test/intro-composition.mjs --preflight-only
```

`--preflight-only` verifies the manifest, each independent pin manifest and source ZIP, and every
title archive's length and SHA-256. It does not launch the browser or start the candidate server.

The browser check selects each fixture through `#folder-input`, verifies that Library identifies
the expected DOS title, then checks the decoded frame count and nonblank pixels. It also rejects HTTP
requests for game-archive extensions. Missing fixtures or pins fail preflight; they do not skip the
ten-route gate.

The external manifest is reproducible with the checked-in metadata-only builder
`build-intro-fixture-manifest.py`. It rechecks the pinned GOG/NWN manifests and ZIP members, compares
each selected local title archive byte-for-byte with its pinned ZIP member, and refuses output under
the repository. Use `--write` only with a new external output path; it creates the file without
overwriting. Without `--write`, it prints the deterministic output SHA-256 without writing anything.
