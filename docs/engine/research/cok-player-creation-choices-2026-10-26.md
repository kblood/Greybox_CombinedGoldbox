# CoK creation choices for the two admitted player icons

Unpublished Browser/Electron implementation at base `ee911ce2`. This slice adds an optional
character-icon selector and preview to the existing creation view. It uses the two admitted
DOS/Restyle appearances from [the second-appearance receipt](cok-player-second-appearance-2026-10-26.md).
It adds no art, retail save fixture, engine field or inferred class/race/sex mapping.

## Selection and source colors

`cokPlayerAppearanceChoices.ts` exposes a frozen, read-only list with precisely these canonical
identities:

| Visible choice | Source tuple (hex) |
| --- | --- |
| Icon 1 | `05 18 00 02` |
| Icon 2 | `05 01 01 02` |

`05 18 02 02` remains a supported imported storage-slot alias and does not become a third choice.
`No icon` is initially selected. Unknown ids are rejected; the optional no-selection path and
records without appearance fields retain their prior behavior. The selected id survives race,
sex, class and other form rerenders. Adding a member resets the next draft to `No icon`.

The new choices use an explicitly **neutral source-color preset**, not a claimed retail default.
The [source contract](cok-player-icon-source-contract-2026-10-26.md) proves the color map begins
as identity, and selectors `[1,2,3,4,6,7]` replace a low index and the corresponding index plus 8.
For each selector `i`, byte `((i+8)<<4)|i` preserves both indices. Thus
`[91,A2,B3,C4,E6,F7]` keeps all sixteen EGA colors unchanged. The older test palette
`[10,21,32,43,64,75]` remains synthetic test data and is not used as a creation preset.
Custom colors and any original retail creation-default palette remain unresolved.

Every request receives a fresh appearance object and palette array. The existing engine copies
that array into the derived sheet. The web party-to-combatant bridge now also copies the array,
so mutating a combatant's appearance cannot change the persistent created character.

The preview follows the existing CoK graphics setting: source DOS pixels, Restyle pixels, or
explicit DOS fallback while Amiga player mapping is unavailable. Failed loads show an unavailable
preview; selecting no icon clears it. Form/selection revisions and DOM connection checks prevent
an earlier delayed image load from overwriting the current choice or a replaced creation view.

## Independent neutral-palette oracle

The source/pixel procedure in the second-appearance receipt was run again against its pinned
`CBODY.DAX` and `CHEAD.DAX` sources. This run retained source indices directly after OR
composition (equivalent to the neutral identity map), applied the independently proven key-1
mask, expanded nearest-neighbor 4×, then SHA-256 hashed the raw RGBA bytes:

| Body variant | Neutral original RGBA SHA-256 |
| --- | --- |
| 65 | `2779962815F3A49952B02B95B795B43D951DBF1807F47F31D4BE86954BBDF849` |
| 193 | `863CE0A51EA4AAEB5C80D0B7AAC2F0C482C166197E2A14F939161BB411FC0BA4` |
| 88 | `955EED86E079DC5B65AFB61B60021DA8A44F50C5FBF541FCC436F5F231BD5D8D` |
| 216 | `94AF6B418C489E5F64B7346F75F43792CA4843C1420102A403ECB0AA24F7E805` |

All four browser loader outputs match these independent pins. These pins preserve hidden RGB
in transparent cells. Rendered-canvas comparisons separately normalize the buffer through a
software canvas; they do not replace raw source-derived pins with browser captures.

## Focused checks and limits

Passed `pnpm --filter @goldbox/web e2e:cok-player-appearance` with the existing external PNG source
and headless Edge. In addition to the earlier importer/package checks, this run verifies:

- Twelve original RGBA oracle buffers, including the four neutral-preset variants above.
- Exactly two immutable choices, unknown-id rejection and independent factory/request/sheet/
  persistent-member/combatant palette arrays.
- Actual creation select and Add buttons; no-selection member; retained choice through race,
  sex and class rerenders; reset after Add; exact preview pixels for both choices.
- Created party reorder, app-save restoration and character-sheet identity/fallback.
- Delayed stale creation-preview rejection, runtime mode change, and explicit deselection.
- Created-party natural combat binding to `p1`/`p3`, with the appearance-free legacy member in
  `p2`. DOS→Restyle→DOS changes and exactly restores each visible mapped player's own tile,
  as well as the complete canvas, while retaining the combatant state.

Passed `pnpm --filter @goldbox/web typecheck` and the owned `git diff --check`.
The browser check stages twelve pinned image paths into its owned temporary output and removes
that directory afterward. It never writes the user's untracked public art directory.

No commit, push, production build or deployment belongs to this slice. The optional candidate
portion of the focused script was not invoked. Candidate/live acceptance and broader CoK
graphics coverage remain coordinator work. This is a two-choice creator, not coverage of the
retail appearance editor, custom colors, additional tuples or Amiga player art.
