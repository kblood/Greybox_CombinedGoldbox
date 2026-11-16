# Gateway ECL6 boat and companion exit gates — static byte contract

Date: 2026-07-31

Method: retail `ECL6.DAX#21` bytes and the already-recovered Gateway `GAME.OVR` CALL-080C host
contract; no new DOSBox run, save mutation, or native prompt capture

Evidence tooling: `tools/analyze_gateway_ecl6_dynamic.py`,
`tools/test_analyze_gateway_ecl6_dynamic.py`

## Result

Gateway's ECL6 wilderness has two pre-continuation prompt families beyond Sundabar:

1. The ordinary non-edge terrain probe asks `ABANDON THE BOAT?` whenever the travel word
   `[0x4CF5]` is nonzero on a common-terrain branch. YES writes the whole word to zero and reaches
   ECL `EXIT`; NO retains it and jumps to the shared no-transition tail at `0x8B43`.
2. A host edge-exit attempt runs named-party guards before any six-sector remap. Selector 23 guards
   EREK. Selector 26 guards MUTHTUR and then RISHPAL. An active match presents the shared
   `CONTINUE / GO BACK` menu; CONTINUE removes that member and advances to the next guard, while
   GO BACK retains the member and takes `0x8B43`. A present but inactive match is removed without
   presenting the menu.

The ordering matters. Selector 26 can present two consecutive prompts. If the player continues
past MUTHTUR and then goes back at RISHPAL, MUTHTUR has already been removed; the two gates are not
one atomic combined choice.

The static control flow also settles the clock boundary. `ECL_CLOCK 12,3` at `0x82DB` executes
before the temporary prospective-cell probe and before the boat branch. A paused boat prompt has
therefore already incurred the ECL-side 12-hour step. The accepted arm's direct `EXIT` is distinct
from the rejected arm's `GOTO 0x8B43`. Physical movement after that ECL return remains host-owned;
this memo does not promote the unobserved boat acceptance into a native-proven +1-minute move.

## Provenance

The extracted block is 5,278 bytes with SHA-256
`a74bf5afe5ad897cc901766bb191cbebb8883be9a729ceee3ee88ce2001adf6a`. The title-local host
executable evidence used for CALL `0x080C` is Gateway `GAME.OVR`, SHA-256
`c2e64df225bf80026d4bc16d865804dd9e51b1296e6496fa46bba3c2e704f5cd`.

The analyzer pins complete instruction bytes for every inline prompt, the shared companion menu,
and all three inline party-name comparisons. Operand-shape assertions separately pin selector,
picture, party scan, active predicate, removal, choice, suppression, and call-order instructions.

## Boat branch

The common terrain arm is a literal sequence:

```text
82DB  ECL_CLOCK 12,3
82E0  CALL C01E                    ; temporary forward/prospective-cell host probe
...
8373  COMPARE [4CF5], 0
8379  IF_EQ
837A  EXIT                         ; land mode: no boat prompt
837B  PRINTCLEAR "ABANDON THE BOAT?"
838B  CALL 080C                    ; Gateway ~Yes ~No host menu
838F  IF_EQ                        ; selected index == 1
8390  GOTO 8B43                   ; NO
8394  SAVE 0 -> [4CF5]             ; YES
839A  EXIT
839B  EXIT                         ; direct-exit terrain-table entries
```

Gateway's recovered CALL-080C host compares its zero-based selection with one. Consequently:

| choice | compare flag | `[4CF5]` after | ECL continuation |
| --- | --- | ---: | --- |
| YES, index 0 | not equal | 0 | direct `EXIT` at `0x839A` |
| NO, index 1 | equal | unchanged | `GOTO 0x8B43` |

The initial comparison is specifically against zero, not one. Any nonzero word asks the abandon
question on common terrain. The adjacent deep-water arm has a different predicate:

```text
839C  COMPARE [4CF5], 1
83A2  IF_EQ
83A3  EXIT
83A4  PRINTCLEAR "THE WATER IS TOO DEEP."
83B8  GOTO 8B43
```

Thus deep water accepts exactly mode 1; mode 0 and other nonzero values take the rejection text.
An implementation must persist the word rather than flattening it to a boolean.

### Clock and host boundary

The ECL instruction order proves the 12-hour operation precedes the prompt. It does not contain a
post-YES `CALL C01E`, selector write, coordinate write, or encounter call. YES instead returns to
the native host through ECL `EXIT`. The native ordinary-movement trace elsewhere proves an accepted
ordinary move totals 12h01m, but no native boat-prompt acceptance has been captured. The bounded
implementation contract is therefore:

- preserve the already-applied 12-hour ECL step while the modal is paused;
- keep pose/selector unchanged until the host continuation is resolved;
- on YES, write travel mode zero before returning to the deferred host continuation;
- on NO, retain the exact prior travel word and take the no-transition tail;
- do not call the public forward action again after YES, because that would repeat `ECL_CLOCK`,
  the descriptor probe, and the prompt.

Whether the deferred host continuation then contributes the normal one-minute move and exactly one
SearchLocation call is an implementation hypothesis consistent with the existing host/controller
division, not a new native-runtime claim in this memo.

## Named companion exit guards

When `[0x7ED5]` (`tried_to_exit_map`) is nonzero, the script calls the guards in this exact order:

```text
892D  GOSUB 8E20      ; selector-23 EREK gate
8931  GOSUB 8FC3      ; selector-26 MUTHTUR gate
8935  GOSUB 8F37      ; selector-26 RISHPAL gate
8939  GOSUB 87E3      ; Sundabar coordinate gate
893D  SUBTRACT 21 from [4C24]
8946  ON_GOTO sector remap
```

The selector and presentation contract is:

| selector | order | name comparison | picture | exact prompt |
| ---: | ---: | --- | ---: | --- |
| 23 | 1 | `EREK` | `0x66` | `EREK STOPS AND REFUSES TO GO FORWARD, SAYING 'I CANNOT LEAVE THIS REGION SO LONG AS AMANITAS NEEDS MY HELP.'` |
| 26 | 1 | `MUTHTUR` | `0x4D` | `'THIS, MY FRIENDS, IS AS FAR AS I DARE GO. HALF-ORCS AREN'T WELCOME IN THIS PART OF THE REALMS.'` |
| 26 | 2 | `RISHPAL` | `0x22` | `'I CANNOT GO TOO FAR FROM HOME, HE SAYS, 'AND LEAVE MY FAMILY UNPROTECTED.'` |

All three active gates converge on the one byte-pinned horizontal menu at `0x8E85`:
`CONTINUE`, `GO BACK`. Its result word is compared with one at `0x8E9E`. GO BACK/index 1 jumps
to `0x8B43`. CONTINUE/index 0 falls through the removal sequence and returns to the outer call
order, allowing the next guard or sector remap to run.

### Party scan and active predicate

Each name-specific scanner:

1. Saves the current selected-character index `[0x7EB1]` into `[0x7F7A]`.
2. Starts scan index `[0x7F79]` at zero.
3. Executes `LOAD_CHARACTER [0x7F79]` and compares the selected name at `[0x7C00]` with its exact
   inline name.
4. Increments until the index reaches party size `[0x7F3E]`.
5. On a match, compares selected-character active field `[0x7D00]` with one.

An absent name restores the original selection and returns without a prompt or removal. An active
value of one returns equal to the caller and opens the gate menu. A matching value other than one
takes the removal sequence immediately and returns non-equal, so the caller skips the prompt and
continues.

Both silent inactive removal and CONTINUE use the same native removal shape:

```text
SAVE 0 -> selected name field [7C00]
SAVE 0 -> selected active field [7D00]
ADD 128 to the matched scan index [7F79]
LOAD_CHARACTER [7F79]              ; index+128 removal convention
LOAD_CHARACTER [7F7A]              ; restore original selection
```

The evidence supports the exact selected-character active field. It does not support substituting
HP, consciousness, or a browser-only companion flag for that predicate.

## No-transition suppression state

Boat NO, companion GO BACK, deep-water rejection, mountain rejection, and several other blocked
branches converge on:

```text
8B43  SAVE FF -> [7EC9]
8B49  SAVE FF -> [7F80]
8B4F  EXIT
```

The next SearchLocation begins:

```text
8BD6  COMPARE [7F80], 0
8BDC  SAVE 0 -> [7F80]              ; unconditional clear
8BE2  IF_NE
8BE3  RETURN                        ; old nonzero value suppresses this call
```

Therefore the one-shot `[0x7F80]` value must survive a declined or blocked prompt until the next
SearchLocation consumes it. A modal implementation must not reset it merely because the controller
returns to its active input phase. This is a persistent ECL word in the continuation contract, not
an overlay-local busy flag.

## Focused tests

`tools/test_analyze_gateway_ecl6_dynamic.py` now checks the pure transcriptions without retail
artifacts and, when the ignored retail block is installed, verifies the complete byte report:

- zero versus arbitrary nonzero travel words;
- YES/NO compare polarity, write, and continuation;
- 12-hour ECL step before the paused boat choice;
- selector-23 and selector-26 guard membership and MUTHTUR-before-RISHPAL order;
- absent, inactive, active-CONTINUE, and active-GO-BACK companion outcomes;
- exact prompts, menu labels, picture ids, party fields, and removal convention;
- `0x8B43` writes to `[0x7EC9]`/`[0x7F80]` and the `0x8BD6` consume-and-clear path.

Reproduction:

```powershell
python -m unittest tools.test_analyze_gateway_ecl6_dynamic -v
python -m py_compile tools/analyze_gateway_ecl6_dynamic.py tools/test_analyze_gateway_ecl6_dynamic.py
```

## Claim boundary

This memo proves retail ECL instruction bytes, addresses, strings, menu order, selector guards,
party scan/removal control flow, travel-word comparisons/writes, ECL clock ordering, and
suppression writes/consumption. CALL-080C choice polarity additionally rests on the already-pinned
Gateway `GAME.OVR` handler.

No native run in this slice has displayed `ABANDON THE BOAT?`, EREK, MUTHTUR, or RISHPAL; no native
run has accepted or declined those prompts; and no correlated RAM/save trace has observed their
travel, party, movement, remount, or suppression effects. The exact physical host continuation
after boat YES and the natural reachability of each guarded edge remain native-runtime tasks. This
document must not be cited as native capture evidence.
