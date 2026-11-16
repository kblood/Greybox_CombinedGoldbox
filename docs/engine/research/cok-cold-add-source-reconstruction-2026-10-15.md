# CoK cold Add: original-source reconstruction

Date: 2026-10-15. Static source interpretation of the accepted cold Add endpoint; no new execution, instruction decoding or runtime read-count claim.

## Authority

Original decoded rows are the accepted WORLD union `build/cok-recomp/world-after-cold-bootstrap-sol-20261015-a-v3/luna-source-controls-luna-v3-20261015-a/checkout-one/build/generated/manifest.json`. Module47 is overlay descriptor009E, file offset120539; module39 is descriptor00F7, file offset237328. All4584 persisted instruction rows for these two modules were compared byte-for-byte with the original GAME.OVR at their recorded source offsets: no mismatch. This was a read-only comparison, not regeneration or execution. Existing `build/rea/rea-add-files-20261015-a/character-files` dossiers provide navigation only; original coordinates below do not use relocated Ghidra target names.

## WHO and sidecar reconstruction

The original reader is009E:11E5. At1291..129D it clears a0199-byte destination; at12AF..12BE it supplies that destination and requested0199 bytes to original resident0A46:14B4. The subsequent close is at12C9. These are original requested sizes, not observed DOS return counts for the accepted run.

Afterward, `12D3/12D8` clear character `+143/+145`; `12E2/12E7` clear
`+E3/+E5`; and `12F1/12F6` clear `+183/+185`. At `12FE..1305` the reader
also zeros the new character's party next-link pair `+17F/+181`. Serialized
pointers are deliberately discarded before the sidecar lists are rebuilt, and
the incoming party node begins with a null next link.

Original overlay009E:11E0 contains Pascal bytes `04 2e 73 66 78` (".sfx"). Reader1497/149C and14D9/14DE use that literal while constructing/testing/opening the sidecar name. The SFX branch is therefore source-bound, not inferred from endpoint pointer content. At14AD..14B1 it requests a9-byte temporary allocation. At1507..1511 it requests a9-byte record read into that temporary buffer;1516 compares the returned local count with9 and bypasses record insertion if unequal.

On a full record,1523..152D tests characterE3/E5. If null,152F..1533 requests a9-byte allocation and153B (`268985e300`) /1540 (`268995e500`) writes returnedAX/DX intoE3/E5. Otherwise1560 allocates the next node and1569/156D links it at previous-node+5/+7. At1585..1595 the original routine copies9 bytes from the temporary record to the current linked node. At15A0/15A4 it clears that node's next pointer. The read loop continues while the local return count equals9;15B8 closes and15C9 frees the temporary allocation.

This establishes the static role ofE3/E5 as the rebuilt9-byte SFX-list head on this reader path. It explains why the serialized pointer is not retained. The observed5B4C:0000 head and matching nine bytes are consistent with the source reconstruction; no static source inspection determines the run's allocation address or proves its exact sequence of DOS callbacks. The nearby .stf literal is at11DB and its separate branch uses3F-byte records and different linkage; E3/E5 should not be labelled the STF head.

## D6 change

Reader15E4 has original bytes `9a2500f700`: public00F7:0025 resolves through the original descriptor table toF7:0433. This routine resets character59, then loops an index0..7 (0441 initial zero,0447 increment,04F1..04F7 termination). It reads characterF9+index into localBP-4 at044A..0458. At049C it readsD6,04A1 compares against that local byte, and signedJGE04A4 skips the update ifD6 is already at least as large. Otherwise04AC (`268885d600`) stores the local byte intoD6.

The precise local rule is a running signed-byte maximum of existingD6 and the eightF9..100 bytes; it is not an unconditional increment. The accepted endpoint'sF9..100 bytes are `01 00 00 00 00 00 00 00`, with serializedD6=0 and finalD6=1. Those values satisfy this original update rule. This supports an original recomputation explanation without assigning an unverified game-field name toD6. Source order places this recomputation at the end of reader11E5, before its return; dynamic callback/path capture remains separate evidence.

## Slot and insertion

Original insertion root `009E:1989` first writes `FF` to character `+137` at
`1992`. If the head at `609A/609C` is null, it installs the argument there at
`19A7/19AA` and leaves the new node's `+17F/+181` link untouched. Otherwise it
walks to the zero-link tail and appends through `+17F/+181` at `19EA/19EF`,
again leaving the incoming node's link untouched.

The retained caller dossier
`build/rea/rea-add-files-20261015-a/add/add-function.json` resolves the pointer
handoff. `cok_add_root` stores the allocator's AX:DX at `[BP-14]`/`[BP-12]`
(Ghidra `33867`/`3386A`), pushes that same pair for reader call `00A4:3892`
(`33886`/`33889`), then pushes it again for insertion call `00A4:3A0F`
(`33A09`/`33A0C`). The retained caller listing has no intervening write to
either local. Reader `9E:11E5` reads its far character pointer from `[BP+0A]`
and zeros `+17F/+181` at `12FE..1305`; insertion `9E:1989` reads the supplied
far pointer at `[BP+6/+8]`. The retained caller and callee listings therefore
establish that the same character pointer is zero-linked and then passed for
insertion. If execution reaches both calls, that null pair terminates party
traversal in either branch; the slot-mark traversal advances through
`+17F/+181` at `1A4F..1A5F`. This static REA control/data flow does not prove
the calls execute in a live cold-Add run or establish runtime acceptance.
Reader `RETF 0C` matches its six caller-pushed words; insertion `RETF 4`
matches its far-pointer argument. The insertion routine updates current
character `6096/6098` at `19FA/19FD`. It clears an eight-byte local used-slot
array, traverses the party, and tests each `+137` value against the original
32-byte bitset at `009E:1969` (`FF` followed by 31 zero bytes), marking
represented slots. At `1A6E` (`26c685370100`) it writes zero to current
character `+137`; `1A77..1A99` increments while the slot is below eight and
occupied. At `1A9F` (`26ff857c06`) it increments party structure `+67C`.

Thus137 is assigned by first-free-slot insertion rather than restored unchanged fromWHO. In the observed singleton case, the newly inserted node startsFF and slot0 is available, consistent with final137=0 and party count1. Add's original calls include00A4:3892 to public009E:0039 (reader11E5) and00A4:3A0F to public009E:0052 (insertion1989). The retained caller dossier establishes static pointer continuity across these calls; it does not substitute for a dynamic call trace.

## Remaining observation

The source now explains the pointer reconstruction, conditionalD6 update and slot reassignment without inventing executable behavior. The accepted RAM snapshot corroborates their resulting values. The planned optional DOS companion is still required for exact paths, open/read/close ordering, actual requested/returned counts, EOF and transfer digests. No additional REA recovery is necessary for these local assignments; broader semantic naming or a complete dynamic path claim requires separate evidence. View and WORLD gameplay remain unaccepted.
