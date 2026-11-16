# DQK enemy NPC combat route audit

Date: 2026-09-25.

## Result

The first apparent natural NPC-combat candidate was a record-ID/member-index mix-up.
DQK ECL `LOAD_MONSTER` operands are logical IDs resolved through `MONCHA.GLB`'s
member-0 ID table. A direct parse of the held retail table gives:

| ECL ID | HLIB member | Record | `isMonster` at `+0x66` |
|---:|---:|---|---:|
| 68 | 68 | GNOME WARRIOR | 0 |
| 91 | 87 | ENCHANTED AURAK | 1 |
| 92 | 88 | GREATER DISIR | 1 |
| 93 | 89 | DISIR | 1 |
| 94 | 90 | MINOTAUR CHAMP | 1 |
| 112 | 91 | CAPTAIN DAENOR | 0 |
| 113 | 92 | GRUNSCHKA | 0 |
| 114 | 93 | SELIAS | 0 |
| 115 | 94 | TASSLEHOFF | 0 |
| 116 | 95 | BALDRIC | 0 |
| 117 | 96 | SIR DISCORE | 0 |
| 118 | 97 | ELGYNORA | 0 |
| 119 | 98 | DAWNSHINE | 0 |

This corrects the misleading inference from `LOAD_MONSTER #93`: the NPC memo's
`m93 SELIAS` names HLIB member 93, while ECL ID 93 resolves to member 89, DISIR.
The other observed matches corroborate the distinction: area 58's `#91` is
ENCHANTED AURAK and area 39's `#94` is MINOTAUR CHAMP. Area 7's `ADD_NPC #117`
through `#119` are recruitment operands for real NPCs, not enemy `LOAD_MONSTER`
records.

## ECL route audit

Area 64 supplies a genuine NPC-framed combat candidate. Its ECL code loads
logical ID 68 at `0x91F4` (15 GNOME WARRIOR records) and reaches `COMBAT` at
`0x91FF`; a second wave at `0x9386` (9 records) reaches `COMBAT` at `0x9391`.
The MONCHA ID table maps ID 68 to member 68 GNOME WARRIOR, whose `isMonster`
byte at `+0x66` is zero. The first wave's script presents ATTACK / WAIT / LEAVE
at `0x912B`; ATTACK reaches the combat setup and `LOAD_MONSTER #68`.

There is a static chain from area 66 to area 64, but it is not the gnome-fight
entry. Area 66's descriptor-3 arm at `0x8933` is present at GEO coordinates
`(4,12)` and `(4,13)` (raw plane-2 byte `0x83`). The cells have south/north wall
type 7 respectively, satisfying the `[0x0032] != 0` facing-wall gate when the
party faces that wall. The arm also requires bit 2 of `[0x009C]` clear; it sets
the bit, writes `1` to `[0x01A2]`, calls `0x9F03`, then executes `NEWECL #64`
at `0x8959`. Area 64's initial entry tests previous area `[0x0016] == 66` and
jumps to `0x84FC`.

The ordinary area-64 entry saves the incoming area from `[0x0016]` at `0x8014`,
then checks it against 66 at `0x801B`. An area-66 return takes `0x84FC` and its
`[0x01A2]` dispatch; the descriptor-3 chain sets `[0x01A2]=1`, so it selects
the spiders scene at `0x8515` and bypasses the gnome opening. The gnome opening
is reached on the other entry path when `[0x019F]==0` at `0x8030` and
`[0x019B]==99` at `0x803B`.

Area 65 has a direct source chain into that opening: after the windship
`LEAP ABOARD` choice (`0xA4EE` / `0xA504`), its continuation reaches
`SAVE #99,[0x019B]` at `0x9527`, then `NEWECL #64` at `0x952D`. A second
`SAVE #99` / `NEWECL #64` pair occurs at `0x9EC2` / `0x9EC8`. The area-64
`[0x019F]` gate is resolved for the documented endgame chain: a CFG-aware
census of every reachable instruction operand across all 47 ECL areas found
only three references to `[0x019F]`: area 64's `COMPARE` at `0x8030`, area
62's `SAVE #1,[0x019F]` at `0xA81F`, and area 64's reset at `0x804A`.
The campaign route recorded in `dqk-ending-ingress.md` enters area 64 from
area 62, where the alternate opening resets the flag; its victory chains to
area 66, and the reachable area-66 / area-67 endgame choices lead to area 65.
Thus on this source-backed route the later area-65 windship return reaches the
ordinary area-64 branch with `[0x019F]==0`. This closes the state-gate question
for that chain, not a live playthrough or the still-open actor-turn behavior.

`[0x00C4]==1` is not a combat gate. At area 64 `0x8F9A`, equality selects the
shorter `"YOU AND "` narration at `0x8F8D`; inequality presents the gnomes'
arrival text. Both paths converge at `0x9007`, continue to the ATTACK / WAIT /
LEAVE menu at `0x912B`, and the ATTACK branch loads 15 ID-68 records at `0x91F4`
before `COMBAT` at `0x91FF`. The second wave likewise loads 9 ID-68 records at
`0x9386` before `COMBAT` at `0x9391`.

Retail DQK copies `0x19E` bytes of each resolved MONCHA record into the combat
roster at `0x42E52` and clears only the link words, preserving `+0x66`. Member
68 has `+0x66=0`; the other queued dragons/draconians have `+0x66=1`. Combat
setup at `0x2D729` reverses facing only for `+0x66==1`. The target predicate
at `0x25D90` compares actor and candidate `+0x66`; equal values take its
rejection path when the allow-same-side argument is zero. Several automatic
selection callers pass zero. The interactive path has a separate ally
confirmation: `0x2784F` checks the candidate's opposite-side value against the
actor and, for same-side candidates with actor `+0x18C==0`, asks `"attack ally?"`
through the string at file `0x684A1`. A rejected answer returns failure; an
accepted answer returns success. Its caller at `0x23A1B` then stores the
selected target and calls attack resolution at `0x26636` from `0x23A63`.
Therefore a party member can deliberately target a loaded GNOME WARRIOR after
confirming friendly fire. This proves targetability as an ally, not as a normal
hostile NPC. The separate caller at `0x27EBF` passes an allow-same-side value
of one, but its broader role is still unidentified.

The turn-dispatch routine at file `0x5ED25` does not inspect `+0x66`. It first
calls the `1D99:0xE69` type gate, which accepts combatant `+0x28` values
`0x27`, `0x28`, and `0x49`. Type `0x49` takes the PC action path, consulting
the `+0xA5` condition fields. Types `0x27`/`0x28` take another action path.
When the gate rejects a record, dispatch instead requires `+0x37 > 0` and
`+0x38 < 0x80`, then sends the `+0x37` priority to queue insertion at
`1D99:0x100D`. The combat audit identifies `+0x37/+0x38` as a timed-effect
duration/type slot, so this condition cannot be read as a generic AI or speed
test. Side and actor scheduling are separate, but this code alone does not
identify the ID-68 branch or prove its queue entry: its post-load
`+0x28/+0x37/+0x38` values still need to be traced. Follow the queued action
into its outgoing target selection before claiming the gnomes can attack either
side. Do not infer NPC attacks from the ally-fire resolver.

The source record is not enough to fill in those scheduler values: decoded
MONCHA member 68 has zeroes at `+0x28`, `+0x37`, and `+0x38`, and the roster
builder copies the `0x19E`-byte record before clearing only link words. The
area-64 ATTACK branch also executes `SETUP_MONSTER #255,#1,#44,#0` at `0x918E`
before loading the gnomes. Its retail handler at `0x43071` writes the current
combatant's `+0x38/+0x37` effect slot through `[0xB20F]`. Whether that pointer
or later combat initialization affects ID-68 nodes is not established. Trace
the pointer identity, the slot's lifetime, and post-load writes before drawing
any conclusion about turns.

The GNOME WARRIOR record does carry a concrete equipped-weapon candidate:
member 68 declares two affects and five item instances; item 0 is base type 9
with `ready=1`. Retail `DISK1/ITEMS.DAT` base item 9 has carry slot 0, weapon
class `0x80`, melee enabled, and damage `2d4` vs Large / `1d6` vs Small-Medium.
This grounds the stored equipment and its retail damage profile, but not that
the gnome receives an actor turn, which size branch the original resolver uses,
or whether this item is the attack source for the area-64 fight. Keep the
native NPC `1d2` placeholder until those consumer links are traced.

The apparent area-66 `LOAD_MONSTER #93` at `0x8728` is not NPC evidence: ID 93
resolves to DISIR. Its following combat tail at `0x8746` is skipped by the
`COMPARE_AND`/`IF_EQ`/`RANDOM`/`IF_NE` path. Area 58's `ENCOUNTER_MENU` route
to ID 91 likewise loads ENCHANTED AURAK, not a named NPC. Other dynamic
`LOAD_MONSTER` ID producers remain in the general scan but are not needed to
establish the area-64 ID-68 candidate.

## Combat data still unproven

The native NPC decoder in `native/src/cccombat.asm` reads stored HP and THAC0,
but currently assigns placeholder AC from the record, damage `1d2`, and XP 0.
The MONCHA audit says the NPC damage bytes at ability-relative `+61/+63/+65`
are placeholders. NPC `+0x54` contains plausible values, including 10,000 for
SELIAS, but its use is unresolved; do not treat it as kill XP without a retail
consumer.

The next bounded work is to trace the ID-68 combatant's post-load scheduler
fields and outgoing target behavior. The confirmed player friendly-fire route
can exercise their target record's HP/AC and damage receipt, but it does not
prove NPC outgoing damage or kill-award semantics. Trace the actor turn and
post-lethal award path before changing the native placeholder fields. The
existing synthetic `DQKNPC` fixture uses IDs 55 and 64 and does not cover
logical ID 68.

This audit used local ECL/MONCHA/GEO source bytes and static instruction scans.
It did not run DOSBox or establish a runtime combat trace.

## Source-route correction — 2026-09-25 static follow-up

The area-65 windship-to-area-64 chain and area-64 branch merge above were
independently checked against the current `ECL.GLB` member bytes. Area 64's
`[0x00C4]` comparison changes only the narration; both arms converge before
the same player menu, ID-68 LOAD_MONSTER, and COMBAT. The former claim that
`[0x00C4]==1` was required to reach combat is withdrawn.
(See the final section, 2026-10-07, which retracts the `[0xB20F]` combatant reading above.)

The area-66 descriptor-3 chain is a separate spiders return route. Its
previous-area test diverts before the ordinary `[0x019B]` gnome-state check, so
it cannot serve as the gnome-route ingress. The area-65 windship route is
grounded separately by the area62→64→66→67→65 story chain: area64 clears
`[0x019F]` on the first alternate opening, and the corpus-wide reachable ECL
writer scan found no later writer before area65 returns to64.

Target selection supports confirmed friendly fire: for a same-side candidate,
the interactive path prompts before its caller reaches the attack resolver.
Automatic targeting still filters equal `+0x66`; the separate callsite that
passes an allow-same-side value remains unidentified. The combat-turn behavior
of the 15 loaded gnomes and their outgoing damage/award path remain open.

## Resolution of the `[0xB20F]` / `+0x37/+0x38` question - 2026-10-07 (static, capstone only)

Method: capstone 16-bit sweeps of `The Dark Queen of Krynn/DQK.EXE` plus
`tools/disasm_dqk.py --disasm/--thunk`. No Unicorn run, no DOSBox. Everything
below is pinned by `tools/test_dqk_npc_combat_route.py`. Segment bases:
`2033` -> `0x31D20`, `25a4` -> `0x402C0`, `1d99` -> `0x1FD90`.

**Retraction.** The paragraphs above (and `disasm-combat-dqk.md` section 10.2.2,
and NATIVE-TASKS item 28) read `0x43071` as a timed spell-effect applicator
writing a combatant's `+0x38/+0x37` through `[0xB20F]`. That is wrong on two counts.

1. `0x43071` is the ECL `SETUP_MONSTER` handler (`decompile-dqk-ecl-dispatch.md`
   table: opcode `0x0c` -> `2033:0df8` -> `1d99:132d` -> `25a4:2db1` = file
   `0x43071`). Its four `lcall 2033:0112` operand fetches (indices 1..4) are the
   four ECL operands, stored as: op1 -> `[0xBEE8]`, op2 -> `[B20F]+0x38`,
   op3 -> `[0xB1CA]`, op4 -> `[0xC2E7]`. For `SETUP_MONSTER #255,#1,#44,#0`:
   `[BEE8]=255`, `rec+0x38=1`, `[B1CA]=44`, `[C2E7]=0`; `rec+0x37` is then
   the result of `0x40483(...)` clamped to `<= rec+0x38` (so `<= 1`; type `0x10`
   forces 2/2). The sibling `APPROACH` handler (`0x0d` -> `0x4310F`) does
   `dec rec+0x37` when nonzero. So `+0x38/+0x37` are the encounter maximum /
   current approach distance (matching the TS VM's `maxDistance` for
   SETUP_MONSTER/APPROACH), not a spell duration.
2. `[0xB20F]` is not a combatant pointer. A whole-file scan for stores to
   `DS:B20F/B211` finds exactly one writer, in startup code: `0x37D0A/0x37D0E`
   store the far result of a `0x400`-byte allocation, and `0x37D16` then does
   `dec bx; mov [B20F],bx` (the record is addressed as base+1+offset, matching
   `dqk-qsv-save-transfer-consumers.md`: the QSV `0x400` read lands at `[B20F]+1`).
   It is never re-aimed at a roster node. Combat code corroborates this by
   reading it as a state record (`0x5DC7D` `+0x14`, `0x5EDB9` `+0x3C`); the
   combatant globals are different (`[AD67]`, `[C6E5]` list head).
   Caveat: indirect writes (block copies into the buffer, e.g. a save load) are
   not enumerated by a direct-store scan; they would change record contents, not
   the pointer.

**Consequence for the pointer/lifetime question.** The area-64 opening's
`SETUP_MONSTER` writes approach-distance bytes into the global state record; they
have no path to the 15 loaded ID-68 nodes (which `0x42E52` copies as `0x19E`
bytes from MONCHA, clearing only link words). Statically visible writers of
`+0x37/+0x38` through bx/si/di (21 sites, pinned): `0xA90D`, `0xB84D/0xB854`
(the `0x3D`-byte constructor at `0xB7BB`), `0x11A40`, `0x11B0C`, `0x17746`,
`0x325DA` (an ECL-segment clamp `min(rec+0x37, v)` through `[B20F]`),
`0x34C2B..0x34CA6` (decay routine through a stack pointer), `0x404A4`,
`0x43093..0x430ED` (SETUP_MONSTER), `0x4311A` (APPROACH), `0x4E2F2/0x4E2F7`
(a `0x3D` node built with `+0x28=6`, `+0x37=0x17`, `+0x38=0x80`). None is
specific to ID 68; which of them touch a roster node was not classified.

**The `0x5ED25` gate.** Its first argument (`[bp+6]`) is the node examined;
`+0x28 in {0x27,0x28,0x49}` via `1d99:0E69` (file `0x59AB7`), else
`+0x37 > 0 && +0x38 < 0x80`. It does not read `[B20F]` for that test (its only
`[B20F]` use is `+0x3C` at `0x5EDB9`). It has exactly one direct caller,
`0x5DE78` (`lcall 2b3a:2175`), inside a nine-way switch
(`jmp cs:[bx+0x1252]` at `0x5DDFD`) that applies the same `+0x37/+0x38` pre-test
to the entity picked at `[bp-0x10]`; no `1d99` FBOV stub targets it. That is the
shape of a selection/action path, so it cannot be called the NPC AI turn
dispatcher on current evidence (indirect calls are not excluded by a static scan).
Whether the argument is a `0x19E` roster node or a `0x3D` linked object was not
settled.

**Verdict for item 28: unresolved, with a named diagnostic.**
`DQK_NPC_TURN_SCHEDULE_UNRESOLVED`: the retail routine that gives roster nodes
(including ID 68) their action turns was not identified, and the `SETUP_MONSTER`
and `0x5ED25` leads do not supply it. The native engine should keep the `1d2` /
zero-XP NPC placeholders and not grant area-64 gnomes enemy turns on this evidence.
Next bounded step: a Unicorn or GameLink watch of the combat round loop for the
first reader of roster `+0x28/+0x37/+0x38` after `COMBAT 0x91FF`.

## Turn scheduler located (2026-10-07, static, DQK.EXE only)

Pinned by `tools/dqk_npc_turn.py` / `tools/test_dqk_npc_turn.py`. No Unicorn or
GameLink run was made (organic Unicorn runs do not reach COMBAT).

**Retraction.** The "first reader of roster `+0x28/+0x37/+0x38`" framing above is
wrong. Those offsets belong to the `0x3D`-byte ITEM nodes hanging off a roster
record's `+8` list (allocator `DS:C3A9`/`0x3D`, copy at `0x42EB1`; item menu
cursor `les bx,[AD67]; les bx,es:[bx+8]` at `0x5DB02`; flag tests on item
`+0x36/+0x37/+0x38` bit 7 at `0x5D98A..0x5D998`; `+0x39` far chain). The
`0x5ED25` gate is item-use logic, not a turn dispatcher: it works on actor
`[AD67]`, reads `+0x18C` (`0x5EDF6`, `0x5EFCC`) and never touches the initiative
key. ID 68 (GNOME WARRIOR) has `+0x28/+0x37/+0x38 = 0` simply because it carries
no items.

**Actual chain (file offsets).**
1. `0x2299D` combat main sets `[AE57]=5`, calls `0x229BA` `21e4:4dd2` (file
   `0x29B32`), which writes roster `+0x18C`: side `+0x66==0` gives `+0x9B & 0x80`,
   any other side gives 1 (`0x29B4E..0x29B5F`).
2. `0x22A24` `21e4:0004` (file `0x24D64`) runs per node: when `+0x18B != 0` it
   stores initiative `rand(1,6)+mod`, floored at 1, into `+0x40 -> +3` (`0x24EB6`,
   `0x24ECF`).
3. `0x22847` insertion-sorts combatants into `DS:BD99[0x49]` by that key.
4. `0x22B8B` per actor: requires moves left (`+0x40->+3 > 0`, `0x22BC8`), then
   `cmp byte [+0x18C],0` at `0x22C89`: nonzero goes to `lcall 1d99:0FF9` (stub
   `0x20D89`, overlay 2 entry file `0x2DE10`, the AI turn); zero goes to the human
   menu `0x22CCF`.

**Consequence.** MONCHA member 68 has `+0x66=0`, `+0x9B=0x80`, so control init
gives `+0x18C = 0x80`: the gnome is computer-controlled by default and gets
initiative and turns from the same scheduler as monsters. Not yet read: the AI
body (overlay 2 from `0x2DE10`) and the loop at `0x22FA3` that zeroes `+0x18C`
for `+0x9B < 0x80` nodes (hands PCs to humans), which could flip the gnomes.

**Verdict.** `DQK_NPC_TURN_SCHEDULE_UNRESOLVED` is kept, narrowed: scheduler,
control byte and AI entry are identified; the AI body's target/move selection is
unread. Next step: disassemble `0x2DE10` onward.
