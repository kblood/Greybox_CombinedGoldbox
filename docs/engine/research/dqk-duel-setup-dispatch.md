# DQK native `setupDuelAttack` (`CALL 0x0001`) dispatch — RESOLVED

**Scope:** close the "Gap 1: COMBAT roster" honest gap left by
`docs/engine/research/dqk-picture-id-mapping.md` — the attract demo's (`ECL.GLB` id 7) terminal
`COMBAT` fires with an ECL-level empty roster because the fight is set up entirely by DQK.EXE's
native `CALL 0x0001` (`setupDuelAttack`) routine, not `LOAD_MONSTER` data. This doc traces that
native routine end to end: what it reads, what it computes, and — via a live Unicorn dynamic trace
— what it actually resolves for a real playthrough of the Demo route. Method only permitted:
Unicorn + Ghidra headless + static disassembly (no DOSBox-X; another agent held the exclusive
slot for this round).

**Headline result:** the `CALL 0x0001` dispatch is DQK's own generic "duel setup" combatant-cloning
helper (the same mechanic COAB's decompiled `SetupDuel(bool)` implements for training-hall
class-change duels), reused here to place 5 CPIC-icon combat tokens on the demo's battlefield. A
live trace of the real Demo route captured the actual icon ids DQK.EXE resolves; every one decodes
to real, non-degenerate art in the GOG install's own `DISK2/CPIC.TLB`. This is now wired into
`apps/web/src/ui/dqkDemo.ts`, which renders the 5 real icons when `COMBAT` fires instead of a
placeholder note.

---

## 1. The script's own loop, not 5 separate call-sites

The VM-level trace (`packages/engine/test/dqkDemoCombatRoster.test.ts`) sees five `CALL 0x0001`
effects. Disassembling `ECL.GLB` block 7's `GOSUB 0x86e4` subroutine (the nonlocal `GOTO cbf:0`
lands inside it) shows this is ONE call site inside a 5-iteration loop, not 5 distinct calls:

- `[0x00bf]` is the loop counter (0..4), bounded by `[0x00c0]` = 4 (`8063: SAVE #4, 0x00c0`).
- Each iteration does 3 `GETTABLE` reads at vaddrs `0x871d` / `0x872e` / `0x873f` — these hit the
  `GETTABLE` opcode's raw-block fallback path (`packages/engine/src/ecl/vm.ts`'s `case 0x2a`,
  `this.raw[targetOffset]` when the target address isn't in the VM's writable memory map),
  proving the loop reads a small **X / Y / facing table embedded directly in the ECL block's own
  bytes** — script-authored battlefield positions, not native-random. The 3 reads populate
  `[0x0034]` (X), `[0x0035]` (Y), `[0x0011]` (facing) before each `CALL 0x0001`.
- Then `CALL 0x0001` fires once per iteration — the native duel-setup dispatch this doc traces.

So the demo places exactly 5 duel participants at 5 script-supplied positions; DQK's native code
supplies each one's identity/art.

## 2. DQK's real native `CALL` dispatch is a direct id-1/2/3 compare chain

The Gen2 ECL dispatch table (already solved, `decompile-dqk-ecl-dispatch.md`) gives the `CALL`
opcode's own handler file offset: `0x2d | CALL | 2033:0ebe | 2033:0aba (near) | 0x0327da`.
Disassembling `0x0327da` shows DQK dispatches the raw `CALL` operand word via a direct
`cmp ax,1` / `cmp ax,2` / `cmp ax,3` chain — **not** the formula-based `ECL_CALL_ROUTINES` /
`eclCallRoutineId` sparse table `vm.ts` previously used (ids like `0xae11`, `0x3201`, etc., from
an older/different convention). Routine id 1 → `setupDuelAttack`; routine id 2 →
`setupDuelDefend`; a previously-undocumented **routine id 3** exists (handler starts at file
`0x03281b`) that the engine currently has no name/effect for (left unnamed — no evidence yet of
what it does; noted here rather than guessed).

*(This finding doesn't change `vm.ts`'s existing `ECL_CALL_ROUTINES` entries for ids 1/2 — they
already map to `setupDuelAttack`/`setupDuelDefend` and both fire correctly for this script — it
only corrects the understanding of what native mechanism actually reads that id. No code change
was needed for routine ids 1/2; routine id 3 stays unrecognized, matching this project's
"UNLOCATED beats invention" convention.)*

## 3. Routine id 1 = COAB's `SetupDuel(true)`, cross-verified two independent ways

Routine id 1 resolves (via the FBOV stub `1d99:121f` → `LJMP 25a4:0x1685` → file `0x041a55`) to:

```
041a55  mov       word ptr [bp - 0xe], es
041a58  mov       word ptr [bp - 0x10], bx
041a5b  les       bx, ptr [bp - 0xc]
041a5e  mov       word ptr [bp - 2], es
041a61  mov       word ptr [bp - 4], bx
041a64  mov       byte ptr [bp - 0x2b], 0xa
041a68  les       bx, ptr [0xb20f]          ; "current record" pointer (pervasively documented)
041a6c  mov       al, byte ptr es:[bx + 0x3a]  ; class/species-like field
041a70  mov       ah, 0
041a72  mov       bx, ax
041a74  shl       bx, 1                      ; word-stride index
041a76  mov       al, byte ptr [bx + 0x75b8]  ; DGROUP lookup table -> icon id byte
041a7a  mov       byte ptr [bp - 0x2a], al    ; <-- icon id stored (the Unicorn watch target, §4)
041a7d  les       bx, ptr [0xc6e5]
041a81  mov       word ptr [bp - 0x26], es
041a84  mov       word ptr [bp - 0x28], bx
041a87  push      word ptr [0xad6b]          ; arg1 (some DGROUP global, not hardcoded like COAB's "11")
041a8b  push      word ptr [bp - 0x2a]       ; arg2 = icon id
041a8e  push      ds
041a8f  mov       ax, 0x778c
041a92  push      ax                          ; arg3 = far string ptr ds:0x778c
041a93  lcall     0x104c, 0xdf                ; 3-arg far call
041a98  add       sp, 8                       ; 8 bytes popped = 3 args (2+2+4 far ptr... consistent)
041a9b  mov       al, byte ptr [0xad6b]
041a9e  les       bx, ptr [bp - 0x20]
041aa1  mov       byte ptr es:[bx + 0xc5], al
```

Two independent, non-coincidental matches to COAB's decompiled `SetupDuel(bool isDuel)`
(`coab_extracted/engine/ovr008.cs`), which calls
`chead_cbody_comspr_icon(gbl.monster_icon_id, 11, "CPIC")`:

- **Call shape**: 3 arguments (icon-id-like byte, a count/type word, a far string pointer),
  `add sp,8` after the call matching a 3-arg far call.
- **The literal string constant**: `ds:0x778c` resolves, via the DGROUP-in-overlay-12 file mapping
  below, to the exact ASCII bytes `"CPIC\0"` in DQK.EXE.

### DGROUP-in-overlay-12 file-offset formula (needed to resolve the string)

`DQK_DGROUP_SEG` (canonical `0x322E`, the constant `tools/unicorn_dqk_trace.py` already uses)
lies far beyond `MZ_IMAGE_END` (`0x218D5`), so the ordinary `HDR + seg*16` formula that resolves
other canonical segments does **not** apply to DGROUP. DGROUP's actual static content is stored
inside **overlay 12's** file blob — overlay 12's `runtime_seg` in `disasm_dqk.py`'s
`OVERLAY_DESCS` table is literally `0x322E`, matching `DQK_DGROUP_SEG` exactly. The correct
mapping is:

```
file_offset = overlay_code_start(12) + dgroup_offset
            = 0x63A20 + dgroup_offset
```

`overlay_code_start(12) = 0x63A20` (overlay 12's base file offset `0x62C30` +
`OVERLAY_PREFIX_BYTES[12] = 0xDF0`). Applying this to `0x778c`:
`0x63A20 + 0x778C = 0x6B1AC` — confirmed to contain the literal string `"CPIC\0"` in the DQK.EXE
file. The icon-lookup table read at `[bx+0x75b8]` resolves the same way:
`0x63A20 + 0x75B8 = 0x6ADD8` — a small word-stride array (`0x14, 0x14, 0x2a, 0x11, 0x3d, 0x15,
0x07, 0x01, 0x20, 0x26, ...` for its first several entries).

## 4. Live capture: the actual icon ids DQK.EXE resolves for the Demo route

Static reading alone can locate the *mechanism* but not the *live value* — `[0xb20f]`'s content
(and therefore the `+0x3a` field) is populated by native code outside this ECL block, and the
"Demo" route is separately proven (`dqk-demo-route.md`) to skip the entire save/CBODY-load
pipeline, so its value during Demo specifically needed direct observation, not inference.

**Method:** `tools/unicorn_dqk_trace.py --run` reusing the already-proven Demo-route fake-key
recipe (`dqk-demo-route.md`), with `--watch-exec 0x25a4:0x16aa:duel-icon-al
--watch-exec-repeat --watch-exec-repeat-limit 10` — `25a4:16aa` = handler entry `25a4:1685` +
`0x25` (the `mov [bp-0x2a],al` instruction at file `0x041a7a`, confirmed against
`disasm_dqk.py --disasm 0x041a55 --len 0x60` above). 30,000,000-instruction budget, all 14 fake
keys consumed cleanly, `ECL.glb` opened twice (handles 24 and 55 — the script runs twice in one
trace window).

**Result: 10 hits**, each showing `ecl=b1c7:0x2d` in its register dump (confirming the hit occurs
while the VM's own `CALL` (`0x2d`) opcode context is active — i.e. exactly where expected) and the
low byte of `ax` holding the resolved icon id:

| Hit | instr | AL (icon id) |
|---:|---:|---:|
| 1 | 8398914 | 0x80 |
| 2 | 9191407 | 0x80 |
| 3 | 9348289 | 0x82 |
| 4 | 9522958 | 0x86 |
| 5 | 9692676 | 0x80 |
| 6 | 9829165 | 0x80 |
| 7 | 9996842 | 0x81 |
| 8 | 10122889 | 0x80 |
| 9 | 10289309 | 0x80 |
| 10 | 10445986 | 0x80 |

Two groups of 5 (matching the two script runs / two `ECL.glb` opens): run 1 =
`0x80, 0x80, 0x82, 0x86, 0x80`; run 2 = `0x80, 0x81, 0x80, 0x80, 0x80`. Every distinct value
observed: `{0x80, 0x81, 0x82, 0x86}`.

*(An earlier attempt in this same investigation — a `--watch-dgroup-read` on `[0xb20f]` itself
with too small a hit budget — was exhausted by unrelated early-boot keyboard-polling code that
also touches that address, well before the trace reached the actual duel-setup execution. That
attempt produced no useful data and was abandoned in favor of the `--watch-exec` approach above,
which targets the icon-store instruction directly and succeeded. Recorded per this project's
"UNLOCATED beats invention" ethic — applies to ruling out unsound attempts, not just withholding
invented content.)*

## 5. `CPIC.TLB` decode: the icon ids resolve to real art

`DISK2/CPIC.TLB` is a plain **leaf `TILE`** container (header: `magic=1`, `tag="TILE"` directly —
unlike `PICA`/`PICB`/`PICC.TLB`, which are nested **master `HLIB`** containers with `tag="HLIB"`
and a real `ptr[0]` set-id table). Running the captured icon ids through
`parseHlibSetIdTable`/`dqkPictureSlot` (the PICA/B/C mechanism) therefore does **not** apply —
`parseHlibSetIdTable` on `CPIC.TLB` reads `ptr[0]` as if it were an id table, but for a leaf `TILE`
container `ptr[0]` is the library's own first pointer, producing a spurious-looking "id table" that
is not the real addressing scheme.

The real scheme (confirmed by decoding and rendering): the icon id **is a direct positional index**
into the leaf's own image list — `decodeHlib`'s walk-order label `img{n}` (zero-padded 3 digits),
i.e. `arch.images.find(im => im.label === 'img128')` for icon id `0x80`. All 4 distinct live-captured
ids decode cleanly:

| Icon id | Size | Draw method | Notes |
|---:|---|---:|---|
| 0x80 (128) | 24×24 | 21 | small humanoid figure, tan/brown palette |
| 0x81 (129) | 24×24 | 21 | small humanoid figure, same palette family |
| 0x82 (130) | 24×48 | 21 | taller figure, richer multi-colour palette (blue/red/yellow/brown) |
| 0x86 (134) | 48×24 | 21 | wide (horizontal) sprite |

24×24 is exactly the expected size for a Gold Box combat-icon token (matching the "CPIC" =
combat-picture family name); the 24×48 / 48×24 variants are the expected shape for a
larger-footprint creature occupying 2 grid cells. Rendered to
`renders/dqk-demo-duel-icons/` (regenerated by
`packages/engine/test/dqkDuelIconMapping.test.ts`) and inspected directly: 3 of the 4 show
coherent, non-garbage pixel art (recognizable humanoid silhouettes / a larger multi-colour figure);
id `0x86`'s render shows a horizontal-stripe pattern that may be a legitimate low-detail/terrain-ish
icon or an edge case in the shared-palette fallback — flagged here rather than asserted as fully
understood, but its geometry (48×24, non-crashing decode, real palette) is still consistent with a
genuine CPIC library entry, not a decode failure.

## 6. What remains open

- **Routine id 3** — RESOLVED 2026-07-22, see §9. It is NOT duel-related; it is the native
  "advance the current looping animated picture" call (CoAB's `DaxArray.NextFrame()` +
  `DrawMaybeOverlayed(CurrentPicture(), ...)` + `CurrentDelay()`-scaled pacing idiom).
- **Species/monster *names*** for the CPIC icons: DQK's data ships no in-file label mapping an icon
  id to a creature name (only pixel art) — the "roster" is real sprite art, proven from DQK's own
  code and data, but not a bestiary entry with a name. This is an honest characteristic of the
  native mechanic itself (a generic "clone a combatant with this icon" helper), not an
  unresolved research gap.
- `[0xad6b]`'s exact role (the first pushed argument, a DGROUP global rather than COAB's hardcoded
  `11`) was not traced further — plausible as a "combatant type/team" tag but not confirmed.
- Icon `0x86`'s render ambiguity (§5) — not re-investigated further this round.

## 7. Wiring

`apps/web/src/ui/dqkDemo.ts`: `DEMO_DUEL_ICON_IDS = [0x80, 0x80, 0x82, 0x86, 0x80]` (run 1's
captured sequence), a new `DqkDuelIconIndex` class (direct `img{n}` positional lookup into
`CPIC.TLB`), and `paintDuelIcons()` render the 5 real icons side by side on a dedicated canvas when
`COMBAT` fires, replacing the old "roster not known" placeholder text with a note that correctly
describes the duel-setup mechanic and shows the real art.

## 8. Evidence / regression tests

- `packages/engine/test/dqkDemoCombatRoster.test.ts` — unchanged, still pins the ECL-level empty
  roster / 5x `setupDuelAttack` calls / nonlocal GOTO (the starting point this doc builds on).
- `packages/engine/test/dqkDuelIconMapping.test.ts` — new: confirms `CPIC.TLB`'s leaf-`TILE` shape
  and that every live-captured icon id decodes to a real, non-blank image; renders each to
  `renders/dqk-demo-duel-icons/`.

---

## 9. Routine id 3 — RESOLVED (2026-07-22): `advanceAnimatedPicture` (native `DaxArray.NextFrame()`-equivalent)

**Scope:** a separate, unrelated closure — routine id 3 is **not** a duel-setup variant. It was
named by (a) fully disassembling its own inline handler body (no far call into an overlay is
even needed — unlike routines 1/2, which each delegate via `LJMP` into overlay 4's shared
`SetupDuel`-equivalent, routine 3's logic is inlined directly in the `CALL`-opcode dispatcher
itself, file offsets `0x03281b`-`0x03285a`, all within already-loaded overlay index 3 — see
`docs/engine/research/decompile-dqk-ecl-dispatch.md` for the dispatcher's own compare chain at
`0x0327e8`-`0x032809`: `cmp ax,1`/`cmp ax,2`/`cmp ax,3` against an operand word built from
`[0xae6b]<<8 | [0xb186]`), and (b) cross-referencing the result against CoAB's decompile.
Method: static disassembly only (no DOSBox-X, no Unicorn needed — this closure did not require
a dynamic trace).

### 9.1 What the inline handler does, byte for byte

```
03281b  push  word ptr [0xb20e]     ; push CURRENT frame index (pre-increment)
03281f  mov al,1; push ax            ; push 1        }
032822  mov ax,3; push ax            ; push 3        } 4 args total
032826  push ax                      ; push 3 (again)}
032827  lcall 0x24da, 0xc            ; CALL #1 -- draw current frame (see 9.2, target uncertain)
03282c  add sp,8
03282f  cmp byte ptr [0xb20c], 0     ; [0xb20c] acts as both "reset value" and a nonzero flag
032834  je    0x3283f
032836  mov al,1; push ax
032839  lcall 0x10b2, 0x22c          ; CALL #2 (conditional) -- file 0x1314c, see 9.3
03283e  pop cx
03283f  inc   byte ptr [0xb20e]      ; curFrame++
032843  mov al, byte ptr [0xb20e]
032846  cmp al, byte ptr [0xb20d]    ; compare against numFrames-equivalent
03284a  jbe   0x32852
03284c  mov al, byte ptr [0xb20c]    ; wrap back to the reset value
03284f  mov byte ptr [0xb20e], al
032852  lcall 0xa62, 0x949           ; CALL #3 (unconditional) -- file 0xd369, see 9.4
032857  mov sp,bp; pop bp; retf
```

The `[0xb20e]`/`[0xb20d]`/`[0xb20c]` triple (already known, uninterpreted cells from
`tools/unicorn_dqk_trace.py`'s DGROUP watch list and
`docs/engine/research/dqk-start-load-route-anchors.md`/`unicorn-dqk-trace.md`) is now named:
**`[0xb20e]` = current animation frame index, `[0xb20d]` = frame count, `[0xb20c]` = wrap-reset
value.**

### 9.2 The wraparound clamp is byte-identical to CoAB's `DaxArray.NextFrame()`

`coab_extracted/Classes/DaxFiles/DaxArray.cs`:

```csharp
public void NextFrame()
{
    curFrame++;
    if (curFrame > numFrames) { curFrame = 1; }
}
```

This is exactly `inc [0xb20e]; if ([0xb20e] > [0xb20d]) [0xb20e] = [0xb20c]` with `[0xb20c]`
holding the constant `1` — the same "advance, clamp back to slot 1" logic, field for field
(`curFrame`↔`[0xb20e]`, `numFrames`↔`[0xb20d]`, the literal reset `1`↔`[0xb20c]`). This one
match alone is enough to place routine 3 in the animated-picture family, independent of
resolving either external call target.

### 9.3 CALL #1 and #2 line up with `DrawMaybeOverlayed(CurrentPicture(), overlay, 3, 3)`

CoAB's `CMD_Call` (`coab_extracted/engine/ovr003.cs:1832`) — the Gen1/CoAB counterpart of
DQK's Gen2 `CALL` opcode, using the OLDER sparse `word - 0x7fff` operand convention rather
than DQK's newer direct `cmp ax,1/2/3` chain — has a case whose body is this exact idiom:

```csharp
case 0xE804:
    ovr030.DrawMaybeOverlayed(gbl.byte_1D556.CurrentPicture(), true, 3, 3);
    gbl.byte_1D556.NextFrame();
    seg041.GameDelay();
    break;
```

The literal `3, 3` position/size arguments in `DrawMaybeOverlayed` match DQK's routine 3 CALL
#1 literally (`push ax(=3); push ax(=3)`, the last two of its 4 pushed args) — a strong,
specific numeric match, not just a shape match. The same three-call combination
(`DrawMaybeOverlayed(CurrentPicture(), overlay, 3, 3)` → advance-frame → delay) recurs at two
more independent CoAB call sites (`ovr008.cs:266`/`ovr025.cs:1416` load-and-draw-frame-0, and
the real-time animation loop in `ovr027.cs:185-198`, which additionally shows the exact
`CurrentDelay() * 100` scaling used by DQK's CALL #3, §9.4) — this is a genuinely reusable
CoAB idiom, not a one-off, which is consistent with DQK's newer engine promoting it to its own
dedicated native routine id.

CALL #2 (conditional on `[0xb20c] != 0`, i.e. effectively always taken since `[0xb20c]` is the
constant `1`) resolves cleanly (via the ordinary resident-segment formula
`file = 0x2400 + seg*16 + off`, confirmed sound by two independent clean landings, §9.5) to file
offset `0x01314c` — a real function that conditionally sets a redraw flag at `[0x58ca]` and, on
the full-redraw path, reads two byte fields off the same `[0xb20f]` "current record" pointer
already established in §3 of this doc (`es:[bx+0x1fa]`, `es:[bx+0x1fb]`, offset by `0x1d`/`0x21`)
and draws them via a shared near helper at file `0x019980` (resolved from `0x169b:0xbd0`, also
via the plain resident formula) whose own shape — resolve an id through one far call, then
forward the result plus two more args into an inner draw routine — is consistent with, though
not a byte-exact reproduction of, `DrawMaybeOverlayed`'s own (picture, overlay-flag, row, col)
signature. **This second call's precise correspondence to a single CoAB function is not fully
pinned down** — flagged honestly rather than asserted.

### 9.4 CALL #3 matches `CurrentDelay() * 100` byte for byte

```
032852  lcall 0xa62, 0x949   ; -> file 0xd369 (resident formula, clean landing)
```

Disassembly of file `0xd369`:

```
00d369  les   bx, ptr [0xb20f]        ; the "current record" pointer
00d36d  mov   al, byte ptr es:[bx+0x12]
00d371  mov   ah, 0
00d373  mov   dx, 0x64                 ; 100
00d376  mul   dx                       ; al * 100
00d378  push  ax
00d379  lcall 0xdf9, 0x52a             ; pass the scaled value to a delay/pacing routine
00d37e  pop   cx
00d37f  retf
```

CoAB's `AnimationFrame.delay` field is explicitly commented **"Tenth of a second"**
(`coab_extracted/Classes/DaxFiles/DaxArray.cs:49-51`), and `DaxArray.CurrentDelay()` is used at
`ovr027.cs:190` as `gbl.byte_1D556.CurrentDelay() * 100` (tenths-of-a-second × 100 = a
millisecond threshold). DQK's CALL #3 does the **identical scale-by-100 operation** on a byte
field read from the current record (`es:[bx+0x12]`) before handing it to a delay call — the
same "delay-in-tenths-of-a-second, scaled to milliseconds, passed to the pacing primitive"
idiom, field for field.

### 9.5 Resolution-method note (honesty on what's solid vs. uncertain)

CALL #2's and #3's targets (`0x10b2:0x22c`, `0xa62:0x949`) resolve via the **plain resident-MZ
formula** (`file_offset = 0x2400 + seg*16 + off`, since both segments land before
`MZ_IMAGE_END = 0x218D5`) to clean, well-formed function prologues/bodies — high confidence.
CALL #1's target (`0x24da:0xc`) does **not** fall in the resident range (`0x24da*16 = 0x24DA0 >
MZ_IMAGE_END`), so it needed the overlay-relative `resolve_ljmp()` path in `tools/disasm_dqk.py`
(originally built/validated only for `CS=0x1D99` stub-table lookups, §2 of this doc). That path
did find a matching stub and returned file `0x0367fc`, but the bytes there decode as a short,
semantically-implausible instruction run (`or sp,[si-0x74f7]`; `in ax,0x9a`; `rol
word[0x9a4],cl`; `pop bp`; `retf`) immediately followed — 12 bytes later, at `0x036808` — by a
clean, unrelated function prologue. This is not a confident resolution (landing 12 bytes before
an unrelated function's start is not what a real CALL target should look like), so **CALL #1's
exact file offset is left honestly unresolved** rather than asserted. This does not weaken the
overall identification: §9.2's `NextFrame()` clamp match and §9.4's `CurrentDelay()*100` match
are each independently sufficient, and CALL #1's own *argument shape* (a frame/picture value
plus literal `1, 3, 3`) already matches `DrawMaybeOverlayed(picture, true, 3, 3)` without
needing its target resolved.

### 9.6 Naming and wiring

**Routine id 3 = `advanceAnimatedPicture`** (draw the current frame of the record's
looping-picture animation, optionally refresh a secondary UI icon pair, advance the frame
index with wraparound, then pace by the frame's own tenths-of-a-second delay — the native
counterpart of CoAB's `DaxArray`/`DrawMaybeOverlayed`/`CMD_Call case 0xE804` idiom). Not wired
into `packages/engine/src/ecl/vm.ts`'s `ECL_CALL_ROUTINES` this round — no evidence was
gathered (nor sought, out of scope) that any currently-playable DQK route (Demo or otherwise)
actually issues a `CALL 3`; wiring it without a confirmed live use site would be speculative.
This closure is a documentation/identification win, matching Target 1's own scope in this
round's task.

---

## Summary for future readers

| Gap | Status | Where |
|---|---|---|
| `COMBAT` roster mechanism | **Resolved** — native "duel setup" (routine id 1), CPIC icon tokens | this doc |
| Live icon ids for the Demo route | **Captured** via Unicorn `--watch-exec` (not invented) | §4 |
| Icon id → real art | **Resolved** — direct positional index into `CPIC.TLB` | §5, `dqkDuelIconMapping.test.ts` |
| Species/monster name behind each icon | **Genuinely absent from DQK's own data** (not a research gap) | §6 |
| Native `CALL` routine id 3 | **Resolved (2026-07-22)** — `advanceAnimatedPicture`, CoAB's `DaxArray.NextFrame()`/`DrawMaybeOverlayed`/`CurrentDelay()` idiom; CALL #1's own file offset stays unresolved (honest gap, §9.5) | §9 |
