# CoK DOS PIC1#57 frame-0 dialogue Restyle admission

Published bounded increment from commit `203a44f3` on `greybox`. The admission covers exactly one DOS dialogue
portrait and preserves the existing cottage pilot. It does not establish complete CoK dialogue/
portrait coverage, animation coverage or an Amiga counterpart. Candidate:
`{external-workspace}/batch03_work/dist-app-dialogue57-candidate-20261027` (1,259 files, 893 audited
public assets). It was assembled from the previous complete 1,256-file package, fresh production
bundles, and only the one hash-pinned dialogue PNG; it retains all 23 game JSON manifests byte for
byte. The normal `build:app` path now includes a dedicated exact-file bundler and fails closed if
the external source/output hashes, PNG types or geometries differ. Raw `build:app` still reports
620 unavailable source references and audits only its reduced local asset set; it was not deployed
by itself. The release candidate reused the previous complete package and overlaid the exact fresh
production bundles and pinned portrait output.

## Source and reviewed output

| Field | Admitted value |
| --- | --- |
| Game/system | CoK / DOS-EGA |
| Archive | `Champions of Krynn/PIC1.DAX` |
| Archive SHA-256 | `2F62DAB8B7F776226D6C6C35847382DE3BAA758A836220639D2C46C2DD74AE97` |
| Block/frame | 57 / 0 |
| Source geometry | One 88×88 frame, offsets (0,0), delay 0 |
| External source PNG | `{external-workspace}/cok_restyle_work/dos_complex_render/PIC1/PIC1_057_f0.png` |
| Source PNG SHA-256 | `F854DEBB99B65C412E49E90A7606263341E83BAE5DCA0BA8B5BA36D51D671191` |
| Reviewed output | `{external-workspace}/cok_restyle_work/done/PIC1_057_f0_restyle.png` |
| Output geometry | 352×352, 8-bit RGBA, scale 4 |
| Output SHA-256 | `A2D2126C903D61AFA46085693E9DECFD08B789F33C96FBA0292B6BDA73441CBE` |

Astra's source admission established the exact 4× decoded-source PNG pixels and visual review;
the implementation rechecked the current archive, source PNG and reviewed output hashes.
The DOS-specific original prompt is absent. Batch02 prompt 043 is for an Amiga source and does
not supply this DOS output's provenance. No image generation or provenance reconstruction was
performed.

## Runtime behavior

The CoK opening, travel and Throtl presentation hosts now carry a source identity beside each
decoded picture: game, system, archive name, actual archive hash, block and frame. The dialogue
controller retains the identity with its current picture when a subsequent turn has no PICTURE.
The new scene descriptor only matches the exact admitted source; a numeric id 57 alone cannot
activate it. Id 58 and missing or mismatched identities retain original art.

The controller supports exact-source scene descriptors alongside the existing opening pilots.
Restyle caches and pending requests for the new descriptor use its complete source identity and
logical frame identity. Async completion also checks the mounted dialogue, picture revision and
currently selected descriptor. An old 57 load cannot paint after selecting 58 or closing the view.
Selecting an original mode during loading keeps that original mode selected.

`cokPortraitArt.ts` validates output byte limit, PNG type/geometry, hash and decoded geometry before
returning RGBA. Its runtime destination is `restyle/cok/dialogue/PIC1_057_f0_restyle.png` beneath
the app base. The overlay uses the same absolute (24,24) origin and native 88×88 rectangle as the
indexed portrait. Neither ECL progression nor gameplay data depends on the selected art.

This slice does not stage the image into a production package or the user's untracked public
art directory. Its focused test intercepts that exact runtime URL with bytes from the reviewed
external output. Candidate packaging must independently include and verify that file before
release.

## Verification

Passed:

- `pnpm --filter @goldbox/web e2e:cok-dialogue-restyle` (development, complete candidate and live;
  candidate/live modes fetch the packaged PNG from their respective static sites).
- `pnpm --filter @goldbox/web e2e:cok-restyle` (existing cottage positive, persistence and corrupt-output controls).
- `pnpm --filter @goldbox/web typecheck`.
- `node apps/web/scripts/bundle-cok-dialogue-restyle.mjs {external-workspace}/batch03_work/dialogue-bundle-check-20261027`; staged output SHA-256 matches the manifest.
- `node apps/web/scripts/public-artifact-policy.mjs {external-workspace}/batch03_work/dist-app-dialogue57-candidate-20261027` (893 files).
- Complete-candidate static production smoke and all 10 intro routes.
- 23 candidate game JSON manifests compare byte-identically with the previous complete package.
- Live `pnpm --filter @goldbox/web e2e:cok-restyle` cottage regression.
- Live `pnpm --filter @goldbox/web e2e:cok-graphics`: all 106 CPIC identities and DOS→Amiga→Restyle→DOS combat-state/pixel restoration.
- `git diff --check`.

Atomic deployment to `https://dionysus.dk/greybox/` completed after the commit was pushed. Live
HTTP 200 responses for the app entry, entry JS, CSS, dungeon chunk and portrait PNG match their
candidate bytes. Their SHA-256 values are respectively:

| Live file | SHA-256 |
| --- | --- |
| `index.html` | `AADC198E0F01B8D197EEAB513603BC48CA1C8690DB69913A3B2C2DA4D3D14AD3` |
| `assets/index-BCbuPrA1.js` | `BF09D23F8D35F6542CCFBBD1E6313075186BFAADA89830DBC33F62E3418F2989` |
| `assets/index-CmCV0s3L.css` | `540AE20E73B93ADC104808244BED00AFD0E28AEFD7CB057BC915EE50E4C400E9` |
| `assets/dungeon3d-DcjsJ3m1.js` | `8B56B90876BBA8C370B75E24EFA97E19AC069D76678051B09CFC47CAA1338416` |
| `restyle/cok/dialogue/PIC1_057_f0_restyle.png` | `A2D2126C903D61AFA46085693E9DECFD08B789F33C96FBA0292B6BDA73441CBE` |

The new focused browser test drives the real `?explore=cok-natural-6` final-landmark arrival
path underlying `explore-cok6-landmark-outpost`: travel arm 3, retail YES choice, then the normal
ECL1#17 Throtl host. At the first landmark Continue it verifies picture 57, the complete source
identity and memory `[4C26,4C28,4C29,4C37] = [1,7,0x13,0]`. DOS→Restyle→DOS changes portrait
pixels and restores the complete original canvas exactly. Pixels outside the original 88×88
portrait rectangle, narrative text, choices, picture register, source identity and those ECL
words stay unchanged by the graphics switch.

It then drains the actual narrative pages to the next explicit Continue: 57 and its source
remain selected without another PICTURE. The destination menu changes to 58, whose Restyle and
DOS canvases are identical. Candidate and live modes fetch the packaged PNG from the actual static
package/site and exercise that same route. The development-mode run also uses fresh sessions to
check delayed-57 completion after 58 and after closing the dialogue, plus corrupt reviewed-output
rejection. Separate development controller controls use decoded real portraits and alter one
identity field at a time (game, system, bank, hash, block, frame, or absent source); none fetches
or paints the reviewed overlay.

The first test iteration passed portrait-placement, pixel-restoration and state assertions,
then timed out because its driver skipped intermediate narrative pages on the way to 58.
The final driver drains to actual choices, matching the existing bounded route's semantics.
This was corrected in the test; the ECL and runtime progression were unchanged.

The focused test stops at the 58 destination menu. It does not claim the complete existing
Outpost/save-reload route. The full browser corpus remains an explicitly excluded gate because it
reads retail `CHRDATA1.SAV`; it is not claimed green. The bounded source commit was pushed before
deployment. No game-data write, retail save read or artwork-file modification was performed.
