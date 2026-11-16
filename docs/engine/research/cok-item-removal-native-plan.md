# CoK owned item removal: original execution and native plan

Updated 2026-09-08: owned DOS DESTROY_ITEMS activates the verified callback
subset through GBBOOT (`84e5156`). Unsupported applied callbacks, including
effect 7, still reject before activation. The original research below records
how this implementation was derived; its earlier limits are historical.
The 2026-09-25 static trace now establishes the attack path's mode-4 target
handle and effect-7 callback address. Next establish callback write/RNG/global
ownership and connect those outputs to the staged mutation contract.
Combat RNG continuity (`a42459b`) is shipped but does not enable that callback.
See [the dated DOS handoff](../HANDOFF-NATIVE-DOS-2026-09-08.md) for the complete
verified baseline and next-task acceptance criteria.

## Runtime-table correction and derived-stat model

The `442ba95` harness did not load the runtime item-definition table. Its
299 passing cases therefore could not establish real armor/weapon behavior;
its thirteen-slot coverage claim was too broad. The standalone `ITEMS` file,
not initialized executable data, supplies the definitions. Original code at
1089Ah seeks two bytes; 108ABh requests 0810h bytes into DS:5886. The held file
supplies 0800h bytes: 128 records of 16 bytes. The loader's CS:0055 string is
`ITEMS` (overlay 0061, file base 10098h). The corrected oracle loads those
bytes, records the actual read count, and checks the complete `ITEMS` hash.
A control restoring the old zero-filled table produces wrong weapon hit and
damage bonuses. Header/data mutation and original seek/read instruction guards
make this initialization boundary part of the standing tests.

The portable model now implements all E6:43 character writes and the equipped
weight global. Equipment pointers are returned as record indices; the body
clears those thirteen pointer fields, and tests materialize only those pointers
before comparing every byte of the original result. The model includes weapon,
armor, ring, shield, race bonuses, movement, signed comparisons and wrapping
arithmetic. It preserves inventory/effect/party links supplied by the caller.
Types without one of the 128 held definitions are rejected before model output;
this is separate from FIND_ITEM's full byte-sized query domain.

`tools/test_cok_equipment_stats.py` adds 1080 complete-record comparisons, helper
boundary cases and invalid-input controls. Together with the 299 removal cases,
1379 tests pass in 32.17 seconds (`build/native-equipment-stats-focused.log`). The existing 156 removal comparisons
now use the portable model after an independent list filter, replacing their
previous use of the original recalculation routine for expected body bytes.
Item-driven ability changes performed before E6:43 are still separate work.

## Standing evidence

`tools/cok_item_removal_oracle.py` maps unchanged held CoK code and executes the
entire callback initializer at GAME.OVR 144D2h. Only unloaded overlay entries
are redirected to copied original code. Operand readers, unready callbacks,
unlink/free, real FreeMem, effect reversal and character recalculation all
execute their original instructions. Complete image and overlay hashes reject
code/data drift. Screen memory is synthetic, display delay is zero, and game
state is camp; no display timing or pixel parity is claimed.

`tools/test_cok_item_removal.py` contains 299 cases, now rerun with the real
item definitions and portable body reference:

- 156 opcode traversal cases cover empty parties/inventories, all six owners,
  first/last/no selection, immediate and variable operands, duplicate and
  head/middle/tail deletion, types 0/255 and 1101 records. An independent host
  list filter followed by portable recalculation matches complete party bodies
  and surviving item records. Effect lists, comparison bytes and selected
  pointer are preserved; operand PCs, recalculation visits and actual frees
  are checked. The expected body no longer executes original recalculation code.
- Three code-mutation controls reject changed handler, recalculation and
  initializer bytes.
- Eight effect cases execute first-match effect removal, including applied
  and unapplied records and the haste/slow callbacks. They preserve later
  duplicates and unrelated records, with nine-byte effect frees preceding
  the 63-byte item free.
- 108 equipment reconstruction cases cover all six held character bodies,
  thirteen slots, all 128 held definition indices, duplicate equipment,
  a wrapping 257-item count, zero quantity and word multiplication overflow.
- 24 two-owner cases combine zero to three matching items, cursed/uncursed
  records and first/second/no selection. Effects belong to the item's owner.
  Each uncursed item removes the first matching effect; two applied haste
  nodes can therefore age that owner twice. The other owner's effects and age
  remain unchanged. A cursed record is deleted without removing its effect.

## Modeled equipment fields

`tools/cok_equipment.py` models GAME.OVR 372C6h..374B1h. It returns record
indices for the thirteen equipment slots, the wrapping byte item count and
hand total, wrapping word carried weight, and equipped weight. Categories
0..8 keep the last equipped record; category 9 fills two slots in order;
types 30 and 12 also fill their special slots. Quantity zero keeps the base
weight, while a nonzero quantity multiplies it with word wrapping. Six
currency words are added to carried weight.

The rest of E6:43 is now modeled and compared against the original, including
its helpers at 365C9h, 367E6h, 3686Eh, 3698Ch, 3781Ch, 3789Eh, 37920h, 379B8h,
37A5Bh and 37AE1h, and F7:48/its nested race-level reader. Preceding unready
callbacks can change effective abilities before this recalculation; those
changes remain outside `recalculate`.

## Derived-stat boundary found during continuation

The strength-index helper at 37920h has no assignment for strength above 25,
or for strength 18 with exceptional strength above 100. A scratch execution
with stack bytes 33h and 77h returns those different bytes for both invalid
inputs. Valid boundary controls return 23 for 18/100 and 30 for strength 25
regardless of stack fill (`build/cok-strength-boundary.json`). The portable
model must define a preflight rejection for these inputs, rather than silently
turning an original uninitialized-stack result into a fabricated stat value.
Full input validation and integration behavior remain to be implemented.

## Strength and charisma prerequisites verified

`tools/cok_item_abilities.py` now models DB:8E indices zero and five, reached
by unready kinds 3/5 and post-removal effects 0Ch/0Eh/26h. Strength considers
remaining ready items, then the first 26h, 71h and 0Ch effect in that fixed
kind order. It retains candidate exceptional bytes across items and preserves
the original comparison that can replace greater strength with 18/100. Forced
strength applies after effects. Charisma starts from its base byte, processes
item kinds 6/8, then adds the first 0Eh effect's entire byte 3 with wrapping.
Effect lookup ignores applied and duration fields; neither model mutates input.

`tools/test_cok_item_abilities.py` passes **204 tests in 13.69 seconds**
(`build/native-item-abilities-focused.log`), covering 1644 original executions
plus six malformed-record checks. Matrix cases include encoded-effect
boundaries, byte wrapping, signed level eligibility, duplicate/first-match
lookup, item order, forced overrides and unapplied effects. Complete bodies,
items, effects, selected/comparison state and the DS region are checked.

Twenty-four of those tests execute complete original DESTROY_ITEMS for item
kinds 0/2 and effects 0Ch/0Eh/26h, with applied and cursed variants. Expected
results compose independent effect filtering, the portable ability model and
the portable equipment model. Original callbacks for 0Ch/26h at 11099h and
0Eh at 111A4h are no-ops; their post-unlink ability calls supply the body change.
The tests preserve later duplicate effects and check real nine-byte and
63-byte free order. A cursed item is removed without dropping its effect.

These functions may reproduce an original intermediate 18-strength value with
an exceptional byte above 100. They do not silently normalize that result;
`recalculate` already rejects its stack-dependent downstream strength index.
The native stage must run this validation before activating mutations.

## Remaining work before native activation

1. Integrate the verified `native/src/cokstats.inc` E6:43 assembly module into
   the native inventory helper as part of staged mutation, using real `ITEMS`
   definitions. The streaming begin/item/finish interface is now ported and
   tested in DOS. Preserve boundary checks, stable indices and whole-body
   differential tests when composing preceding ability/effect changes.
2. Finish the unready item-effect family at 28B01h. Low-seven-bit kinds 0/2
   remove item byte 61's effect through the initialized 0065:0228 callback;
   kinds 3/5 recalculate strength through DB:8E, and kind 9 removes effect 17h.
   Strength/charisma updates and the post-removal cases 0Ch/0Eh/26h are now
   modeled with composed original execution tests. Finish coverage of the
   remaining applied-effect callbacks and kind-9 removal, preserving real
   effect-list ownership, duplicate kinds, remaining equipment and curses.
3. Design the native staged mutation packet around complete GBPR, GBIV and
   owned timer state. Preserve ECL continuation and propagate recalculated
   character bytes and effect changes together. Validate before activation;
   refresh GBPS query bits after publication and preserve cold checkpoints.
   Existing helper staging is a starting point, not evidence of a transaction
   spanning every party, inventory, effect and source-export file.
4. Add DOS integration cases that compare the native result with the original
   oracle, including subsequent FIND_ITEM, changed stats, timers and cold
   reload. Include failed staging/publication and unsupported-state controls.
5. Build and run the clean-source flow sweep, armed corpus and final related
   gates before removing the visible owned-inventory halt from the release.

The current native source is `0d9c0ef`; its clean 2026-09-08T09:00:20Z sweep
remains 19 PASS /8 known FAIL /0 SKIP with all 27 verdict tuples unchanged.
The new equipment module is not yet called by live item removal. No website
deployment is required for this native/tools/docs work.

## Next ability probe

With the corrected item table, `build/probe-cok-item-abilities.py` executes
32 removals spanning item-effect kinds 0..15, with and without a remaining
strength-boosting item. In this fixture only kinds 3/5 restore base strength
and exceptional strength when the last boost disappears; another boost keeps
the effective 18/100 values. This is exploratory branch evidence, not a complete
ability model. Results: `build/cok-item-abilities.json`. The next model needs
the remaining-effect lookups and the nested comparison helpers at 354EEh and
35586h, then the native mutation can use it before the verified E6:43 model.

A two-order control adds an important constraint: remaining kinds 5/subtype 6
then 3 produce strength 18/100, while reversing them produces strength 24 with
the exceptional byte still 100 (`build/cok-item-strength-order.json`). The
nested comparison can replace a greater strength when an 18-strength candidate
has a greater exceptional byte, and some branches retain the prior candidate's
exceptional byte. A simple maximum over strength pairs would be wrong. The
initial expectation of 24/0 for the reverse order failed; the measured 24/100
result agrees with the retained local shown in the original instructions.

## Remaining applied callbacks and nested inventory deletion

`build/probe-cok-expiry-callbacks.py` attempts all 120 initialized applied
callbacks with one effect, an empty inventory and the held first character.
88 return and 32 remain unresolved (`build/cok-expiry-callback-coverage.json`).
This is exploratory coverage, not 88 passing compatibility cases: combat-context
pointers and other runtime globals are not reconstructed for arbitrary effects,
and return alone does not prove valid reads/writes or a portable model. The
remaining callbacks need discriminating state fixtures, not no-op replacements.

Effect 17h's callback at 1139Dh scans for the first item whose type +46 is 6
and marker +49 is 79h. During removal it unlinks/frees that conjured weapon,
then recalculates equipment. Consequently kind-9 unready can mutate inventory
inside the outer DESTROY_ITEMS traversal. `build/probe-cok-kind9-removal.py`
confirms three original cases (`build/cok-kind9-removal.json`):

- If the conjured weapon is the successor already cached by DESTROY_ITEMS,
  a later matching type-39 item remains. The outer loop visits the freed
  successor, whose link was cleared, and stops scanning that owner.
- If an ordinary item separates the trigger and conjured weapon, the later
  matching type-39 item is removed; the ordinary item remains.
- Removing a conjured weapon earlier in the list also permits the later match
  to be removed. Real item/effect frees are recorded in order.

Do not implement all item removal as an unconditional filter over matching
records. Preserve this nested-callback/cleared-link behavior and verify it in
the native stage before claiming kind-9 support.


## Composed stable-node removal model — 2026-09-08

`tools/cok_item_removal.py` composes the verified unready dispatch, ability
updates and equipment recalculation for one owner's original DESTROY_ITEMS
traversal. Inventory and effect records retain their original indices during
mutation. Returned live records have zeroed link fields, with order and stable
indices carrying the links; equipment slots refer to stable item indices.
Inputs remain unchanged. A native caller must stage all owners before publishing.

The model supports applied effects 0Ch/0Eh/26h and 17h, and removal of unapplied
effects. Other applied callbacks reject without producing a publishable result;
this is an explicit research boundary, not a no-op implementation. Kind-9 and
kinds 0/2 effect-17h removal use the same first-match callback behavior.

`tools/test_cok_item_removal_model.py` passes **617 tests in 16.62 seconds**
(`build/native-removal-model-focused.log`). It compares complete bodies, surviving
item/effect records, original free order and selected/comparison state. Two-owner
fixtures check local effect search and selection restoration. The cases include
all 24 orders of trigger/conjured/later-match/ordinary records, with kinds 0/2/9,
applied/unapplied and cursed variants; 120 orders of two triggers, two conjured
weapons and one ordinary record, with two first-effect applied states; missing
effects; composed strength/charisma cases; and all 16 low item-kind dispatches.

The 24 self-deletion cases distinguish 12 normal unapplied controls from 12
applied-effect errors. In the latter, the original unlinks/frees the conjured
item once, removes the effect, then enters E6:70's missing-item branch at
37CDDh when the outer handler tries to remove that item again. It reaches BIOS
keyboard interrupt 16h through the error display. The null-item branch at
37C4Bh is not taken. This proves the observed error boundary, not what happens
after acknowledging the error. The model rejects this operation before output;
native staging must likewise avoid publishing a partially executed error path.

Exploratory evidence remains in `build/probe-cok-self-removal.py`,
`build/cok-self-removal.json` and `build/cok-unlink-disasm.txt`. This strengthens
the stable-index requirement: neither filtering all matching types nor making
unlink silently idempotent reproduces the original traversal.


## Native streaming equipment module — 2026-09-08

`native/src/cokstats.inc` ports the complete portable E6:43 equipment/stat model
to 386-compatible 16-bit assembly. It is not yet called by CCINV or the live
DESTROY_ITEMS path. The module has no file I/O or allocations: `cs_begin` accepts
a mutable staged 409-byte body and the 2048-byte definitions; `cs_item` processes
each live 63-byte item with its stable 32-bit index; `cs_finish` completes the
character fields. Thirteen slot indices and equipped weight remain explicit
outputs. Empty slots use FFFFFFFFh, which is reserved and rejected as an item
index. Serialized equipment pointers are zeroed; other body links are opaque.

The module checks undefined strength-index states before changing the staged
body and rejects item types without held definitions. Any rejection requires
the caller to discard the whole stage. It does not itself implement inventory,
party, effect or checkpoint publication. Its internal memory use is independent
of inventory length; only the last weapon record and fixed slot/modifier state
are retained. It preserves order-dependent armor/ring behavior, wrapping weights,
signed comparisons, race/level rules and auxiliary weapon bonuses.

`tools/cok_native_stats.py` assembles the actual module in a temporary directory
and executes its near-call interface. The existing original-code equipment tests
now also compare the compiled native body, slots and weights with the portable
model. `tools/test_cok_equipment_stats.py` plus `tools/test_cok_native_stats.py`
pass **1081 tests in 21.72 seconds** (`build/native-stats-port-focused.log`).

The latter test runs `native/cokstats-test.ps1` headlessly with a test-only DOS
driver. Its **631 cases** cover all byte dexterities, strength-index boundaries,
random fields, 32-bit slot indices, a 1101-record inventory and good cases after
rejected strength/item inputs in the same DOS process. Every output byte matches;
the input file remains unchanged. A second DOS run with a corrupted strength-hit
modifier produces different output. This driver is a test protocol, not the
future mutation packet or the production helper integration.


## Mutation packet integration constraint

The existing `checkpoint_store` entry point in `native/src/gbboot.asm` rejects
unless `checkpoint_camp_active == 1` and writes an in-camp header flag. It cannot
be reused unchanged as a general DESTROY_ITEMS snapshot: the opcode may execute
outside camp. Reusing GBCP's component encodings is still useful, but a mutation
request/response must carry the VM continuation without assuming camp state.

CCECL should resolve the target and successor PC into a yield request while
retaining the current opcode PC as the failure/rollback position. The helper
must validate complete GBPR, owned timer/effect state and streaming GBIV before
returning a combined candidate. Preserve stable node indices during mutation;
only serialize surviving records after every owner succeeds. Bind the response
to the request/continuation before activation, then refresh GBPS query bits.
Do not publish the inventory independently of its character/effect updates or
advance the VM on helper failure. Native equipment and ability modules now
exist; effect callbacks, staging, this yield bridge and cold round-trip DOS
cases remain necessary before removing the live halt.

Implementation direction for the next helper step: keep the temporary inventory
at fixed 63-byte record offsets and use its four-byte link field at 42 as a
stable next index, with FFFFFFFFh as end-of-chain. Keep owner heads separately.
Unlink must search the live chain and clear the removed node's successor,
preserving the outer handler's already-cached successor and its missing-node
error behavior. Only after all owners succeed should a streaming compaction
emit live records with zeroed serialized links and final lengths. Give the
working file a distinct header so existing GBIV validation cannot activate it.
This is a design choice for implementation, not a completed storage format.
Existing timers retain owner plus all nine original SFX bytes in ten-byte
records, with an existing total capacity of 256; do not confuse that timer
limit with the uncapped streaming inventory path.

The existing validators have different scopes. CCINV `open_core` checks GBCP
magic, stable CoK id at +6, version/length, roster owners and CRC; it does not
validate the in-camp flag or VM status. GBBOOT `checkpoint_validate` additionally
requires header+14 == 1, GBEF status == 0 and a clear combat-resume flag.
Consequently a mutation wrapper must validate its pending opcode/continuation
explicitly rather than treating CCINV envelope validation as semantic validation
of a general engine snapshot. The live inventory halt currently has VM status 4.

## Held applied effect 7: missing runtime context — 2026-09-08

The fourth held CoK SAVE member has a ready type-67 item with effect 7 and
an applied effect-7 record. Mapping original overlays 0124, 0116 and 0111 lets
the callback return, but does not establish a valid execution environment.
The saved body's runtime pointer at 387 is null, and the fixture's global
pointer DS:6A2E is also null. E6:C0 loads that global pointer at 38E49h and
writes its byte 6 at 38E4Dh, then resets the byte later.

`tools/test_cok_item_removal_context.py` proves both sides with original code:
the guarded oracle rejects the write to address 00006h; removing the guard
allows return with writes `(6,1,1)` then `(6,1,0)`. The complete resident image
is identical before and after, so even a final image comparison misses this
invalid context. The surviving item/effect lists alone look plausible.

`Machine` now rejects instruction-driven writes below the resident data
boundary BC60h. This is a narrow guard, not validation of every runtime read
or combat invariant. It does not make effect 7 supported: reconstruct the
original runtime context and RNG behavior before modeling this callback.
The two regression cases pass in 0.13 seconds
(`build/native-context-guard-control.log`). The preceding focused run had
2201 passing cases and one incorrect final-image inequality assertion, now
replaced by the observed write trace. Earlier exploratory callback-return
counts must not be used as compatibility counts.

Static follow-up locates the allocation at 0F22Eh: size 04E9h (1257 bytes),
stored into DS:6A2E/6A30; bytes 4/5/6 are initialized to 0/1/0. The default
initializer at 0F162h fills 04E2h bytes starting at structure+7 with 17h,
then reads configuration bytes at `DS:4B28` offsets +186/+188 and calls
`0xEB9A`, `0xECA5`, and `0xEFE4` (`0xF19C-0xF1A4`). `0xEB9A` reaches the
combat RNG, so the Python flat-map seed is not yet shown equivalent to this
initializer. Coordinate access elsewhere uses `y*50+x+7`, consistent with a
50-by-25 map plus seven header bytes. Character lookup at 3FF53h searches
the DS:68D1 pointer table from index 1 through DS:6242's count; the accessors
then read four-byte entries at DS:623F for x, y and the byte at entry+3.
These are static layout findings, not a validated initialized combat fixture.
Next reconstruct that map, pointer table and body+387 target context together.
Scratch evidence: `build/cok-context-global-references.txt`,
`build/cok-context-init-and-accessors.txt` and
`build/cok-context-character-lookup.txt`.

### Synthetic context execution follow-up

`build/probe-cok-context-range.py` now executes E6:C0 and full DESTROY_ITEMS
with two explicitly indexed character pointers, size-1 coordinate entries,
the original default clear-cell byte 17h in a 1257-byte map, and a body+387
context whose target pointer at +10 names the second character. Original
overlays 0124/0116/0111 run unchanged with the resident-write guard enabled.
This reconstructs a synthetic context; it is not a captured retail combat save.

All **32 cases return**: eight coordinate deltas times four RNG seeds
(0, 1, DEADBEEFh and FFFFFFFFh). Tested deltas are (0,0), (1,0), (2,0),
(3,0), (10,0), (1,1), (2,2) and (3,4). The measured range equals
`max(dx,dy) + floor(min(dx,dy)/2)` for these cases. The line-step code at
3E9A5h increments its cost byte by two for the major-axis step and one for
the minor-axis step; E6:C0 halves the selected cost. Do not generalize this
small experiment to all terrain, footprints, missing targets or overflow.

The RNG at resident B628h updates DS:43AE's 32-bit state using
`state = (state * 08088405h + 1) mod 2^32`. The bounded random call at B5D9h
uses the high word modulo the die size, and DB:52 adds one. Each full removal
advances this state exactly once in the 32 cases. The held member/item yields
d6+3 for range below 2, d4+1 otherwise; these additive constants are fixture
results, not a general effect formula. Complete final body changes agree
across the tested distances because final equipment recalculation follows the
callback, while global damage and RNG changes remain significant.

Artifacts: `build/cok-context-range-probe.json`, its `.log`, and
`build/cok-context-range-rng-disasm.txt`. The preceding accessor probe also
passed four two-member coordinate/size cases, including byte values 0/255
(`build/cok-context-accessor-probe.json`). None is a standing compatibility
test yet. Next vary weapon bonus, strength/dexterity and footprint/context
boundaries, then incorporate explicit RNG/global outputs into staged mutation
before treating applied effect 7 as supported.

The follow-up `build/probe-cok-context-abilities.py` passes **72 cases**:
distances 1/2, weapon bonus bytes 0/1/127/255, strength pairs 3/0, 18/100,
25/0 and dexterities 3/18/25, with seed DEADBEEFh. The measured global damage
equals `(die + bonus + 2 + strength_damage)` modulo 256 below range 2, and
`(die + bonus + 1)` modulo 256 otherwise. The strength modifier uses the
already verified strength table; all cases enable ability modifiers at body
276. This still does not cover disabled modifiers, footprints or missing
targets. Results: `build/cok-context-abilities-probe.json` and its `.log`.

## Native streaming ability module — 2026-09-08

`native/src/cokability.inc` ports the verified DB:8E strength and charisma
updates. `ca_begin` receives a staged 409-byte body and ability 0 or 5;
`ca_item` streams remaining 63-byte records in list order; `ca_effect` streams
9-byte effects in list order; `ca_finish` writes only the selected ability
bytes. Begin rejects every other mode before changing the body. Body bytes
are unchanged until finish. The module retains fixed state and first-match
effect flags without following serialized pointers or imposing record caps.

Strength preserves retained candidates, the exceptional-strength replacement
rule, forced strength 3, fixed effect-kind order, signed positive-level checks
and byte wrapping. Charisma preserves per-item changes and the first effect's
complete flag byte. No applied/duration filter is added. This is a prerequisite
for the staged mutation helper; it is not yet called by CCINV or live removal.

The existing **204-test** original-code ability suite now compares compiled
assembly in its direct ability cases and passes in **19.14 seconds**
(`build/native-abilities-focused.log`). The separate DOS test passes in
**2.54 seconds**, with **1634 cases** in one process covering all effect flag
bytes, randomized records, every invalid mode followed by recovery, and
1101-item/effect streams (`build/native-abilities-dos.log`). Complete output
bodies agree with the portable model, input stays unchanged, and corrupting
the effect lookup causes different output. The test-only driver is 1235 bytes
including its buffers and is not a production mutation protocol.

## RNG integration boundary

CCECL already stores and exports a full 32-bit RNG state (`rng_state` and
`fx_resume_rng`), so effect 7 does not require widening that field. However,
Before `729d08c`, `op_random` and `roll_d6` used multiplier 1664525, increment
1013904223 and modulo of the complete state. Original CoK's callback uses
08088405h, increment 1 and modulo of the high word, as measured above.
The shared field alone did not establish equivalent RNG behavior. `729d08c`
now selects the measured CoK recurrence for native CoK RANDOM, d6 and rest,
with original execution tests and a three-profile DOS RANDOM batch. See
`cok-rng-native.md` for exact boundaries and remaining tactical-combat scope.
The item callback still needs explicit RNG/global outputs in staged mutation;
this change does not activate it.

## Standing effect-7 context evidence — 2026-09-08

`tools/cok_effect7_oracle.py` supplies two indexed characters, a declared target,
and an explicit 1257-byte clear map to unchanged original overlays. Its companion
`tools/test_cok_effect7_context.py` passes **339 tests in 35.45 seconds**
(`build/native-effect7-context-focused.log`). These are synthetic contexts for the
held fourth member's Houpak, not captured retail combat or general callback parity.

Original DGROUP:1FE4 contains four signed coordinate pairs per size. Sizes 1–4
describe a single cell, vertical pair, horizontal pair and 2x2 square respectively;
unused pairs are (-1,-1). Sixteen tests check both the image bytes and the original
accessor at file offset 3F31Fh. In 128 size/coordinate combinations, original range
at 38E2Eh matches the minimum of `max(dx,dy)+floor(min(dx,dy)/2)` over both
footprints. Cases include overlap, reversed diagonals and opposite valid map
corners. Every footprint is wholly inside the 50x25 map.

Full removal in those cases consumes exactly one RNG draw. Another 144 cases
vary enabled/disabled body-byte-276 ability modifiers, range 1/2, item bonuses
0/1/127/255, three STR/exceptional-STR pairs and three DEX values. Below range 2,
damage is `(d6 + bonus + 2 + enabled_strength_damage) mod 256`; otherwise it is
`(d4 + bonus + 1) mod 256`. Thirty-two seed/range cases retain the prior exploratory
matrix. The recurrence is `(state * 08088405h + 1) mod 2^32`, with the high word
modulo the die size plus one. DEX did not change damage in this tested matrix.

The oracle records complete removal snapshots, context/map bytes, final DGROUP
changes and instruction-level DGROUP/map writes. Original range temporarily writes
map byte 6 to 1, then 0; tests check both writes despite identical final map bytes.
The 216-byte range table at DS:6A33 is restored; its preceding count is not part
of that preservation claim. Four applied/unapplied controls produce identical
complete character/list snapshots and context bytes while RNG and global damage
differ. Thus body/list equality alone cannot validate this callback.

Six malformed-context controls reject before execution with the entire mapped
image unchanged; eight invalid footprint/domain controls reject at construction.
A deliberate map-pointer shift into adjacent padding bypasses public validation
and proves the instruction-level map guard fires. That guard covers the explicit
allocation and nearby padding, not all arbitrary reads in the mapped megabyte.
An earlier out-of-map coordinate experiment returned without a guard failure;
it was not evidence of a valid context and is excluded from the supported domain.

Native effect 7 remains unsupported. Production still needs an explicit context
and staged RNG/global-damage outputs: the current GBMR contract preserves the
GBEF RNG unchanged. Establish context provenance and observable output ownership
before extending that contract or removing the native guard.

## Original context lifetime and additional outputs — 2026-09-08

`tools/test_cok_context_lifecycle.py` adds 25 standing original-code cases.
The combined lifecycle/effect-7 group passes **364 tests in 35.48 seconds**
(`build/native-context-lifecycle-focused.log`). No native callback was enabled.

The complete original per-party initializer at 0F273h calls equipment
recalculation, allocates 22 bytes per character, clears them, initializes
direction at context byte 9 and the beyond-party flag at byte 19. Twenty-four
cases cover eight even direction inputs and party counts 0/1/2 with two indexed
characters on opposing sides. Every other context byte, including target +10,
is zero. Original allocation rounds the two blocks to addresses 8F000h and
8F018h in this fixture. The allocator, memory clear and recalculation execute
unchanged; the original startup-installed heap callback at A46:A9 is supplied
explicitly, with a bounded heap and a declared party structure.

The retained-party cleanup at 07791h executes unchanged in a separate case:
both contexts are freed with size 22, both body+387 pointers become null, and
the two-member party chain remains intact. This does not cover NPC removal,
opposing-side cleanup or full combat startup/teardown. Initialization cases
avoid the separate control/morale substitution by supplying body byte 231 = 1.

Allocation therefore does not establish a callback target. Static target-store
candidates include 15FA6h, where the routine at 15F3Eh temporarily substitutes
a candidate target around DB:34 and restores the prior pointer at 15FC9h.
Other stores select from the indexed combat table.
`build/cok-effect7-target-assignment-candidates.txt` records leads, not a proven
target-selection contract.

The follow-up `build/probe-cok-target-substitution.py` executes the entire
15F3Eh routine after original context initialization with the held Houpak/effects
and an explicit indexed clear map. It accepts the candidate, writes its pointer
at context +10/+12 and restores the previous null pointer; all 22 context bytes
match afterward. RNG stays DEADBEEFh and damage stays zero. This is one exploratory
case, not standing coverage or an effect-7 execution: DB:34 modes 1 and 0 are
used there, whereas the branch at 34600h selects effect 7 for mode 4. The next
audit must follow mode-4 attack dispatch and its target ownership.

The applied/unapplied output audit also finds final writes to DS:6A32 (range
table count, 2 in the four standing controls) and DS:6B34 (die count, 1), beyond
RNG and DS:6B30 damage. The controls now seed the unapplied fields with A5h and
check that they remain unchanged and unwritten while the applied callback sets
its measured values. Do not silently omit these from the output-ownership audit.
`cok-rng-native.md` already identifies DB:52's DS:6B34 store; this extends that
evidence to complete applied/unapplied item-removal controls.
The range routine restores its 216-byte table but not the preceding count.

Instruction-read tracing identifies the apparent DS:6BB0 input as the original
callback-table pointer, initialized by the unchanged callback initializer; it
is read by the indirect dispatch at 3418Ch. DS:4B51 is tested at 41627h before
a formatting path. These findings do not prove all possible runtime reads valid.
Scratch evidence: `build/cok-effect7-output-ownership.json`,
`build/cok-context-lifecycle-probe.json`, and their probe scripts. Linear static
reference lists are candidate searches, not exhaustive absence proofs.

The next production decision remains how a native host obtains a valid target
and owns callback outputs. Do not create a fictitious target from the serialized
body pointer, or treat initializer success as a complete combat context.

## Production mode-4 target and callback trace — 2026-09-25

The earlier direct-near-call scan missed far calls through VROOMM stubs. The
validated CoK selector geometry in `tools/vroomm_layout.py` gives selector base
`0x38` (score 1891; runner-up 730). It maps `DB:34` to descriptor 23, public
stub 4 at `START.EXE:0xEAF`, procedure offset `0x057C`, and `GAME.OVR:0x34527`.
The old flat `0x200 + selector*16` path in `disasm_cok.py` incorrectly mapped
this pair to `0x38F59`; `resolve` now uses the validated descriptor geometry.
`C0:B0` was a coincidental flat-address alias for the same physical stub, not
the validated virtual selector pair. The setup path at `0x15F3E` does call
`DB:34`, but with modes 1 and 0 only.

Production mode 4 is reached inside the known attack-resolution chain:
`0x167AF -> 0x162E3 -> 0x14F24`. At `0x14F79`, `0x14F24` calls `DB:34`
with mode 4 and passes `SS:BP+0x0C`, the address of its far-pointer target
argument. Earlier instructions in the same routine dereference that argument
as the target combatant body and use fields `+0x190`, `+0x192`, and `+0x194`.
This is a pointer-to-member handle backed by the live `0x14F24` stack frame.
The mode-4 dispatcher at `0x34527` takes mode from `[bp+0x0A]` and the far
pointer handle from `[bp+6]`; its branch at `0x34600` passes that handle to
`0x342FD` for effect ids `07, 1D, 4B, 69, 72, 73, 75`.

For effect 7, helper `0x34153` indexes the callback table at `DS:0x6B94` by
`4 * id` and makes the indirect far call at `0x3418C`. The initializer at
`0x144D2` sets slot `DS:0x6BB0` to `0065:0043`. The same validated geometry
maps selector `0x65` to descriptor 12; offset `0x43` is public stub 7 at
`START.EXE:0x7FB`, with procedure offset `0x0208`, resolving to
`GAME.OVR:0x10DF0`. This callback consumes the forwarded pointer-to-member
handle, follows it to the character body and its `+0x183` context, and writes
the member field at `+0x18C` and global `DS:0x6B30`; it also calls other
combat helpers. The stack callback ends in `RETF 0x0A`, matching the five-word
forwarded argument block.

This establishes the original attack path's mode-4 target provenance and the
effect-7 callback implementation address. It does not show that the existing
synthetic lifecycle fixtures preserve this exact context, prove which writes
are owned outputs, or authorize native mutation. Next audit the callback and
its callees for RNG, character, combat-global and transient writes; match each
write to the staged native output contract before changing authorization.
Static inspection and source-only tests only; no DOSBox or UI runtime was
launched.

## Effect-7 character-write ownership and producer trust — 2026-09-25

The synthetic lifecycle oracle now records writes to both 512-byte combatant
slots with the executing relocated instruction address. In the four standing
applied/unapplied comparisons in `test_callback_global_effects_do_not_hide_body_or_list_differences`,
the applied path executes the callback's initial store at `GAME.OVR:0x10E78`
and one branch-final store at `0x10ED9` or `0x10F21`, all to the owning body at
`+0x18C`; the unapplied control executes none of those callback stores. This
closes a write-provenance gap: complete final snapshots alone had hidden the
callback's direct character write because surrounding removal/recalculation
also produces the same final body bytes in these controls. The held synthetic
fixture changes byte `+0x18C` from `0x2A` to `0x28`, but that final value cannot
be attributed to the callback by snapshot comparison alone.

The same bounded control records one RNG draw, final `DS:0x6B30` damage, die
count `DS:0x6B34`, range-table count `DS:0x6A32`, and the map-byte 6 set/clear
writes. The 216-byte range table is restored; its preceding count is not. These
are original-code synthetic-context observations, not a captured retail combat
snapshot, and the unresolved range helper selectors still prevent claiming a
complete transient write map.

The current staged GBOC validator does not establish that a callback produced
its asserted damage or draw count. `cm_authorize_output` folds the record's
caller-supplied draw count against the paused RNG and applies the caller-supplied
damage; it has no callback execution proof or independently derived damage
input. The current test set explicitly pins acceptance of an arithmetically
self-consistent forged record with 65,535 draws and damage 255. This is a
producer-trust gap, even though effect 7 remains unsupported by the ordinary
native item-removal path. Do not widen callback authorization or treat RNG-fold
consistency as output provenance until a trusted producer or independent
derivation from validated combat context exists. The next bounded task is to
trace who can construct the GBOC input on each real M-stage path, then define a
producer contract that binds callback id, owner/target, context, damage and RNG
to the original execution.

The producer-boundary trace is now narrowed. `CCINV B` reads the 40-byte GBOC
payload from an input GBMB v3 manifest at `+672` and copies it byte-for-byte
into GBMR; `CCINV M` routes that supplied record by its own target ordinal;
`CCINV C` checks that the candidate retained the request's record. None of
those stages creates callback outputs. The GBBOOT `inventory_run` call sites
use `I`, `R`, `W`, `A`, `S`, `L` and `Q`; they do not submit the B/M/C
transaction. Thus the forged-record test describes the exposed packet/helper
boundary, while the ordinary GBBOOT route currently has no GBOC producer and
does not activate this output path. The implementation task is to put trusted
derivation at the actual callback execution boundary and carry that result
through B/M/C, or reject externally supplied output records until such a
producer exists.

The original `DESTROY_ITEMS` dispatch confirms what the callback receives.
At entry `GAME.OVR:0x10DF0`, the far-call return site is `0x34190`, immediately
after the indirect call at `0x3418C`. The stack argument is a member handle;
dereferencing it yields the owner body at `0x70000`. The trace then sees the
body's `+0x183` field point to context `0x71000`, whose `+10` target points to
body `+512`. These address values come from the synthetic fixture: it explicitly
installs the context pointer and target. The original dispatch proves the
owner-handle calling convention, but does not prove production initializes
those context fields. Next trace the real removal route's writes to the body
context, map byte, positions and target; keep externally supplied output records
rejected until those values have a trusted producer.

The mode-4 attack oracle now separately runs the original `0x0F273` per-party
initializer after clearing both body `+0x183` pointers. On the firing
`0x14F24` path, the callback at `0x10DF0` receives the second-argument owner at
`BODY_BASE+512` and its allocated context at `0x8F018`; context `+10` is null
at callback entry. The call returns with the expected second RNG draw. This
proves the callback can receive an originally allocated owner context without
the synthetic target pointer. Static setup tracing finds the matching original
entry: validated VROOMM geometry maps `0x5E:0x25` to `GAME.OVR:0xFDF2`, called
from `0xAEE1`. That entry calls map setup `0xF1C3`, per-party context setup
`0xF273`, then placement `0xF991`. `0xF1C3` allocates 1257 bytes at `DS:6A2E`
and builds terrain; `0xF991` walks the combatant list and calls placement helper
`0xF513`, which reaches `0xF3C6` to write `DS:623F/6240` coordinates and checks
the corresponding map footprint. The mode-4 target itself remains the live
far-pointer argument passed by `0x14F24`; context `+10` was null in the
successful oracle call. These are static path findings, not a full dynamic
execution of `0xFDF2`: the focused attack oracle still supplies map and
position tables. `tools/test_cok_effect7_target_provenance.py` passes 22 tests.

### `0xFDF2` setup inputs and oracle-owned state — 2026-09-25

This pass follows the entry and its three setup calls at instruction level and
compares the referenced state with `ContextMachine` / `wire_attack_overlays`
in `tools/test_cok_effect7_target_provenance.py`. It is a static audit; it does
not claim that the real entry ran or that its unresolved resident globals were
reconstructed.

| Setup input or output | Retail code evidence | Current fixture treatment |
| --- | --- | --- |
| Entry and current party chain (`DS:609A/609C`) | `0xAEE1` calls overlay `0x5E:0x25`, resolved to `0xFDF2`. `0xFDF2` calls `0xF1C3` at `0xFEC9`, `0xF273` at `0xFED2`, then `0xF991` at `0xFEDB`. Both latter helpers walk the far-linked combatant list rooted at `DS:609A/609C`; `0xF991` writes each visited member pointer to `DS:68D1 + index*4`. | `Machine(retail, members)` constructs the list directly from the held `CHRDATA4.SAV` body and its item/effect records. It does not run the retail party loader or the `0xAEE1` caller. |
| Workspace/config pointers (`DS:4B28`, `DS:4B2C`) | `0xFDF2` clears word `+0x666` through the structure pointed to by `DS:4B2C` at `0xFEBD`. `0xF1C3` selects a map initializer from the `+0x1CC` word in the `DS:4B28` structure (`0xF1C9-0xF1D3`, then either `0xEA67` or `0xF162`). The upstream producer/contents of both pointers are outside the executed oracle route. | `wire_attack_overlays` installs `DS:4B2C -> 0x74000`, clears a `0x680`-byte workspace, and sets its `+0x67C` word to 2. It does not install or validate the `DS:4B28` source structure. |
| Map allocation and terrain (`DS:6A2E/6A30`) | `0xF1C3` allocates `0x4E9` bytes through allocator `A46:23F` at `0xF22E-0xF23A`, stores the far pointer at `DS:6A2E/6A30`, initializes header bytes `+4/+5/+6` to `0/1/0`, then dispatches `0xF162` or `0xEA67`. In the default `0xF162` branch, `0x4E2` bytes from map `+7` are filled with `0x17`, then it reads `DS:4B28+0x186/+0x188` and calls `0xEB9A`, `0xECA5`, and `0xEFE4`; the flat Python map does not reproduce the complete helper. | `ContextMachine` uses a Python-owned `MAP_BASE=0x72000` block, fills its 1250 cell bytes with `0x17`, sets header bytes `+4/+5/+6` to `0/1/0`, and writes the pointer to linear address `0x56A2E` (the fixture's `DS:6A2E`). It never calls `0xF1C3`. |
| Per-member combat contexts (`body+0x183`) | `0xF273` starts from `DS:609A/609C`, requests `0x16` bytes per member using `A46:23F` (`0xF2A3-0xF2B4`), stores each far pointer at body `+0x183`, and clears the requested 22-byte payload (`0xF2BC-0xF2CA`). It also reads body fields including `+0x18A`, `+0xE7`, and `+0xCF`, plus `DS:6D87` and the `DS:4B2C` capacity word. | Unlike the other two helpers, `machine()` does execute original `0xF273` after `wire_attack_overlays` zeros both body `+0x183` pointers. The allocator table at `DS:54386/5439A` and arena at `0x8F000` are fixture-installed. The two observed allocation pointers are 24 bytes apart, which establishes allocator stride, not a 24-byte context payload. The successful callback therefore proves allocated owner context, but not the real `0xFDF2` setup inputs. |
| Placement state (`DS:623F/6240`, member index/pointers) | `0xF991` resets its per-index fields, calls `0x116:0x39` at `0xF9C3`, then walks `DS:609A/609C` and calls `0xF513` at `0xFC10`. Validated descriptor procedure index 5 resolves `0x116:0x39` to `GAME.OVR:0x3F685`. That routine clears the `0x4E2`-byte scratch grid at `DS:63F3`, walks indexed coordinates/status from `DS:623F/6240/6242`, and writes occupancy cells using 50-byte rows. `0xF991` also calls `0xE6:0xB6` at `0xF997`, resolved to `GAME.OVR:0x38C30`; that resets and rebuilds `DS:6B2C/6B2D` from active/kind bytes at body `+0x189/+0x18A`. `0xF513` calls `0xF3C6` directly at `0xF963`; that helper bounds-checks its candidate coordinates and map footprint, then stores selected x/y bytes at `DS:623F + index*4` and `DS:6240 + index*4` (`0xF449-0xF47C`). `0xF991` also fills the per-index size/status fields at `DS:6241/6242`; placement failure can remove a member, so capture the resulting chain. | `ContextMachine` does not call `0xF991`, `0x116:0x39`, or `0xF513`. It directly writes the two member pointers at linear `0x568D1 + index*4` (DS:68D1) and four-byte position records at `0x5623F + index*4` (DS:623F). Positions default to `(10,10,1)` and `(11,10,1)`. The test therefore supplies map/position state; on the mode-4 attack path the target comes from the `0x14F24` far-pointer argument. |

The audit separates three evidence levels. The `0xFDF2 -> 0xF1C3 -> 0xF273 ->
0xF991` call order and the helper writes are byte-backed static findings; only
`0xF273` has been executed on the focused mode-4 test path; map creation and
placement remain fixture-supplied. The `0xF991 -> 0x116:0x39 -> 0x3F685`
occupancy pass is now address-resolved, but the resident setup that populates
`DS:4B28`, the caller-owned game/workspace state, and the selector/table inputs
that choose each final position are not yet producer-traced. Do not replace
those gaps with values inferred from the synthetic oracle.

### Bounded caller probe result — 2026-09-25

`python -m tools.probe_cok_combat_setup` starts at caller `0xAEC9`; its held
`CHRDATA4` party chain remains explicitly synthetic. The first attempt
incorrectly applied the current overlay's segment delta to external VROOMM
selector operands. That redirected `0x105:0x2F` into `GAME.OVR:0xEC39`; its
apparent `DS:6A2E` read was a harness artifact and is retracted. The corrected
probe rebases self-segment relocations and preserves external selectors
through their patched entry stubs. Its initialized-region ledger marks the
MZ image, loaded overlay code, held-party records, explicit fixture globals,
nonzero pre-probe DS bytes, the caller stack sentinel, and subsequent original
memory writes. It stops on the first uncovered read: retail `0x105:0x2F`
(`GAME.OVR:0x3CEBC`) reads one zero byte at `DS:6DA2` (`DS=0x5000`, linear
`0x56DA2`) from instruction `GAME.OVR:0x3CECE`. The stack frames return first
to `GAME.OVR:0xFE07`, then caller `GAME.OVR:0xAEE6`. This is a precise first
uninitialized input boundary, not yet proof that retail's runtime leaves the
byte unset; the MZ/data loader and upstream producer for `DS:6DA2` remain
unmodeled. `DS:6A2E` is not read in this corrected run, and `F1C3/F273/F991`
are not reached. The probe never launches DOSBox.

### Startup producer and corrected first boundary — 2026-09-25

The raw `START.EXE` prefix, rather than the zero-filled prefix returned by the
legacy EXEPACK decompression-only API, proves the startup call. The new
`unpack_complete_load_image()` API composes the untouched load-module bytes
before the measured first decompressed destination offset into a separate
complete image; `unpack()` remains unchanged for existing callers. For held
CoK the decompressor first writes at image offset `0x038D`, so the API restores
the full raw prefix while leaving every decompressed byte from `0x038D` onward
unchanged. Synthetic tests cover prefix restoration and reject a source module
too short to contain the measured prefix. The real-byte test retains entry
`0000:003F` (`9A 00 00 46 0A`) and startup-call bytes at load-image offset
`0x013B` (`9A 25 00 61 00`). That far call targets `0061:0025`; the validated overlay descriptor
resolves this to `GAME.OVR:0x100F3`. The initializer's normal path reaches
`0x1054E..0x1055A`, which passes `DS:6DA2`, length `0x42`, and fill byte 0 to
resident `A46:1661`. That helper executes `CLD; REP STOSB` at load-image offsets
`0xBACF..0xBAD0`, proving startup initializes exactly `DS:[0x6DA2,0x6DE4)`.
The routine at `0x3CEBC` reads the first byte as an optional-list count and
clears the 66-byte structure on return. This supersedes the earlier
interpretation that the value's only provenance gap was the DOS loader/BSS.

`tools/probe_cok_combat_setup.py` now reproduces and labels that exact startup
clear before entering at `0xAEC9`; it does not assume DOS allocation is zeroed.
The probe advances past `0x3CECE` and stops at linear `0x66DC0`, source
`GAME.OVR:0x3BC45`. In this fixture `SS=0x6000`, `DI=0x6DA2`; the instruction
reads `SS:[DI+0x1E]`, while the caller's far-pointer argument is `5000:6DA2`.
The caller at `0x3CEBC` first dereferences that far pointer through `ES:DI`,
then forwards `ES:DI` to `0x27F:0x1CF6`; the callee path reads the offset through
`SS:DI`. This establishes a segment-equality assumption in this call path, not
that `DS:6DC0` is an independent retail input.

The in-memory Unicorn sensitivity run with `SS=DS=ES=0x5000` crosses the
`SS:[DI+0x1E]` read and returns through `0x3BC63`, then reaches an uncovered
stack-relative read at `START.EXE:0xAF43`. That altered segment layout also
changes where the synthetic stack lives, so the later read is not yet a
production input. The held EXEPACK header reports transfer entry `0000:003F`
and initial stack `1491:4000` (`exepack_unpack.unpack`). The raw prefix at
`0000:003F` first calls `0xA46:0`; its resident entry at unpacked offset
`0xA460` sets `DS=load_segment+0x0BC6` and does not change SS in that routine.
This proves the initial stack and data segment are distinct at this startup
point, but not their values at caller `0xAEC9` after subsequent startup calls.
The probe's `SS=0x6000:SP=0xF000` is an explicit synthetic choice. Thus
`0x3BC45` is proven sensitive to that choice, but whether later startup makes
the live runtime satisfy the callee's `SS==ES` assumption remains open.

A second in-memory sensitivity variant used the EXEPACK header's initial
`SS:SP=1491:4000` and retained the probe's synthetic `DS=ES=0x5000`, entering
manually at `0xAEC9`. It stopped at the same `GAME.OVR:0x3BC45` read, now at
linear `0x1B6D0` (`SS:0x6DBC`), with `CS:IP=8400:16A6`, `DI=0x6DA2`, and
`SP=0x3FC0`. This confirms the read remains uncovered when the measured
initial stack is used in this partial probe. It does not establish that
`SS=0x1491` survives to `0xAEC9`, because startup was bypassed, nor does it
establish the retail `DS/ES` or pointer values there.

Disassembly of the sensitivity stop at `START.EXE:0xAF43` narrows the missing
input: the helper reads a source far pointer from `SS:[SP+0x0A]`, a destination
far pointer from `SS:[SP+0x06]`, and a byte limit from `SS:[SP+0x04]`; it copies
the bounded buffer with `LODSB/STOSB/REP MOVSB` and returns with `RETF 0x0A`.
Entry instrumentation captured two calls in this sensitivity replay. The
first returned to `0521:036E` with limit `0xFF`, destination `5000:EEAE`, and
source `5000:6DA2`. The later call returned to `0521:0B0A` with limit `0x28`,
destination `5000:EEAF`, and source `0000:0000`. Its source-offset word is the
uncaptured read at linear `0x5EEAA`. This null pointer is from the synthetic
continuation; it does not establish the retail caller's argument or input
producer. The evidence explains the stop without inferring that the
bounded-copy helper itself is faulty. At the later call, the enclosing stack
frame has `SS:BP=5000:EFAE`, returns to `8400:16C4` (`GAME.OVR:0x3BC63`), and
contains `5000:6DA2` at `BP+6/+8` followed by `0000:0000` at `BP+0xA/+0xC`.
The helper call at `START.EXE:0x5D15` therefore receives a null source pointer
in this continuation. This records where the synthetic null enters the
routine; it does not provide a retail producer for it.


A focus-safe Unicorn startup trace now begins at EXEPACK transfer entry
`1000:003F` with all 621 parsed relocations applied, DOS PSP/data selectors
initialized as `0x0FF0`, and the header stack `2491:4000`. Real resident bytes
set `DS=0x1BC6` (`load_segment+0x0BC6`) and leave `SS=0x2491` through the first
DOS vector query at `1A46:0050`. A limited second pass stubs DOS vector
get/set, DOS version and one IOCTL response; it reaches the first video BIOS
query at `1962:060F` with `DS=ES=0x1BC6`, `SS:SP=2491:3FEE`. No SS write
instruction executes in this trace. Since IVT results and IOCTL status are
synthetic and execution stops at `INT 10h`, this narrows early startup only; it
does not prove the final stack or pointer at `GAME.OVR:0xAEC9`.

The first `INT 10h` instruction is source-resolved in the restored CoK load
image. With the trace's load segment `0x1000`, runtime `1962:060F` maps to image
offset `(0x1962-0x1000)*16+0x060F = 0x9C2F`, whose bytes are `CD 10`. The
wrapper at `0x9C2B` saves SI, DI, BP, and ES, executes the interrupt, restores
those registers, then near-returns; it contains no SS write. The traced call
site is `0x9650`, preceded by `MOV AH,0x0F`, and resumes at `0x9653` to inspect
the returned AL. `0x9620` directly near-calls that non-prologued entry at
`0x964E`; it returns at `0x96B6`, after which `0x9620` calls resident helpers
`A46:0x0567` and `A46:0x056C` before its `RETF` at `0x964D`. This accounts for
the first BIOS boundary and its immediate return path, but the earlier far or
indirect caller that enters `0x9620` and the later path to overlay setup
`0xAEC9` remain unlocated. INT 10h results are synthetic in the trace, so
post-return branches that consume AL are not yet retail-runtime evidence.

The restored startup prefix supplies the far caller previously missing from
this chain. It contains 49 consecutive five-byte `CALL FAR` instructions from
load-image offset `0x003F` through `0x012F`; the next bytes at `0x0134` begin a
`PUSH BP; MOV BP,SP` routine. The first entries are `0000:003F -> 0A46:0000`,
then `0000:0044 -> 0962:0000`, then `0000:0049 -> 0960:0000`. At load segment
`0x1000`, the second call enters image offset `0x9620`, whose near call at
`0x9623` reaches the video-query routine above. Its segment word at load-image
`0x0047` is one of the parsed EXEPACK relocations. Thus the first BIOS wrapper
is reached from the explicit prefix call list, not an unknown computed entry.
The table continues through resident, VROOMM, and START-segment entries before
main offset `0x0134`; calls after the first BIOS query remain to be traced for
segment changes and the transition toward `GAME.OVR:0xAEC9`.

**Startup far-call scan continuation — 2026-09-26; format-aware correction.**
Prefix site `0x00DA` contains `9A 20 00 9E 00`, a far call to
`0x009E:0x0020` / restored-image offset `0x0A00`; its segment word at `0x00DD`
is an EXEPACK relocation. The apparent `POP SS` at `0x0A22` was a linear
decode error: `CD 3F 17 28 00` is a five-byte Borland VROOMM public-entry
thunk, with `proc_off=0x2817` encoded in bytes `0x0A22..0x0A23` and a zero
padding byte at `0x0A24`. The format-aware resolver confirms
`0x009E:0x0020 -> descriptor 17, GAME.OVR base 0x1D6DB -> file offset
0x1FEF2`; the target is `PUSH BP; MOV BP,SP; POP BP; RETF`, with no SS write.
Thus this call supplies no evidence of a startup stack transition. The first
call from main entry `0x0134` is also resolved: prefix offset `0x013B` calls
`0x0061:0x0025`, descriptor 11's second stub, to `GAME.OVR:0x100F3`
(`proc_off=0x005B`). That callee is in the existing overlay CFG set, whose
93,151 reachable instruction addresses contain no instruction-boundary
`MOV SS`, `POP SS`, or `LSS`. This does not establish the later runtime value
at `0xAEC9`; the 49-call list and path from the main callee to overlay setup
has been mapped through its descriptor/public-entry boundaries; the path from
main entry `0x0134` through setup to `0xAEC9` and its final SS value remain
unresolved. Do not treat thunk operand bytes as instructions or infer a runtime
stack value from the synthetic startup trace.

**FDF2 graphics-resource-table pointer — 2026-09-26.** The far pointer supplied to
`GAME.OVR:0x3CEBC` on the `0xFDF2` setup path is now source-located. At
`0xFDFD..0xFE02`, FDF2 loads `DI=0x6DA2`, pushes `DS` and `DI`, then calls
`0x0105:0x002F`. The format-aware resolver maps that stub to descriptor 28,
procedure offset `0x0537`, exactly `GAME.OVR:0x3CEBC`. Its entry executes
`LES DI,[BP+6]`, reads the count byte through `ES:[DI]`, walks eight-byte
entries, and forwards each selected entry to `0x027F:0x1CF6`; it clears the
66-byte list on return. Therefore the FDF2 call passes the far pointer
`DS:0x6DA2` (for the startup trace's load segment `0x1000`, `DS=0x1BC6`).
The bounded trace of target entry `0x5E:0x25 -> 0xFDF2` and its nested call
used a host dispatch bridge at `0xA46:0x00D7`, with
`DS=load_segment+0x0BC6` before entering overlay code. Source review on
2026-10-11 identifies that address as the initial error-208 trap; normal
initialization installs the real INT 3F manager at `0x09F0:0x02E6`.
The bridge is not original VROOMM loading; see the
[source and original-loading proof](cok-original-vroomm-c-rust-plan-2026-10-11.md).
The startup
initializer at `0x100F3` clears `DS:[0x6DA2,0x6DE4)`; Task 128 now maps the
source writer at `GAME.OVR:0x3CA69`, including a caller that passes
`DS:0x6DA2` as its destination. This establishes static writer code, not which
successful resource load populated the exact table before a valid FDF2 call or
the production `SS` value. This matters because the nested helper reads
`SS:[DI+0x1E]` and later fields while the pointer itself is passed in `DS:DI`;
do not infer SS/DS equality from the synthetic `5000:6DA2` fixture.

**`6DA2` reference follow-up — 2026-09-26.** The raw `xrefoff 0x6DA2` hits
were checked at their instruction sites. `GAME.OVR:0x3B2F9..0x3B3A8` is a
consumer: it tests bytes at `DS:6DA2/6DA3`, indexes fields at `DS:6DA0 +
8*index`, and advances `DS:6DA3`; this block does not write the count at
`DS:6DA2`. A second cursor-advance block at `0x3D37..0x3D66` likewise indexes
the selected record, calls `0x0105:0x0025`, and advances or wraps `DS:6DA3`.
The startup initialization block at `0x106E6..0x106F6` zeros `DS:6DA0` as
part of a larger global clear; it does not initialize the count at `DS:6DA2`.
Separately, the routine at `0x1054E` clears `DS:[0x6DA2,0x6DE4)` through
`0xA46:0x1661` when `DS:0x45F4 == 2`; this is another reset site, not a record
producer.
Other exact `0x0105:0x002F` callsites at `0x071C`, `0x44B6`, and `0x1A440`
respectively precede UI setup, encounter-state setup, and processing of the
adjacent `DS:6DE5`/`DS:6DEA` lists. These identify additional consumers and
state handling, but do not establish a writer for the records later passed by
FDF2. The startup clear and synthetic probe still cannot identify the later
producer; leave count/record provenance and production `SS` open.

A byte-offset Capstone candidate scan for absolute write operands in
`DS:0x6DA0..0x6DE3`, followed by inspection of the candidate instruction
sites, found no direct store to the count byte or record payload. The confirmed
writes are the startup zero word at `0x106F3` to adjacent `DS:0x6DA0` and the
two cursor increments/wraps at `0x3B377/0x3B384` and `0x3D54/0x3D61` to
`DS:0x6DA3`. This is a raw candidate scan rather than a CFG proof; it does not
exclude stores through aliased or computed pointers, which remain the next
producer-tracing surface.

The neighboring setup callers do not close that gap. At `0x9011` and
`0x90BC`, `DS:6DA2` is passed to `0x0105:0x002A`, which resolves to
`GAME.OVR:0x3CA69`; that routine sends the list through `0x3CEBC`, whose
documented behavior consumes and clears the 66-byte buffer. At `0x903E`, the
same pointer is passed to `0x0105:0x003E` / `GAME.OVR:0x3D0B3`, which copies
the 66-byte buffer to a stack-local area and reads the selected far-pointer
entry for display. These paths are consumers/resetters; they do not establish
where the list's count or entries are first produced.

A bounded instruction-boundary check found no `MOV SS` or `POP SS` in
prologue-seeded linear windows over the composed CoK START image (108
`55 89 E5` seeds) or GAME.OVR body (827 seeds). Each decode stopped at a
return or after `0x400` bytes; the raw START prefix was retained below the
EXEPACK decompressor's first write (`0x38D`) and the decompressed image used
above it. The prior START offset wording needs correction: the packed file has
`8E 15 77 15 C8 15` at file offset `0x7F79` (load-module offset `0x7D79`),
while the unpacked image contains the same sequence at `0x7FF0`; unpacked
offset `0x7D79` is ordinary arithmetic code. At unpacked `0x7FF0`, the bytes
decode as `MOV SS,[DI]` if decoding is started there, but no prologue-seeded
window reaches it. Near-CFG walks from transfer entry `0x003F` and main entry
`0x0134` also do not reach it; those walks stay within the load-module CS and
do not follow far or indirect calls. Treat `0x7FF0` as an unresolved possible
code entry, not a disproven byte coincidence. The surrounding bytes are
table-shaped: six consecutive nonzero words at `0x7FEA..0x7FF6` are
`0x1597, 0x15F5, 0x15FC, 0x158E, 0x1577, 0x15C8`, followed by zero padding;
the `0x158E` word is the candidate opcode plus ModR/M byte. This suggests data,
but ownership and consumers remain unproven. The 11 OVR byte candidates
likewise had no instruction-boundary hit in the earlier windows. These are
bounded negatives, not a whole-program proof: indirect entries and startup
calls not covered by those seeds could still change SS.

The follow-up reference audit narrows this candidate further. In the unpacked
START image, `0x7F80..0x7F9F` ends with a `RETF`; the following bytes are a
length/text region, zero padding, and compact constants through `0x7FF7`.
A raw little-endian scan of the preceding image bytes (`0x0000..0x7FC0`) finds
no direct word reference to `0x7FEA` or `0x7FF0`. The six values at
`0x7FEA..0x7FF6`, when independently decoded as image offsets, do not form a
coherent set of procedure entries: `0x1597` does not decode, `0x1577` begins
with `INC SI`, and the others land inside existing instructions or function
bodies. This is bounded evidence that `0x7FF0` is table data rather than a
startup `MOV SS` entry. It does not exclude a computed/indirect reference, and
the table's owner/consumer is still unidentified; retain that limitation while
following runtime transfers after the first `INT 10h`.

The GAME.OVR side is now checked with direct control-flow traversal from every
validated overlay public procedure and every `55 89 E5` / `55 8B EC` prologue
seed. Across 34 descriptors this deduplicates to 825 seeds (504 public
procedures) and reaches 93,151 unique instruction addresses while following
direct branches and near calls. It finds no instruction-boundary `MOV SS`,
`POP SS`, or `LSS`; the `AEC9` and `FDF2` starts are included. Seven apparent
`POP SS` decodes in the earlier linear windows are dead-after-return text, not
instructions: they occur after `RET`/`RETF` at OVR file offsets `0x10D3A`,
`0x1B063`, `0x1B6BB`, `0x1D256`, `0x27E1E`, `0x29538`, and `0x305D1`, each
followed by readable message text. This is stronger evidence that the setup
path itself inherits its stack segment, but not a complete proof for indirect
transfers or for startup before overlay entry. The unresolved interval is the
START/runtime path after the first BIOS query and before entry at `0xAEC9`.

Next continue post-EXEPACK startup from the first `INT 10h` boundary through
the mapped 49-call prefix and main entry `0x0134` toward `GAME.OVR:0xAEC9`.
Treat `0x7FF0` as likely table data on the bounded reference evidence above,
while leaving its owner unresolved. Follow the remaining far/indirect
transitions and record whether `SS` or `DS` changes before overlay entry. The
far pointer passed from FDF2 to `0x3CEBC` is resolved as `DS:0x6DA2`; trace
the count/record producer using the pointer-taking callers, since the bounded
absolute-write scan found only reset/cursor stores. Do not treat
`START.EXE:0xAF43` from the altered-segment run as a retail prerequisite. Once
the production SS/ES relationship and buffer provenance are established,
resume toward `0xFEDE` and the full
`FDF2` return at `0xFFFE` / caller `0xAEE6`. Capture
map/context/member/placement/membership/counter/RNG outputs with original write
offsets before comparing them with the `0x14F24` attack oracle. Keep GBOC
externally supplied output untrusted until an ordinary native producer derives
and binds its outputs. Neither Unicorn run launched DOSBox.

Review corrections from 2026-09-25: `F162` does not end after filling the
terrain bytes; it reads config `+0x186/+0x188`, calls `EB9A/ECA5/EFE4`, and
consumes RNG through `EB9A`. `F273` requests and clears `0x16` bytes; the
observed 24-byte pointer spacing is allocator stride, not a proved structure
size. The `FEDE` checkpoint is deliberately partial because `FDF2` continues
with later setup and presentation calls.

## Native staged removal kernel — 2026-09-08

`native/src/cokremove.inc` (`0800c9d`) now composes unready, the verified
applied 0Ch/0Eh/26h/17h callbacks, strength/charisma and equipment updates.
Other applied effects reject. Inventory records remain at fixed offsets with
32-bit next indices in their link fields; the outer cached successor remains
separate. Unlink searches the live chain and rejects a missing node rather
than silently accepting the original self-deletion error. Read/write hooks
let a caller supply disk-backed storage. Success leaves explicit live heads
and stable equipment slots for later compaction. Any carry requires discarding
the entire stage, including all previously processed owners.

The kernel bounds each chain walk by its source count, checks indices before
I/O, retains at most 256 staged effects per call, and imposes no additional
inventory-count cap. It streams each live record into the existing equipment
and ability modules. Serialized body inventory/effect heads and equipment
pointers are zero on success; the returned heads/indices describe live records.
Effect removal and item removal notifications retain their original order.

The **617-test** original-code/model suite now checks the compiled kernel too,
including rejection of unsupported callbacks and self-deletion, and passes in
**21.59 seconds** (`build/native-removal-kernel-focused.log`). The adapter's
I/O hooks use a temporary host file; the original-code oracle remains separate.

`native/cokremove-driver.asm` exercises real DOS seeks/reads/writes in a
headless **369-case** batch. It passes in **2.49 seconds**
(`build/native-removal-kernel-dos.log`): nested order/cursed/duplicate cases,
ability/effect composition, self-deletion, unsupported callbacks, 1101-item
streams crossing a 64-KiB file offset, and injected invalid-handle read/write
failures followed by valid cases in the same process. Complete output bodies,
live records, stable slots and removal order match the model. The input file
is unchanged. The scratch file has a distinct GBIW header.

This driver is a test protocol, not the production mutation request/response.
The kernel is not yet called by CCINV or the live VM. Combined all-owner
staging, validated response activation and VM continuation are still required;
do not publish the inventory alone or remove the current halt yet.

## Combined party reference and continuation audit — 2026-09-08

`tools/cok_party_removal.py` composes all owners into a single immutable result:
GBPR bodies, GBIV records, canonical timer state, the owned-effect matrix,
item-type bitmap and compacted equipment indices. Owner source IDs and inventory
presence/cloud flags are preserved. Effect owner ordinals are one-based and are
independent of source IDs. Each owner's effect order and the surviving global
interleaving are preserved. Serialized links are cleared and unused timer space
is zeroed. Unknown-duration timer state is rejected; the model must have the
complete effect list before claiming safe removal.

`tools/test_cok_party_removal.py` passes **49 tests in 1.60 seconds**
(`build/cok-party-removal-focused.log`). The 28 complete original-code comparisons
cover zero through six owners, selected/no selection and both global owner orders.
They check complete materialized bodies/lists, free order, query bitmaps and
compacted equipment references; each candidate also agrees with the compiled
native per-owner kernel. Six late-failure cases place an unsupported callback at
each possible owner and confirm rejection with unchanged input bytes. Fifteen
malformed roster/inventory/timer cases reject before any owner work. This remains
a reference operation, not a native request/response implementation or publication.

The continuation audit found why the existing combat resume path cannot serve as
an item-mutation continuation unchanged:

- `CCECL.read_resume_state` accepts status 3 with GBRS flag bit 0 set, while the
  current inventory halt exports status 4 with that flag clear.
- `apply_resume_state` restores PC, RNG, call stack, sparse memory and clock, then
  calls `set_resume_cmp_flags`, replacing comparisons with the combat outcome.
  It does not restore `selected_valid`, `selected_party` or `selected_not_found`.
- Preserve the six flag bytes explicitly. `set_bool_flags` clears all four ordering
  flags, and a fresh block starts with all six zero, so recomputing flags from
  `cmp_l`/`cmp_r` does not preserve every valid state. Preserve the operands too.
- `vm_reset_all` clears queued encounter/NPC/script effects and setup fields. A
  mutation bridge must either retain these pending effects or apply them once
  before constructing the continuation; replaying them after a resume would
  duplicate damage or other host actions. GBBOOT currently synchronizes timers
  and applies queued roster damage before branching on combat status.
- `exec_one` keeps PC at the current opcode and starts operands at PC+1. The
  current owned halt consumes no operand. The mutation yield must validate and
  evaluate the operand without advancing the committed PC, carrying both that
  failure PC and the checked successor. The response must be tied to the same
  active block and input state before activation.

The next native change must therefore include explicit continuation state and
combined candidate validation, not merely change status 4 into a combat yield.
No current kernel callback changes RNG; contextual applied effect 7 still rejects.

The last native build measures CCECL at **63,491 resident bytes**, GBBOOT at
**64,503** and CCINV at **21,802** (`build/native-removal-kernel-build.log`).
Against the 65,280-byte build guard this leaves 1,789 bytes in CCECL and only
777 in GBBOOT. Keep all-owner staging and packet validation in the helper;
GBBOOT's bridge must remain small or reclaim measured resident space. Emitted
.COM size alone understates resident usage. CCECL's old stack comment quoting
65,189 bytes is historical and is not the current measurement.

## Native combined candidate — 2026-09-08

`e35ecd0` adds CCINV's `M inventory request response` mode. It checks a distinct
GBMR packet plus GBMC continuation frame, validates the original GBIV digest and
owner order, then stages every owner through the native removal kernel. Complete
response bytes match the combined reference across 128 DOS cases; the focused
wrapper/reference suite passes 50 tests in 9.85 seconds. Created owners, supported
ability callbacks, late rejection, stale input and existing-file preservation are
included. The full engine build passes; CCINV uses 32279 resident bytes.

The staging layout is refined from the earlier plan: each completed owner may be
compacted into the unpublished output while later owners are processed. Owners
cannot reference each other's working nodes, and any later failure discards that
entire output. Only the completed combined candidate is renamed to the requested
response path. Stable indices remain intact during every owner's nested callbacks.

The request/response format and validation limits are specified in
`cok-mutation-packet.md`. This completes the native combined staging helper, not
live activation. The checked VM yield/frame, response activation, exactly-once
queued effects and cold-checkpoint round trip remain the next required work.

## Effect-7 target provenance and output ownership — 2026-09-08

Task 1 of the dated handoff asked who supplies effect 7's damage target and who
consumes each output, and required independently checked, dynamically verified
production-context evidence rather than a synthetic clear-map result alone.
`tools/test_cok_effect7_target_provenance.py` (21 tests) executes original
`14F24h` directly (not through the item-removal `destroy()` callback that the
existing 339 effect-context tests already cover) and answers both halves.

**Supplier, confirmed dynamically.** `14F24h`'s mode-4 dispatch reaches
`db:34` (file `034527h`) then `0342FDh` then `E6:A2` (file `0389EDh`).
Disassembling `E6:A2` shows it does `les di, ptr [bp+0xc]`, reads
`es:[di+0xe3]`/`es:[di+0xe5]` (the 227/229 effects-list head, matching
`Machine.__init__`'s own `body[227:231] = pointer(effects[0]...)`), walks
9-byte records with the link at offset+5, and compares each record's id byte
against its own `[bp+0xa]` byte argument. `[bp+0xc]` is `14F24h`'s own second
far-pointer stack argument, forwarded unchanged through the whole chain. This
static reading was **not** dynamically confirmed before this session; doing so
surfaced that part of an earlier hypothesis was wrong. Sweeping the synthetic
combat context's target field (`cok_effect7_oracle.CONTEXT_BASE+10`) and the
"active/selected character" global at `DS:609A` across every combination that
disagrees with the second argument (14 parametrized cases) leaves the outcome
unchanged in every case: only the second argument decides whether the
replacement draw fires. The effect record's own applied byte (offset+4) also
does not gate this attack path — contrary to the item-removal callback, where
it does (`test_cok_effect7_context.py`'s
`test_callback_global_effects_do_not_hide_body_or_list_differences`) — only the
record's id byte matters, and items are not required at all (an effects-only
struct with no items list still triggers the draw).

**Consumer, confirmed dynamically.** `14F24h` computes and scales damage into
`DS:56B30` but never writes the HP field (offset `0x197`, confirmed by
disassembling the routine immediately after `E6:A2` at file `038a7dh`, which
reads the same struct's HP byte as `es:[di+0x197]`) on either candidate struct,
in the firing or non-firing case. `14F24h` is therefore not the consumer of its
own output; its own caller (not yet located by address) is.

Every claim above carries an explicit contrasting case that would fail if the
implementation used a different argument or dropped a guard: swapping which
physical address (`BODY_BASE` vs `BODY_BASE+512`) holds the qualifying struct,
or which effect id is present, flips the expected RNG draw count (checked
exactly against the documented `state*08088405h+1 mod 2^32` recurrence, not
just against a second measurement). Both were mutation-tested in-session: the
provenance tests were re-run against an argument-order swap (18 of 21 tests
went red) and the HP-consumption test was re-run against a field known to be
written when the effect fires (both parametrized cases went red), then both
mutations were reverted and the suite re-confirmed green (21 passed in 0.75s).

One byte field on the target struct at offset 396 (0x18C) is observed written
twice with the same value only when the effect fires; its producing
instruction was not located in the time available and is disclosed here
unidentified rather than silently omitted. This does not affect the provenance
or HP-non-consumption findings, which do not depend on it.

`tools/test_cok_effect7_target_provenance.py` passes **21 tests** (`python -m
pytest tools/test_cok_effect7_target_provenance.py -q`, 0.75s). The full
`tools/` suite with `GB_NATIVE_FLOW_GATE=1` set passes **5199 of 5201** (2
known pre-existing inherited browser-audit failures, unchanged counts: 757 vs
754 unconsumed exports, 1655 vs 1662 barrel surface — both already recorded in
the dated handoff and unrelated to this work). No native source was built or
changed this session; this is oracle-level standing evidence at the same level
as the existing 339+25 tests, not a native engine change, so no flow sweep was
required.

## 14F24h's caller and consumer, located and confirmed dynamically — 2026-09-08 (continuation)

The previous section's open item — "its own caller (not yet located by
address) is [the consumer]" — is closed. Static disassembly plus dynamic
Unicorn execution (`tools/test_cok_effect7_damage_consumer.py`, 9 tests)
locate the full chain from `14F24h`'s `DS:56B30` output to the actual HP
write, and confirm every link by running it, not by reading it.

**The chain, by file offset:**

- `0167AFh` (external stub `88:5Ch`, an attack-resolution entry point) near-
  calls `0162E3h`.
- `0162E3h` near-calls `14F24h` at file `0165F7h`
  (`mov al,[bp-0x15]; push ax; push cs; call 0x14f24`), then, after `14F24h`
  returns, checks the target's own active flag `es:[di+0x189]` at
  `0165FDh`, and when active calls `0150A8h` at file `016621h`, pushing (in
  the callee's `[bp+N]` numbering) the mode word `1`, `DS:56B30` **twice**,
  a message sub-type byte, and two far pointers — the target struct at
  `[bp+0xe]`/`[bp+0x10]`, a second struct (the other combat participant) at
  `[bp+0x12]`/`[bp+0x14]`.

  **CORRECTED 2026-09-09** — this bullet used to say "checks the attacker's
  own active flag". Re-disassembled and re-derived independently of that
  claim (not taken on trust): the instructions at 0165FAh-0165FDh are
  `les di, ptr [bp+0x10]; cmp byte ptr es:[di+0x189],0`, i.e. `di` is
  reloaded from `[bp+0x10]` immediately before the flag test. `[bp+0x10]`
  is the SAME local that a few lines later is pushed to `0150A8h` as the
  target struct pointer (see `[bp+0xe]`/`[bp+0x10]` above), not the
  attacker's. So this gates whether `0150A8h`/`E6:0xA7` fire on whether the
  TARGET is still active — the sensible reading, since gating a hit on the
  attacker's own liveness would make no sense — not on the attacker's. The
  matching correction already lives in
  `tools/test_cok_effect7_damage_consumer.py`'s header comment; this bullet
  had not been updated to agree with it until now.
- `0150A8h` is a shared, multi-mode "compose combat message" dispatcher.
  Every mode branch converges on the same final call at file `015229h`:
  `push [bp+0x10]; push [bp+0xe]; mov al,[bp+0xa]; push ax; lcall 0xe6,0xa7`
  — the target far pointer plus **one** of the two pushed `DS:56B30` copies
  (`[bp+0xa]`; the other copy at `[bp+8]` feeds an unrelated `lcall 0xe6,0x52`
  message-formatting call earlier in the same function and is not consulted
  for the HP write).
- `E6:0xA7` = file `038A7Dh` (overlay `0xE6`, procedure index 27) is the
  **HP-write consumer**. Disassembled in full: it reads the target's HP byte
  at `es:[di+0x197]`, compares it to the pushed damage byte, computes either
  the overkill amount (`hp < damage`, `jb 0x38ab0`) or the remaining hp
  (`hp >= damage`), sets a status byte at `es:[di+0x188]` (4 exact-lethal, 5
  partial-overkill, 6 overkill — the 5/6 boundary is overkill amount `<= 9`
  vs `> 9`, confirmed dynamically below), clears the active flag
  `es:[di+0x189]` via a shared subroutine at `a46:d79` on any lethal branch,
  and finally writes the clamped byte back to `es:[di+0x197]` — either the
  computed remaining hp (non-lethal, file `038b70h`) or a literal `0`
  (lethal, file `038b3fh`).

**Confirmed dynamically, not just read:**

1. `E6:0xA7`'s own boundary logic, called directly with disagreeing
   `(damage, hp0)` pairs on a synthetic struct: partial damage (12, 50) ->
   `(hp=38, status=0, active=1)`; exact-lethal (50, 50) -> `(0, 4, 0)`;
   overkill-amount-9 (59, 50) -> `(0, 5, 0)`; overkill-amount-10 (60, 50) ->
   `(0, 6, 0)`; zero-damage no-op (0, 50) -> `(50, 0, 1)` unchanged. The 9-vs-10
   pair is a deliberate boundary null: either value alone would not rule out
   an off-by-one in the status threshold.
2. `0150A8` forwards the pushed damage byte to `E6:0xA7`'s HP write
   unmodified: driving the real `0150A8` entry point with damage=12 on
   hp0=50 produces the identical `(38, 0, 1)` result as calling `E6:0xA7`
   directly, after wiring a scratch combat sub-struct at struct offset
   `0x183` (387) for both participants (the existing provenance module's
   `wire_attack_overlays()` zeroes that pointer for both slots, since its
   own coverage never calls `0150A8`; this module wires it back for its own
   connectivity test only).
3. **The full supplier-to-consumer loop, end to end.** `14F24h`'s real
   computed damage (from `call_14f24`, the existing provenance module's own
   supplier evidence) fed directly into `E6:0xA7` on the same machine state
   produces exactly `50 - damage` for both the firing and non-firing case
   and both physical slot orientations (`real_in_slot0` parametrized both
   ways, matching the existing provenance tests' own style) — the
   definitive proof that this is the real consumer, not merely a
   plausible-looking write site elsewhere in the overlay.
4. **Mutation control.** Corrupting the disp16 low byte of `E6:0xA7`'s final
   write instruction (file `038b73h`: `26 88 85 97 01` -> `26 88 85 00 01`,
   redirecting the write from struct offset `0x197` to `0x100` while
   preserving the instruction's length and decode) makes the HP-write pin
   observably fail: the real HP field is left at its unmodified starting
   value (50, not the correct 38) while the clamped byte lands at the
   redirected offset instead. Reverting to the real, hash-validated overlay
   bytes restores the correct `(38, 0, 1)` result. (An earlier attempt
   mutated the adjacent ModRM byte at `038b72h` instead of the disp16 byte;
   that shortens the instruction from 5 to 3 bytes and desyncs every
   following opcode into unrelated data, crashing far from the write site
   with an unrelated "unmapped instruction" fault at file offset `00026h` —
   a real failure, but the wrong one to keep, since it does not isolate the
   HP-write pin specifically. `tools/test_cok_effect7_damage_consumer.py`'s
   docstring records this to save the next reader the same detour.)

**Disclosed, unexplored side-path.** Overlay `0xDB`'s file `0340F2h` contains
a hard-coded `mov byte ptr es:[di+0x197], 0` — a second, unrelated HP-zeroing
write site reached by some other, not-yet-traced caller. It is not on the
`14F24h` -> `0150A8h` -> `E6:0xA7` chain this section verifies (that chain's
own zero-write for the lethal case is at file `038b3fh`, inside `E6:0xA7`
itself) and is not required by this task's scope. Recorded here, unidentified
rather than silently omitted, matching this document's own offset-396
disclosure above.

**What this does and does not change.** This closes the open item both this
document and `cok-mutation-output-ownership.md`'s "What remains before this
is native" item 1 named. It is still pure RE/investigation plus standing
oracle-level evidence: no native (`.asm`) source changed, no mutation
callback is authorized (`AUTHORIZED_OUTPUT_CALLBACKS` remains the empty
`frozenset()`), and no flow sweep was required. `tools/test_cok_effect7_damage_consumer.py`
passes **9 tests** (`python -m pytest tools/test_cok_effect7_damage_consumer.py -q`).
The full `tools/` suite with `GB_NATIVE_FLOW_GATE=1` set passes **5231 of
5233** (the same 2 pre-existing, unrelated inherited browser-audit failures
as the previous section, now at updated counts — 757 vs 754 unconsumed
exports, 1655 vs 1662 barrel surface — both already tracked outside this
document's scope and untouched by this session).

## Queue-vs-direct: does anything stage effect 7's damage before the HP write? — 2026-09-09 (continuation)

The prior section closed "which caller writes the HP field" but left one
half of `cok-mutation-output-ownership.md`'s "What remains before this is
native" open in its own exact words: "locate a DAMAGE-queue-append contract
(or confirm none exists and design around direct HP writes) before extending
`cokyield.inc`/`cokrequest.inc` for a GBMR v3 branch." This section answers
that, both statically and dynamically, and adds
`tools/test_cok_effect7_damage_queue.py` (6 tests) as standing evidence.

**Answer: no queue. Direct scalar read-and-forward only, on the
original-binary side.**

1. **Static.** The complete 42-byte instruction span between `call 0x14f24`
   returning (file `0165FAh`) and `call 0x150a8` being reached (`016621h`,
   ending `016624h`) is pinned byte-for-byte and exhaustively accounted for
   by instruction length (17 instructions, lengths summing to exactly 42
   with no remainder — `CALLER_GLUE_BYTES`/`CALLER_GLUE_INSTRUCTION_LENGTHS`
   in the new test file). It contains one `les`, one flag compare with a
   conditional skip, and eight `push`-family instructions — two of which are
   `mov al,[0x6b30]` (absolute `DS:0x56B30`, the exact scalar `14F24h` just
   computed) immediately followed by `push ax`. There is no write
   instruction anywhere in the span, no call to anything other than
   `0150A8h` itself, and no loop — i.e. no room for an append, an index
   increment, or a watermark check. This is a direct scalar load-and-forward,
   not an indexed array/queue access (which would need an extra index
   register load and a non-constant effective address, neither present).
2. **Dynamic.** Running the real `0150A8h -> E6:0xA7` chain three times in a
   row on the same machine, identical target/other/damage, touches the
   byte-for-byte **identical** set of ~4967 memory addresses every time
   (`test_no_growing_state_across_repeated_calls`, both slot orientations),
   while the target's HP keeps decreasing cumulatively across the three
   calls — a real, repeatable effect with no advancing/growing state
   anywhere an append-based queue would need one (its write pointer would
   have to move to a new slot on the second and third call; it does not).
   Restricting the same trace to each combat participant's own 512-byte
   struct shows the **only** byte either struct has written to it during
   this whole chain is the documented HP field
   (`test_within_struct_writes_are_only_the_documented_hp_field`) — no
   "pending damage" byte lands anywhere else on either struct.
3. **Falsifiability control.** `test_write_set_equality_is_sensitive_to_real_code_path_differences`
   proves the identical-write-set check above is not vacuously true: a
   1-digit vs. 2-digit damage value (6 vs. 40) measurably changes the
   transient stack scratch the "compose combat message" text formatting
   uses, so the two write-sets genuinely differ when the code path genuinely
   differs — the equality assertion in step 2 could have failed, and does,
   under a real input difference.

`python -m pytest tools/test_cok_effect7_damage_queue.py -q` -> **6 passed**.
Combined with the two existing effect-7 files:
`python -m pytest tools/test_cok_effect7_target_provenance.py tools/test_cok_effect7_damage_consumer.py tools/test_cok_effect7_damage_queue.py -q`
-> **36 passed** (30 without the new file — no regression, purely additive).

**A second, genuinely append-based DAMAGE queue exists in this codebase —
but it is a different, unrelated, native-only subsystem, and this is the
finding that resolves the ambiguity in `cok-mutation-output-ownership.md`'s
earlier text.** `native/src/ccecl.asm`'s `op_damage` handler (ECL script
opcode `0x2E`, confirmed real/derived per
`docs/engine/research/decompilation-sources.md:72`, not invented) appends a
20-byte record into the `fx_script_events` array, capacity `SCRIPTCAP`, only
when `fx_script_count < SCRIPTCAP` — genuinely append-based, with its own
resume/acknowledgment watermark protocol (`native/src/cokresume.inc`
~lines 246-258, zeroing already-acknowledged `002Eh`-tagged entries' argument
count on resume). `native/src/gbboot.asm`'s `apply_effect_damage_roster` /
`apply_damage_value_to_roster` drains it entirely via DOS file I/O against an
exported `GBEF`/`GBPR` file pair, computing `count*sides+bonus` and clamping
a roster HP byte to zero. **This queue is populated only by the ECL VM's own
opcode dispatch and drained only by GBBOOT's own file I/O — it has no code
path connecting it to `14F24h`/`0162E3h`/`0150A8h`/`E6:0xA7`**, which live
entirely inside the original CoK executable's overlay code and never read or
write `fx_script_events`, any GBEF script-event field, or any GBMB field.
It is also not a semantic drop-in even where it is native: its own consumer
does not reproduce `E6:0xA7`'s status-byte (4/5/6 death-transition
classification) or active-flag-clear behavior — it only clamps HP.

**What this implies for GBMR v3.** Because there is no queue to append to on
the original-binary side, a native effect-7 callback's output has to
synchronize with the direct `E6:0xA7` write site itself (or a host-side
reimplementation of its exact `clamp(hp-damage,0)` + status/active-transition
logic), not with any append/watermark abstraction — and specifically not
with the ECL-DAMAGE `fx_script_events` queue, which is architecturally
unreachable from this callback's trigger path. See
`cok-mutation-output-ownership.md`'s updated "Why damage is not written
here" section (2026-09-09) for the full design consequence and the two
concrete hook-point options it leaves open for the next round.

No native (`.asm`) source changed this round; `AUTHORIZED_OUTPUT_CALLBACKS`
remains the empty `frozenset()`.

**Startup-trace boundary correction — 2026-09-26.** The generic
`tools/unicorn_cok_midi.py` full-START route is not valid evidence for the
production startup state at `0xAEC9`. With its calibrated setup keys
(`2,2,2`), an exact write watch shows resident helper `1A46:0B76` copying
prompt bytes `5D 20 4A 4F` (`"] JO"` from `[1] JOYSTICK`) over the active
return frame at `SS:SP=2491:FFEF`. The following `RETF 4` therefore transfers
to `4F4A:205D`, where memory is zero-filled. This explains the apparent jump
without invoking a missing overlay copy and retracts the MIDI note's earlier
overlay-loading hypothesis. The cause of the overlapping destination in that
harness run remains unresolved; do not use it to infer retail `SS`,
`DS:6DA2` contents, or native producer behavior. Continue the effect-7 task
through the composed EXEPACK/startup analysis above, keeping synthetic BIOS
responses clearly labeled.

**Composed-startup INT 3F correction — 2026-09-26.** The generic harness's registered
software-interrupt dispatch also had an invalid saved frame: `_on_intr` pushed FLAGS, CS, IP,
although `IRET` consumes IP, CS, FLAGS. That sent execution into prompt literal bytes. It now
saves the real-mode frame in IRET order and clears IF/TF while the handler runs; the focused
Unicorn round-trip regression checks the exact frame, return address, restored stack and flags.
With this correction, a composed `START.EXE` image (complete EXEPACK prefix plus all 621
relocations, load segment `0x1000`, entry `1000:003F`, initial stack `2491:4000`) runs 40 million
instructions without exhausting its synthetic `2,2,2` plus 40-Enter key script. It opens
`MIDI.DAX`, `SOUND.DAX`, `TITLE.DAX`, and later `BIGPIC2.DAX`. TITLE seeks at file offsets 38,
9,754, 35,974, and 45,723 match the starts of all four compressed blocks. It reads the final
TITLE byte at offset 57,527 before opening `BIGPIC2.DAX` at instruction 36,359,907. The 40M cap
is in its VGA renderer (`ES=0xA000`, live code writes `ES:[DI]`). Only one scripted key was
consumed (`AX=0x0002` at instruction 676,012); the remaining 42 key entries were not requested.
The block-3 offline decode is 10,577 bytes with SHA-256
`145b95153c90a395f0aa525a39a0809ecd2e973fbcba8ef724f4f99e080c6499`. The expected raw block
was not found in the full 1.1MB emulator memory snapshot at the cap, so the renderer's exact
input/output buffer relation remains unproved. TITLE input reaches EOF and execution proceeds to
BIGPIC2, but no pixel parity claim follows from that alone. A 60M run opens `DUNGCOM.DAX` and
`RANDCOM.DAX`, reads additional GAME.OVR chunks into `3255`, `3640`, and `37F7`, and executes
at `37F7:0D20`; only the first synthetic key (`AX=0x0002`) is consumed. The `INT 3F` return
at `10E6:0045` maps to composed START image offset `0xEA3`, where `CD 3F 20 0D 00` supplies
procedure offset `0x0D20`. The following GAME.OVR read at `0x365A6` has length `0x37B4`, matching
descriptor 24; `0x365A6 + 0x0D20 = 0x372C6`, whose source disassembly begins `push bp; mov bp,sp`.
The overlay loader reads its `0x1B6`-byte relocation table separately. Descriptor 24's resident
stub-array scan has two candidate starts, and no runtime post-relocation memory snapshot was
captured, so selector geometry and exact relocated-image parity remain unproved.

The cap `127F:29B8` has linear address `0x151A8`, corresponding to START image offset `0x51A8`
at load segment `0x1000`. The static instructions there test `[bp-0x1A]`, optionally copy a byte
to a pointer from `[bp+0x14]`, then merge bytes through `ES:[DI+0x17]`; `CX` is the byte-loop
counter loaded from `[bp-0x10]`. The preceding code initializes the optional-copy flag from
argument bit `0x04` at `[bp+0x0C]`. The saved log does not capture BP, CX, ES:DI, or arguments at
the cap, so live values and the conditional branch are unknown. There is no later INT 16h
request in this run after its first synthetic key, but this alone does not prove a menu/input
transition. Neither run establishes production `SS`, `DS:6DA2`, or an effect-7 producer. Next
capture the cap state and the title renderer destination at a block boundary, then compare it
with the offline decode after applying the retail display layout. Keep the effect-7 producer
inputs unresolved until source/runtime evidence reaches them; do not launch DOSBox or host input.
