# After creation: persistence, campaign execution and combat

2026-10-15, Astra read-only planning. Creation root admission remains next after
helper acceptance: expected delta2774 instructions/7416 bytes, expected total
32845/84012. This document does not authorize those bytes or replace that task.
Durable host saves remain the parallel zero-guest-byte lane.

## Evidence used

Reviewed the accepted runtime's Borland `startup_catalog`, held GAME.OVR bytes,
REA save/load dossiers, and original-loader research Tasks198..200. Direct
Capstone decoding followed each selected procedure's local branches and call
fallthrough, recording callees without traversing them. It did not run the
application or mutate the scanner/runtime. Counts below are local decoded bodies,
not dependency-closure sizes or new-byte admission budgets. No listed local
body encountered an interrupt or computed transfer; their callees still can.

Catalog coordinate conversion: descriptor9E body base1D6DBh,4E base8A41h,
3E base096Ch. Public stub offset is20h+5*index; its body target comes from the
original descriptor procedure table. In particular,9E indices8/9 bind load/save,
4E indices3/4 bind header/load, and3E index1 binds campaign entry3C28.
Every root below begins original `55 89 E5`; this corroborates the entry, not
its semantic name or exhaustive runtime coverage.

## Task A: paired world persistence and character restoration

| Root | GAME.OVR offset | Local rows/bytes | Role established by original calls and prior REA |
| --- | --- | --- | --- |
| 9E:1B34 | 1F20F | 563/1492 | World load |
| 9E:22DE | 1F9B9 | 534/1337 | World save |
| 9E:0A80 | 1E15B | 63/157 | Filename/sidecar cleanup helper |
| 9E:11E5 | 1E8C0 | 374/1034 | Load-side allocation and record reconstruction dependency |
| 9E:1989 | 1F064 | 98/311 | Load-side fixup/copy dependency |
| 9E:2108 | 1F7E3 | 64/207 | Save-side leaf dependency |

The two main body counts exactly reproduce the prior REA observations, but
original decoding identifies26/22 unique direct callees versus REA's23/21.
Use original call operands as the dependency list. Load calls0A46:14B4,
9E:0555/0817/0A80/11E5/1989, allocation023F, string helpers, resource wrappers
0614:045C and069C:02A7/04C1/050B/05DA, and overlay105:07ED/10B:1025/130D.
Save calls0A46:139B/13D2/144A/14BB,9E:0555/0A80/0BED/2108,09C4:00DE,
0521:0353/096C, E6:11C7 and menu/error helpers. Many are shared with creation;
subtract the final accepted tuples rather than charging them again.

Inventory the paired closure against the accepted complete-creation baseline.
Partition at whole helpers if its new physical bytes exceed32768. Recover
11E5/1989's pointer/list reconstruction before asserting a cold character load;
do not infer it from the save record's raw pointer fields. Preserve original
SAVGAM/CHRDAT naming and original linked-list iteration. The inferred5469-byte
world payload remains conditional on actual record-size initialization and a
runtime round trip; it is not a replacement schema.

Acceptance combines the durable-host implementation with original guest save,
process exit, fresh original guest load and a subsequent state-changing action.
Check location, flags, party order, character inventory/spells and allocation
cleanup. Exercise short/error writes and truncated/missing files through the
original DS:43AC/8A58 error paths. Completion is paired restoration, not a file
appearing on disk.

## Task B: campaign entry, ECL execution and area transitions as one closure

| Root | GAME.OVR offset | Local rows/bytes |
| --- | --- | --- |
| 3E:3C28 campaign/demo entry | 4594 | 236/776 |
| 4E:0361 ECL resource load | 8DA2 | 92/214 |
| 4E:01E8 header initialization | 8C29 | 131/346 |
| 3E:3ADD event loop | 4449 | 38/106 |
| 3E:386D opcode dispatcher | 41D9 | 293/624 |
| 92:0E77 campaign-entry dependency | 1A13C | 346/816 |
| 92:09EC campaign-entry dependency | 19CB1 | 433/1130 |

The original3E:3C28 calls both ECL load/header entries,3ADD,3B47,3403,
92:0E77/09EC,A4:3B0A and shared rendering/menu dependencies. Header01E8 calls
4E:0032/06CC. Resource loader0361 reaches069C:088E plus allocation/free and
resident file operations. Preserve allocation-produced workspace pointers
DS:4B28/4B2C/4B34; older synthetic fixtures that manually supplied them are not
campaign acceptance.

3ADD calls3E:386D and124:093E/024F (OVR4160D/40F1E). The latter two decode
115/249 and817/1771 local rows/bytes and call resident string helpers. Their
precise diagnostic/event roles need caller-state verification.

386D is an original comparison/direct-call dispatch tree with53 unique local
callees; no computed jump table was encountered in that body. Inventory all
branches and callees as a coherent interpreter group. Do not add one handler per
observed prompt or pretend that the public procedure table lists all53 internal
entries. One branch selects3E:191C for opcode24h, joining combat below.

Normal campaign start is ECL1 block36, followed by16. ECL2 block57 is the demo,
with its distinct party/enemy population and eventual COMBAT. Verify both branch
selection and normal campaign state; a working demo does not establish normal
exploration. After event closure, identify the exact native movement/door/area
transition roots through its original call graph and dispatcher handlers before
admitting them. `decompile-ovr015-movement.md` explicitly says its CoK byte
confirmation is pending; CoAB names/sub_43813/sub_438DF are not approved CoK
addresses. Keep the deliverable one complete movement/event/transition loop,
partitioning only its helper admission. Gate with collision, turn, door, NEWECL,
choice/one-shot flags and save/reload across an area change.

## Task C: full encounter lifecycle, then complete turn dependencies

| Root | GAME.OVR offset | Local rows/bytes |
| --- | --- | --- |
| 3E:191C COMBAT handler | 2288 | 223/845 |
| 44:0EA9 direct combat dependency | 5FDE | 241/561 |
| 47:1968 direct combat dependency | 7C66 | 166/483 |
| 4A:07DA direct combat dependency | 873C | 262/614 |
| 58:0172 direct combat dependency | AEC9 | 101/302 |

Tasks199/200 observed selector24h enter the original3E:191C code through the
loader and then open DUNGCOM.DAX/RANDCOM.DAX. Their runtime3EE3 segment is an
allocation observation; use original descriptor3E for source identity. Those
traces ended before a combat turn and are not existing combat acceptance.

191C directly calls the four roots above,4E:04A9,88:1E96,96:0005 and several
descriptor cleanup entries at0000. Verify each table entry and its real bytes;
zero body offset is not permission to replace a cleanup call with a no-op.
44:0EA9 and4A:07DA share4E:1885,A8:0D74/3334 andB3:0511/063A/0D01/0FB1/1929.
47:1968 has its own local0574/0B23/118C/1493/1618/185F helpers plus freeing
and rendering.58:0172 calls58:004B/02A0/040B/0B6D,5E:1C58,DB:057C/2375 and
E6:268A. These are concrete first closure seeds; detailed tactical roles need
original data-flow verification rather than borrowed symbol names.

Admit shared encounter setup/cleanup helpers first, then full round/turn
control and attack/AI/spell dependencies in complete-procedure batches. Keep
one encounter-lifecycle acceptance target: resource load, player/monster turns,
movement/targeting, damage/death, victory or defeat/flee and return to campaign.
The old monster-AI string anchors atC564/D821/B2A6 locate neighborhoods, not
verified function identities; do not seed CoAB sub_3504B as a CoK address.

## Shared service and closure rules

Preserve existing dynamic contracts at0661:0355 and0A46:03B7/03C3/0601/07FB/088C:
live owner/generation, exact targets, source bytes and file-record bounds remain
mandatory. The selected local bodies above expose no additional computed site;
that does not certify their transitive closures. Every newly reached indirect
site needs original table/state provenance before its containing helper admits.

Known pending host services include AH06, process termination AH4C and exceptional
INT23. Exact FindFirst currently excludes wildcards/FindNext; implement those
only when the next original path proves its actual requested pattern/state.
DOS36/39/41 and file read/write must retain guest-helper and disk-failure tests.
BIOS keyboard/video/timer, graphics device, mouse or sound requests reached by
campaign/combat need explicit existing-handler checks; admitted interrupt bytes
do not establish service coverage. Inventory ports and service arguments, not
only interrupt numbers.

Reuse and parameterize the existing closure traversal with original descriptor
procedure roots plus discovered near-call entries. Maintain original byte and
relocation identities, shared physical-byte dedup, local body returns, explicit
deferred edges, and <=32KiB new-byte batches. Public procedure tables are seed
directories, not blanket code/data classification. No whole-binary coverage
percentage is justified by current evidence.
