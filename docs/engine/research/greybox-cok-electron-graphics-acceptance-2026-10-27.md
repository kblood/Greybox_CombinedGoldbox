# CoK Electron graphics acceptance — 2026-10-27

## Update: graceful Electron restart acceptance and full-package candidate

The current complete candidate is `{external-workspace}/batch03_work/cok-runtime-site-candidate-67097d34`.
It overlays the fresh renderer build onto the live v5 base
`{external-workspace}/batch03_work/cpic1-12-35-acceptance-20261027/package-v11`: all 6,357 prior files
remain, only `index.html` changed among them, and the candidate adds
`assets/dungeon3d-8IMGIWil.js` and `assets/index-DwkuMGWn.js` (6,359 files total). All 23 game
manifests and the inventory manifest retain their base bytes. The new entry JavaScript hash is
`eb295ba81c7d5f141043d8ac13240b8962de8a67b9d3280114f70ebd8cf8ca09`; CSS remains
`assets/index-B_6xssA6.css` with hash
`b8ffe181f1087b544360a073931598d0d30c26a934e14e5cc3da4ad246319307`. The generated inventory
manifest remains hash `37f8b37340c1d3df510efc7f2954483e7ba966923efc8fbfa5c5717641bfed94`.
The public-artifact audit checked 926 assets, and `GB_STATIC_DIST_DIR=<candidate> pnpm --filter
@goldbox/web e2e:static` passed. The candidate was atomically deployed to `/var/www/html/greybox`.

The focused Electron gate passed **3/3** against that exact full-package candidate: native folder
detection, selected-folder CoK campaign/combat, and process-restart/save continuity. The test asserts
both renderer processes load the candidate `index.html`, validates the active DevTools port and
browser websocket path, and checks graceful process exits and profile cleanup. After restart, before
any graphics click, the inherited Restyle BIGPIC1#121 hash matched the explicit Restyle hash
`90437ec2bf1dffc0d3723e3552d812f342b37c972328829de7d684d677447175`; Restyle changed 53,979 pixels
and the visible DOS selection restored exact canvas hash
`f01c71b59aed32ee8cde692b7a795e2a318927cb2f9383f740ca27625b472f7a` and unchanged game/save state.

The first process stored **Restyle** with **Amiga** as the original fallback and closed cleanly. The
second process used a new PID and a newly acquired selected-folder source capability. Before any
folder or mode interaction, both preference keys and quick-save SHA-256
`9ce134767e091337049d0f6a72e08e86f69e2472f377ddf9632e6f5ad6ed77fc` were unchanged. Loading the
retained save restored disk 1 / area 32, pose `(4,0,east)`, clock 363, encounter flag `08`, the same
party, and settled combat. The selected CoK DOS tree contains no `BIGPIC1.DAA`; Amiga was explicitly
reported as DOS fallback, not claimed as Amiga image equivalence. Natural combat exercised CPIC1
#12/#35; guarded #12 stayed original and #35 changed opaque samples. The exploration landing view
still showed zero Restyle wall pixels. No renderer errors or optional audio misses occurred in the
full-package rerun.

Live verification after deployment: `https://dionysus.dk/greybox/?restyle=1` returned HTTP 200 and
referenced the candidate JS/CSS. HTTP 200 and SHA-256 matched for `index.html`, the entry JS, CSS,
`restyle/cok-generated/manifest.json`, CPIC1 #12/#35 v5 PNGs and BIGPIC1#121 Restyle PNG. The live
`GB_E2E_BASE_URL=https://dionysus.dk/greybox pnpm --filter @goldbox/web e2e:cok-restyle` gate passed
both cases: ECL#112 Restyle changes only image pixels and restores exact DOS, and a corrupt output is
rejected while original pixels and the requested Restyle preference remain intact. That live test
assertion was updated to match the runtime's preserved-preference behavior; it does not change the
web bundle.

Exact focused command against the complete candidate:

```powershell
$env:GB_ELECTRON_ONLY='electron-cok-process-restart'
$env:GB_ELECTRON_RENDERER_ROOT='C:/GoldBoxImg/batch03_work/cok-runtime-site-candidate-67097d34'
pnpm --filter @goldbox/electron e2e
```

The restart case uses the selected-folder retail route and `window.__explore.load()` after fresh
folder acquisition. It does not claim full CoK graphics coverage or an Amiga player/map mapping.

## Update: v5 CPIC candidate on the complete site package

Repeated the focused retail Electron route against
`{external-workspace}/batch03_work/cpic1-12-35-acceptance-20261027/package-v11` after adding the v5
CPIC1 #12/#35 mappings. `pnpm --filter @goldbox/electron build` and the targeted Electron e2e
passed; result **2/2**. The source-pinned diagnostic #12 and #35 each changed their 144/164
visible samples, had zero escaped mask pixels, preserved combat state and restored exact DOS
pixels. In the natural encounter, #35 changed 164 samples; guarded #12 correctly retained its
original pixels. Combat Restyle changed 47,099 canvas pixels and loaded all 25 terrain tiles.
Travel Restyle changed 69,763 pixels and restored the exact DOS canvas; its Amiga choice fell
back to DOS because the selected folder lacks an Amiga map source. The exploration landing view
still changed zero wall pixels. Campaign progression, graphics switching and save/load continuity
passed without errors. This candidate result is local; live deployment is recorded separately.

The package's expanded Restyle inventory now contains 2,542 exact source/output pairs, including
the v5 portraits and exact prompt references. The two prior v1 portraits remain as unapproved
cards. This improves gallery and runtime coverage for two CPIC1 identities; it does not close the
CoK art denominator or establish Amiga/player/animation coverage.

## Scope and result

Ran the real selected-folder Champions of Krynn DOS campaign route in the local Electron shell,
switching the visible graphics controls through DOS-EGA, Amiga, and Restyle in travel, exploration,
and natural combat. The focused route passed **2/2**:

```powershell
$env:GB_ELECTRON_ONLY='electron-cok-retail-travel'
pnpm --filter @goldbox/electron e2e
```

This verifies the built local Electron renderer with its actual file-relative assets and the
selected retail DOS folder. It is not acceptance of the complete published site package, a
process-restart preference check, or full CoK graphics coverage.

## Observed behavior

- Travel on `BIGPIC1.DAX#121`: Restyle changed 69,763 canvas pixels; Amiga clearly fell back to
  DOS because no Amiga map source is present in the selected folder; returning to DOS restored
  the exact original canvas hash.
- Exploration at `ECL1` area 32: the visible selector changed modes, but the landing view rendered
  **zero** Restyle wall pixels. The selected DOS folder also has no decoded Amiga wall source.
  This route does not prove exploration Restyle is visually implemented.
- Natural combat: Restyle changed 47,099 canvas pixels; 19 of 25 pinned DUNGCOM terrain samples
  were visible, and all 25 terrain images loaded. The original DOS canvas hash returned exactly.
  CPIC IDs **12** and **35** remained original art because no CPIC1 mappings are declared.
- Gameplay/story snapshots remained identical during the mode switches. The route also passed its
  opening, mission, town-service, travel, encounter-flag and save/load continuity assertions.
- Nine absent CoK Amiga audio resources are explicitly optional in `gameAudio.ts`; no other
  console or failed-resource errors were accepted.

## CPIC diagnosis

The selected DOS `CPIC1.DAX` SHA-256 is
`5f3e5fdc1734f8aed583233da9c97630b130ad5628eee0f18d875291dfa5e26b`, exactly the CPIC1 archive
hash pinned in `cokCombatRestyleManifest.json`. The two combat icons are missing because CPIC1
does not declare IDs 12 or 35; those numbers exist in other CPIC banks. The current any-bank
`isCokCombatRestylePictureId()` check therefore emits a misleading source-archive-mismatch error.

Existing DOS outputs are available outside the repository at
`{external-workspace}/cok_restyle_work/done/CPIC1_012_restyle.png` and
`CPIC1_035_restyle.png`. Their SHA-256 values are respectively
`7947ae446328673fa6e6b36ec334caae433fb44e32b82b754f0284f122b1cfe4` and
`d73f9ff7a4e73786356892ce198c2d82137a3f278b179fe5eb540e67f71e6268`; both are 96×96, 8-bit RGBA.
The exact source identity and mask still need to be validated in the next runtime slice before
these candidates are admitted. `CPIC1#35` and `CPIC1#59` have byte-identical DOS source PNGs; that
alias must remain explicit.

## Website status

The live Restyle inventory remains current. The live HTML, inventory manifest and referenced JS
hashes match the documented release candidate; live and local completed inventory IDs/output
hashes have no differences. It contains all **2,540 eligible** ledger source/output pairs and
4,838 PNGs. There are 2,435 pairs without runtime approval, 122 held ledger rows and 13 excluded
blank rows. Composition review is still `not-reviewed`; gallery presence is not visual approval
or proof of in-game rendering. No duplicate website deployment is needed for this test-only slice.

## Next step and holds

Plan the next DOS CPIC runtime increment from the real encounter identities, then validate source
archive/block identity, output hash/geometry/color type, transparency mask and visible composition
before adding exact CPIC1 mappings. Keep the Amiga fallback until the selected-folder Amiga source
and logical identities are proven. Continue to treat exploration walls, animation, player
appearances, dialogue, UI and remaining scenes as separate coverage. Do not run broad native,
corpus, or Rust/Defender workflows under the existing holds.
