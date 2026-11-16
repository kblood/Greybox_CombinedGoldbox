# Static asset packaging boundary

`bundle-assets.mjs` excludes original executables/drivers and save/character files
from manifest, catalog, UI/audio literal, and recursive directory inputs. `SAVE`
descendants, `SAVGAM*` and `CHRDAT*` names are excluded case-insensitively. Config/key
formats are also excluded. Counts distinguish
collected paths, recursive paths (a skipped directory counts once), and removed
bundled manifest entries. Source manifests/data are never rewritten.

Allowed absolute paths still map to `assets/external/`. GEO and ECL scripts are
allowed gameplay data; DAX is a container extension, not a synonym for artwork.
Production NWN preview deliberately omits executable-resident loot vocabulary;
development retains the local executable reader.

`public-artifact-policy.mjs` has two modes. The generic asset-bundler check audits the
complete output `assets/` tree and bundled manifest references. The release build uses
`--complete-output`, which walks the entire output and admits only app-owned root
HTML/SVG, JS/CSS chunks, game/Restyle metadata JSON, and `restyle/animations.html`.
Unknown paths, forbidden assets, and filesystem links fail closed. The synthetic release
check covers accepted files and rejected image/archive paths. It scans public HTML/JS/CSS/JSON/SVG
text for drive-root and UNC machine paths and rejects `data:image` payloads in text artifacts.
Production Vite sets `assetsInlineLimit: 0`, so imported images are emitted as files and rejected by
the output allowlist instead of being inlined into JS/CSS. Production Vite also projects local paths
out of the graphics registry, alias evidence and runtime archive tables while keeping game source
files user supplied. Arbitrary byte arrays manually embedded in JS/JSON are not classified by this
artifact audit and remain a source-review concern.
Extensionless Amiga audio requires a FORM SMUS/8SVX/INST signature or the pinned
SHA-256 for the verified `soundData`/`periodTable` banks; `.smu` needs FORM SMUS.
C64 PRG inputs are restricted to
the catalog's extracted picture/charset naming. This is a packaging inventory
policy, not a general byte-level classifier of every allowed container.

`build-app.mjs` runs the strict audit after its metadata-only packers. A fresh Vite build
removes old output; invoking the bundler alone on contaminated output fails closed. The strict
output audit scans text paths and image data URIs, but it does not classify arbitrary opaque data
embedded inside JS or JSON payloads. No remote files change until a separately authorized atomic
deployment replaces the site. The earlier web release receipt documents authorization for the
specific artwork and gameplay-data scope of that release; it does not override the current
user-owned-input rule or authorize all future game/generated images. Current distribution keeps
original and generated game images in user-owned local inputs. Saves, original executable code and
credentials are not included. See
[the web release receipt](../../../docs/engine/research/greybox-public-release-2026-10-25.md).

Focused verification:

```
node --test apps/web/test/bundle-assets.test.mjs
pnpm --filter @goldbox/web typecheck
node apps/web/scripts/public-artifact-policy.mjs dist-app
```

Missing local game holdings remain explicit build warnings, not successful
playability evidence. Keep the existing static art/gameplay and intro assertions
intact; a safety audit pass does not replace those runtime gates. Save import remains available from a selected local installation; an unselected
public route explains that no save is bundled instead of requesting a missing URL.
The standalone save editor is local-only in production.
