# DQK WHO engine/browser integration audit (2026-07-29)

## Outcome

The reusable engine already had the right pause/resume architecture for `WHO`, but its operand
contract was wrong: it treated the opcode's only inline-string operand as a destination address.
Retail DQK bytes prove that operand is the visible prompt and the native handler installs the
chosen party record as the engine's selected-player context. The engine contract is now corrected
and covered by synthetic and retail-byte tests. The DQK browser has a bounded inspection replay
that reaches the authentic typed WHO pause and stops there.

This work does **not** claim the browser naturally reaches the area-67 form, that the original DOS
confirmation gesture is known, or that the post-selection explorer transition is reproduced.

## Exact evidence

The source artifacts used here are:

- `The Dark Queen of Krynn/DISK3/ECL.GLB`, SHA-256
  `40542071E42D3CD125EABCEAD11456A99942BF55A7736FDB79F66A3C27C3664D`.
- `The Dark Queen of Krynn/DQK.EXE`, SHA-256
  `6B0A9AC5C873997087F1F3F626334A71092FE7C8D1E92CE7F72869A59931F837`.
- `docs/engine/research/dqk-search-location.md`, especially the authentic slot-B route, the
  area-67/member-47 identification, and the isolated generic dispatcher stop.
- `docs/engine/research/decompile-dqk-ecl-dispatch.md`, opcode row `0x39` and the static handler
  chain `2033:0F0C -> 1D99:128D -> 25A4:2FE0`.

`ECL.GLB` maps logical area 67 to member index 47. At member offset `0x07A7` / virtual address
`0x87A7`, the exact retail sequence is:

```text
87A7  WHO       "WHO WILL THROW A STONE?"
87BC  GOSUB     9854
87C0  IF_NE
87C1  GOTO      87A7
```

The operand begins `80 12 ...`: `0x80` is an inline packed string and `0x12` is its packed byte
length. It is not an ECL lvalue. The old VM therefore wrote the selected number to bogus memory
address `0x0012`.

The static DQK handler is the procedure at file `0x432A0..0x4333A`, reached by
`2033:0F0C -> 1D99:128D -> 25A4:2FE0`. The nearby `0x433AC` address belongs to
opcode `0x40 DESTROY_ITEMS`, not WHO. WHO fetches one operand, copies its decoded
inline prompt from `DS:B487` to the UI buffer, opens the selection UI, then
stores the returned selected-party pointer in `DS:AD67/AD69`. There is no write
through an operand-derived ECL address. This proves the engine-level result is
selected-player context. It does not identify which physical DOS key/click
causes the form to return that result.

The native DOS bridge has since gained a Gen2-specific WHO path: it carries the
inline packed prompt with the GBPR roster names, marks the pending selection as
destination-free, and restores the chosen member into CCECL's one-based selected
party state after a cold resume. The narrow `ccecl-menu-resume-test.ps1` fixture
now asserts prompt bytes, selection state, preserved flags, and unchanged
`MEM[0014]`; it has not been run because this session is avoiding DOSBox windows.
The older Gen1 destination form remains in place.

The latest runtime artifact in `dqk-search-location.md` proves one `Down` edge reaches the generic
post-INT16 form dispatcher at `1D42:00F8`, where `AX` is searched in a 64-entry code-segment table.
It does not yet prove an accepted confirmation action, selected-member return byte, or subsequent
original-DOS explorer state.

## Implemented reusable seam

`packages/engine/src/ecl/vm.ts` now emits:

```ts
{ type: 'who', prompt: string, ins: EclInstruction }
```

`resume(index)` on that pause installs the zero-based host roster index as the VM's selected-party
context. It no longer writes to the WHO operand. This matches the abstraction already used by
`selectedPartyIndex`, `partyMemberAffects`, selected-player pseudo-fields, `LOAD_CHARACTER`, and
`FIND_SPECIAL`; the browser does not need to emulate the DOS form's raw key code.

`packages/engine/src/world/dialogue.ts` carries the retail WHO string into
`DialogueTurn.prompt`, retaining `awaiting: 'who'` and no invented choices.

`apps/web/src/ui/dqkExplore.ts` exposes `window.__dqk.inspectArea67Who()`. It decodes shipped area
67, enters at the byte-pinned WHO instruction, returns the typed pause/prompt plus the live party
names, and offers no resume operation. The focused DQK browser assertion checks that bounded
contract. This is explicitly a direct-entry inspection, not a natural-route marker.

## Tests

`packages/engine/test/dqkEvents.test.ts` adds two focused cases:

1. A synthetic Gen2 block uses the retail packed prompt, resumes with member index 1, and proves a
   following `FIND_SPECIAL` reads member 1's affects. It also proves memory address `0x0012` is
   never written.
2. A golden over the retail `ECL.GLB` pins area 67 -> member 47, the exact
   `WHO -> GOSUB 9854 -> IF_NE -> GOTO 87A7` bytes, and the `DialogueRunner` WHO pause. It
   deliberately does not resume.

The DQK section of `apps/web/test/e2e.mjs` calls `inspectArea67Who()` and requires area 67, member
47, vaddr `0x87A7`, `awaiting === 'who'`, the exact prompt, and a non-empty live party roster.

## Remaining integration plan

Once native work establishes an accepted selection and captures the resulting original-DOS state,
the smallest honest browser integration is:

1. Preserve a `DialogueRunner` when `drainRunner` receives `awaiting: 'who'`; do not auto-call
   `choose(0)` as `dqkExplore.ts` does today.
2. Render a DQK party-picker modal from `turn.prompt` and the existing live `getParty()` order.
   Highlight movement changes only UI state. Confirm calls `runner.choose(selectedIndex)` once.
   The raw DOS scan/key code remains outside the engine contract.
3. If the retail script returns to `WHO` through its own `IF_NE/GOTO`, keep the same modal open and
   repaint from the new turn. Do not hard-code the validation result in the browser.
4. Resume the same runner through its real effects/chain and assert the captured native boundary:
   area/map id, pose/facing, displayed command state, and any changed ECL memory. That assertion is
   the browser replay that can replace the current inspection-only seam.
5. Add a narrow e2e marker only after the route starts from authentic saved/session state and the
   post-WHO explorer boundary matches the native capture. Until then, retain the direct-entry label.

One additional engine dependency is visible in the real continuation. Subroutine `0x9854` begins
by comparing selected-player field `[0x05EE]` with zero; the failure text is `THAT ONE CANNOT DO
ANYTHING.` The present VM's selected-player field adapter covers `0x7D00` and thief-skill fields
`0x7CA5..0x7CAC`, but not `0x05EE`. The native trace or a source/static mapping must identify the
exact DQK meaning and encoding of `0x05EE` before the real validation loop can be claimed. Do not
replace it with a guessed `conscious` flag merely because the text is suggestive.

## Claim boundary

Proven now:

- retail area/member and instruction sequence;
- exact WHO prompt;
- WHO selects engine party context rather than writing an ECL destination;
- engine/dialogue/browser inspection reaches a typed WHO pause;
- the generic DOS form dispatcher receives a selector input after INT16.

Not proven here:

- the accepted DOS confirmation key or click;
- how the returned native member id maps to a particular saved-party row in this run;
- the exact semantics of selected-player field `0x05EE`;
- the valid-selection continuation after `0x9854`;
- any natural browser area-66 -> area-67 -> explorer transition;
- combat, persistence, campaign, or native tactical parity from this WHO route.
