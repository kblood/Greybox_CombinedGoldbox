# Native DOS menu-yield bridge contract — 2026-09-12

## Scope

CCECL currently records `VERTICAL_MENU` and `HORIZONTAL_MENU` in the `GBSX`
tail of a `GBEF` v9 effect record, then writes its deterministic `/C` choice to
VM memory. A player-selectable menu must instead yield **before** that write,
preserve the VM snapshot, and resume once with a validated choice. This note is
the implementation contract for that bridge. `CCECL /!` now emits and resumes
the strict v14 `GBMN`/`GBMS`/`GBMT`/`GBMO` state; `CCMENU.COM` validates and answers it.
GBBOOT's explicit `/!` route invokes the helper and cold-resumes CCECL, so a
choice reaches the ordinary native boot loop.

The v14 menu tail also carries DQK Gen2's operandless `PARTY_SURPRISE` prompt.
That subtype uses `GBMN.flags=3`, destination `0xffff`, option count 2, and the
existing reserved word to preserve retail `LE` and `GE`; its captured text has
three `GBMT` segments (preceding `PRINTCLEAR` prompt, `YES`, `NO`). CCMENU
accepts Y/N or the usual numbered choices. Cold resume clears only `EQ`, `NE`,
`LT`, and `GT`, restores `LE`/`GE`, then sets `EQ` for Yes or `NE` for No without
a destination write. Other v14 menu subtypes retain their original shape.

`CCECL /!` is the explicit interactive-menu mode. It is deliberately a
punctuation switch: every unused letter option is already a plausible future
seed or host value, while `/P` is the existing persistent-state input. Without
`/!`, the existing `/C` responder remains the only menu path and keeps its
current deterministic semantics.

The existing v9 layout is fixed at 5,750 bytes. `GBRS` at offset 116 contains
the current PC, RNG, call stack, and sparse memory; `GBSX` at offset 2,246
contains the menu opcode, operands, and its first inline text string. `vmstat`
uses value 2 for an awaiting menu or input state. Combat uses value 3.

## v14 record extension

A menu yield writes a v14 `GBEF` record of 5,920 bytes. It retains every v9
byte, the v11 `GBMN` tail, and the v12 `GBMS` state tail.

| Offset | Field | Requirement |
| --- | --- | --- |
| 5750 | `char[4] magic` | `GBMN` |
| 5754 | `u16 flags` | ordinary choice: 1; DQK `PARTY_SURPRISE` (`0x22`): 3 |
| 5756 | `u16 destination` | sparse VM-memory destination; `0xffff` for `PARTY_SURPRISE` |
| 5758 | `u16 option_count` | 1 through 255 for menus; 2 for `PARTY_SURPRISE`; zero only for `INPUT_NUMBER`, where it means a free unsigned 16-bit answer |
| 5760 | `u16 opcode` | `0x0015` vertical, `0x002b` horizontal, or operandless Gen2 `0x0022` Yes/No |
| 5762 | `u16 event_index` | index of the corresponding `GBSX` record |
| 5764 | `u16 reserved` | zero except `PARTY_SURPRISE`: bit 0 retains `LE`, bit 1 retains `GE` |
| 5766 | `u16 pending_pc` | post-menu VM PC |
| 5768 | `u16 pending_area` | yielded block id/area |
| 5770 | `u16 pending_destination` | must equal destination |
| 5772 | `u16 pending_opcode` | must equal opcode |

`GBMS` at offset 5,774 contains `u16 cmp_l`, `u16 cmp_r`, `u16 selected_party`,
and `u16 flags` (bit 0 selected member valid, bit 1 selected member absent).
`GBMT` follows at offset 5,786:

| Offset | Field | Requirement |
| --- | --- | --- |
| 5786 | `char[4] magic` | `GBMT` |
| 5790 | `u16 text_count` | vertical: `option_count + 1`; horizontal: `option_count`; Gen1 WHO: `option_count`; Gen2 WHO: `option_count + 1` |
| 5792 | `byte[128] data` | exact length-prefixed segments, then zero padding; packed ECL prompt plus choices for vertical menus, packed prompt plus ASCII GBPR names for Gen2 WHO, ASCII GBPR names only for Gen1 WHO |

The existing prefix already carries queued encounter, NPC, setup, and host
fields. A cold menu resume validates `GBMS` and every `GBMT` segment boundary
and padding byte before it restores the prefix and applies the answer.

For `INPUT_NUMBER` (`0x0f`), DQK's retail handler ignores operand 1 and writes
the numeric result through operand 2. The interactive record uses
`option_count=0` as an unambiguous free-number marker; CCMENU accepts the full
`0..65535` range without expanding it into 65,536 menu options. Other opcodes
must keep a nonzero count. The v14 layout is unchanged; the exact meaning of
zero is guarded by the `INPUT_NUMBER` opcode and its two-operand event shape.
CCMENU and CCFP reject a nonzero numeric count, matching CCECL's producer and
resume validator. The metadata word is never used as the numeric destination.

`GBEF.status` is 2, `GBRS` state-present bit is set, and its PC is the byte
after the complete menu instruction. No selection is written before the yield.
The captured `GBSX` event must agree with the tail’s opcode and have the
matching event index; the tail's `option_count` is independently bounded
rather than inferred from untrusted text.
The record is exact-length: CCECL and CCMENU reject both truncation and any
trailing byte, bound `GBSX` count to its 64-record extent before using the
tail's event index, and reject a menu whose prompt or label bytes cannot fit
the fixed `GBMT` payload.

`WHO` (`0x39`) has dialect-specific operands. The older Gen1 short form carries
a destination and writes the zero-based selection there. DQK's Gen2 form carries
one inline packed prompt, such as `WHO TRIES TO LIFT THE LID?`; its length is
metadata, and the selected result updates native party context. Under `/!`,
CCECL copies that Gen2 prompt as the first packed GBMT segment, followed by each
already-validated GBPR name as an ASCII segment. Gen1 WHO keeps its name-only
payload and destination contract. CCMENU renders the Gen2 prompt with the packed
renderer and the names with the ASCII renderer. Gen2 CCECL, CCFLOW, and CCMENU
require the destination-free sentinel plus a matching one-argument prompt
length. A missing, corrupt, or out-of-range roster remains on the deterministic
headless `/W` path.

## Outcome sidecar

The menu helper writes a 18-byte `GBMO` v2 outcome file:

```
00  char[4]  "GBMO"
04  u16      version = 2
06  u16      selected (zero based)
08  u16      option_count copied from GBMN
10  u16      pending_pc copied from GBMN
12  u16      pending_area copied from GBMN
14  u16      pending_destination copied from GBMN
16  u16      pending_opcode copied from GBMN
```

CCECL’s menu-resume path rejects a truncated file, wrong magic/version, pending
identity, changed count, or a selection outside `[0, option_count)` (except
free-number `INPUT_NUMBER`, whose selected word is accepted directly). Menu
validation also binds the pending identity itself to the saved state:
PC/area must equal `GBRS` PC/area, and destination/opcode must equal `GBMN`
destination/opcode. CCMENU checks these pairs before publishing an answer;
CCECL checks them before accepting one. A token matching an inconsistent
pending identity is rejected, retained, and cannot authorize a resume. Ordinary
menus write `selected` to `destination`, restore `GBRS`, and resume at the
saved post-menu PC. `INPUT_STRING` uses the same identity-bound v2 token with
selected zero: before publishing it, CCMENU bounds and uppercases the keyboard
text, preflights sparse-map capacity, and replaces the pending `GBRS` map with
one character word per byte plus a NUL terminator. CCECL validates that exact
input shape, restores the changed checkpoint, and deliberately does not
overwrite the destination. Empty text becomes one ASCII space, matching the
source VM. It deletes the validated outcome only after the restored sparse map
can accept the ordinary selected value; replaying the same outcome fails before
mutation. Callers publish a newly emitted v14 record and a new outcome for every
prompt. No fallback default is permitted on an invalid outcome.

## Helper and GBBOOT boundary

`CCMENU.COM` is a sibling executable, not code added to the nearly-full
`GBBOOT.COM`. It validates v14/`GBMN`/`GBMS`/`GBMT`, decodes the raw packed
prompt and every option label, renders numbered choices, a free-number prompt,
or bounded text, reads one player response, and writes `GBMO`. Its `/S n` switch supplies a zero-based deterministic selection for its
DOSBox smoke. `CCECL /!` consumes that exact outcome only after validating the
tail, event shape, count, version, and selected range; a rejected outcome makes
no output record and does not mutate VM state. GBBOOT recognizes status 2,
runs CCMENU, and invokes CCECL `/R <GBEF> <GBMO> /E <next>`. Its `/C n`
remains CCECL's deterministic automation seed; only with explicit `/!` does it
also become CCMENU's `/S n` selection for the headless DOSBox proof.

The current continuation restores PC, RNG, call stack, sparse VM memory, clock,
comparison flags, selected-character context, and queued encounter/NPC/setup
state. The smoke executes `COMPARE`, `LOAD_CHARACTER`, and `LOAD_MONSTER`
before yielding, verifies the v14 tail and rendered labels, and proves the resumed encounter handoff.
The string smoke enters lowercase `hands`, proves that `HANDS\0` survives the
cold restart, and takes a following `memstr == inline-string` `IF_EQ` branch.

## Complete-label implementation

`GBSX` remains a bounded diagnostic/event surface; it is not the menu
presentation source. CCECL captures each inline packed prompt and option into
`GBMT` and fails the interactive yield if a label is non-inline or the fixed
128-byte store would overflow. The installed Gen1 and DQK corpus scans peak at
104 and 99 raw bytes respectively, so this versioned bound preserves both
measured corpora while recovering 384 CCECL resident bytes. CCMENU verifies its segment count, every
length boundary, and all-zero suffix before decoding the six-bit strings. The
synthetic smoke asserts `PICK`, `LEFT`, `RIGHT`, `YES`, and `NO` in the DOS
helper output. Its CoAB title-owned horizontal-menu arm also renders `PRESS
BUTTON OR RETURN TO CONTINUE.` before cold-resuming, while retaining the
malformed-record checks.

## Required proof

1. Synthetic vertical and horizontal menus each yield before changing their
   destination memory, then resume with two different valid choices.
2. A cold second CCECL process resumes exactly once and does not replay effects
   before the menu instruction.
3. Truncated/malformed GBEF and GBMO files, mismatched counts, and out-of-range
   selections fail before state mutation.
4. A real title-owned menu proves its displayed selection controls a different
   subsequent branch. **CoK horizontal evidence landed 2026-09-13:**
   `ccecl-menu-resume-test.ps1` enters retail `ECL1.DAX#34` at the verified
   `0x931B` test probe, cold-resumes the one-choice continuation into the
   source-owned `ATTACK / WAIT / LEAVE` prompt, then separately selects ATTACK
   and LEAVE. ATTACK yields the exact three-group `13x8 / 35x5 / 38x2` combat
   handoff; LEAVE retains selector value 2 and the source retreat narration.
   The direct-PC probe establishes the menu bridge and source branch behavior;
   it is not a natural-campaign claim. **DQK vertical evidence landed with the
   same regression:** retail `DISK3/ECL.GLB#58` at `0xA34F` renders `WHAT DO
   YOU DO?` and its three labels. PULL and LEAVE cold-resume to distinct
   source transcripts. **CoK's live movement proof landed in
   `gbcok-playable-flow-test.ps1`:** from staged retail data, its bounded
   `GBBOOT /E /! /C 0 /T 1` run starts at `(4,15)` facing west, takes one
   normal CCFP movement step into `(3,15)`, and records live descriptor 156 in
   `GBST`. It uses neither `/@` direct-PC nor `/B` event injection, displays
   the one-choice continuation and `ATTACK / WAIT / LEAVE`, enters combat,
   resumes, and records consumed source flag `4C55=0020`. Existing `/C` flow
   pins remain unchanged.
5. The full native flow suite remains green, with the helper invoked only by an
   explicit interactive route.
