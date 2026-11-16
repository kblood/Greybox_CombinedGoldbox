# DQK sound triggers: PlaySound ids -> SOUNDS.GLB members

Static derivation from `The Dark Queen of Krynn/DQK.EXE` (plain MZ, 449,664 bytes, header
0x2400) and `DISK1/SOUNDS.GLB` (24,904 bytes). Pinned by `tools/dqk_sound_trigger.py` and
`tools/test_dqk_sound_trigger.py` (8 tests, skip cleanly when data is absent). Feeds
`docs/engine/NATIVE-TASKS-2026-09-12.md` item 11. No DOSBox session was run; nothing here
claims a sound was heard.

Address convention: `file = 0x2400 + seg*16 + off` (far-call segment words are unrelocated).

## 1. The dispatcher (PlaySound = `1023:0006` = file 0x12636)

- Accepts id 0..0x29 and 0xFF, anything else returns.
- Rewrite at 0x12652: if id == 0x0B, read the creature record pointer at `ds:B20F`; byte `+0x3A`
  == 3 -> id 0x0E, == 6 -> id 0x0F. Bytes pinned (`837e060b ... c746060e00 ... c746060f00`).
- Key table: 27 words at file **0x12693** = `0..0xF, 0x20..0x29, 0xFF`; target table at
  **0x126C9** (segment base file 0x12630). Handlers:
  - 0, 1, 2 -> small local handlers (sound off / on / stop effects).
  - **3..0xF -> one shared handler (cs:0xFC)**: returns if `[ACD8]==6` (no device); if sound is
    disabled (`[A846]==0`) it only does a ~2-tick wait and plays nothing; otherwise it calls the
    driver front end `0FD3:0176` with the id.
  - 0x20..0x27 -> handler cs:0x15A (same front-end call, gated on device != 6).
  - 0x28, 0x29, 0xFF -> cs:0x161, direct front-end call.

## 2. The driver front end (`0FD3:0176` = file 0x122A6)

Own switch (keys at file 0x122CB): 0 and 1 clear/set flag `[24AF]`; 2 stops digital SFX; 0x29
and 0x28 start XMI slot 0 / 1 (`[24B0]`); 0xFF stops music (frees slots). The default branch:

- `3 <= id < 0x10` (range checks at 0x12412/0x1241A, `cmp di,10h`), requires `[1E5D]!=0` (SFX
  enabled), then **`sub di,3` (`83 EF 03` at 0x1242C)**, so effect index = id - 3.
- `0x20 <= id < 0x28`: requires `[1E5C]!=0` (music enabled), builds `"%s%d.XMI"` from the
  music-driver prefix table (`RODQ`/`ADDQ`/`TYDQ`/`PCDQ`, 13-byte records at ds:2461) and the
  per-id tables at ds:1F21/1F31; this is XMI music.

Two back ends for ids 3..0xF, selected by `[1F01]` (set from the device tables at ds:1F41/1F51
indexed by `[ACD8]`):

| `[1F01]` | devices (ds:21E1 SFX driver name) | back end |
|---|---|---|
| 1 | PCSPKR, TANDY, ADLIB, MT32MPU (no SBDIG) | `18FC:0016` plays HLIB member `id-3` of the `sounds` library (ds:24B1, loaded at init by `193F:00D5` after `18FC:0006`) |
| 0 | ADLIB+SBDIG, MT32MPU+SBDIG | `0E56:0265` with the file named at ds:2495 = **`SFXDQ.VOC`** (index `id-3`) |

`18FC:0016` runs a loop over 11-byte records (`/200`, `>>1` arithmetic); **that record is a driver-side
structure of the player itself, not the DIG4 member header** (the member header is 6 bytes, see the
codec note in section 6) and it was not decoded here. `193F:01FD` additionally `193F:01FD` verifies the `HLIB` magic (`0x4948`/`0x4C42`
pair), the count at +8 and member pointers at `0x10 + 4*index`, exactly the SOUNDS.GLB layout.
The member argument is the id-3 value passed by the caller. **Not traced end to end:** the
`[9F80]` flag (set to 1 at file 0x1B3CF) selects the library-pointer lookup path; I did not
confirm its runtime value, nor which `[ACD8]` the retail DQK.CFG selects. Treat "SOUNDS.GLB is
the non-Sound-Blaster back end, SFXDQ.VOC the SB one" as read from bytes, unverified live.

## 3. Id classification (DIG4 vs XMI vs PC speaker)

| id | class |
|---|---|
| 0, 1, 2 | control: sound-off flag, sound-on flag, stop SFX |
| **3..0xF** | **digitized SFX**: SOUNDS.GLB DIG4 member `id-3`, or SFXDQ.VOC marker on SB-digital |
| 0x10..0x1F | unmapped (PlaySound returns) |
| 0x20..0x27 | **XMI music tracks** (`title` = 0x20, `final1` = 0x27 callers seen). Not DIG4 |
| 0x28, 0x29 | XMI slot start (music control) |
| 0xFF | stop all music/SFX |

**PC speaker:** DQK has no PC-speaker tone synthesis in PlaySound. `PCSPKR.ADV` and `PCDQ*.XMI`
are the Miles-style driver and its XMI music for the speaker device; effects on that device go
through the same SOUNDS.GLB library path as above. No Gen1-style port-0x61 effect table exists in
this dispatcher.

## 4. id -> SOUNDS.GLB member -> header rate (read from the file)

Header is `u16be rate, u16 0, u16be payload_len` (6 bytes; `packages/engine/src/audio/dig.ts`).
Member names = `DQK_SFX_NAMES` order; member i spans `ptr[i]..ptr[i+1]`, pointer list at 0x10,
13 members, sentinel pointer 0x6148 = file size.

| id | member | name | rate Hz | payload |
|---|---|---|---|---|
| 0x03 | 0 | cast | 7418 | 3057 |
| 0x04 | 1 | flame | 7418 | 2574 |
| 0x05 | 2 | sorcery | 7418 | 3583 |
| 0x06 | 3 | die | **11127** | 3542 |
| 0x07 | 4 | sling | 7418 | 2756 |
| 0x08 | 5 | hit | 7418 | 1040 |
| 0x09 | 6 | lightning | **11127** | 2872 |
| 0x0A | 7 | swing | 7418 | 1081 |
| 0x0B | 8 | walk | 7418 | 167 |
| 0x0C | 9 | fireball | **5564** | 2990 |
| 0x0D | 10 | bow | 7418 | 240 |
| 0x0E | 11 | sploosh | 7418 | 366 (only via 0x0B rewrite, creature type 3) |
| 0x0F | 12 | crackle | 7418 | 482 (only via 0x0B rewrite, creature type 6) |

Names are the existing engine labels; the id->name direction is corroborated by callers below
(id 9 near the string "breathes lightning", and the spell-cast chooser).

## 5. Callers with immediate ids (24 far-call sites to 1023:0006)

22 immediate, 2 dynamic. File offset of the `lcall`, function start, id, evidence.

| site | func | id | evidence |
|---|---|---|---|
| 0x24372 | 0x24301 | 5 sorcery | flag-selected arm (inference) |
| 0x2437E | 0x24301 | 4 flame | other arm (inference) |
| 0x2560A | 0x25420 | 0x0B walk | **TACTICAL COMBAT move, not the exploration step** (see section 5a) |
| 0x261D0 | 0x26177 | 8 hit | string "Nothing Happens..." in function |
| 0x26436 | 0x26177 | 8 hit | string "t is full!" |
| 0x2652F | 0x26177 | 0x0A swing | string "t is full!" |
| 0x27671 | 0x275E8 | 0x0D bow | ranged attack arm (inference) |
| 0x276C1 | 0x275E8 | 7 sling | ranged attack arm (inference) |
| 0x276FD | 0x275E8 | 0x0A swing | ranged attack arm (inference) |
| 0x2B086, 0x2B137 | 0x2B075 | 6 die | (inference) |
| 0x31ADE, 0x31BB1 | 0x3196F | 0xFF | string "Woof"; stop-all |
| 0x3872D | 0x38705 | 0x20 | string "title"; XMI |
| 0x387E1 | 0x3878B | 0x27 | string "final1"; XMI |
| 0x43B2A | 0x43B26 | 0x0B walk | **EXPLORATION party step** (see section 5a); function start corrected from 0x43A6A, which is the preceding routine |
| 0x4B4C6 | 0x4B1B3 | 0xFF | stop-all |
| 0x54923 | 0x5485B | 9 lightning | string "breathes lightning" |
| 0x5B97E / 0x5B98A / 0x5B996 | 0x5B73B | 0x0C / 9 / 3 | one function choosing fireball / lightning / generic cast |
| 0x5C13A | 0x5C0ED | 3 cast | (inference) |
| 0x249EF | 0x249BF | dynamic | string "is bandaged"; id = argument `[bp+0xA]` |
| 0x3315F | 0x33140 | dynamic | save-disk routine; id = return of `31E32(1)` |

"inference" means the event label comes from the shape of neighbouring code, not a string. The
ids and sites themselves are mechanical (the tool re-scans the EXE and fails if one moves).
Strong ones: id 9 breath-lightning, and the 0x5B73B chooser (fireball/lightning/cast).

## 5a. Which routine is the step (verified by disassembly, 2026-10-07)

- **0x25420 is the tactical combat move, not the exploration step.** It takes a creature far pointer
  (`[bp+6]`), an actor index and a facing (`[bp+0xA]`), reads/writes the per-actor position table at
  `ds:C3F1` (stride 6), computes the move-point cost and subtracts it from `creature->[+0x40]->[+7]`
  (`sub es:[bx+7],al` at 0x25526, pinned), redraws, then `PlaySound(0x0B)` at 0x2560A.
- **0x43B26 is the exploration step.** Key handler 0x43DC5 / dispatch at 0x441B3: when the view mode
  `[ae57]==4` and the passability test `1d99:10fd(x,y,facing)` returns 1, it sets `[ae48]=1` and near-calls
  0x43B26 from 0x441F5. 0x43B26 does `PlaySound(0x0B)` (0x43B2A), a 50 ms delay, then adds the facing deltas
  (`ds:6189` / `ds:6192`) to the party position `[C9F0]`/`[C9F1]` with wrap against the map size at `[CA08]`.
  Mode 3 takes a different handler (0x43C07) with no sound call. **The sound plays before the position
  advances, and only when the step is allowed.** Turning does not reach this routine.
- Both sites play id 0x0B, so the id/member/rate (member 8, 7418 Hz) are the same; only the label differs.
  A native first-person trigger should be modelled on 0x43B26, not 0x25420.

## 6. Consequences for native item 11

- A native trigger is not an ECL CALL; these are engine-code events. The best-evidenced first
  trigger is **spell cast: id 3 (member 0, 7418 Hz)** or **breath lightning: id 9 (member 6,
  11127 Hz)**, whose rate differs from the default so a wrong-rate play is detectable.
- **Codec: SETTLED** (commit 521bdd8c). A DIG4 member is a 6-byte header (`u16be rate, u16 0,
  u16be payload bytes`) followed by 4-bit unsigned samples, two per byte, low nibble first, centre 8
  (as in `dig.ts`); sample count = 2 x payload bytes. The payload word equals `member_len - 6` (or
  `-7`) in 13/13 members. CCSND now implements this and its sidecar is GBSN version 2. The earlier
  4-byte-header / 8-bit-PCM reading in `ccsnd.asm` was wrong and is retired. The "11-byte record"
  mentioned in section 2 is a different, player-internal structure and has no bearing on this.
- Sound-disabled behaviour is part of the original: with `[A846]==0` ids 3..0xF still insert a
  two-tick delay. Native "audio unavailable" paths that publish status without altering state
  should not add or skip that delay unless they model it.

## 7. Pins and controls

`tools/dqk_sound_trigger.py::check_pins` re-derives: key table, shared handler, 0x0B rewrite
bytes, `id-3` and range bytes, every caller id, member count, per-member rates, length-word
identity. Mutations seen RED: member 8 header rate 7418 -> 11127; `sub di,3` -> `sub di,4`; caller
0x54923 id 9 -> 0xA. Unrelated-member control: id 0x0B (member 8) vs id 0x09 (member 6) differ in
member, rate and length.
