; ============================================================================
;  CCCOMBAT.COM  --  Tier-1 tactical (grid) melee combat engine.
;
;    CCCOMBAT /T <encounter> <seed> [trace]
;    CCCOMBAT /F <encounter|effects.gbef> [moncha.dax|glb] <seed> [trace] [outcome]
;    CCCOMBAT /V <encounter|effects.gbef> [moncha.dax|glb] <seed> [raw]
;    CCCOMBAT /E <effects.gbef> [moncha.dax|glb] <seed> [trace] [outcome] [raw]
;        [/W walls.wgrd]
;        [/J] CoK shared RNG: read full state from GBEF v9 GBRS, return it in
;             GBCR v2 via required /R. Valid for /E, /K, or effect-file /F.
;                                           expand CCECL GBEF combat payload
;
;  Clean-room NASM port of the VERIFIED TypeScript combat oracle:
;    packages/engine/src/combat/tactical.ts   (the authoritative rules)
;    packages/engine/src/combat/combat.ts      (to-hit/damage model, bySideThenId)
;    packages/engine/src/util/rng.ts           (legacy Numerical-Recipes LCG)
;  /J selects the verified original CoK recurrence and byte-sided dice draws.
;  This does not claim original CoK initiative, combat AI, or complete damage parity.
;  Design: docs/engine/research/asm-combat-engine-design.md  (Tier-1 / M2).
;
;  Tier-1 scope (the CCFP-sized first slice): ONE encounter run end-to-end,
;  headless.  Roster placed party-west / enemies-east on a flat open grid;
;  stored+sorted initiative; AI fires a finite-ammo missile shot when a clear
;  in-range line exists, otherwise attacks the WEAKEST in-reach foe or spends
;  its per-combatant open-grid movement allowance with footprint checks; if that
;  reaches melee, it attacks. Hits resolve d20>=THAC0-AC with the Gen1/Gen2 death rule
;  (Gen1 dmg>hp+10 =>
;  permadeath; Gen2 downed stays unconscious); victory/defeat each round.
;  EXCLUDES spells, real decoded movement rates/loadouts, and full encounter-map
;  terrain costs (those are later tiers per the design). /W imports Greybox WGRD
;  bridge wall cells as blocked terrain for movement and missile line-of-fire; it
;  is not the original DQK DungCom/WildCom 50x25 terrain pipeline. Decoded monster
;  morale can trigger surrender or routed flee.  Melee reach, open-grid close
;  movement, and missile line-of-fire are footprint-aware for decoded small/large
;  figures and synthetic blocked cells.  Missile line-of-fire blocks on
;  intervening bodies or synthetic terrain cells. Synthetic damage/status
;  hazards fire on start-of-turn and end-of-move/end-of-flee exposure; real
;  map-derived hazard zones are later tiers.
;
;  /T and /E emit one ASCII line per event to CCCOMB.TRC, or to the optional
;  trace path (CR/LF terminated), the exact format the design's seeded-trace
;  gate diffs against the TS oracle:
;     round type actor target roll needed hit damage hpAfter dead [moveCol moveRow]
;  Fields not applicable to an event type are '-'.  Numeric formatting uses the
;  signed-decimal put_sdec borrowed from ccfp.asm.
;  /E may also take an optional outcome path after [trace]; when present the
;  terminal result is written as "party", "enemy", "flee", or "draw" for
;  CCECL resume.  A successful party-wide flee is its own result: GBCR v2
;  already calls it outcome 3, so the text sidecar must not collapse it to draw.
;  A third optional path makes /E dump the same 320x200 tactical RAW frame that
;  /V uses before the deterministic resolver mutates the live combat state.
;  `/R result.gbr` writes a separate binary combat-result block with outcome,
;  XP award, and final party HP/condition records for later roster writeback.
;
;  The /T <encounter> arg names a built-in synthetic roster (commit-safe; NOT
;  derived from copyrighted game data).  Encounter "1" is the Tier-1 fixture.
;  The /V form renders that roster as a minimal mode-13h tactical viewport:
;  open grid, green party blocks, red enemy blocks. With [raw] it writes
;  u16 w,h + 64000 framebuffer bytes + 768-byte palette and exits; without
;  [raw] it waits for a key and restores text mode.
;  The /E form reads CCECL's stable GBEF encounter handoff prefix and expands queued
;  LOAD_MONSTER groups. If a Gen1 CoK 409-byte MON*CHA.DAX archive is supplied,
;  it decodes real HP/THAC0/AC/damage/XP by monster id. CoAB 422-byte MON*CHA.DAX
;  records decode the runtime combat fields from the local Player layout. DoK
;  216-byte archives decode verified THAC0/AC/damage/footprint fields AND real
;  HP/XP from the record bytes (max at +40, live at +108, award from +109/+111).
;  CORRECTED 2026-09-07: this sentence said DoK "keeps deterministic HP because
;  DoK compact HP/XP are still unlocated", which stopped being true at 132306c
;  on 2026-09-05 when the placeholder `(id & 7) + 4` was replaced by those reads.
;  A stale banner is read with authority, and this one outlived its code by two
;  days and helped a stale golden look like an engine fault. HLIB
;  MONCHA.GLB support resolves the member-0 id table, skips each member's 2-byte
;  big-endian uncompressed length (fidelity-plan §29), and reads every field at a
;  fixed offset: the bestiary half (is-monster byte = 1) at DQK_L_ABIL, the
;  character/NPC half (= 0) at the NPC deltas with stored HP. Nothing is
;  reconstructed, scanned for, or injected -- the five staged-recovery strategies
;  this line used to list (inline-RLE re-expansion, ability-block scan,
;  compact/short-tail, canon-AC, raw dec-path) were all compensating for the
;  length word being eaten, and are gone. Amiga GLIB MONCHA containers are accepted by
;  swapping their pointer/id metadata; until Secret/Gateway stat offsets are
;  pinned, resolved GLIB records use deterministic placeholder tactical stats.
;  Without a MON archive, /E falls back to deterministic placeholder enemies.
;
;  Build:  build.ps1 -Target cccombat   (nasm -f bin -> build\cccombat.com)
; ============================================================================
        cpu     386
        bits    16
        org     100h

; -- Combatant record layout (one .COM-segment array; Tier-1 fields only)
;  Mirrors the TacticalCombatant fields the Tier-1 paths touch.  Ids are the
;  oracle's "p0,p1,.. / e0,e1,.." scheme (side + ordinal); the id string is
;  generated, not stored, so a record is compact.
C_SIDE    equ 0     ; byte  0=party 1=enemy   (party sorts before enemy)
C_ORD     equ 1     ; byte  ordinal within side (id = side letter + ord)
C_HP      equ 2     ; word  current hp (signed; may go <=0)
C_MAXHP   equ 4     ; word  max hp
C_THAC0   equ 6     ; word  to-hit AC0
C_AC      equ 8     ; word  armour class (signed)
C_DCOUNT  equ 10    ; word  damage dice count   (Ndice)
C_DSIDES  equ 12    ; word  damage die sides     (dSize)
C_DBONUS  equ 14    ; word  damage flat bonus    (signed)
C_XP      equ 16    ; word  xp awarded when slain (enemy)
C_INIT    equ 18    ; word  stored initiative (0xFFFF = unset -> seed d10)
C_FLAGS   equ 20    ; word  status flags bitfield (see CF_*)
C_COL     equ 22    ; word  grid column
C_ROW     equ 24    ; word  grid row
C_SIZE    equ 26    ; word  combat icon footprint (1=small, 2=large)
C_MOVE    equ 28    ; word  movement allowance in whole cells (Tier-1 fallback)
C_MRANGE  equ 30    ; word  missile range in cells (0 = no missile weapon)
C_AMMO    equ 32    ; word  missile ammo/uses remaining
C_ATTACKS equ 34    ; integer attacks; DQK tag: bit15 + kind-2 rate in low byte
C_HALFATT equ 36    ; word  half-attacks encoding; 3 => 2,1,2,1...
C_REC     equ 38    ; record size (bytes)

MAXCOMB   equ 32    ; max combatants
GBCR_HDR_LEN equ 16
GBCR_REC_LEN equ 6
DOK_MAGIC_MISSILE equ 15

; DoK compact-party GBPR records preserve the 216-byte CHRDATA.GAM body, then
; store a small derived combat tail in the padding region.
DOK_META_OFF   equ 216
DOK_META_FLAGS equ DOK_META_OFF+4
DOK_META_HP    equ DOK_META_OFF+6
DOK_META_AC    equ DOK_META_OFF+8
DOK_META_DCOUNT equ DOK_META_OFF+10
DOK_META_DSIDES equ DOK_META_OFF+12
DOK_META_DBONUS equ DOK_META_OFF+14
DOK_META_LEVEL equ DOK_META_OFF+16
DOK_META_CLASS equ DOK_META_OFF+18
DOK_META_BASEAC equ DOK_META_OFF+19
DOK_META_THAC0 equ DOK_META_OFF+20
DOK_META_MOVE  equ DOK_META_OFF+22
DOK_META_COND  equ DOK_META_OFF+24
DOK_META_MAXHP equ DOK_META_OFF+26

; status-flag bits. Low byte is mutable combat status; high byte stores optional
; decoded morale as (moralePercent+1), so 0 means "no morale field".
CF_DEAD   equ 0001h
CF_UNCON  equ 0002h
CF_SURRENDERED equ 0004h
CF_FLED   equ 0008h
CF_FEARED equ 0010h
CF_GUARDING equ 0020h
CF_HELD   equ 0040h
CF_ASLEEP equ 0080h
CF_INACTIVE equ CF_SURRENDERED | CF_FLED
CF_DISABLED equ CF_HELD | CF_ASLEEP

start:
        cld
        mov     ax, cs
        add     ax, 1000h
        mov     [icon_seg], ax
        call    alloc_daxseg
        jc      .nomem
        call    parse_args
        call    se_scan_profile
        jc      .badfx
        call    scan_party_arg
        call    se_setup
        jc      .badfx
        call    scan_icon_arg
        call    scan_command_arg
        call    scan_result_arg
        call    scan_cok_rng_arg
        jc      .badfx
        cmp     byte [secret_profile], 0
        je      .rng_profile_ok
        cmp     byte [cok_rng_mode], 0
        jne     .badfx                   ; CoK RNG/result protocol is a separate profile
.rng_profile_ok:
        call    scan_surprise_arg
        call    scan_wall_arg
        call    derive_default_wallname
        call    load_icon_gbim
        cmp     byte [vmode], 0
        jne     .run_view
        cmp     byte [emode], 0
        jne     .run_effect
        cmp     byte [fmode], 0
        jne     .run_flee
        cmp     byte [tmode], 0
        jne     .run_builtin
        mov     dx, s_usage
        mov     ah, 9
        int     21h
        mov     ax, 4C00h
        int     21h
.run_builtin:
        ; build the named encounter roster into the combatant array
        call    build_encounter
        call    load_wall_terrain_optional
        jmp     .run
.run_view:
        cmp     byte [vfxmode], 0
        je      .run_view_builtin
        call    build_effect_encounter
        jc      .badfx
        jmp     .run_view_have
.run_view_builtin:
        call    build_encounter
.run_view_have:
        call    load_wall_terrain_optional
        call    render_combat_view
        cmp     byte [vrawflag], 0
        je      .view_wait
        call    dump_view_raw
        jc      .noopen
        mov     ax, 0003h
        int     10h
        mov     ax, 4C00h
        int     21h
.view_wait:
        xor     ah, ah
        int     16h
        mov     ax, 0003h
        int     10h
        mov     ax, 4C00h
        int     21h
.run_effect:
        call    build_effect_encounter
        jc      .badfx
        call    load_wall_terrain_optional
        cmp     byte [kmode], 0
        je      .effect_headless
        ; Interactive: enter mode 13h and load the DAC ONCE here, then let
        ; redraw_board repaint between actions.  combat_run still writes the
        ; same trace file, so a /K session is adjudicated by exactly the same
        ; goldens as the headless modes.
        call    render_combat_view
        jmp     .run
.effect_headless:
        cmp     byte [vrawflag], 0
        je      .run
        call    render_combat_view
        call    dump_view_raw
        pushf
        mov     ax, 0003h
        int     10h
        popf
        jc      .noopen
        jmp     .run
.run_flee:
        cmp     byte [vfxmode], 0
        je      .run_flee_builtin
        call    build_effect_encounter
        jc      .badfx
        jmp     .run_flee_have
.run_flee_builtin:
        call    build_encounter
.run_flee_have:
        call    load_wall_terrain_optional
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, trcname
        int     21h
        jc      .noopen
        mov     [trcfh], ax
        mov     ax, [seed]
        call    rng_seed
        call    combat_run_party_flee
        mov     bx, [trcfh]
        mov     ah, 3Eh
        int     21h
        call    write_outcome
        jc      .noopen
        call    write_result
        jc      .noopen
        mov     ax, 4C00h
        int     21h
.run:
        ; open the trace file CCCOMB.TRC for writing
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, trcname
        int     21h
        jc      .noopen
        mov     [trcfh], ax
        ; seed the RNG and run the battle, streaming events to the trace
        mov     ax, [seed]
        call    rng_seed
        call    combat_run
        cmp     byte [kmode], 0
        je      .no_text_restore
        call    interactive_epilogue
.no_text_restore:
        ; close trace
        mov     bx, [trcfh]
        mov     ah, 3Eh
        int     21h
        call    write_outcome
        jc      .noopen
        call    write_result
        jc      .noopen
        mov     ax, 4C00h
        int     21h
.noopen:
        mov     dx, s_noopen
        mov     ah, 9
        int     21h
        mov     ax, 4C01h
        int     21h
.nomem:
        mov     dx, s_nomem
        mov     ah, 9
        int     21h
        mov     ax, 4C01h
        int     21h
.badfx:
        mov     dx, s_badfx
        mov     ah, 9
        int     21h
        mov     ax, 4C01h
        int     21h

; ============================================================================
;  Minimal tactical viewport (/V).  This keeps the 10x10 tactical state but
;  renders the recovered Gold Box combat view: seven visible 24px cells clipped
;  to x/y [8,176), with flat figure blocks until real 24x24 art is wired in.
;  It deliberately does not run the battle yet; this proves the combat-screen
;  surface, coordinate mapping, palette, and raw oracle path before sprite art.
; ============================================================================
render_combat_view:
        mov     ax, 0013h
        int     10h
        push    cs
        pop     ds
        cld
        call    set_combat_palette
        mov     ax, 0A000h
        mov     es, ax
        xor     di, di
        xor     ax, ax
        mov     cx, 32000
        rep     stosw
        call    draw_combat_grid
        call    draw_combatants
        ; RESTORE ES.  This routine sets ES=0A000h so the draw helpers can use
        ; it, and every trace line in this file is assembled with STOSB, i.e.
        ; through ES:DI into linebuf, while eol_flush writes DS:DX from linebuf.
        ; Leave ES on video RAM and the trace builder scribbles the text into
        ; the framebuffer while the file receives the untouched -- zeroed --
        ; linebuf, at exactly the right LENGTH.  The result is a trace file of
        ; the correct size containing nothing but NULs, and an outcome file that
        ; is still perfectly correct, so nothing looks broken from outside.
        ;
        ; dump_view_raw already restored ES on its own success path (its
        ; 'push cs / pop es' before the CLC) with no comment saying why, which
        ; is the only reason the existing /E-with-raw route survives. That made
        ; the invariant real but invisible, and the first new caller -- the /K
        ; interactive mode -- hit it immediately. Restoring here instead makes
        ; it the callee's job, so it cannot be missed again.
        push    cs
        pop     es
        ret

set_combat_palette:
        mov     dx, 03C8h
        xor     al, al
        out     dx, al
        inc     dx
        cmp     byte [icon_valid], 0
        je      .ega
        push    ds
        mov     ds, [cs:icon_seg]
        mov     si, [cs:icon_bases]
        add     si, [cs:icon_npixels]
        add     si, 14
        mov     cx, 32*3
.icon_lp:
        lodsb
        shr     al, 2
        out     dx, al
        loop    .icon_lp
        pop     ds
        ret
.ega:
        mov     si, combat_pal
        mov     cx, 16*3
.lp:
        lodsb
        out     dx, al
        loop    .lp
        ret

draw_combat_grid:
        mov     word [view_i], 0
.vlines:
        mov     ax, [view_i]
        cmp     ax, VIEW_VISIBLE_CELLS
        ja      .hlines_start
        mov     bx, VIEW_CELL
        mul     bx
        add     ax, VIEW_X0
        mov     bx, VIEW_Y0
        mov     cx, VIEW_GRID_PIX+1
        mov     dl, VIEW_GRID_COL
        call    draw_vline
        inc     word [view_i]
        jmp     .vlines
.hlines_start:
        mov     word [view_i], 0
.hlines:
        mov     ax, [view_i]
        cmp     ax, VIEW_VISIBLE_CELLS
        ja      .done
        mov     bx, VIEW_CELL
        mul     bx
        add     ax, VIEW_Y0
        mov     bx, ax
        mov     ax, VIEW_X0
        mov     cx, VIEW_GRID_PIX+1
        mov     dl, VIEW_GRID_COL
        call    draw_hline
        inc     word [view_i]
        jmp     .hlines
.done:
        ret

draw_combatants:
        mov     word [view_i], 0
.lp:
        mov     bx, [view_i]
        cmp     bx, [ncomb]
        jae     .done
        mov     si, bx
        imul    si, si, C_REC
        add     si, comb
        call    is_active_si
        jnc     .next

        ; Window-relative first: [view_col0]/[view_row0] are the top-left cell
        ; of the 7x7 window on the 10x10 logical grid.  They are 0 for /V and
        ; every headless mode, so this is an identity transform there; only the
        ; interactive turn scrolls them (center_view_on_cur).  The SUB borrows
        ; when the combatant is left of or above the window, and JB catches it.
        mov     ax, [si+C_COL]
        sub     ax, [view_col0]
        jb      .next
        cmp     ax, VIEW_VISIBLE_CELLS
        jae     .next
        mov     [view_rc], ax
        mov     bx, [si+C_ROW]
        sub     bx, [view_row0]
        jb      .next
        cmp     bx, VIEW_VISIBLE_CELLS
        jae     .next
        mov     [view_rr], bx
        mov     cx, VIEW_BLOCK
        cmp     word [si+C_SIZE], 1
        jbe     .size_ok
        cmp     ax, VIEW_VISIBLE_CELLS-1
        jae     .next
        cmp     bx, VIEW_VISIBLE_CELLS-1
        jae     .next
        mov     cx, VIEW_BLOCK_LARGE
.size_ok:
        mov     [rect_h], cx
        mov     ax, [view_rc]
        mov     bx, VIEW_CELL
        mul     bx
        add     ax, VIEW_X0+1
        mov     bx, [view_rr]
        imul    bx, bx, VIEW_CELL
        add     bx, VIEW_Y0+1
        mov     di, [view_i]
        shl     di, 1
        mov     dx, [combat_pic+di]
        call    find_icon_dx
        jc      .flat
        mov     [icon_dstx], ax
        mov     [icon_dsty], bx
        mov     [icon_dstsize], cx
        call    draw_combat_icon
        jmp     .next
.flat:
        mov     dl, VIEW_PARTY_COL
        cmp     byte [si+C_SIDE], 0
        je      .draw
        mov     dl, VIEW_ENEMY_COL
.draw:
        call    draw_rect
.next:
        inc     word [view_i]
        jmp     .lp
.done:
        ret

; DX=logical picBlock. Select matching packed GBIM metadata, CF=0; CF=1 fallback.
find_icon_dx:
        push    ax
        push    bx
        push    si
        xor     bx, bx
.scan:
        cmp     bl, [icon_count]
        jae     .miss
        mov     si, bx
        shl     si, 1
        cmp     dx, [icon_blocks+si]
        jne     .next
        mov     ax, [icon_bases+si]
        mov     [icon_base], ax
        mov     ax, [icon_widths+si]
        mov     [icon_width], ax
        mov     ax, [icon_heights+si]
        mov     [icon_height], ax
        mov     ax, [icon_npixels+si]
        mov     [icon_npix], ax
        pop     si
        pop     bx
        pop     ax
        clc
        ret
.next:
        inc     bx
        jmp     .scan
.miss:
        pop     si
        pop     bx
        pop     ax
        stc
        ret

; Fit one matched GBIM frame into the stable combat footprint. Index 0 is
; transparent. ES=A000, source remains in icon_seg.
draw_combat_icon:
        push    ax
        push    bx
        push    cx
        push    dx
        push    si
        push    di
        push    bp
        push    ds
        mov     word [icon_dy], 0
        mov     ds, [cs:icon_seg]
.row:
        mov     ax, [cs:icon_dy]
        cmp     ax, [cs:icon_dstsize]
        jae     .done
        mul     word [cs:icon_height]
        xor     dx, dx
        div     word [cs:icon_dstsize]
        mul     word [cs:icon_width]
        add     ax, [cs:icon_base]
        add     ax, 14
        mov     [cs:icon_srcrow], ax
        mov     ax, [cs:icon_dy]
        add     ax, [cs:icon_dsty]
        mov     bx, 320
        mul     bx
        add     ax, [cs:icon_dstx]
        mov     di, ax
        mov     word [cs:icon_dx], 0
.pixel:
        mov     ax, [cs:icon_dx]
        cmp     ax, [cs:icon_dstsize]
        jae     .next_row
        mul     word [cs:icon_width]
        xor     dx, dx
        div     word [cs:icon_dstsize]
        add     ax, [cs:icon_srcrow]
        mov     si, ax
        mov     al, [si]
        or      al, al
        jz      .transparent
        mov     [es:di], al
.transparent:
        inc     di
        inc     word [cs:icon_dx]
        jmp     .pixel
.next_row:
        inc     word [cs:icon_dy]
        jmp     .row
.done:
        pop     ds
        pop     bp
        pop     di
        pop     si
        pop     dx
        pop     cx
        pop     bx
        pop     ax
        ret

; draw_rect: AX=x, BX=y, CX=w, [rect_h]=h, DL=color.  ES=A000.
draw_rect:
        mov     [rect_x], ax
        mov     [rect_y], bx
        mov     [rect_w], cx
        mov     [rect_color], dl
.row:
        cmp     word [rect_h], 0
        je      .done
        mov     ax, [rect_x]
        mov     bx, [rect_y]
        mov     cx, [rect_w]
        mov     dl, [rect_color]
        call    draw_hline
        inc     word [rect_y]
        dec     word [rect_h]
        jmp     .row
.done:
        ret

; draw_hline: AX=x, BX=y, CX=len, DL=color.  ES=A000.
draw_hline:
        push    ax
        push    dx
        mov     ax, bx
        mov     bx, 320
        mul     bx
        mov     di, ax
        pop     dx
        pop     ax
        add     di, ax
        mov     al, dl
        rep     stosb
        ret

; draw_vline: AX=x, BX=y, CX=len, DL=color.  ES=A000.
draw_vline:
        push    ax
        push    dx
        mov     ax, bx
        mov     bx, 320
        mul     bx
        mov     di, ax
        pop     dx
        pop     ax
        add     di, ax
        mov     al, dl
.lp:
        jcxz    .done
        mov     [es:di], al
        add     di, 320
        dec     cx
        jmp     .lp
.done:
        ret

dump_view_raw:
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, vrawname
        int     21h
        push    cs
        pop     ds
        jc      .err
        mov     [outfh], ax

        mov     dx, rawhdr
        mov     cx, 4
        call    write_out
        jc      .close_err

        ; VGA mode 13h is one contiguous 64,000-byte frame.  Write it in
        ; one DOS call rather than copying each scanline through a scratch
        ; buffer; write_out reads the handle through CS and restores DS.
        push    ds
        mov     ax, 0A000h
        mov     ds, ax
        xor     dx, dx
        mov     cx, 64000
        call    write_out
        pop     ds
        jc      .close_err

.palette:
        cmp     byte [icon_valid], 0
        je      .fixed_palette
        push    ds
        mov     ds, [cs:icon_seg]
        mov     dx, [cs:icon_bases]
        add     dx, [cs:icon_npixels]
        add     dx, 14
        mov     bx, [cs:outfh]
        mov     ah, 40h
        mov     cx, 768
        int     21h
        pop     ds
        jc      .close_err
        jmp     .palette_done
.fixed_palette:
        mov     dx, combat_pal
        mov     cx, 768
        call    write_out
        jc      .close_err
.palette_done:
        mov     bx, [outfh]
        mov     ah, 3Eh
        int     21h
        push    cs
        pop     es
        clc
        ret
.close_err:
        mov     bx, [outfh]
        mov     ah, 3Eh
        int     21h
.err:
        stc
        ret

; write CX bytes from DS:DX to [outfh].  Works while DS is A000 by reading the
; handle through CS.
write_out:
        mov     bx, [cs:outfh]
        mov     ah, 40h
        int     21h
        push    cs
        pop     ds
        jc      .err
        cmp     ax, cx
        jne     .err
        clc
        ret
.err:
        stc
        ret

; ============================================================================
;  RNG -- exact port of packages/engine/src/util/rng.ts
;    next():  state = (state*1664525 + 1013904223) >>> 0   (32-bit)
;    die(s):  s<=0 -> 0 ; s==1 -> 1 ; else (next() % s) + 1
;    roll(n,s,b): b + sum(die(s)) in order
;  32-bit state held in dx:ax (dx=high, ax=low) is awkward in 16-bit; we keep
;  the state in a dword variable and use 386 32-bit ops (cpu 386) for the mul.
; ============================================================================
rng_seed:
        cmp     byte [cok_rng_mode], 0
        je      .legacy
        mov     eax, [cok_rng_resume+10]
        mov     [rng_state], eax
        ret
.legacy:
        movzx   eax, word [seed]            ; seed is 16-bit on the command line
        mov     [rng_state], eax
        ret

; rng_next -> EAX = new 32-bit state (also stored).  Clobbers EDX.
rng_next:
        mov     eax, [rng_state]
        mov     edx, 1664525
        mul     edx                         ; EDX:EAX = state * 1664525 ; keep low 32 in EAX
        add     eax, 1013904223
        mov     [rng_state], eax            ; >>> 0 is implicit in 32-bit wrap
        ret

; rng_die: AX = sides (signed-ish, treated as int).  Returns AX = 1..sides (0 if <=0).
;   Matches: if(sides<=0)return 0; if(sides===1)return 1; return (next()%sides)+1
rng_die:
        cmp     byte [secret_profile], 0
        jne     se_die
        cmp     byte [cok_rng_mode], 0
        jne     cok_combat_die
        test    ax, ax
        jg      .pos
        xor     ax, ax                      ; sides<=0 -> 0
        ret
.pos:
        cmp     ax, 1
        jne     .roll
        mov     ax, 1                        ; sides==1 -> 1
        ret
.roll:
        movzx   ecx, ax                      ; divisor (sides), zero-extended
        push    ecx
        call    rng_next                     ; EAX = next() (unsigned 32-bit)
        pop     ecx
        xor     edx, edx
        div     ecx                          ; EAX/ECX -> EDX = next() % sides (unsigned)
        mov     ax, dx
        inc     ax                           ; +1
        ret

; rng_roll: BX=count, CX=sides, DX=bonus(signed) -> AX = bonus + sum(die(sides))
;   Draws die(sides) exactly `count` times, IN ORDER (matches the oracle for-loop).
rng_roll:
        push    si
        push    di
        movsx   edi, dx                      ; running total (signed) in EDI = bonus
        mov     si, bx                       ; loop counter
.lp:
        test    si, si
        jle     .done
        mov     ax, cx                       ; sides
        push    si
        push    cx
        call    rng_die                      ; AX = die(sides)
        pop     cx
        pop     si
        movsx   eax, ax
        add     edi, eax
        dec     si
        jmp     .lp
.done:
        mov     eax, edi
        pop     di
        pop     si
        ret                                  ; result in AX (low 16; values are small)

; ============================================================================
;  Encounter builder -- synthetic Tier-1 fixture (commit-safe, NOT game data).
;  Layout matches what the TS harness builds for the same encounter id.
; ============================================================================
%include "cokcombatrng.inc"

build_encounter:
        ; copy the static fixture record table into the live combatant array.
        ; Unknown ids select encounter "1" for backwards-compatible smoke runs.
        mov     word [terrain_block_count], 0
        mov     word [terrain_cost_count], 0
        mov     word [hazard_count], 0
        mov     word [guard_ai_enabled], 0
        mov     word [fixture_status_seed_timer], 0
        call    clear_status_timers
        call    clear_secondary_attacks
        mov     si, enc_table
.scan:
        mov     ax, [si]
        or      ax, ax
        jz      .fixture1
        cmp     ax, [encid]
        jne     .next
        or      ah, ah
        jz      .hit                        ; one-character id: exact match
        mov     al, [si+2]
        cmp     al, [encid+2]
        je      .hit
.next:
        add     si, 8
        jmp     .scan
.hit:
        mov     dx, si                      ; dx = matched table entry
        mov     cl, [si+3]                  ; kind = type<<4 | enc_spec row
        or      cl, cl
        jz      .plain
        mov     al, cl
        and     al, 0Fh
        shl     al, 2
        cbw
        add     ax, enc_spec
        mov     di, ax
        shr     cl, 4
        cmp     cl, 3
        jb      .spec
        je      .guard
        cmp     cl, 5
        jb      .gen2
        je      .status
.spec:                                      ; 1 terrain, 2 hazard, 6 terrain+cost
        push    cx
        mov     si, [di+2]
        mov     di, [di]
        mov     ax, [di]
        cmp     cl, 2
        je      .haz
        mov     [terrain_block_count], ax
        mov     di, terrain_blocks
        mov     cl, 1
        jmp     .mv
.haz:
        mov     [hazard_count], ax
        mov     di, hazard_cells
        mov     cl, 3
.mv:
        shl     ax, cl
        mov     cx, ax
        rep     movsw
        pop     ax
        cmp     al, 6
        jne     .plain
        mov     ax, [fixture10_cost_n]
        mov     [terrain_cost_count], ax
        mov     si, fixture10_cost
        mov     di, terrain_costs
        mov     cx, ax
        shl     cx, 1
        add     cx, ax
        rep     movsw
        jmp     .plain
.guard:
        mov     word [guard_ai_enabled], 1
        jmp     .plain
.gen2:
        mov     byte [combat_ruleset], RULE_GEN2
        jmp     .plain
.status:
        mov     word [fixture_status_seed_idx], 0
        mov     word [fixture_status_seed_kind], HAZ_STATUS_HELD
        mov     word [fixture_status_seed_timer], 3
.plain:
        mov     si, dx
        mov     di, [si+6]
        mov     cx, [di]
        mov     si, [si+4]
        jmp     .copy
.fixture1:
        mov     si, fixture1
        mov     cx, [fixture1_n]
.copy:
        mov     di, comb
        mov     [ncomb], cx
        ; cx records * C_REC bytes
        mov     ax, C_REC
        mul     cx                          ; DX:AX = total bytes (small)
        mov     cx, ax
        rep     movsb
        call    seed_fixture_status_timer
        ret

clear_status_timers:
        push    ax
        push    cx
        push    di
        push    es
        push    ds
        pop     es
        xor     ax, ax
        mov     di, status_timer
        mov     cx, MAXCOMB
        rep     stosw
        mov     di, status_kind
        mov     cx, MAXCOMB
        rep     stosw
        pop     es
shared_epi_ax_cx_di_es:
        pop     di
        pop     cx
        pop     ax
        ret

clear_secondary_attacks:
        push    ax
        push    cx
        push    di
        push    es
        push    ds
        pop     es
        xor     ax, ax
        mov     di, sec_dcount
        mov     cx, MAXCOMB
        rep     stosw
        mov     di, sec_dsides
        mov     cx, MAXCOMB
        rep     stosw
        mov     di, sec_dbonus
        mov     cx, MAXCOMB
        rep     stosw
        pop     es
        jmp     shared_epi_ax_cx_di_es

seed_fixture_status_timer:
        push    ax
        push    bx
        mov     ax, [fixture_status_seed_timer]
        cmp     ax, 0
        jle     .done
        mov     bx, [fixture_status_seed_idx]
        cmp     bx, [ncomb]
        jae     .done
        shl     bx, 1
        mov     [status_timer+bx], ax
        mov     ax, [fixture_status_seed_kind]
        mov     [status_kind+bx], ax
.done:
        pop     bx
        pop     ax
        ret

; ============================================================================
;  build_effect_encounter -- expand a CCECL GBEF COMBAT handoff prefix into the
;  live combatant array.  Party side is the fixture party for now.  With a
;  Gen1 CoK MON*CHA.DAX path, enemies use decoded record stats. DoK compact
;  MON*CHA.DAX records supply verified THAC0/AC/damage and REAL HP read from the
;  record (+40 max, +108 live) -- corrected 2026-09-07; "deterministic HP" here
;  described the pre-132306c placeholder and was two days out of date.
;  Pool 287-byte MON*CHA records supply fixed-offset HP, THAC0, AC, damage,
;  XP, and icon footprint fields. DQK MONCHA.GLB records are read at fixed
;  offsets past the 2-byte length word, monster or NPC framing chosen by the
;  is-monster byte, resolved through its id table.
;  Without an archive, enemy stats are placeholders keyed by monsterId/picBlock.
; ============================================================================
build_effect_encounter:
        call    clear_secondary_attacks
        call    read_gbef
        jc      .err
        cmp     word [fxbuf], 'GB'
        jne     .err
        cmp     word [fxbuf+2], 'EF'
        jne     .err
        cmp     word [fxbuf+4], 2
        jb      .err
        cmp     word [fxbuf+8], 3          ; CCECL vm status: COMBAT yield
        jne     .err
        mov     ax, [fxbuf+6]
        test    ax, 0008h                  ; FX_HAVE_ENC
        jz      .err
        mov     ax, [fxbuf+32]             ; queued group count
        or      ax, ax
        jz      .err
        cmp     ax, GBEF_MAX_GROUPS
        jbe     .count_ok
        jmp     .err
.count_ok:
        mov     [fx_group_count], ax
        ; DQK CCECL tags the otherwise-unused third LOAD_FILES prefix word
        ; with D0xx. Resolve its independent terrain-master group ordinals
        ; here, on the combat path; never fold them into exploration wall state.
        mov     word [combat_hlib_groups], 0
        mov     ax, [fxbuf+16]
        cmp     ah, 0d0h
        jne     .combat_groups_done
        and     ax, 00ffh
        cmp     ax, 6
        ja      .combat_groups_done
        mov     bx, ax
        mov     al, [dqk_combat_group_pairs+bx]
        xor     ah, ah
        mov     [combat_hlib_groups], ax
.combat_groups_done:
        cmp     byte [monmode], 0
        je      .no_mon
        call    load_mon_archive
        jc      .err
.no_mon:

        cmp     byte [partyname], 0
        je      .fixture_party
        call    load_gbpr_party
        jc      .err
        jmp     .party_ready
.fixture_party:
        ; Compatibility fixture used when no explicit native roster is supplied.
        mov     si, fixture1
        mov     di, comb
        mov     cx, C_REC * 2
        rep     movsb
        mov     word [ncomb], 2
.party_ready:
        call    validate_effect_capacity
        jc      .err
        mov     word [effect_enemy_ord], 0
        mov     word [fx_group_idx], 0

.group_loop:
        mov     ax, [fx_group_idx]
        cmp     ax, [fx_group_count]
        jae     .done
        mov     bx, ax
        shl     bx, 1
        mov     dx, bx
        shl     bx, 1
        add     bx, dx                      ; bx = group index * 6
        mov     ax, [fxbuf+34+bx]
        mov     [fx_monster], ax
        mov     ax, [fxbuf+36+bx]
        and     ax, 00ffh
        mov     [fx_copies], ax
        mov     ax, [fxbuf+38+bx]
        mov     [fx_pic], ax

.copy_loop:
        cmp     word [fx_copies], 0
        je      .next_group
        cmp     word [ncomb], MAXCOMB
        jae     .err
        call    append_effect_enemy
        jc      .err
        dec     word [fx_copies]
        jmp     .copy_loop

.next_group:
        inc     word [fx_group_idx]
        jmp     .group_loop
.done:
        cmp     word [effect_enemy_ord], 0
        je      .err
        clc
        ret
.err:
        stc
        ret

; Validate the complete declared handoff before any enemy is appended.  The
; 32-record combat array includes the already loaded party, so accepting only
; the prefix that fits would turn a source encounter into an easier one.
validate_effect_capacity:
        push    ax
        push    bx
        push    cx
        push    dx
        push    si
        mov     ax, [ncomb]
        mov     cx, [fx_group_count]
        xor     dx, dx
.loop:
        cmp     dx, cx
        jae     .ok
        mov     bx, dx
        shl     bx, 1
        mov     si, bx
        shl     bx, 1
        add     bx, si                    ; group index * 6
        mov     bx, [fxbuf+36+bx]
        and     bx, 00ffh
        add     ax, bx
        cmp     ax, MAXCOMB
        ja      .bad
        inc     dx
        jmp     .loop
.ok:
        clc
        jmp     .done
.bad:
        stc
.done:
        pop     si
shared_epi_ax_bx_cx_dx_si:
        pop     dx
        pop     cx
        pop     bx
        pop     ax
        ret

read_gbef:
        mov     ax, 3D00h
        mov     dx, efxname
        int     21h
        jc      .err
        mov     [infh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, GBEF_LEN
        mov     dx, fxbuf
        int     21h
        jc      .close_err
        cmp     ax, GBEF_LEN
        jb      .close_err
        call    read_cok_rng
        jc      .close_err
        mov     bx, [infh]
        mov     ah, 3Eh
        int     21h
        clc
        ret
.close_err:
        mov     bx, [infh]
        mov     ah, 3Eh
        int     21h
.err:
        stc
        ret

load_wall_terrain_optional:
        cmp     byte [wallname], 0
        je      .ok
        mov     ax, 3D00h
        mov     dx, wallname
        int     21h
        jc      .ok
        mov     [wallfh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, WALLBUF_LEN
        mov     dx, wallbuf
        int     21h
        jc      .close_ok
        mov     [wall_len], ax
.close_ok:
        mov     bx, [wallfh]
        mov     ah, 3Eh
        int     21h
        cmp     word [wallbuf], 'WG'
        jne     .ok
        cmp     word [wallbuf+2], 'RD'
        jne     .ok
        cmp     word [wall_len], 10
        jb      .ok
        movzx   ax, byte [wallbuf+4]
        or      ax, ax
        jz      .ok
        cmp     ax, 32
        ja      .ok
        mov     [wall_w], ax
        movzx   ax, byte [wallbuf+5]
        or      ax, ax
        jz      .ok
        cmp     ax, 32
        ja      .ok
        mov     [wall_h], ax
        mov     ax, [wall_w]
        cmp     ax, COMBAT_GRID_W
        jbe     .max_x_ok
        mov     ax, COMBAT_GRID_W
.max_x_ok:
        mov     [wall_max_x], ax
        mov     ax, [wall_h]
        cmp     ax, COMBAT_GRID_H
        jbe     .max_y_ok
        mov     ax, COMBAT_GRID_H
.max_y_ok:
        mov     [wall_max_y], ax
        mov     word [wall_y], 0
.row:
        mov     ax, [wall_y]
        cmp     ax, [wall_max_y]
        jae     .ok
        mov     word [wall_x], 0
.col:
        mov     ax, [wall_x]
        cmp     ax, [wall_max_x]
        jae     .next_row
        call    wall_cell_offset
        jc      .next_col
        mov     si, wallbuf
        add     si, ax
        cmp     byte [si], 0
        je      .next_col
        cmp     byte [si+1], 0
        je      .next_col
        cmp     byte [si+2], 0
        je      .next_col
        cmp     byte [si+3], 0
        je      .next_col
        call    append_wall_terrain_block
.next_col:
        inc     word [wall_x]
        jmp     .col
.next_row:
        inc     word [wall_y]
        jmp     .row
.ok:
        clc
        ret

; AX = byte offset into wallbuf for [wall_x],[wall_y], CF=1 if outside the
; bytes actually read. WGRD cells are four bytes [N,E,S,W] after a 6-byte header.
wall_cell_offset:
        push    bx
        push    dx
        mov     ax, [wall_y]
        mov     bx, [wall_w]
        mul     bx
        add     ax, [wall_x]
        shl     ax, 1
        shl     ax, 1
        add     ax, 6
        mov     dx, ax
        add     dx, 3
        cmp     dx, [wall_len]
        jae     .bad
        clc
        jmp     .done
.bad:
        stc
.done:
        pop     dx
        pop     bx
        ret

append_wall_terrain_block:
        push    ax
        push    bx
        push    cx
        mov     cx, [terrain_block_count]
        cmp     cx, MAX_TERRAIN_BLOCKS
        jae     .done
        mov     bx, cx
        shl     bx, 2
        mov     ax, [wall_x]
        mov     [terrain_blocks+bx], ax
        mov     ax, [wall_y]
        mov     [terrain_blocks+bx+2], ax
        inc     word [terrain_block_count]
.done:
        pop     cx
shared_epi_ax_bx_cx:
        pop     bx
        pop     ax
        ret

append_effect_enemy:
        push    di
        mov     ax, [ncomb]
        imul    ax, ax, C_REC
        add     ax, comb
        mov     di, ax

        mov     byte [di+C_SIDE], 1
        mov     ax, [effect_enemy_ord]
        mov     [di+C_ORD], al
        mov     word [di+C_SIZE], 1
        mov     word [di+C_MOVE], DEFAULT_MOVE_CELLS
        mov     word [di+C_MRANGE], 0
        mov     word [di+C_AMMO], 0
        mov     word [di+C_ATTACKS], 1
        mov     word [di+C_HALFATT], 0
        mov     word [di+C_FLAGS], 0

        cmp     byte [monmode], 0
        je      .placeholder
        call    fill_enemy_from_mon
        jnc     .common
        pop     di
        ret

.placeholder:
        ; hp/maxHp = 4 + (monsterId & 7), enough variance to prove the handoff.
        mov     ax, [fx_monster]
        and     ax, 0007h
        add     ax, 4
        mov     [di+C_HP], ax
        mov     [di+C_MAXHP], ax

        ; default deterministic combat stats (thac0/ac/damage/xp) from fx_monster/fx_pic
        call    calc_default_combat_stats
.common:
        mov     word [di+C_INIT], 0FFFFh
        mov     ax, [effect_enemy_ord]
        cmp     ax, EFFECT_ENEMY_SLOT_COUNT
        jb      .slot_ok
        xor     ax, ax
.slot_ok:
        shl     ax, 1
        shl     ax, 1
        mov     bx, ax
        mov     ax, [effect_enemy_slots+bx]
        cmp     word [di+C_SIZE], 1
        je      .col_ok
        cmp     ax, 8
        jbe     .col_ok
        mov     ax, 8
.col_ok:
        mov     [di+C_COL], ax
        mov     ax, [effect_enemy_slots+bx+2]
        cmp     word [di+C_SIZE], 1
        je      .row_ok
        cmp     ax, 8
        jbe     .row_ok
        mov     ax, 8
.row_ok:
        mov     [di+C_ROW], ax

        mov     bx, [ncomb]
        shl     bx, 1
        mov     ax, [fx_pic]
        mov     [combat_pic+bx], ax

        inc     word [ncomb]
        inc     word [effect_enemy_ord]
        pop     di
        ret

; -- Shared deterministic combat-stat fallback --------------------------
;  Sets THAC0/AC/damage dice/XP for the current enemy record (DI) from
;  fx_monster/fx_pic when no better source is available. Factored out of
;  three identical inline copies (append_effect_enemy .placeholder,
;  fill_enemy_from_mon .buck, and fill_enemy_from_mon .err) -- HP/MAXHP
;  are set separately by each caller since .buck derives them from a
;  verified raw record instead of this placeholder scheme.
calc_default_combat_stats:
        mov     ax, [fx_monster]
        shr     ax, 3
        and     ax, 0001h
        add     ax, 18
        mov     [di+C_THAC0], ax

        mov     ax, 10
        mov     bx, [fx_monster]
        and     bx, 0003h
        sub     ax, bx
        mov     [di+C_AC], ax

        mov     word [di+C_DCOUNT], 1
        mov     ax, [fx_pic]
        and     ax, 0003h
        add     ax, 4
        mov     [di+C_DSIDES], ax
        mov     word [di+C_DBONUS], 0
        mov     ax, [fx_monster]
        add     ax, 5
        mov     [di+C_XP], ax
        ret

fill_enemy_from_mon:
        mov     byte [mon_record_loaded], 0
        push    di
        call    dax_get_mon_record
        pop     di
        jc      .err
        cmp     byte [secret_profile], 0
        je      .legacy_profile
        call    se_fill_enemy
        ret                         ; explicit profile never admits placeholders
.legacy_profile:
        cmp     byte [monkind], MONK_GLB
        jne     .not_glb
        jmp     .dqk
.not_glb:
        cmp     word [mon_raw_size], 422
        je      .coab
        cmp     word [mon_raw_size], 409
        je      .cok
        cmp     word [mon_raw_size], 216
        je      .dok
        cmp     word [mon_raw_size], 287
        je      .pool
        cmp     word [mon_raw_size], 263
        je      .buck
        jmp     .err

.coab:
        ; CoAB Player.StructSize == 0x1A6. MONnCHA stores both base and
        ; recalculated combat fields; prefer the runtime tail when populated.
        movzx   ax, byte [monraw+1A4h]     ; hit_point_current
        cmp     ax, 0
        jne     .coab_hp_ok
        movzx   ax, byte [monraw+78h]      ; hit_point_max
.coab_hp_ok:
        cmp     ax, 0
        jne     .coab_hp_store
        mov     ax, 1
.coab_hp_store:
        mov     [di+C_HP], ax
        mov     [di+C_MAXHP], ax

        mov     al, 60
        sub     al, [monraw+199h]          ; thac0 = 60 - hitBonus
        cbw
        mov     [di+C_THAC0], ax

        mov     al, 60
        sub     al, [monraw+19Ah]          ; ac = 60 - ac byte
        cbw
        mov     [di+C_AC], ax
        ; Keep the selected CoAB dual-attack profile coherent.  Prefer
        ; recalculated attack1, then attack2, then the base attack profiles.
        ; When attack1 is the primary routine and attack2 is populated, stash
        ; attack2 as a secondary melee routine for AI turn resolution.
        movzx   ax, byte [monraw+19Eh]     ; attack1_DiceCount
        cmp     ax, 0
        jne     .coab_atk1_runtime
        movzx   ax, byte [monraw+19Fh]     ; attack2_DiceCount
        cmp     ax, 0
        jne     .coab_atk2_runtime
        movzx   ax, byte [monraw+11Eh]     ; attack1_DiceCountBase
        cmp     ax, 0
        jne     .coab_atk1_base
        movzx   ax, byte [monraw+11Fh]     ; attack2_DiceCountBase
        cmp     ax, 0
        jne     .coab_atk2_base
        mov     ax, 1
        mov     [di+C_DCOUNT], ax
        mov     [di+C_DSIDES], ax
        xor     ax, ax
        mov     [di+C_DBONUS], ax
        jmp     .coab_damage_done
.coab_atk1_runtime:
        mov     [di+C_DCOUNT], ax
        movzx   ax, byte [monraw+1A0h]     ; attack1_DiceSize
        cmp     ax, 0
        jne     .coab_atk1_runtime_sides
        movzx   ax, byte [monraw+120h]     ; attack1_DiceSizeBase
        cmp     ax, 0
        jne     .coab_atk1_runtime_sides
        mov     ax, 1
.coab_atk1_runtime_sides:
        mov     [di+C_DSIDES], ax
        mov     al, [monraw+1A2h]          ; attack1_DamageBonus is signed
        cbw
        mov     [di+C_DBONUS], ax
        call    coab_store_runtime_attack2
        jmp     .coab_damage_done
.coab_atk2_runtime:
        mov     [di+C_DCOUNT], ax
        movzx   ax, byte [monraw+1A1h]     ; attack2_DiceSize
        cmp     ax, 0
        jne     .coab_atk2_runtime_sides
        movzx   ax, byte [monraw+121h]     ; attack2_DiceSizeBase
        cmp     ax, 0
        jne     .coab_atk2_runtime_sides
        mov     ax, 1
.coab_atk2_runtime_sides:
        mov     [di+C_DSIDES], ax
        mov     al, [monraw+1A3h]          ; attack2_DamageBonus is signed
        cbw
        mov     [di+C_DBONUS], ax
        jmp     .coab_damage_done
.coab_atk1_base:
        mov     [di+C_DCOUNT], ax
        movzx   ax, byte [monraw+120h]     ; attack1_DiceSizeBase
        cmp     ax, 0
        jne     .coab_atk1_base_sides
        mov     ax, 1
.coab_atk1_base_sides:
        mov     [di+C_DSIDES], ax
        mov     al, [monraw+122h]          ; attack1_DamageBonusBase is signed
        cbw
        mov     [di+C_DBONUS], ax
        call    coab_store_base_attack2
        jmp     .coab_damage_done
.coab_atk2_base:
        mov     [di+C_DCOUNT], ax
        movzx   ax, byte [monraw+121h]     ; attack2_DiceSizeBase
        cmp     ax, 0
        jne     .coab_atk2_base_sides
        mov     ax, 1
.coab_atk2_base_sides:
        mov     [di+C_DSIDES], ax
        mov     al, [monraw+123h]          ; attack2_DamageBonusBase is signed
        cbw
        mov     [di+C_DBONUS], ax
.coab_damage_done:
        mov     ax, [monraw+127h]          ; exp low word
        mov     [di+C_XP], ax
        movzx   ax, byte [monraw+11Ch]     ; attacksCount in half-attacks
        cmp     ax, 0
        je      .coab_halfatt_done
        mov     [di+C_HALFATT], ax
.coab_halfatt_done:
        mov     al, [monraw+0F7h]          ; control_morale
        call    set_morale_from_al
        clc
        ret

.cok:
        movzx   ax, byte [monraw+98]       ; hitPoints
        mov     [di+C_HP], ax
        mov     [di+C_MAXHP], ax

        mov     al, 60
        sub     al, [monraw+89]            ; thac0 = 60 - raw byte
        cbw
        mov     [di+C_THAC0], ax

        mov     al, 60
        sub     al, [monraw+275]           ; ac = 60 - raw byte
        cbw
        mov     [di+C_AC], ax

        movzx   ax, byte [monraw+269]
        mov     [di+C_DCOUNT], ax
        movzx   ax, byte [monraw+271]
        mov     [di+C_DSIDES], ax
        movzx   ax, byte [monraw+270]
        mov     [di+C_DBONUS], ax
        ; award = u16le(rec+304) + rec[306] * rec[283], the CoK sibling of the DoK
        ; formula verified in docs/engine/research/dok-kill-xp.md (its lines
        ; 120-123 carry the retail cross-check: GHOUL 65 + 2*9, SIVAK 350 + 6*27,
        ; RED DRAGON 1950 + 16*33).  Only the flat term was read until 2026-09-05,
        ; so every CoK kill under-awarded by exactly mult * rolled hp.
        mov     al, [monraw+306]           ; per-hit-point xp multiplier
        mul     byte [monraw+283]          ; ax = mult * rolled hp (truncated to 16)
        add     ax, [monraw+304]           ; + flat per-monster term
        mov     [di+C_XP], ax
        movzx   ax, byte [monraw+207]      ; combat icon size: >1 => Large
        call    decode_combat_size
        mov     [di+C_SIZE], ax
        ; movement = rec+0xD5 (retail copies it to combatant +0x198 at
        ; GAME.OVR 0x3755D; CalcMoves 0x14EB7 clamps outside 1..96 to 1 and
        ; doubles it to half-squares, which the shl at the use sites redoes).
        mov     al, [monraw+213]
        call    clamp_move_al
        mov     [di+C_MOVE], ax
        mov     al, [monraw+231]           ; control_morale
        call    set_morale_from_al
        clc
        ret

.dok:
        push    bx
        mov     bx, [ncomb]
        mov     al, [monraw+22]            ; DEX (cur) for per-round initiative
        mov     [dok_dex+bx], al
        pop     bx
        ; HP and kill-XP come from the retail bytes, per
        ; docs/engine/research/dok-kill-xp.md (Status: LOCATED, 2026-08-19; every
        ; offset there was re-read from disk): hp@40 is the maximum and is
        ; mirrored at @214, @108 is the live/rolled value (proven live rather than
        ; a second mirror by the six retail 216-byte SAVE/CHRDATA*.GAM, each of
        ; which has b108 < hp@40), @109..110 is the flat kill-XP term and @111 the
        ; per-hit-point multiplier.
        ;
        ; Until 2026-09-05 this branch derived HP from the monster INDEX
        ; (fx_monster & 7, + 4) and stored a hard zero to C_XP, behind a comment
        ; claiming HP/XP "remain unlocated" -- which had been false for the six
        ; weeks since that document was written.  DoK therefore awarded no
        ; experience at all for any kill.
        movzx   ax, byte [monraw+40]       ; max hit points (mirrored at +214)
        cmp     ax, 0
        jne     .dok_maxhp_ok
        mov     ax, 1                      ; degenerate record: same clamp as .pool
.dok_maxhp_ok:
        mov     [di+C_MAXHP], ax
        movzx   cx, byte [monraw+108]      ; live/rolled hit points
        cmp     cx, 0
        jne     .dok_hp_ok
        mov     cx, ax                     ; no rolled value -> enter at full hp
.dok_hp_ok:
        mov     [di+C_HP], cx

        mov     al, 60
        sub     al, [monraw+31]            ; thac0 = 60 - raw byte
        cbw
        mov     [di+C_THAC0], ax

        mov     al, 60
        sub     al, [monraw+95]            ; ac = 60 - raw byte
        cbw
        mov     [di+C_AC], ax

        movzx   ax, byte [monraw+89]
        mov     [di+C_DCOUNT], ax
        movzx   ax, byte [monraw+91]
        mov     [di+C_DSIDES], ax
        movzx   ax, byte [monraw+90]
        mov     [di+C_DBONUS], ax
        ; award = u16le(rec+109) + rec[111] * rec[108].  dok-kill-xp.md's VERIFIED
        ; section disassembles DoK's own calc_battle_exp (GAME.OVR 0x4C1B..0x4F14,
        ; XP core 0x4CED..0x4D20) doing exactly this, and records that mult * hp is
        ; truncated to a signed 16-bit int before retail's 32-bit accumulate --
        ; so the 16-bit product here is faithful, not a width shortcut.  Say the
        ; limit with it: that truncation is UNOBSERVABLE on shipped content.  The
        ; largest product across all 64 retail DoK records is 25 * 81 = 2025
        ; (UNDEAD ROC), nowhere near 32768, so no test on real data can tell this
        ; apart from a wider multiply.  It is faithful by disassembly, not by
        ; measurement.
        mov     al, [monraw+111]           ; per-hit-point xp multiplier
        mul     byte [monraw+108]          ; ax = mult * rolled hp (truncated to 16)
        add     ax, [monraw+109]           ; + flat per-monster term
        mov     [di+C_XP], ax
        movzx   ax, byte [monraw+41]       ; compact DoK icon size: >1 => Large
        call    decode_combat_size
        mov     [di+C_SIZE], ax
        mov     al, [monraw+62]            ; compact DoK control_morale
        call    set_morale_from_al
        clc
        ret

.pool:
        ; Pool of Radiance MON*CHA.DAX records decode to 287 bytes.
        movzx   ax, byte [monraw+50]       ; current/max HP
        cmp     ax, 0
        jne     .pool_hp_ok
        mov     ax, 1
.pool_hp_ok:
        mov     [di+C_HP], ax
        mov     [di+C_MAXHP], ax

        mov     al, 60
        sub     al, [monraw+45]            ; thac0 = 60 - raw byte
        cbw
        mov     [di+C_THAC0], ax

        mov     al, 60
        sub     al, [monraw+275]           ; ac = 60 - raw byte
        cbw
        mov     [di+C_AC], ax

        movzx   ax, byte [monraw+165]      ; primary damage dice count
        cmp     ax, 0
        jne     .pool_dcount_ok
        mov     ax, 1
.pool_dcount_ok:
        mov     [di+C_DCOUNT], ax
        movzx   ax, byte [monraw+167]      ; primary damage die size
        cmp     ax, 0
        jne     .pool_dsides_ok
        mov     ax, 1
.pool_dsides_ok:
        mov     [di+C_DSIDES], ax
        mov     al, [monraw+169]           ; primary damage bonus is signed
        cbw
        mov     [di+C_DBONUS], ax
        movzx   ax, byte [monraw+186]      ; XP is stored big-endian
        shl     ax, 8
        movzx   bx, byte [monraw+187]
        or      ax, bx
        mov     [di+C_XP], ax
        movzx   ax, byte [monraw+108]      ; combat icon size: >1 => Large
        call    decode_combat_size
        mov     [di+C_SIZE], ax
        clc
        ret

.buck:
        ; Buck Rogers Countdown MON0CHA.DAX records are 263 bytes. The archive
        ; and ids are verified. HP is the only combat field with a corpus-wide
        ; record oracle: raw[69] mirrors raw[227] in all 54 records. Validate
        ; that redundant source value before using it.  THAC0/AC/attack-1 damage
        ; are source-owned too (GAME.OVR-oracled, pinned with nulls by
        ; tools/test_buck_monster_fields.py): raw[51]=60-THAC0, raw[55]=60-AC,
        ; raw[61]/[63]/[65]=dice count/sides/signed bonus.  XP and movement
        ; remain placeholders.
        movzx   ax, byte [monraw+69]
        or      ax, ax
        jz      .err
        cmp     al, [monraw+227]
        jne     .err
        mov     [di+C_HP], ax
        mov     [di+C_MAXHP], ax

        ; placeholder stats first (keeps the XP placeholder), then overwrite the
        ; source-owned fields.
        call    calc_default_combat_stats
        mov     al, 60
        sub     al, [monraw+51]
        cbw
        mov     [di+C_THAC0], ax
        mov     al, 60
        sub     al, [monraw+55]
        cbw
        mov     [di+C_AC], ax
        movzx   ax, byte [monraw+61]
        mov     [di+C_DCOUNT], ax
        movzx   ax, byte [monraw+63]
        mov     [di+C_DSIDES], ax
        mov     al, [monraw+65]
        cbw
        mov     [di+C_DBONUS], ax
        clc
        ret

.dqk:
        mov     byte [mon_record_loaded], 1
        ; §29: with the phase fixed every field sits at a fixed offset, so the old
        ; five-step chain (reconstruct -> ability scan -> compact/short-tail -> canon-AC
        ; injection -> raw retry) has nothing left to do. It existed to compensate for
        ; records that would not decode at a fixed offset, and they would not decode
        ; because the length word was being eaten. The is-monster byte picks the half of
        ; the library; nothing here can invent a stat any more.
        ;
        ; The sentence that stood here ended "build_dqk_recon,
        ; try_dqk_selected_compact and try_dqk_selected_canon_ac are left assembled but
        ; unreferenced, as the record of a wrong turn." Those three are DELETED (with
        ; the rest of the cluster; see the §29 CLEANUP note by DQK_L_FIXED), so the
        ; sentence stopped being true the moment they went. It is quoted rather than
        ; dropped because it is the only place that recorded WHY they existed.
        ;
        ; Their three override flags went with them. dqk_ac_override, dqk_dmg_override
        ; and dqk_attacks_override were cleared here and tested below, and nothing has
        ; set any of them since their only setters were deleted -- three branches that
        ; could not be taken, plus dqk_ac_val / dqk_dmg_n / dqk_dmg_s / dqk_dmg_b /
        ; dqk_attacks_val / dqk_recon_size, all read-only-from-zero. The decode below is
        ; now the straight-line fixed-offset read it should have been.
        xor     bx, bx
        call    sniff_dqk_mon_direct
        jnc     .dqk_decode
.dqk_sniff_failed:
        ; A positive kind-2 rate with no valid kind-2 profile is distinguishable
        ; from an ordinary unsupported record.  On the sole trusted DQK handoff,
        ; reject it rather than admit the roster placeholder with an invented
        ; cadence.  GLIB and other callers retain their established fallback.
        or      bx, bx
        jz      .dqk_nonsecondary_failure
        cmp     byte [mon_glib], 0
        jne     .dqk_nonsecondary_failure
        cmp     byte [fxbuf+17], 0d0h
        je      .fail
.dqk_nonsecondary_failure:
        cmp     byte [monraw+DQK_L_ISMON], 0
        jne     .err
        call    try_dqk_selected_npc
        jc      .err
        jmp     .dqk_decode_npc

.dqk_decode:
        mov     si, monraw
        movzx   ax, byte [si+DQK_L_ABIL+25] ; hitDice (ability-relative)
        mov     bx, ax
        mov     cx, 9
        mul     cx
        inc     ax
        shr     ax, 1                      ; round(hd * 4.5)
        cmp     ax, bx
        jae     .dqk_hp_ok
        mov     ax, bx
.dqk_hp_ok:
        mov     [di+C_HP], ax
        mov     [di+C_MAXHP], ax

        mov     al, 60
        sub     al, [si+DQK_L_ABIL+15]     ; thac0 = 60 - raw byte
        cbw
        mov     [di+C_THAC0], ax

        mov     al, 60
        sub     al, [si+DQK_L_ABIL+67]     ; ac = 60 - raw byte
        cbw
        mov     [di+C_AC], ax

        movzx   ax, byte [si+DQK_L_ABIL+61]
        mov     [di+C_DCOUNT], ax
        movzx   ax, byte [si+DQK_L_ABIL+63]
        mov     [di+C_DSIDES], ax
        mov     al, [si+DQK_L_ABIL+65]     ; DQK damage bonus is signed
        cbw
        mov     [di+C_DBONUS], ax

        ; DQK stores independent two-round rates for attack kinds 1 and 2 at
        ; A+59/A+60, followed by the matching damage profiles at A+61..66.
        ; The retail combat consumer spends kind 2 before kind 1.  Keep the
        ; primary rate in C_HALFATT and use C_ATTACKS bit 15 as a DQK-only tag;
        ; its low byte carries the secondary rate.  This avoids growing C_REC,
        ; which has no resident-space budget, and leaves every non-DQK caller
        ; on the existing generic/CoK/DoK/CoAB paths.
        ;
        ; Provenance, because §29 deleted the previous attempt at this and the
        ; replacement should not be as thin. hackdocs_extracted/CCHFORM.TXT
        ; documents FRUA's record at 171-172 as "Number of attacks per two
        ; rounds (1st/2d attacks, unarmed)" with 179 = "60 - Base AC"; that
        ; layout registers onto DQK at a uniform +8, which is why the AC read
        ; eight lines above is at +67 and this one is at +59. Both archives were
        ; read: HYDRA is 8/0 1d12 AC 5 THAC0 7, and UMBER HULK is
        ; 4/2 3d4 AC 2 THAC0 12, byte-identical in FRUA's MONST.GLB at the
        ; documented offsets and in DQK's MONCHA.GLB at +8. The value 1 never
        ; occurs in any of the four rate columns across 450 fields, which is the
        ; parity argument that this is a per-two-rounds figure.
        ; See docs/engine/research/moncha-shorttail-c4.2b-2b-2a.md.
        ;
        ; Gate this compact encoding to the CCECL DQK handoff (D0xx), native
        ; HLIB, and this successfully validated bestiary record.  NPCs, GLIB,
        ; placeholders, and direct non-DQK callers retain their prior behavior.
        cmp     byte [mon_glib], 0
        jne     .dqk_rates_done
        cmp     byte [fxbuf+17], 0d0h
        jne     .dqk_rates_done
        movzx   ax, byte [si+DQK_L_ABIL+59]
        mov     [di+C_HALFATT], ax
        mov     al, [si+DQK_L_ABIL+60]
        mov     ah, 80h
        mov     [di+C_ATTACKS], ax

        mov     bx, [ncomb]
        shl     bx, 1
        movzx   ax, byte [si+DQK_L_ABIL+62]
        mov     [sec_dcount+bx], ax
        movzx   ax, byte [si+DQK_L_ABIL+64]
        mov     [sec_dsides+bx], ax
        mov     al, [si+DQK_L_ABIL+66]
        cbw
        mov     [sec_dbonus+bx], ax
.dqk_rates_done:

        mov     ax, [monraw+DQK_L_XP]
        mov     [di+C_XP], ax
        clc
        ret
.dqk_decode_npc:
        mov     si, monraw
        movzx   ax, byte [si+DQK_L_ABIL+17] ; stored HP, not hit-dice average
        mov     [di+C_HP], ax
        mov     [di+C_MAXHP], ax

        mov     al, 60
        sub     al, [si+DQK_L_ABIL+15]     ; thac0 = 60 - raw byte
        cbw
        mov     [di+C_THAC0], ax

        mov     al, 60
        sub     al, [si+DQK_L_ABIL+67]     ; ac = 60 - raw byte
        cbw
        mov     [di+C_AC], ax

        mov     word [di+C_DCOUNT], 1      ; decodeNpcRecord nominal melee placeholder
        mov     word [di+C_DSIDES], 2
        mov     word [di+C_DBONUS], 0
        mov     word [di+C_XP], 0
        clc
        ret
.err:
        cmp     byte [monkind], MONK_GLB
        jne     .fail
        cmp     byte [mon_record_loaded], 0
        je      .fail
        ; Resolved HLIB/GLIB MONCHA records can be roster-only (for example
        ; DQK's Area-5 ZOMBIE) and therefore have no validated stat layout.
        ; Keep combat moving with the deterministic placeholder below, but do
        ; not admit unknown IDs, corrupt members, or failed decompression:
        ; mon_record_loaded remains the required proof of a real record.
        mov     ax, [fx_monster]
        and     ax, 0007h
        add     ax, 4
        mov     [di+C_HP], ax
        mov     [di+C_MAXHP], ax
        ; default deterministic combat stats (thac0/ac/damage/xp) from fx_monster/fx_pic
        call    calc_default_combat_stats
        clc
        ret
.fail:
        stc
        ret

coab_store_runtime_attack2:
        movzx   ax, byte [monraw+19Fh]     ; attack2_DiceCount
        or      ax, ax
        je      .done
        mov     bx, [ncomb]
        shl     bx, 1
        mov     [sec_dcount+bx], ax
        movzx   ax, byte [monraw+1A1h]     ; attack2_DiceSize
        cmp     ax, 0
        jne     .sides
        movzx   ax, byte [monraw+121h]     ; attack2_DiceSizeBase fallback
        cmp     ax, 0
        jne     .sides
        mov     ax, 1
.sides:
        mov     [sec_dsides+bx], ax
        mov     al, [monraw+1A3h]          ; attack2_DamageBonus is signed
        cbw
        mov     [sec_dbonus+bx], ax
.done:
        ret

coab_store_base_attack2:
        movzx   ax, byte [monraw+11Fh]     ; attack2_DiceCountBase
        or      ax, ax
        je      .done
        mov     bx, [ncomb]
        shl     bx, 1
        mov     [sec_dcount+bx], ax
        movzx   ax, byte [monraw+121h]     ; attack2_DiceSizeBase
        cmp     ax, 0
        jne     .sides
        mov     ax, 1
.sides:
        mov     [sec_dsides+bx], ax
        mov     al, [monraw+123h]          ; attack2_DamageBonusBase is signed
        cbw
        mov     [sec_dbonus+bx], ax
.done:
        ret

decode_combat_size:
        cmp     ax, 1
        jbe     .small
        mov     ax, 2
        ret
.small:
        mov     ax, 1
        ret

; set_morale_from_al: AL=control_morale byte, DI=combatant. Stores optional
; morale% in the high byte of C_FLAGS as morale+1.
set_morale_from_al:
        push    ax
        cmp     al, 7Fh
        jbe     .none
        and     al, 7Fh
        movzx   ax, al
        shl     ax, 1
        cmp     ax, 102
        jbe     .store
        mov     ax, 102
.store:
        inc     ax
        shl     ax, 8
        and     word [di+C_FLAGS], 00FFh
        or      [di+C_FLAGS], ax
        jmp     .done
.none:
        and     word [di+C_FLAGS], 00FFh
.done:
        pop     ax
        ret

sniff_dqk_mon_direct:
        cmp     word [mon_raw_size], DQK_L_FIXED
        jb      .fail
        cmp     byte [monraw+DQK_L_ISMON], 1
        jne     .fail
        mov     al, 60
        sub     al, [monraw+DQK_L_ABIL+15]
        cmp     al, 30
        ja      .fail
        mov     al, 60
        sub     al, [monraw+DQK_L_ABIL+67]
        cbw
        cmp     ax, -12
        jl      .fail
        cmp     ax, 16
        jg      .fail
        movzx   ax, byte [monraw+DQK_L_ABIL+25]
        cmp     ax, 1
        jb      .fail
        cmp     ax, 40
        ja      .fail
        movzx   ax, byte [monraw+DQK_L_ABIL+61]
        cmp     ax, 1
        jb      .fail
        cmp     ax, 20
        ja      .fail
        mov     al, [monraw+DQK_L_ABIL+63]
        call    is_dqk_die_size
        jc      .fail
        ; A zero second rate is a valid absent routine. A positive rate must
        ; carry a complete secondary profile before the later DQK tag can
        ; activate it; otherwise retain no approximate scheduler.
        cmp     byte [monraw+DQK_L_ABIL+60], 0
        je      .valid
        movzx   ax, byte [monraw+DQK_L_ABIL+62]
        cmp     ax, 1
        jb      .secondary_fail
        cmp     ax, 20
        ja      .secondary_fail
        mov     al, [monraw+DQK_L_ABIL+64]
        call    is_dqk_die_size
        jc      .secondary_fail
.valid:
        clc
        ret
.secondary_fail:
        inc     bx                    ; caller distinguishes this exact failure
.fail:
        stc
        ret

try_dqk_selected_npc:
        cmp     byte [monraw+DQK_L_ISMON], 0
        jne     .fail
        cmp     word [mon_raw_size], DQK_L_FIXED
        jb      .fail
        ; The is-monster byte already said this is the character half, so the old
        ; ability-spread heuristics (is_dqk_rolled_ability / is_dqk_monster_default_ability)
        ; are not just redundant, they are wrong: they would reject a named NPC whose
        ; abilities happen to be flat 10s. Only the field-range check remains.
        call    sniff_dqk_npc_ability
        jc      .fail
        clc
        ret
.fail:
        stc
        ret

sniff_dqk_npc_ability:
        mov     si, monraw
        mov     al, 60
        sub     al, [si+DQK_L_ABIL+15]
        cmp     al, 30
        ja      .fail
        movzx   ax, byte [si+DQK_L_ABIL+17]
        cmp     ax, 1
        jb      .fail
        movzx   ax, byte [si+DQK_L_ABIL+25]
        cmp     ax, 1
        jb      .fail
        cmp     ax, 40
        ja      .fail
        clc
        ret
.fail:
        stc
        ret

is_dqk_die_size:
        cmp     al, 4
        ja      .above4
        cmp     al, 1
        jb      .no
        jmp     .yes                   ; 1, 2, 3, 4
.above4:
        cmp     al, 12
        ja      .above12
        test    al, 1
        jz      .yes                   ; 6, 8, 10, 12
.above12:
        cmp     al, 20
        je      .yes
        cmp     al, 100
        je      .yes
.no:
        stc
        ret
.yes:
        clc
        ret

; int 21h whose DS:DX buffer is the FS-addressed daxbuf block.
dax_int21:
        push    ds
        push    fs
        pop     ds
        int     21h
        pop     ds
        ret

; Shrink the .COM block to image + icon buffer, then allocate the DAX block.
alloc_daxseg:
        mov     ax, cs
        mov     es, ax
        mov     bx, 1000h+ICON_PARAS
        mov     ah, 4Ah
        int     21h
        jc      .fail
        mov     bx, DAXPARAS
        mov     ah, 48h
        int     21h
        jc      .fail
        mov     [daxseg], ax
        mov     fs, ax
        ; DOS hands the block back uninitialised; the old in-image buffer was
        ; zero, and short-read paths may rely on that.
        mov     es, ax
        xor     di, di
        xor     ax, ax
        mov     cx, DAX_FILEMAX/2
        cld
        rep     stosw
        push    cs
        pop     es
        clc
        ret
.fail:
        stc
        ret

load_mon_archive:
        mov     ax, 3D00h
        mov     dx, monname
        int     21h
        jc      .err
        mov     [infh], ax
        mov     bx, ax
        cmp     byte [secret_profile], 0
        je      .size_ok
        call    se_check_mon_size
        jc      .close_err
.size_ok:
        mov     ah, 3Fh
        mov     cx, 16
        mov     dx, daxbuf
        call    dax_int21
        jc      .close_err
        mov     [dax_len], ax
        cmp     ax, 2
        jb      .close_err

        mov     byte [mon_glib], 0
        cmp     word [fs:daxbuf], 'HL'
        jne     .try_glib_header
        cmp     word [fs:daxbuf+2], 'IB'
        jne     .try_dax_header
        cmp     word [dax_len], 16
        jb      .close_err
        cmp     word [fs:daxbuf+12], 'DA'
        jne     .close_err
        mov     bx, [infh]
        mov     ax, 4200h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_err
        mov     bx, [infh]
        mov     ah, 3Fh
        mov     cx, DAX_FILEMAX
        mov     dx, daxbuf
        call    dax_int21
        jc      .close_err
        mov     [dax_len], ax
        mov     ax, [fs:daxbuf+8]            ; stored pointer count - 1
        inc     ax
        cmp     ax, 2
        jb      .close_err
        cmp     ax, HLIB_PTRCAP
        ja      .close_err
        mov     [hlib_ptr_count], ax
        mov     bx, ax
        shl     bx, 2
        add     bx, 16
        cmp     bx, [dax_len]
        ja      .close_err
        mov     bx, [infh]
        mov     ah, 3Eh
        int     21h
        mov     byte [monkind], MONK_GLB
        mov     byte [combat_ruleset], RULE_GEN2
        clc
        ret

.try_glib_header:
        cmp     word [fs:daxbuf], 'GL'
        jne     .try_dax_header
        cmp     word [fs:daxbuf+2], 'IB'
        jne     .try_dax_header
        cmp     word [dax_len], 16
        jb      .close_err
        ; Secret uses DATA here; Gateway's MONCHA uses GLIB. Both are flat
        ; Amiga GLIB data containers with big-endian metadata and MONCHA RLE
        ; payload members.
        cmp     word [fs:daxbuf+12], 'DA'
        je      .glib_tag_ok
        cmp     word [fs:daxbuf+12], 'GL'
        jne     .close_err
.glib_tag_ok:
        mov     bx, [infh]
        mov     ax, 4200h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_err
        mov     bx, [infh]
        mov     ah, 3Fh
        mov     cx, DAX_FILEMAX
        mov     dx, daxbuf
        call    dax_int21
        jc      .close_err
        mov     [dax_len], ax
        mov     ax, [fs:daxbuf+8]            ; GLIB big-endian stored pointer count - 1
        xchg    al, ah
        inc     ax
        cmp     ax, 2
        jb      .close_err
        cmp     ax, HLIB_PTRCAP
        ja      .close_err
        mov     [hlib_ptr_count], ax
        mov     bx, ax
        shl     bx, 2
        add     bx, 16
        cmp     bx, [dax_len]
        ja      .close_err
        call    byteswap_hlib_ptrs
        mov     bx, [infh]
        mov     ah, 3Eh
        int     21h
        mov     byte [monkind], MONK_GLB
        mov     byte [mon_glib], 1
        mov     byte [combat_ruleset], RULE_GEN2
        clc
        ret

.try_dax_header:
        mov     ax, [fs:daxbuf]
        mov     [dax_toc_bytes], ax
        or      ax, ax
        jz      .close_err
        xor     dx, dx
        mov     bx, 9
        div     bx
        or      dx, dx
        jnz     .close_err
        mov     [dax_count], ax
        mov     ax, [dax_toc_bytes]
        add     ax, 2
        mov     [dax_data_base], ax
        cmp     ax, DAX_FILEMAX
        ja      .close_err
        mov     [dax_toc_read_len], ax
        mov     bx, [infh]
        mov     ax, 4200h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_err
        mov     bx, [infh]
        mov     ah, 3Fh
        mov     cx, [dax_toc_read_len]
        mov     dx, daxbuf
        call    dax_int21
        jc      .close_err
        cmp     ax, [dax_toc_read_len]
        jne     .close_err
        mov     bx, [infh]
        mov     ah, 3Eh
        int     21h
        mov     byte [monkind], MONK_DAX
        clc
        ret
.close_err:
        mov     bx, [infh]
        mov     ah, 3Eh
        int     21h
.err:
        stc
        ret

dax_get_mon_record:
        mov     ax, [fx_monster]
        mov     [want_mon], ax
        cmp     byte [monkind], MONK_GLB
        je      glb_get_mon_record
        mov     cx, [dax_count]
        mov     si, daxbuf+2
.scan:
        jcxz    .err
        movzx   ax, byte [fs:si]
        cmp     ax, [want_mon]
        je      .found
        add     si, 9
        dec     cx
        jmp     .scan
.found:
        mov     ax, [fs:si+5]
        cmp     ax, MON_RAW_MAX
        ja      .err
        mov     [mon_raw_size], ax
        mov     ax, [fs:si+1]
        add     ax, [dax_data_base]
        mov     [dax_src], ax
        mov     ax, [fs:si+3]
        adc     ax, 0
        mov     [dax_src_hi], ax
        mov     ax, [fs:si+7]
        mov     [dax_comp], ax
        or      ax, ax
        jz      .err
        add     ax, [dax_data_base]
        jc      .err
        cmp     ax, DAX_FILEMAX
        ja      .err
        call    dax_stream_to_monraw
        jc      .err
        clc
        ret
.err:
        stc
        ret

dax_stream_to_monraw:
        mov     ax, 3D00h
        mov     dx, monname
        int     21h
        jc      .err
        mov     [infh], ax
        mov     bx, ax
        mov     ax, 4200h
        mov     cx, [dax_src_hi]
        mov     dx, [dax_src]
        int     21h
        jc      .close_err
        mov     bx, [infh]
        mov     ah, 3Fh
        mov     cx, [dax_comp]
        mov     dx, daxbuf
        add     dx, [dax_data_base]
        call    dax_int21
        jc      .close_err
        cmp     ax, [dax_comp]
        jne     .close_err
        mov     bx, [infh]
        mov     ah, 3Eh
        int     21h
        mov     ax, [dax_data_base]
        mov     [dax_src], ax
        call    dax_rle_to_monraw
        ret
.close_err:
        mov     bx, [infh]
        mov     ah, 3Eh
        int     21h
.err:
        stc
        ret

glb_get_mon_record:
        cmp     byte [secret_profile], 0
        je      .profile_ok
        jmp     se_mon_member
.profile_ok:
        xor     ax, ax                      ; member 0 = id table
        call    hlib_member_span
        jc      .err
        mov     si, daxbuf
        add     si, [hlib_mem_start]
        mov     ax, [fs:si]
        cmp     byte [mon_glib], 0
        je      .idcount_ok
        xchg    al, ah
.idcount_ok:
        mov     [mon_id_count], ax
        add     si, 2
        mov     cx, [mon_id_count]
.scan:
        jcxz    .err
        mov     ax, si
        sub     ax, daxbuf
        add     ax, 4
        cmp     ax, [hlib_mem_end]
        ja      .err
        mov     ax, [fs:si]
        cmp     byte [mon_glib], 0
        je      .monid_ok
        xchg    al, ah
.monid_ok:
        cmp     ax, [want_mon]
        je      .found
        add     si, 4
        dec     cx
        jmp     .scan
.found:
        mov     ax, [fs:si+2]                  ; 1-based member index
        cmp     byte [mon_glib], 0
        je      .memidx_ok
        xchg    al, ah
.memidx_ok:
        or      ax, ax
        jz      .err
        call    hlib_member_span
        jc      .err
        cmp     byte [mon_glib], 0
        je      .rle
        mov     ax, [hlib_mem_end]
        sub     ax, [hlib_mem_start]
        cmp     ax, 422
        jne     .rle
        call    glb_raw_to_monraw
        clc
        ret
.rle:
        cmp     byte [mon_glib], 0
        jne     .legacy_glib_rle
        call    hlib_rle_to_monraw
        ret                          ; strict HLIB carry gates record admission
.legacy_glib_rle:
        call    glb_rle_to_monraw
        cmp     word [glb_decl_len], 0
        je      .err                 ; zero-length GLIB MONCHA member is corrupt
        clc
        ret
.err:
        stc
        ret

byteswap_hlib_ptrs:
        mov     si, daxbuf+16
        mov     cx, [hlib_ptr_count]
.loop:
        mov     al, [fs:si]
        mov     ah, [fs:si+1]
        mov     bl, [fs:si+2]
        mov     bh, [fs:si+3]
        mov     [fs:si], bh
        mov     [fs:si+1], bl
        mov     [fs:si+2], ah
        mov     [fs:si+3], al
        add     si, 4
        loop    .loop
        ret

glb_raw_to_monraw:
        mov     ax, [hlib_mem_end]
        sub     ax, [hlib_mem_start]
        cmp     ax, MON_RAW_MAX
        jbe     .len_ok
        mov     ax, MON_RAW_MAX
.len_ok:
        mov     [mon_raw_size], ax
        mov     cx, ax
        mov     si, daxbuf
        add     si, [hlib_mem_start]
        mov     di, monraw
        fs rep  movsb                     ; scratch source is in the allocated DOS block
        ret

hlib_member_span:
        mov     cx, [hlib_ptr_count]
        dec     cx
        cmp     ax, cx
        jae     .err
        mov     bx, ax
        shl     bx, 2
        add     bx, 16
        cmp     word [fs:daxbuf+bx+2], 0
        jne     .err
        cmp     word [fs:daxbuf+bx+6], 0
        jne     .err
        mov     ax, [fs:daxbuf+bx]
        mov     [hlib_mem_start], ax
        mov     ax, [fs:daxbuf+bx+4]
        mov     [hlib_mem_end], ax
        cmp     ax, [hlib_mem_start]
        jbe     .err
        cmp     ax, [dax_len]
        ja      .err
        clc
        ret
.err:
        stc
        ret

hlib_rle_to_monraw:
        ; DOS HLIB MONCHA members have a BE length prefix. Validate whole
        ; runs and all trailing input before admitting a decoded record.
        ; Headerless/raw Amiga generations retain their separate GLIB path.
        mov     word [mon_raw_size], 0
        mov     word [glb_decl_len], 0
        mov     si, daxbuf
        add     si, [hlib_mem_start]
        mov     dx, [hlib_mem_end]
        cmp     si, dx
        jae     .err
        mov     ax, dx
        sub     ax, si
        cmp     ax, DQK_MEMBER_HDR
        jb      .err
        mov     ah, [fs:si]
        mov     al, [fs:si+1]
        or      ax, ax
        jz      .err
        cmp     ax, MON_RAW_MAX
        ja      .err
        mov     [glb_decl_len], ax
        add     si, DQK_MEMBER_HDR
        mov     di, monraw
        xor     bx, bx
.loop:
        cmp     si, dx
        jae     .done
        mov     al, [fs:si]
        inc     si
        cmp     al, 80h
        je      .loop                 ; the HLIB codec's no-op, including after output
        ja      .repeat
        movzx   cx, al
        inc     cx
        mov     ax, dx
        sub     ax, si
        cmp     cx, ax
        ja      .err
        mov     ax, [glb_decl_len]
        sub     ax, bx
        cmp     cx, ax
        ja      .err
.literal:
        mov     al, [fs:si]
        inc     si
        stosb
        inc     bx
        loop    .literal
        jmp     .loop
.repeat:
        movzx   cx, al
        neg     cx
        add     cx, 257
        cmp     si, dx
        jae     .err
        mov     ax, [glb_decl_len]
        sub     ax, bx
        cmp     cx, ax
        ja      .err
        mov     al, [fs:si]
        inc     si
.copy_repeat:
        stosb
        inc     bx
        loop    .copy_repeat
        jmp     .loop
.done:
        cmp     bx, [glb_decl_len]
        jne     .err
        mov     [mon_raw_size], bx
        clc
        ret
.err:
        stc
        ret

glb_rle_to_monraw:
        ; Legacy GLIB compatibility decoder. Its framing/stat-layout gaps
        ; require generation-aware dispatch; strict HLIB rules do not apply.
        ; fidelity-plan §29: a MONCHA.GLB member opens with a 2-byte BIG-ENDIAN
        ; uncompressed length; the RLE stream starts at byte 2. DQK's own loader reads
        ; that word (file 0x3570C) and hands it to its decompressor as the expected
        ; output size. Expanding from byte 0 -- what this did until 2026-08-21 -- eats it
        ; as two control bytes and shifts every field by a record-dependent amount.
        mov     word [glb_decl_len], 0
        mov     ax, [hlib_mem_start]
        mov     [hlib_src], ax
        mov     bx, ax
        add     bx, DQK_MEMBER_HDR
        cmp     bx, [hlib_mem_end]
        ja      .nohdr
        mov     si, daxbuf
        add     si, [hlib_src]
        mov     ah, [fs:si]
        mov     al, [fs:si+1]
        mov     [glb_decl_len], ax
        mov     [hlib_src], bx
.nohdr:
        mov     di, monraw
        mov     word [mon_raw_size], 0
.loop:
        mov     ax, [hlib_src]
        cmp     ax, [hlib_mem_end]
        jae     .done
        cmp     word [mon_raw_size], MON_RAW_MAX
        jae     .done
        mov     si, daxbuf
        add     si, [hlib_src]
        mov     al, [fs:si]
        inc     si
        inc     word [hlib_src]
        cmp     al, 81h
        jb      .lit
        mov     cx, 257
        movzx   bx, al
        sub     cx, bx
        mov     ax, [hlib_src]
        cmp     ax, [hlib_mem_end]
        jae     .done
        mov     si, daxbuf
        add     si, [hlib_src]
        mov     al, [fs:si]
        inc     si
        inc     word [hlib_src]
        mov     [hlib_runval], al
.rep:
        jcxz    .loop
        cmp     word [mon_raw_size], MON_RAW_MAX
        jae     .done
        mov     al, [hlib_runval]
        stosb
        inc     word [mon_raw_size]
        dec     cx
        jmp     .rep
.lit:
        movzx   cx, al
        inc     cx
.lit_loop:
        jcxz    .loop
        mov     ax, [hlib_src]
        cmp     ax, [hlib_mem_end]
        jae     .loop
        cmp     word [mon_raw_size], MON_RAW_MAX
        jae     .done
        mov     si, daxbuf
        add     si, [hlib_src]
        mov     al, [fs:si]
        inc     si
        inc     word [hlib_src]
        stosb
        inc     word [mon_raw_size]
        dec     cx
        jmp     .lit_loop
.done:
        ret

dax_rle_to_monraw:
        ; Validate each complete run before touching MONRAW. A corrupt final
        ; run must neither read past the compressed member nor overwrite the
        ; combat arrays immediately following the decoded buffer.
        mov     ax, [mon_raw_size]
        or      ax, ax
        jz      .err
        cmp     ax, MON_RAW_MAX
        ja      .err
        mov     si, daxbuf
        add     si, [dax_src]
        mov     dx, si
        add     dx, [dax_comp]
        jc      .err
        mov     di, monraw
        xor     bx, bx
.loop:
        cmp     bx, [mon_raw_size]
        jae     .done
        cmp     si, dx
        jae     .err
        mov     al, [fs:si]
        inc     si
        cmp     al, 80h
        jae     .rep
        movzx   cx, al
        inc     cx
        mov     ax, [mon_raw_size]
        sub     ax, bx
        cmp     cx, ax
        ja      .err
        mov     ax, dx
        sub     ax, si
        cmp     cx, ax
        ja      .err
.lit:
        mov     al, [fs:si]
        inc     si
        mov     [di], al
        inc     di
        inc     bx
        loop    .lit
        jmp     .loop
.rep:
        neg     al
        movzx   cx, al
        cmp     si, dx
        jae     .err
        mov     ax, [mon_raw_size]
        sub     ax, bx
        cmp     cx, ax
        ja      .err
        mov     al, [fs:si]
        inc     si
.rp:
        mov     [di], al
        inc     di
        inc     bx
        loop    .rp
        jmp     .loop
.done:
        clc
        ret
.err:
        stc
        ret

; ============================================================================
;  Combat driver -- mirrors createTacticalCombat(...).finish() control flow:
;    1. seed initiative for any combatant with init==0xFFFF, in ARRAY ORDER
;       (drawn BEFORE round 1) and emit one 'init' trace line per combatant.
;    2. loop rounds (cap 60): beginRound sorts active by effectiveInitiative
;       desc, tie-break bySideThenId; each actor that is active takes its turn:
;       AI melees the WEAKEST in-reach foe or spends its per-combatant
;       movement allowance to close before retargeting.
;    3. positionCursor ends the battle when a side is wiped or round>=cap.
; ============================================================================
combat_run:
        mov     word [cmd_index], 0
        ; v1 carries the optional DoK Cast receipt in its first reserved word;
        ; each fresh combat begins with a canonical all-zero reserve.
        mov     word [gbcr_reserved], 0
        mov     word [gbcr_reserved+2], 0
        call    combat_seed_init
        call    combat_round_loop
        ret

combat_run_party_flee:
        call    combat_seed_init
        mov     word [round], 1
        call    attempt_party_flee
        jc      .blocked
        call    trace_end
        ret
.blocked:
        mov     word [round], 0
        call    combat_round_loop
        ret

combat_seed_init:
        ; -- initiative seeding (array order, pre-round-1) --
        ; for (const c of combatants) if (c.initiative === undefined) c.initiative = rng.die(10);
        ; DoK (party_dok==1) rolls retail per-round initiative in begin_round instead.
        xor     bx, bx                       ; index 0
        cmp     byte [party_dok], 1
        je      .seeded
.seedlp:
        cmp     bx, [ncomb]
        jae     .seeded
        mov     si, bx
        imul    si, si, C_REC
        add     si, comb
        cmp     word [si+C_INIT], 0FFFFh
        jne     .seednext
        mov     ax, 10
        call    rng_die
        mov     [si+C_INIT], ax
.seednext:
        inc     bx
        jmp     .seedlp
.seeded:
        ; emit one 'init' line per combatant, in ARRAY order (matches the oracle's
        ; per-combatant init lines which the harness emits in `combatants` order).
        xor     bx, bx
.initemit:
        cmp     bx, [ncomb]
        jae     .initdone
        mov     si, bx
        imul    si, si, C_REC
        add     si, comb
        push    bx                           ; trace_init/eol_flush clobber bx
        call    trace_init
        pop     bx
        inc     bx
        jmp     .initemit
.initdone:
        mov     word [round], 0
        ret

combat_round_loop:
        ; -- round loop --
.roundloop:
        ; positionCursor end-conditions checked at top of each round:
        ;   if party==0 || enemy==0 -> end ; if round>=cap -> end
        call    count_sides                  ; -> [n_party],[n_enemy]
        cmp     word [n_party], 0
        je      .end
        cmp     word [n_enemy], 0
        je      .end
        mov     ax, [round]
        cmp     ax, ROUNDCAP
        jae     .end
        inc     word [round]
        call    clear_delayed
        call    tick_status_timers
        call    begin_round                  ; build [order] sorted desc by eff init
        ; for each entry in order: if active, take its turn (AI melee)
        xor     bx, bx                       ; order index
.turnloop:
        cmp     bx, [order_n]
        jae     .roundend
        ; fetch combatant index from order[]
        mov     si, bx
        shl     si, 1
        mov     ax, [order + si]            ; combatant index
        mov     [cur_idx], ax
        ; actor record ptr
        mov     si, ax
        imul    si, si, C_REC
        add     si, comb
        mov     [cur_ptr], si
        ; if !isActive(actor) skip
        call    is_active_si
        jnc     .turnnext
        ; if living(foeSide(actor))==0 -> finalizeEnd (foes wiped mid-round)
        call    count_sides
        mov     al, [si+C_SIDE]
        test    al, al
        jz      .actor_party
        ; actor is enemy -> foes = party
        cmp     word [n_party], 0
        je      .end
        jmp     .do_turn
.actor_party:
        cmp     word [n_enemy], 0
        je      .end
.do_turn:
        and     word [si+C_FLAGS], 0FFDFh    ; its own turn consumes old Guarding state
        call    apply_hazard_cur
        mov     si, [cur_ptr]
        call    is_active_si
        jnc     .turnnext
        test    word [si+C_FLAGS], CF_DISABLED
        jnz     .turnnext
        cmp     byte [si+C_SIDE], 0
        jne     .auto_turn
        push    bx
        movzx   bx, byte [si+C_ORD]
        and     bl, 7                        ; party_ai is 8 bytes; DQK rosters set rows 0-7
        cmp     byte [party_ai+bx], 0        ; DQK recruit: retail +0x18C != 0
        pop     bx
        jne     .auto_turn
        ; Either driver is enough.  This tested cmdmode ALONE, which meant /K
        ; without a /C tape never reached player_command_turn at all -- the
        ; interactive turn was unreachable by an actual human, and every test
        ; hid it by always passing a tape.
        cmp     byte [cmdmode], 0
        jne     .player_turn
        cmp     byte [kmode], 0
        je      .auto_turn
.player_turn:
        mov     byte [delay_request], 0
        call    player_command_turn
        cmp     byte [delay_request], 0
        je      .turnnext
        call    rotate_order_to_tail
        jmp     .turnloop
.auto_turn:
        call    ai_take_turn                 ; AI: melee weakest in-reach foe
.turnnext:
        inc     bx
        jmp     .turnloop
.roundend:
        jmp     .roundloop
.end:
        call    trace_end
        ret

player_command_turn:
        push    ax
        push    bx
        push    si
        ; Attack and movement are turn ledgers.  A move command returns to this
        ; menu, so a player can move, attack by bumping a foe, then move again
        ; without resetting either budget.  The source loop is CoAB ovr009's
        ; `while (var_2 == false)`: End/Delay/Guard/Flee finish the turn, while
        ; move mode itself only ends on Done, exhaustion, or a spent attack.
        ; Delay rotates this actor back into the same round.  Its ledgers must
        ; follow the actor, not this invocation, or Move->Delay->Move starts a
        ; second turn allowance.  The same carrier is handed to Quick below.
        mov     bx, [cur_idx]
        cmp     byte [player_budget_live+bx], 0
        jne     .restore_budget
        call    attacks_this_round
        mov     [player_attacks_left], ax
        mov     si, [cur_ptr]
        mov     ax, [si+C_MOVE]
        or      ax, ax
        jnz     .move_budget_ok
        mov     ax, 1                    ; retail clamps a sub-1 rate to 1 square
.move_budget_ok:
        shl     ax, 1                    ; turn ledger is in half-squares
        mov     [move_left], ax
        call    save_player_budget
        jmp     .next_command
.restore_budget:
        mov     si, bx
        shl     si, 1
        mov     ax, [player_move_budget+si]
        mov     [move_left], ax
        mov     ax, [player_attack_budget+si]
        mov     [player_attacks_left], ax
.next_command:
        mov     bx, [cmd_index]
        mov     al, [cmdbuf+bx]
        or      al, al
        jz      .no_tape
        cmp     al, 13
        je      .no_tape
        inc     word [cmd_index]
        jmp     .have
.no_tape:
        ; The /C tape is consumed first and the keyboard only takes over when it
        ; runs out.  Headless (kmode=0) this is byte-for-byte the old fallthrough
        ; to ai_take_turn, which is what makes every existing trace golden a
        ; control on this change.
        cmp     byte [kmode], 0
        je      .auto
.reprompt:
        call    interactive_prompt
.have:
        and     al, 0DFh
        cmp     al, 'G'
        je      .guard
        cmp     al, 'W'
        je      .guard
        cmp     al, 'F'
        je      .flee
        cmp     al, 'P'
        je      .party_flee
        ; Move/Delay/End used to sit behind a kmode gate, which made them
        ; keyboard-only and left /T fixture runs unable to script a walk.  The
        ; TAPE is the driver; kmode only decides whether a human may take over
        ; when it runs out.  No existing tape uses M, D or E -- the suite's
        ; tapes are P, Q and G only -- so every existing golden is a control.
        cmp     al, 'M'
        je      .move
        cmp     al, 'D'
        je      .delay
        cmp     al, 'E'
        je      .done
        cmp     al, 'Q'
        je      .quick
        cmp     al, 'C'
        je      .cast
        ; Aim, Use, Turn, Bandage, View and Speed have no owned engine
        ; primitive yet. Reject them: headless input ends this actor's turn
        ; without applying an automatic action, while a live player is told and
        ; can choose again. An unsupported command must not mutate the ledger.
        cmp     byte [kmode], 0
        jne     .live_reject
        mov     [rejected_command], al
        call    trace_reject
        jmp     .done
.live_reject:
        mov     si, s_notyet
        call    ui_msg_line
        call    ack_key
        ; ack_key leaves a remaining /C command untouched.  Re-enter the
        ; dispatcher so an automated live test (and a future replay) can use
        ; it; with no tape this falls through to the normal keyboard prompt.
        jmp     .next_command
.move:
        call    do_player_move
        mov     si, [cur_ptr]
        call    is_active_si
        jnc     .done
        ; A surviving bump target consumes every remaining attack in one Move
        ; command. CoAB's combat loop treats that as turnComplete: do not
        ; re-enter the command menu and allow Guard, Delay, or Cast on an
        ; exhausted attack ledger.
        cmp     word [player_attacks_left], 0
        je      .done
        ; A scripted Move may consume its final Done key.  There is no human
        ; menu choice to synthesize once the tape is empty, so preserve the
        ; pre-menu behaviour and finish this turn instead of silently taking
        ; an AI action.  Live play still falls through to the prompt.
        mov     bx, [cmd_index]
        cmp     byte [cmdbuf+bx], 0
        jne     .next_command
        cmp     byte [kmode], 0
        je      .done
        jmp     .next_command
.delay:
        call    do_player_delay
        jmp     .done
.guard:
        call    ready_guard_cur
        jmp     .done
.flee:
        ; Flee is still a player action.  Its route must consume the same
        ; current-turn ledger as Move and Quick, rather than reloading C_MOVE.
        mov     byte [quick_budget_active], 1
        call    try_flee_step
        mov     byte [quick_budget_active], 0
        jmp     .done
.party_flee:
        mov     ax, [cur_idx]
        push    ax
        mov     ax, [cur_ptr]
        push    ax
        call    attempt_party_flee
        pop     ax
        mov     [cur_ptr], ax
        pop     ax
        mov     [cur_idx], ax
        cmp     word [party_flee_escaped], 0
        jne     .done
        call    ai_take_turn
        jmp     .done
.auto:
        call    ai_take_turn
        jmp     .done
.quick:
        mov     byte [quick_budget_active], 1
        call    ai_take_turn
        mov     byte [quick_budget_active], 0
.cast_done:
        jmp     .done
.cast:
        call    cast_magic_missile
        jnc     .cast_done
        ; A Cast with no title-owned prepared spell, exhausted spell instance,
        ; or target is an explicit rejection. It never becomes an AI swing or
        ; silently ends a live player's turn.
        cmp     byte [kmode], 0
        jne     .live_reject
        mov     byte [rejected_command], 'C'
        call    trace_reject
.done:
        call    save_player_budget
        pop     si
shared_epi_ax_bx_si:
        pop     bx
        pop     ax
        ret

; Cast the first title-owned offensive DoK spell: raw WIZ id 15, Magic Missile.
; Its name/identity and its fixed 1d4+1 baseline are shared with the existing
; Dragonlance ruleset evidence. The target is the deterministic weakest living
; foe; source ownership is rechecked by CCHOST before its WIZ writeback.
cast_magic_missile:
        push    bx
        push    cx
        push    dx
        push    si
        push    di
        cmp     byte [party_dok], 1
        jne     .bad
        ; GBCR v1 currently carries one cast receipt. Do not let a later
        ; caster mutate combat after a prior caster has claimed that receipt.
        cmp     word [gbcr_reserved], 0
        jne     .bad
        mov     bx, [cur_idx]
        cmp     byte [party_cast_used+bx], 0
        jne     .bad
        call    party_has_magic_missile
        jc      .bad
        call    pick_weakest_foe
        cmp     word [tgt_idx], -1
        je      .bad
        ; Magic Missile is automatic: draw only its 1d4+1 damage, never a
        ; fabricated d20 check. A Cast spends the turn's remaining attack.
        mov     bx, 1
        mov     cx, 4
        mov     dx, 1
        call    rng_roll
        mov     [r_dmg], ax
        mov     word [r_roll], -1
        mov     word [r_needed], -1
        mov     word [r_hit], 1
        mov     word [player_attacks_left], 0
        mov     bx, [cur_idx]
        mov     byte [party_cast_used+bx], 1
        mov     al, bl
        mov     ah, DOK_MAGIC_MISSILE
        mov     [gbcr_reserved], ax
        mov     si, [tgt_ptr]
        test    word [si+C_FLAGS], CF_ASLEEP
        jz      .damage
        and     word [si+C_FLAGS], 0FF7Fh
.damage:
        mov     ax, [si+C_HP]
        mov     [hp_before], ax
        sub     ax, [r_dmg]
        mov     [si+C_HP], ax
        test    ax, ax
        jg      .alive
        xor     ax, ax
        mov     [r_hpafter], ax
        or      word [si+C_FLAGS], CF_UNCON
        mov     word [r_dead], 0
        cmp     byte [si+C_SIDE], 1
        jne     .trace_dead
        mov     ax, [xp_awarded]
        add     ax, [si+C_XP]
        mov     [xp_awarded], ax
.trace_dead:
        mov     word [trace_event_type], t_cast
        call    trace_attack
        mov     word [trace_event_type], t_attack
        call    trace_slain
        call    check_morale_sweep
        jmp     .ok
.alive:
        mov     [r_hpafter], ax
        mov     word [r_dead], -1
        mov     word [trace_event_type], t_cast
        call    trace_attack
        mov     word [trace_event_type], t_attack
        call    check_morale_sweep
.ok:    clc
        jmp     .done
.bad:   stc
.done:
        pop     di
shared_epi_bx_cx_dx_si_di:
        pop     si
        pop     dx
        pop     cx
        pop     bx
        ret

; Prove the current imported party member owns one raw prepared Magic Missile
; before combat applies it. partybuf is no longer needed after GBPR import, so
; it safely holds this fixed-size 220-byte source record for the brief scan.
party_has_magic_missile:
        mov     bx, [cur_idx]
        mov     al, [party_slots+bx]
        add     al, '0'
        mov     [dokwizpath+12], al
        mov     ax, 3D00h
        mov     dx, dokwizpath
        int     21h
        jc      .bad
        mov     [partyfh], ax
        mov     bx, ax
        mov     ah, 3Fh
        ; Read one byte past the fixed WIZ record: an oversized sidecar must
        ; reject here, before any RNG, HP, or action mutation.
        mov     cx, 221
        mov     dx, partybuf
        int     21h
        jc      .close_bad
        cmp     ax, 220
        jne     .close_bad
        mov     si, 34
.find:
        cmp     si, 73
        ja      .close_bad
        cmp     byte [partybuf+si], DOK_MAGIC_MISSILE
        je      .close_ok
        inc     si
        jmp     .find
.close_ok:
        mov     bx, [partyfh]
        mov     ah, 3Eh
        int     21h
        jc      .bad
        clc
        ret
.close_bad:
        mov     bx, [partyfh]
        mov     ah, 3Eh
        int     21h
.bad:   stc
        ret

; -- save_player_budget: persist the current player's round ledgers by actor.
; Called on every player-command exit, including Delay and Quick.
save_player_budget:
        push    ax
        push    bx
        mov     bx, [cur_idx]
        mov     byte [player_budget_live+bx], 1
        shl     bx, 1
        mov     ax, [move_left]
        mov     [player_move_budget+bx], ax
        mov     ax, [player_attacks_left]
        mov     [player_attack_budget+bx], ax
        pop     bx
        pop     ax
        ret

; -- clear_delayed: one delay per combatant per round.
clear_delayed:
        push    ax
        push    cx
        push    di
        push    es
        push    ds
        pop     es
        mov     di, delayed
        mov     cx, MAXCOMB
        xor     al, al
        rep     stosb
        mov     di, player_budget_live
        mov     cx, MAXCOMB
        xor     al, al
        rep     stosb
        mov     di, player_move_budget
        mov     cx, MAXCOMB
        xor     ax, ax
        rep     stosw
        mov     di, player_attack_budget
        mov     cx, MAXCOMB
        rep     stosw
        pop     es
        jmp     shared_epi_ax_cx_di_es

; -- rotate_order_to_tail: move order[BX] to the end of order[], shuffling the
;    rest down, and leave BX pointing at what is now the next actor.  The caller
;    jumps back to .turnloop WITHOUT incrementing BX, which is the whole point:
;    the delaying combatant now sits at order[order_n-1] and will be reached
;    again this round, once, after everyone else.
rotate_order_to_tail:
        push    ax
        push    cx
        push    si
        push    di
        mov     si, bx
        shl     si, 1
        mov     ax, [order+si]           ; the delaying combatant
        mov     di, bx
.shift:
        inc     di
        cmp     di, [order_n]
        jae     .place
        mov     si, di
        shl     si, 1
        mov     cx, [order+si]
        mov     [order+si-2], cx
        jmp     .shift
.place:
        mov     si, [order_n]
        dec     si
        shl     si, 1
        mov     [order+si], ax
        pop     di
        pop     si
        pop     cx
        pop     ax
        ret

; -- interactive_epilogue: hold the final board, then restore text mode.  The
;    battle is over by here, so this is the one place a blocking key is the
;    correct behaviour rather than a missing feature.
interactive_epilogue:
        push    ax
        push    si
        call    redraw_board
        ; Hold the final board only if a human was actually here.  If the whole
        ; battle ran off the /C tape then read_command_key was never reached,
        ; nobody is watching, and demanding a keystroke would hang a headless
        ; run forever.  That is not a test accommodation -- it is the same rule
        ; the wait itself follows, applied to its own precondition, and it is
        ; what lets a /K session be pinned by a trace golden at all.
        cmp     byte [saw_keyboard], 0
        je      .no_wait
        mov     si, s_battle_over
        call    ui_msg_line
        call    read_command_key
.no_wait:
        mov     ax, 0003h
        int     10h
        pop     si
        pop     ax
        ret

tick_status_timers:
        push    ax
        push    bx
        push    si
        mov     word [status_i], 0
.lp:
        mov     bx, [status_i]
        cmp     bx, [ncomb]
        jae     .done
        shl     bx, 1
        mov     ax, [status_timer+bx]
        cmp     ax, 0
        jle     .next
        dec     ax
        mov     [status_timer+bx], ax
        cmp     ax, 0
        jg      .next
        mov     ax, [status_kind+bx]
        mov     [status_kind_cur], ax
        mov     word [status_kind+bx], 0
        mov     si, [status_i]
        imul    si, si, C_REC
        add     si, comb
        cmp     word [status_kind_cur], HAZ_STATUS_FEARED
        jne     .try_held
        test    word [si+C_FLAGS], CF_FEARED
        jz      .next
        and     word [si+C_FLAGS], 0FFEFh
        call    trace_status_expired
        jmp     .next
.try_held:
        cmp     word [status_kind_cur], HAZ_STATUS_HELD
        jne     .try_asleep
        test    word [si+C_FLAGS], CF_HELD
        jz      .next
        and     word [si+C_FLAGS], 0FFBFh
        call    trace_status_expired
        jmp     .next
.try_asleep:
        cmp     word [status_kind_cur], HAZ_STATUS_ASLEEP
        jne     .next
        test    word [si+C_FLAGS], CF_ASLEEP
        jz      .next
        and     word [si+C_FLAGS], 0FF7Fh
        call    trace_status_expired
.next:
        inc     word [status_i]
        jmp     .lp
.done:
        pop     si
        jmp     shared_epi_ax_bx_si

; -- is_active_si: CF=1 if SI combatant is active (hp>0 and not fled/surrendered)
is_active_si:
        cmp     word [si+C_HP], 0
        jle     .no
        test    word [si+C_FLAGS], CF_INACTIVE
        jnz     .no
        stc
        ret
.no:
        clc
        ret

; -- get_morale_si: SI=combatant -> CF=1 and AX=morale percent, CF=0 if absent.
get_morale_si:
        movzx   ax, byte [si+C_FLAGS+1]
        test    ax, ax
        jz      .none
        dec     ax
        stc
        ret
.none:
        clc
        ret

; -- calc_pct_lost_si: SI=combatant -> AX=round((maxHp-hp)*100/maxHp).
calc_pct_lost_si:
        push    bx
        push    cx
        push    dx
        mov     bx, [si+C_MAXHP]
        cmp     bx, 0
        jg      .have_max
        xor     ax, ax
        jmp     .done
.have_max:
        mov     cx, [si+C_HP]
        cmp     cx, 0
        jge     .hp_nonneg
        xor     cx, cx
.hp_nonneg:
        cmp     cx, bx
        jl      .lost_calc
        xor     ax, ax
        jmp     .done
.lost_calc:
        mov     ax, bx
        sub     ax, cx                      ; lost HP
        movzx   eax, ax
        mov     ecx, 100
        mul     ecx                         ; EDX:EAX = lost * 100
        movzx   ecx, bx
        shr     ecx, 1
        add     eax, ecx                    ; + max/2 for Math.round
        movzx   ebx, bx
        xor     edx, edx
        div     ebx
.done:
        pop     dx
        pop     cx
        pop     bx
        ret

calc_enemy_side_pct_lost:
        push    ax
        push    bx
        push    cx
        push    dx
        push    si
        mov     word [morale_cur_sum], 0
        mov     word [morale_max_sum], 0
        xor     bx, bx
.lp:
        cmp     bx, [ncomb]
        jae     .calc
        mov     si, bx
        imul    si, si, C_REC
        add     si, comb
        cmp     byte [si+C_SIDE], 1
        jne     .next
        call    get_morale_si
        jnc     .next
        mov     ax, [si+C_MAXHP]
        cmp     ax, 0
        jle     .next
        add     [morale_max_sum], ax
        mov     ax, [si+C_HP]
        cmp     ax, 0
        jge     .hp_nonneg
        xor     ax, ax
.hp_nonneg:
        add     [morale_cur_sum], ax
.next:
        inc     bx
        jmp     .lp
.calc:
        mov     bx, [morale_max_sum]
        cmp     bx, 0
        jg      .have_max
        mov     word [morale_side_pct], 0
        jmp     .done
.have_max:
        mov     ax, bx
        sub     ax, [morale_cur_sum]
        jg      .lost_ok
        xor     ax, ax
.lost_ok:
        movzx   eax, ax
        mov     ecx, 100
        mul     ecx
        movzx   ecx, bx
        shr     ecx, 1
        add     eax, ecx
        movzx   ebx, bx
        xor     edx, edx
        div     ebx
        mov     [morale_side_pct], ax
.done:
        pop     si
        jmp     shared_epi_ax_bx_cx_dx_si

; -- check_morale_sweep: after damage, route/surrender enemies whose decoded
;    morale threshold is below personal or team HP-loss percentage.
check_morale_sweep:
        push    ax
        push    bx
        push    si
        call    calc_enemy_side_pct_lost
        xor     bx, bx
.lp:
        cmp     bx, [ncomb]
        jae     .done
        mov     si, bx
        imul    si, si, C_REC
        add     si, comb
        call    is_active_si
        jnc     .next
        cmp     byte [si+C_SIDE], 1
        jne     .next
        test    word [si+C_FLAGS], CF_FEARED
        jnz     .next
        call    get_morale_si
        jnc     .next
        mov     [morale_score], ax
        call    calc_pct_lost_si
        mov     [morale_personal_pct], ax
        mov     ax, [morale_score]
        cmp     ax, [morale_personal_pct]
        jb      .fear
        cmp     ax, [morale_side_pct]
        jb      .surrender
        jmp     .next
.fear:
        or      word [si+C_FLAGS], CF_FEARED
        push    bx
        call    trace_status
        pop     bx
        jmp     .next
.surrender:
        or      word [si+C_FLAGS], CF_SURRENDERED
        push    bx
        call    trace_flee
        pop     bx
.next:
        inc     bx
        jmp     .lp
.done:
        pop     si
        jmp     shared_epi_ax_bx_si

; -- count_sides: fills [n_party],[n_enemy] with active counts --
count_sides:
        push    bx
        push    si
        xor     ax, ax
        mov     [n_party], ax
        mov     [n_enemy], ax
        xor     bx, bx
.lp:
        cmp     bx, [ncomb]
        jae     .done
        mov     si, bx
        imul    si, si, C_REC
        add     si, comb
        call    is_active_si
        jnc     .next
        cmp     byte [si+C_SIDE], 0
        jne     .en
        inc     word [n_party]
        jmp     .next
.en:
        inc     word [n_enemy]
.next:
        inc     bx
        jmp     .lp
.done:
        pop     si
        pop     bx
        ret

; -- attempt_party_flee: CT.7g party-wide flee command.
;    CF=0 if the whole active party escaped; CF=1 if escape is blocked.
attempt_party_flee:
        push    bx
        push    si
        mov     word [party_flee_seen], 0
        call    party_can_escape
        jc      .blocked
        mov     word [party_flee_escaped], 1
        call    trace_party_flee
        call    mark_party_fled
        mov     word [party_fled_flag], 1
        clc
        jmp     .done
.blocked:
        mov     word [party_flee_escaped], 0
        call    trace_party_flee
        stc
.done:
        pop     si
        pop     bx
        ret

; party_can_escape: CF=0 if every active party member can reach the border.
party_can_escape:
        push    bx
        push    si
        mov     word [party_flee_seen], 0
        xor     bx, bx
.lp:
        cmp     bx, [ncomb]
        jae     .finish
        mov     si, bx
        imul    si, si, C_REC
        add     si, comb
        call    is_active_si
        jnc     .next
        cmp     byte [si+C_SIDE], 0
        jne     .next
        mov     word [party_flee_seen], 1
        mov     [cur_idx], bx
        mov     [cur_ptr], si
        call    cur_can_reach_border
        jc      .blocked
.next:
        inc     bx
        jmp     .lp
.finish:
        cmp     word [party_flee_seen], 0
        je      .blocked
        clc
        jmp     .done
.blocked:
        stc
.done:
        pop     si
        pop     bx
        ret

; cur_can_reach_border: CF=0 if [cur_ptr]'s footprint is on or can reach an edge.
cur_can_reach_border:
        push    ax
        push    bx
        push    di
        call    current_edge_dist
        cmp     ax, 0
        je      .yes
        mov     di, [cur_ptr]
        mov     ax, [di+C_MOVE]
        cmp     ax, 0
        jle     .no
        shl     ax, 1
        mov     [move_budget], ax
        mov     ax, [di+C_COL]
        mov     [route_orig_col], ax
        mov     ax, [di+C_ROW]
        mov     [route_orig_row], ax
        call    build_move_dist
        mov     word [route_i], 0
.scan:
        mov     bx, [route_i]
        cmp     bx, COMBAT_GRID_W*COMBAT_GRID_H
        jae     .no
        movzx   ax, byte [move_dist+bx]
        cmp     ax, ROUTE_INF
        jae     .next
        call    route_decode_i
        mov     ax, [route_col]
        mov     [move_new_col], ax
        mov     ax, [route_row]
        mov     [move_new_row], ax
        call    edge_dist_candidate
        cmp     ax, 0
        je      .yes
.next:
        inc     word [route_i]
        jmp     .scan
.yes:
        clc
        jmp     .done
.no:
        stc
.done:
        pop     di
        pop     bx
        pop     ax
        ret

mark_party_fled:
        push    bx
        push    si
        xor     bx, bx
.lp:
        cmp     bx, [ncomb]
        jae     .done
        mov     si, bx
        imul    si, si, C_REC
        add     si, comb
        call    is_active_si
        jnc     .next
        cmp     byte [si+C_SIDE], 0
        jne     .next
        or      word [si+C_FLAGS], CF_FLED
.next:
        inc     bx
        jmp     .lp
.done:
        pop     si
        pop     bx
        ret

ready_guard_cur:
        push    si
        mov     si, [cur_ptr]
        or      word [si+C_FLAGS], CF_GUARDING
        call    trace_guard
        pop     si
        ret

; -- next_input_key: the /C tape first, the keyboard only when it runs out.
;
;    player_command_turn already worked this way, but do_player_move called
;    read_command_key directly, so move mode could only ever be driven by a
;    human -- and this engine's entire test surface is trace goldens.  Routing
;    both through one routine is what makes a walk pinnable: a tape of
;    "M4444D" drives a real four-square move with no keyboard at all.
next_input_key:
        push    bx
        mov     bx, [cmd_index]
        mov     al, [cmdbuf+bx]
        or      al, al
        jz      .kb
        cmp     al, 13
        je      .kb
        inc     word [cmd_index]
        xor     ah, ah
        pop     bx
        ret
.kb:
        pop     bx
        cmp     byte [kmode], 0
        jne     .wait
        mov     ax, 13                   ; headless: a spent tape ends the move
        ret
.wait:
        call    read_command_key
        ret

; -- ack_key: wait for a human to acknowledge a message, but ONLY if a human is
;    driving.  If the tape still has input, return at once and consume nothing.
;
;    This is not cosmetic.  "can't go there" and "not yet in this engine" both
;    sat on a bare read_command_key, so a tape that hit a blocked square or an
;    unimplemented command would print the message and then block forever on
;    INT 16h with no keyboard attached.  A headless harness must never be able
;    to hang on a message it cannot see.
ack_key:
        push    bx
        mov     bx, [cmd_index]
        mov     al, [cmdbuf+bx]
        or      al, al
        jz      .wait
        cmp     al, 13
        je      .wait
        pop     bx
        ret
.wait:
        pop     bx
        cmp     byte [kmode], 0
        je      .none
        call    read_command_key
.none:
        ret

; -- trigger_leaving_reactions: the retail back attack.
;
;    SOURCED, and it refutes what this engine assumed.  All three Krynn manuals
;    carry the rule in near-identical words; the in-repo extraction of the CoK
;    manual has it verbatim at build/cok-manual-extracted.txt:988-992 --
;    "If the character moves away from an adjacent enemy, the enemy gets a
;    free attack at the character's back."  The CoK and DoK Journals add "Back
;    attacks have an improved chance to hit," and DQK's Journal repeats both.
;    The engine had no leaving reaction of any kind before this.
;
;    The manuals stop there, and four questions they leave open are answered
;    instead by the Curse of the Azure Bonds decompile -- the SAME engine
;    generation as CoK and DoK.  LABEL THAT HONESTLY: it is a sibling-engine
;    map, byte-proven in CoAB and NOT byte-proven in CoK, DoK or DQK.  The
;    routine is ovr014.move_step_away_attack(direction, victim) (DOS
;    sub_3E954), called from both the human move loop (ovr009.cs:545) and the
;    monster AI (ovr010.cs:477), in both cases immediately BEFORE the step.
;
;      * PER STEP, not per move command.  The oracle's move loop calls it once
;        per arrow key, with no per-command or per-round latch, so a walk past
;        a foe is checked at every square.  Matched here.
;      * ONLY FOES BEING LEFT.  The oracle builds the adjacent set at the
;        origin, speculatively steps the mover to the destination, builds the
;        set again, and SUBTRACTS it -- a foe still adjacent after the step
;        does not react.  Matched here by the same speculative relocation.
;        My first version of this routine reacted with every adjacent foe and
;        was wrong; the exemption I said "no source supports" is exactly what
;        the source does.
;      * NOT A THAC0 BONUS -- the target's stored REAR AC is substituted.
;        ovr025.cs:477-484 defines ac_behind as the armour/cloak/misc bonuses
;        MINUS 2, dropping the Dexterity and shield terms the front AC keeps
;        (two literal `dec ax` in the original 8086).  So the full rule is
;          ac - ac_behind = Dex bonus + shield bonus + 2,
;        i.e. AD&D 1e's attacked-from-behind rule.  THIS RECORD HAS ONE FLAT
;        C_AC FIELD with no Dexterity or shield decomposition, so only the
;        constant is representable: BACK_ATTACK_AC below is the sourced 2, and
;        the Dex and shield components are a STATED SHORTFALL, not a rounding.
;        Against a Dex-16 shielded fighter retail is 5 points easier and this
;        engine is 2.
;      * FACING IS NOT CONSULTED.  The oracle passes the behind flag as a
;        constant 1 rather than computing geometry, so the rear AC is
;        automatic.  That suits this engine, whose record has no facing field
;        at all -- the browser engine's geometric test is the divergent one.
;      * GUARD DOES NOT DOUBLE UP, and it needs no special case.  The oracle's
;        guard reaction fires from the set adjacent to the DESTINATION and this
;        one from origin-minus-destination; the two sets are disjoint by
;        construction, so a foe can deliver one or the other but never both.
;        Implementing the subtraction above buys that for free.
;      * FLEEING OFF THE MAP DOES NOT PROVOKE.  The oracle's edge step routes
;        to flee_battle, which never calls this.  Reproduced here by omission:
;        .flee goes to try_flee_step without passing through this routine.
;        Ordinary steps taken to REACH the edge still provoke.
;
;    ONLY THE PLAYER'S WALK FIRES THIS, deliberately.  ai_take_turn does not
;    walk -- it makes one whole-budget jump to a Dijkstra anchor
;    (choose_routed_close) -- so there is no square-by-square departure to hook,
;    and adding one there would change existing trace goldens.  Those goldens
;    are the control for this change, so wiring the AI side needs its own
;    commit with its own control.
trigger_leaving_reactions:
        push    ax
        push    bx
        push    si
        push    di
        mov     si, [cur_ptr]
        call    is_active_si
        jnc     .done
        mov     ax, [cur_ptr]
        mov     [leave_mover_ptr], ax
        mov     ax, [cur_idx]
        mov     [leave_mover_idx], ax
        mov     word [leave_i], 0
.lp:
        mov     bx, [leave_i]
        cmp     bx, [ncomb]
        jae     .restore
        cmp     bx, [leave_mover_idx]
        je      .next
        mov     si, bx
        imul    si, si, C_REC
        add     si, comb
        call    is_active_si
        jnc     .next
        test    word [si+C_FLAGS], CF_FEARED | CF_DISABLED
        jnz     .next
        mov     di, [leave_mover_ptr]
        mov     al, [si+C_SIDE]
        cmp     al, [di+C_SIDE]
        je      .next
        mov     di, si
        mov     si, [leave_mover_ptr]
        call    figure_distance
        cmp     ax, MELEE_REACH
        jg      .next                        ; not adjacent to the square being left
        ; Speculative relocation, the same move-test-move-back the oracle does:
        ; a foe that is STILL adjacent at the destination is not being left, so
        ; it does not react.  figure_distance preserves SI and DI.
        mov     ax, [si+C_COL]
        mov     [leave_save_col], ax
        mov     ax, [si+C_ROW]
        mov     [leave_save_row], ax
        mov     ax, [move_new_col]
        mov     [si+C_COL], ax
        mov     ax, [move_new_row]
        mov     [si+C_ROW], ax
        call    figure_distance
        push    ax
        mov     ax, [leave_save_col]
        mov     [si+C_COL], ax
        mov     ax, [leave_save_row]
        mov     [si+C_ROW], ax
        pop     ax
        cmp     ax, MELEE_REACH
        jle     .next                        ; still adjacent after the step
        mov     bx, [leave_i]
        mov     si, bx
        imul    si, si, C_REC
        add     si, comb
        mov     [cur_ptr], si
        mov     ax, [leave_i]
        mov     [cur_idx], ax
        mov     ax, [leave_mover_idx]
        mov     [tgt_idx], ax
        mov     ax, [leave_mover_ptr]
        mov     [tgt_ptr], ax
        mov     byte [attack_missile], 0     ; a back attack is melee by definition
        mov     byte [back_attack], 1
        call    resolve_hit
        mov     byte [back_attack], 0
        mov     ax, [leave_mover_ptr]
        mov     [cur_ptr], ax
        mov     ax, [leave_mover_idx]
        mov     [cur_idx], ax
        mov     si, [leave_mover_ptr]
        call    is_active_si
        jnc     .restore                     ; the mover died on the way out
.next:
        inc     word [leave_i]
        jmp     .lp
.restore:
        mov     ax, [leave_mover_ptr]
        mov     [cur_ptr], ax
        mov     ax, [leave_mover_idx]
        mov     [cur_idx], ax
.done:
        pop     di
shared_epi_ax_bx_si_di:
        pop     si
        pop     bx
        pop     ax
        ret

; -- trigger_guard_reactions: after [cur_ptr] moved/fled, guarding foes in
;    melee reach spend their readied action on one immediate strike.
trigger_guard_reactions:
        push    ax
        push    bx
        push    si
        push    di
        mov     si, [cur_ptr]
        call    is_active_si
        jnc     .done
        mov     ax, [cur_ptr]
        mov     [guard_mover_ptr], ax
        mov     ax, [cur_idx]
        mov     [guard_mover_idx], ax
        mov     word [guard_i], 0
.lp:
        mov     bx, [guard_i]
        cmp     bx, [ncomb]
        jae     .restore
        cmp     bx, [guard_mover_idx]
        je      .next
        mov     si, bx
        imul    si, si, C_REC
        add     si, comb
        call    is_active_si
        jnc     .next
        test    word [si+C_FLAGS], CF_GUARDING
        jz      .next
        test    word [si+C_FLAGS], CF_FEARED | CF_DISABLED
        jnz     .next
        mov     di, [guard_mover_ptr]
        mov     al, [si+C_SIDE]
        cmp     al, [di+C_SIDE]
        je      .next
        mov     di, si
        mov     si, [guard_mover_ptr]
        call    figure_distance
        cmp     ax, MELEE_REACH
        jg      .next
        mov     bx, [guard_i]
        mov     si, bx
        imul    si, si, C_REC
        add     si, comb
        and     word [si+C_FLAGS], 0FFDFh
        mov     [cur_ptr], si
        mov     ax, [guard_i]
        mov     [cur_idx], ax
        mov     ax, [guard_mover_idx]
        mov     [tgt_idx], ax
        mov     ax, [guard_mover_ptr]
        mov     [tgt_ptr], ax
        call    resolve_hit
        mov     ax, [guard_mover_ptr]
        mov     [cur_ptr], ax
        mov     ax, [guard_mover_idx]
        mov     [cur_idx], ax
        mov     si, [guard_mover_ptr]
        call    is_active_si
        jnc     .restore
.next:
        inc     word [guard_i]
        jmp     .lp
.restore:
        mov     ax, [guard_mover_ptr]
        mov     [cur_ptr], ax
        mov     ax, [guard_mover_idx]
        mov     [cur_idx], ax
.done:
        pop     di
        jmp     shared_epi_ax_bx_si_di

; -- apply_hazard_cur: CT.7b hazard for [cur_ptr] at its current anchor.
;    Damage, status, and optional status-saving throws are synthetic fixtures.
apply_hazard_cur:
        push    ax
        push    bx
        push    cx
        push    dx
        push    si
        push    di
        mov     si, [cur_ptr]
        call    is_active_si
        jnc     .done
        call    hazard_at_cur
        jnc     .done
        cmp     word [hazard_dcount], 0
        jne     .do_damage
        cmp     word [hazard_dbonus], 0
        jne     .do_damage
        jmp     .after_damage
.do_damage:
        mov     bx, [hazard_dcount]
        mov     cx, [hazard_dsides]
        mov     dx, [hazard_dbonus]
        call    rng_roll
        cmp     ax, 1
        jge     .dmg_ok
        mov     ax, 1
.dmg_ok:
        mov     [r_dmg], ax
        mov     si, [cur_ptr]
        mov     [tgt_ptr], si
        mov     ax, [si+C_HP]
        mov     [hp_before], ax
        sub     ax, [r_dmg]
        mov     [si+C_HP], ax
        mov     ax, [si+C_HP]
        test    ax, ax
        jg      .hp_pos
        xor     ax, ax
.hp_pos:
        mov     [r_hpafter], ax
        mov     word [r_dead], -1
        mov     si, [cur_ptr]
        call    trace_hazard
        mov     si, [cur_ptr]
        cmp     word [si+C_HP], 0
        jg      .after_damage
        cmp     byte [combat_ruleset], RULE_GEN2
        je      .unconscious
        mov     ax, [hp_before]
        add     ax, 10
        mov     cx, [r_dmg]
        cmp     cx, ax
        jg      .lethal
.unconscious:
        or      word [si+C_FLAGS], CF_UNCON
        mov     word [r_dead], 0
        jmp     .slain
.lethal:
        or      word [si+C_FLAGS], CF_DEAD
        mov     word [r_dead], 1
.slain:
        cmp     byte [si+C_SIDE], 1
        jne     .trace_slain
        mov     ax, [xp_awarded]
        add     ax, [si+C_XP]
        mov     [xp_awarded], ax
.trace_slain:
        mov     si, [cur_ptr]
        call    trace_slain_hazard
        jmp     .done
.after_damage:
        cmp     word [hazard_status], HAZ_STATUS_NONE
        je      .done
        mov     si, [cur_ptr]
        call    is_active_si
        jnc     .done
        mov     word [hazard_save_roll], -1
        mov     word [hazard_saved], 0
        mov     ax, [hazard_save_target]
        cmp     ax, 0
        jle     .apply_status
        push    ax
        mov     ax, 20
        call    rng_die
        mov     [hazard_save_roll], ax
        pop     bx
        cmp     ax, bx
        jl      .apply_status
        mov     word [hazard_saved], 1
        jmp     .trace_status_hazard
.apply_status:
        cmp     word [hazard_status], HAZ_STATUS_FEARED
        jne     .try_held
        mov     si, [cur_ptr]
        or      word [si+C_FLAGS], CF_FEARED
        jmp     .status_applied
.try_held:
        cmp     word [hazard_status], HAZ_STATUS_HELD
        jne     .try_asleep
        mov     si, [cur_ptr]
        or      word [si+C_FLAGS], CF_HELD
        jmp     .status_applied
.try_asleep:
        cmp     word [hazard_status], HAZ_STATUS_ASLEEP
        jne     .trace_status_hazard
        mov     si, [cur_ptr]
        or      word [si+C_FLAGS], CF_ASLEEP
.status_applied:
        call    set_status_timer_cur
.trace_status_hazard:
        mov     si, [cur_ptr]
        call    trace_hazard_status
.done:
        pop     di
shared_epi_ax_bx_cx_dx_si_di:
        pop     si
        pop     dx
        pop     cx
        pop     bx
        pop     ax
        ret

; hazard_at_cur: CF=1 if [cur_ptr]'s anchor has a synthetic hazard.
hazard_at_cur:
        push    bx
        push    cx
        push    dx
        push    si
        mov     si, [cur_ptr]
        mov     dx, [si+C_COL]
        mov     ax, [si+C_ROW]
        mov     cx, [hazard_count]
        xor     bx, bx
.lp:
        cmp     bx, cx
        jae     .none
        mov     si, bx
        shl     si, 4
        cmp     dx, [hazard_cells+si]
        jne     .next
        cmp     ax, [hazard_cells+si+2]
        jne     .next
        mov     dx, [hazard_cells+si+4]
        mov     [hazard_dcount], dx
        mov     dx, [hazard_cells+si+6]
        mov     [hazard_dsides], dx
        mov     dx, [hazard_cells+si+8]
        mov     [hazard_dbonus], dx
        mov     dx, [hazard_cells+si+10]
        mov     [hazard_status], dx
        mov     dx, [hazard_cells+si+12]
        mov     [hazard_save_target], dx
        mov     dx, [hazard_cells+si+14]
        mov     [hazard_rounds], dx
        stc
        jmp     .done
.next:
        inc     bx
        jmp     .lp
.none:
        clc
.done:
        pop     si
shared_epi_bx_cx_dx_si:
        pop     dx
        pop     cx
        pop     bx
        ret

set_status_timer_cur:
        push    ax
        push    bx
        mov     ax, [hazard_rounds]
        cmp     ax, 0
        jle     .done
        mov     bx, [cur_idx]
        cmp     bx, MAXCOMB
        jae     .done
        shl     bx, 1
        mov     [status_timer+bx], ax
        mov     ax, [hazard_status]
        mov     [status_kind+bx], ax
.done:
        pop     bx
        pop     ax
        ret

; ============================================================================
;  begin_round -- build [order] = active combatant indices sorted by
;  effectiveInitiative DESC, tie-broken by bySideThenId (party<enemy, then
;  ascending ordinal-id).  effectiveInitiative = stored init (no haste/slow in
;  Tier-1).  Selection sort (tiny arrays) preserving the exact comparator.
; ============================================================================
begin_round:
        push    bx
        push    si
        ; gather active indices into order[]
        xor     bx, bx                       ; src index
        xor     cx, cx                       ; count
.gather:
        cmp     bx, [ncomb]
        jae     .gathered
        mov     si, bx
        imul    si, si, C_REC
        add     si, comb
        call    is_active_si
        jnc     .gnext
        mov     si, cx
        shl     si, 1
        mov     [order + si], bx
        inc     cx
.gnext:
        inc     bx
        jmp     .gather
.gathered:
        mov     [order_n], cx
        cmp     byte [party_dok], 1
        jne     .tier1_sort
        pop     si
        pop     bx
        jmp     dok_init_round
.tier1_sort:
        ; selection sort order[] using cmp_order (a before b if cmp<0)
        mov     cx, [order_n]
        cmp     cx, 1
        jle     .sorted
        xor     bx, bx                       ; i
.outer:
        mov     ax, [order_n]
        dec     ax
        cmp     bx, ax
        jae     .sorted
        mov     si, bx
        inc     si                           ; j = i+1
.inner:
        cmp     si, [order_n]
        jae     .innerdone
        ; if order[j] should come before order[i], swap
        mov     di, bx
        shl     di, 1
        mov     ax, [order + di]            ; a = order[i]
        mov     di, si
        shl     di, 1
        mov     dx, [order + di]            ; b = order[j]  (candidate)
        ; cmp_order(b, a): want b before a ?  returns sign in AX (<0 b first)
        push    bx
        push    si
        mov     bx, dx                       ; bx = b
        mov     si, ax                       ; si = a
        call    cmp_order                    ; AX<0 => b before a
        pop     si
        pop     bx
        test    ax, ax
        jge     .innernext
        ; swap order[i] and order[j]
        mov     di, bx
        shl     di, 1
        mov     ax, [order + di]
        push    ax
        mov     di, si
        shl     di, 1
        mov     ax, [order + di]
        mov     di, bx
        shl     di, 1
        mov     [order + di], ax
        pop     ax
        mov     di, si
        shl     di, 1
        mov     [order + di], ax
.innernext:
        inc     si
        jmp     .inner
.innerdone:
        inc     bx
        jmp     .outer
.sorted:
        pop     si
        pop     bx
        ret

; -- cmp_order(a_idx in BX, b_idx in SI) -> AX:  <0 if a sorts before b,
;    >0 if after, 0 if equal.  Comparator = b.init - a.init || bySideThenId(a,b).
;    i.e. higher init first; tie -> party(0) before enemy(1); tie -> lower
;    ordinal id first.  (Ids p0<p1.. e0<e1.. so within a side compare ordinal.)
cmp_order:
        push    bx
        push    si
        push    cx
        push    dx
        ; a ptr, b ptr
        mov     ax, bx
        imul    ax, ax, C_REC
        add     ax, comb
        mov     bx, ax                       ; bx = ptr a
        mov     ax, si
        imul    ax, ax, C_REC
        add     ax, comb
        mov     si, ax                       ; si = ptr b
        ; init compare: result = b.init - a.init  (descending)
        mov     ax, [si+C_INIT]
        sub     ax, [bx+C_INIT]              ; AX = b.init - a.init
        test    ax, ax
        jnz     .ret
        ; tie -> bySideThenId(a,b): party(0) before enemy(1)
        mov     al, [bx+C_SIDE]
        mov     ah, [si+C_SIDE]
        cmp     al, ah
        je      .sameside
        ; a.side != b.side: a before b iff a.side==party(0)
        cmp     al, 0
        je      .a_first
        mov     ax, 1                        ; a after b
        jmp     .ret
.a_first:
        mov     ax, -1
        jmp     .ret
.sameside:
        ; same side -> compare ordinal (id ascending)
        mov     al, [bx+C_ORD]
        mov     ah, [si+C_ORD]
        movzx   cx, al
        movzx   dx, ah
        mov     ax, cx
        sub     ax, dx                       ; a.ord - b.ord  (<0 => a first)
.ret:
        pop     dx
        pop     cx
        pop     si
        pop     bx
        ret

; ============================================================================
;  ai_take_turn -- Tier-1 AI for [cur_ptr]/[cur_idx]:
;    fire a finite-ammo missile at the WEAKEST clear in-range foe, otherwise
;    attack the WEAKEST in-reach foe (oracle aiAction step 1 missile/melee +
;    weakest()).  If no foe is in reach, route toward the weakest foe within
;    the mover's movement allowance, requiring the mover's full footprint
;    to fit without overlapping another living combatant; then retarget and
;    attack if adjacent.
;    repeats the swing/shot according to per-combatant attacks-per-round fields.
;  Resolves each hit via resolve_hit, applying the current ruleset's death rule.
; ============================================================================
MELEE_REACH       equ 1   ; default weapon reach (cells, footprint Chebyshev) per oracle Weapon.reach
; Rear-AC delta actually representable here.  The Gen1 oracle's full rule is
; ac - ac_behind = Dex bonus + shield bonus + 2 (ovr025.cs:477-484); this record
; carries one flat C_AC, so only the constant survives.  See
; trigger_leaving_reactions for the shortfall this leaves.
BACK_ATTACK_AC    equ 2
; Step charges out of the half-square budget, for terrain cost 1.  The 3:2
; diagonal-to-orthogonal ratio is measured, and it contradicts RE.6's
; diagCost = 4 against orthogonal 2 (a 2:1 ratio) -- that reading scanned for a
; literal `sub ...,3` and missed a `cost*3` multiply.
MOVE_COST_ORTH    equ 2
MOVE_COST_DIAG    equ 3

; -- axis_gap: AX=aMin, BX=aSize, CX=bMin, DX=bSize -> AX=minimum cell gap
;    Size is clamped to 1..2 because the engine currently decodes small/large
;    tactical icons only.  Adjacent cells have gap 1; overlapping cells gap 0.
axis_gap:
        push    si
        push    di
        mov     si, ax                       ; aMin
        cmp     bx, 1
        jg      .asz_gt1
        mov     bx, 1
        jmp     .asz_done
.asz_gt1:
        cmp     bx, 2
        jle     .asz_done
        mov     bx, 2
.asz_done:
        add     si, bx
        dec     si                           ; aMax
        mov     di, cx                       ; bMin
        cmp     dx, 1
        jg      .bsz_gt1
        mov     dx, 1
        jmp     .bsz_done
.bsz_gt1:
        cmp     dx, 2
        jle     .bsz_done
        mov     dx, 2
.bsz_done:
        add     di, dx
        dec     di                           ; bMax
        cmp     si, cx
        jge     .check_b_before_a
        mov     ax, cx
        sub     ax, si                       ; bMin - aMax
        jmp     .done
.check_b_before_a:
        cmp     di, ax
        jge     .overlap
        sub     ax, di                       ; aMin - bMax
        jmp     .done
.overlap:
        xor     ax, ax
.done:
        pop     di
        pop     si
        ret

; -- figure_distance: DI=actor, SI=candidate -> AX=footprint Chebyshev distance
figure_distance:
        push    bx
        push    cx
        push    dx
        push    si
        push    di
        mov     ax, [di+C_COL]
        mov     bx, [di+C_SIZE]
        mov     cx, [si+C_COL]
        mov     dx, [si+C_SIZE]
        call    axis_gap
        mov     [cand_dist], ax
        pop     di
        pop     si
        push    si
        push    di
        mov     ax, [di+C_ROW]
        mov     bx, [di+C_SIZE]
        mov     cx, [si+C_ROW]
        mov     dx, [si+C_SIZE]
        call    axis_gap
        cmp     ax, [cand_dist]
        jge     .done
        mov     ax, [cand_dist]
.done:
        pop     di
        jmp     shared_epi_bx_cx_dx_si_di

ai_take_turn:
        push    bx
        push    si
        mov     si, [cur_ptr]
        test    word [si+C_FLAGS], CF_FEARED
        jz      .not_feared
        call    try_flee_step
        jmp     .done
.not_feared:
        mov     byte [attack_secondary], 0
        call    pick_missile_target
        cmp     word [tgt_idx], -1
        je      .melee_or_move
        call    attacks_available
        mov     cx, ax
.missile_loop:
        test    cx, cx
        jle     .done
        call    pick_missile_target
        cmp     word [tgt_idx], -1
        je      .done
        mov     si, [cur_ptr]
        cmp     word [si+C_AMMO], 0
        jle     .done
        dec     word [si+C_AMMO]
        push    cx
        mov     byte [attack_missile], 1
        call    resolve_hit
        mov     byte [attack_missile], 0
        pop     cx
        call    consume_quick_attack
        dec     cx
        jmp     .missile_loop
.melee_or_move:
        ; pick weakest in-reach foe; if none, try one footprint-checked close step
        call    pick_weakest_target          ; -> [tgt_idx] (=-1 if none), [tgt_ptr]
        cmp     word [tgt_idx], -1
        jne     .have_target
        call    try_close_step
        jnc     .moved
        mov     si, [cur_ptr]
        call    is_active_si
        jnc     .done
        cmp     word [guard_ai_enabled], 0
        je      .done
        call    ready_guard_cur
        jmp     .done
.moved:
        mov     si, [cur_ptr]
        call    is_active_si
        jnc     .done
        test    word [si+C_FLAGS], CF_DISABLED
        jnz     .done
        call    pick_weakest_target
        cmp     word [tgt_idx], -1
        je      .done
.have_target:
        mov     si, [cur_ptr]
        test    word [si+C_ATTACKS], 8000h
        jnz     .dqk_melee
        call    attacks_available
        mov     cx, ax
        call    melee_swing_count
.secondary_melee:
        call    secondary_attack_present_cur
        jnc     .done
        mov     si, [tgt_ptr]
        call    is_active_si
        jc      .secondary_resolve
        call    pick_weakest_target
        cmp     word [tgt_idx], -1
        je      .done
.secondary_resolve:
        mov     byte [attack_missile], 0
        mov     byte [attack_secondary], 1
        call    resolve_hit
        mov     byte [attack_secondary], 0
        jmp     .done

.dqk_melee:
        ; DQK spends kind 2 before kind 1. A normalized zero remains zero,
        ; rather than acquiring the generic path's minimum one attack.
        movzx   ax, byte [si+C_ATTACKS]
        call    dqk_attacks_this_round
        mov     cx, ax
        mov     byte [attack_secondary], 1
        call    melee_swing_count
        mov     byte [attack_secondary], 0
        mov     si, [cur_ptr]
        cmp     byte [secret_party_loaded], 1
        jne     .tagged_primary
        cmp     byte [quick_budget_active], 1
        jne     .tagged_primary
        mov     cx, [player_attacks_left]
        jmp     .tagged_primary_ready
.tagged_primary:
        mov     ax, [si+C_HALFATT]
        call    dqk_attacks_this_round
        mov     cx, ax
.tagged_primary_ready:
        call    melee_swing_count
        jmp     .done
.done:
        mov     byte [attack_secondary], 0
        pop     si
        pop     bx
        ret

; Resolve CX attacks, retargeting after a kill. attack_secondary selects the
; source profile for the caller.
melee_swing_count:
.swing:
        test    cx, cx
        jle     .done
        mov     si, [tgt_ptr]
        call    is_active_si
        jnc     .repick
        ; DQK 0x2E94D attack stage: a stored target whose side (+0x66) is 0 is
        ; dropped and re-selected, so a monster re-rolls its victim every swing.
        call    dqk_ai_gate
        jnc     .resolve
        mov     si, [tgt_ptr]
        cmp     byte [si+C_SIDE], 0
        jne     .resolve
.repick:
        call    pick_weakest_target
        cmp     word [tgt_idx], -1
        je      .done
.resolve:
        push    cx
        mov     byte [attack_missile], 0
        call    resolve_hit
        pop     cx
        call    consume_quick_attack
        dec     cx
        jmp     .swing
.done:
        ret

; -- attacks_available: Quick spends the player's carried primary-attack
; ledger; ordinary AI turns retain their own record-derived allowance.
attacks_available:
        cmp     byte [quick_budget_active], 0
        je      attacks_this_round
        mov     ax, [player_attacks_left]
        ret

; -- consume_quick_attack: resolve_hit itself does not own an action ledger.
; Do this after every primary AI attack so a partial player bump cannot be
; followed by a freshly granted Quick swing.
consume_quick_attack:
        cmp     byte [secret_party_loaded], 1
        jne     .budget
        cmp     byte [attack_secondary], 1
        je      .done
.budget:
        cmp     byte [quick_budget_active], 0
        je      .done
        cmp     word [player_attacks_left], 0
        jle     .done
        dec     word [player_attacks_left]
.done:
        ret

; attacks_this_round: current actor -> AX=count. Mirrors the oracle halfAttacks
; convention: 3 means two swings on odd rounds, one on even rounds.
attacks_this_round:
        push    bx
        mov     bx, [cur_ptr]
        cmp     byte [secret_party_loaded], 1
        jne     .generic
        cmp     byte [bx+C_SIDE], 0
        jne     .generic
        mov     ax, [bx+C_HALFATT]
        call    se_attacks_this_round
        pop     bx
        ret
.generic:
        mov     ax, [bx+C_HALFATT]
        or      ax, ax
        jle     .plain
        shr     ax, 1
        jnc     .clamp
        test    word [round], 1
        jz      .clamp
        inc     ax
        jmp     .clamp
.plain:
        mov     ax, [bx+C_ATTACKS]
.clamp:
        cmp     ax, 1
        jge     .done
        mov     ax, 1
.done:
        pop     bx
        ret

; AX = one DQK attack kind's raw two-round allowance. DQK phase zero is native
; round 1, so an odd allowance grants its extra attack in native round 2.
; Unlike the generic allowance, zero stays zero.
dqk_attacks_this_round:
        cmp     byte [secret_profile], 0
        jne     se_attacks_this_round
        shr     ax, 1
        jnc     .done
        test    byte [round], 1
        jnz     .done
        inc     ax
.done:
        ret

secondary_attack_present_cur:
        push    bx
        mov     bx, [cur_idx]
        shl     bx, 1
        cmp     word [sec_dcount+bx], 0
        je      .no
        cmp     word [sec_dsides+bx], 0
        je      .no
        stc
        pop     bx
        ret
.no:
        clc
        pop     bx
        ret

; -- pick_missile_target: finite-ammo missile slice.  Among living foes within
;    [C_MRANGE] and a clear footprint-aware line, use the same weakest/nearest
;    reducer as melee.  This keeps real imported monsters melee-only unless an
;    explicit fixture/import fills C_MRANGE and C_AMMO.
pick_missile_target:
        push    bx
        push    si
        push    di
        mov     word [tgt_idx], -1
        mov     si, [cur_ptr]
        cmp     word [si+C_MRANGE], 0
        jle     .done
        cmp     word [si+C_AMMO], 0
        jle     .done
        mov     al, [si+C_SIDE]
        xor     al, 1
        mov     [foe_side], al
        xor     bx, bx
.lp:
        cmp     bx, [ncomb]
        jae     .done
        mov     si, bx
        imul    si, si, C_REC
        add     si, comb
        call    is_active_si
        jnc     .next
        mov     al, [si+C_SIDE]
        cmp     al, [foe_side]
        jne     .next
        mov     di, [cur_ptr]
        call    figure_distance
        mov     [cand_dist], ax
        mov     di, [cur_ptr]
        cmp     ax, [di+C_MRANGE]
        jg      .next
        call    clear_missile_line
        jc      .next
        cmp     word [tgt_idx], -1
        je      .take
        mov     di, [tgt_ptr]
        mov     ax, [si+C_HP]
        cmp     ax, [di+C_HP]
        jl      .take
        jg      .next
        mov     ax, [cand_dist]
        cmp     ax, [best_dist]
        jl      .take
        jmp     .next
.take:
        mov     [tgt_idx], bx
        mov     [tgt_ptr], si
        mov     ax, [cand_dist]
        mov     [best_dist], ax
        mov     [missile_dist], ax
.next:
        inc     bx
        jmp     .lp
.done:
        pop     di
shared_epi_bx_si_di:
        pop     si
        pop     bx
        ret

; -- apply_missile_range_mod: adjusts [r_needed] for the selected missile shot.
;    Matches tactical.ts:
;      short  if dist <= range/3      -> +1 to hit  (needed -= 1)
;      long   if dist >  2*range/3    -> -2 to hit  (needed += 2)
;      medium otherwise               -> no change
;    For integer dist/range we compare dist*3 against range and range*2, which
;    is equivalent to the oracle's fractional thresholds.
apply_missile_range_mod:
        push    ax
        push    bx
        push    cx
        push    dx
        push    di
        mov     di, [cur_ptr]
        mov     bx, [di+C_MRANGE]
        cmp     bx, 0
        jle     .short
        mov     ax, [missile_dist]
        mov     cx, 3
        mul     cx                          ; AX = dist * 3 (small grid values)
        cmp     ax, bx
        jle     .short
        mov     dx, bx
        shl     dx, 1                       ; DX = range * 2
        cmp     ax, dx
        jg      .long
        jmp     .done
.short:
        dec     word [r_needed]
        jmp     .done
.long:
        add     word [r_needed], 2
.done:
        pop     di
        pop     dx
        pop     cx
        pop     bx
        pop     ax
        ret

; -- clear_missile_line: SI=candidate target, [cur_ptr]=shooter.
;    CF=0 if ANY shooter-footprint cell has a clear Bresenham line to ANY target
;    footprint cell. The shooter's and target's own footprints never body-block
;    that shot; other living footprints and synthetic terrain blocks do.
clear_missile_line:
        push    ax
        push    bx
        push    cx
        push    dx
        push    si
        push    di
        mov     [los_target_ptr], si
        mov     di, [cur_ptr]
        mov     ax, [di+C_COL]
        mov     [los_from_col], ax
        mov     ax, [di+C_ROW]
        mov     [los_from_row], ax
        mov     ax, [di+C_SIZE]
        call    los_clamp_size
        mov     [los_from_size], ax
        mov     ax, [si+C_COL]
        mov     [los_to_col], ax
        mov     ax, [si+C_ROW]
        mov     [los_to_row], ax
        mov     ax, [si+C_SIZE]
        call    los_clamp_size
        mov     [los_to_size], ax
        mov     word [los_from_dy], 0
.from_y:
        mov     ax, [los_from_dy]
        cmp     ax, [los_from_size]
        jae     .blocked
        mov     word [los_from_dx], 0
.from_x:
        mov     ax, [los_from_dx]
        cmp     ax, [los_from_size]
        jae     .next_from_y
        mov     word [los_to_dy], 0
.to_y:
        mov     ax, [los_to_dy]
        cmp     ax, [los_to_size]
        jae     .next_from_x
        mov     word [los_to_dx], 0
.to_x:
        mov     ax, [los_to_dx]
        cmp     ax, [los_to_size]
        jae     .next_to_y
        mov     ax, [los_from_col]
        add     ax, [los_from_dx]
        mov     [los_cx], ax
        mov     ax, [los_from_row]
        add     ax, [los_from_dy]
        mov     [los_cy], ax
        mov     ax, [los_to_col]
        add     ax, [los_to_dx]
        mov     [los_tx], ax
        mov     ax, [los_to_row]
        add     ax, [los_to_dy]
        mov     [los_ty], ax
        call    clear_missile_segment
        jnc     .clear
        inc     word [los_to_dx]
        jmp     .to_x
.next_to_y:
        inc     word [los_to_dy]
        jmp     .to_y
.next_from_x:
        inc     word [los_from_dx]
        jmp     .from_x
.next_from_y:
        inc     word [los_from_dy]
        jmp     .from_y
.clear:
        clc
        jmp     .done
.blocked:
        stc
.done:
        pop     di
        jmp     shared_epi_ax_bx_cx_dx_si_di

; clear_missile_segment: uses [los_cx,los_cy] -> [los_tx,los_ty].
; CF=0 if the intermediate cells are clear.
clear_missile_segment:
        push    ax
        push    bx
        push    cx
        push    dx
        mov     bx, [los_tx]
        sub     bx, [los_cx]
        call    los_abs_sign
        mov     [los_dx], ax
        mov     [los_sx], bx
        mov     bx, [los_ty]
        sub     bx, [los_cy]
        call    los_abs_sign
        mov     [los_dy], ax
        mov     [los_sy], bx
        mov     ax, [los_dx]
        or      ax, [los_dy]
        jz      .clear
        mov     ax, [los_dx]
        cmp     ax, [los_dy]
        jb      .y_major
        mov     ax, [los_dx]
        shr     ax, 1
        mov     [los_err], ax
        mov     ax, [los_dx]
        mov     [los_count], ax
.x_loop:
        cmp     word [los_count], 0
        je      .clear
        mov     ax, [los_sx]
        add     [los_cx], ax
        mov     ax, [los_dy]
        sub     [los_err], ax
        jge     .x_no_y
        mov     ax, [los_sy]
        add     [los_cy], ax
        mov     ax, [los_dx]
        add     [los_err], ax
.x_no_y:
        call    los_at_target
        je      .x_next
        call    los_cell_blocked
        jc      .blocked
.x_next:
        dec     word [los_count]
        jmp     .x_loop
.y_major:
        mov     ax, [los_dy]
        shr     ax, 1
        mov     [los_err], ax
        mov     ax, [los_dy]
        mov     [los_count], ax
.y_loop:
        cmp     word [los_count], 0
        je      .clear
        mov     ax, [los_sy]
        add     [los_cy], ax
        mov     ax, [los_dx]
        sub     [los_err], ax
        jge     .y_no_x
        mov     ax, [los_sx]
        add     [los_cx], ax
        mov     ax, [los_dy]
        add     [los_err], ax
.y_no_x:
        call    los_at_target
        je      .y_next
        call    los_cell_blocked
        jc      .blocked
.y_next:
        dec     word [los_count]
        jmp     .y_loop
.clear:
        clc
        jmp     .done
.blocked:
        stc
.done:
        pop     dx
shared_epi_ax_bx_cx_dx:
        pop     cx
        pop     bx
        pop     ax
        ret

los_clamp_size:
        cmp     ax, 1
        jg      .gt1
        mov     ax, 1
        ret
.gt1:
        cmp     ax, 2
        jle     .done
        mov     ax, 2
.done:
        ret

; los_abs_sign: BX=signed delta -> AX=abs(delta), BX=sign(-1/0/1).
los_abs_sign:
        test    bx, bx
        jz      .zero
        jl      .neg
        mov     ax, bx
        mov     bx, 1
        ret
.neg:
        neg     bx
        mov     ax, bx
        mov     bx, -1
        ret
.zero:
        xor     ax, ax
        xor     bx, bx
        ret

los_at_target:
        mov     ax, [los_cx]
        cmp     ax, [los_tx]
        jne     .ret
        mov     ax, [los_cy]
        cmp     ax, [los_ty]
.ret:
        ret

los_cell_blocked:
        call    los_terrain_blocked
        jc      .blocked
        call    los_body_blocked
        jc      .blocked
        clc
        ret
.blocked:
        stc
        ret

los_terrain_blocked:
        push    ax
        push    bx
        push    cx
        mov     cx, [terrain_block_count]
        xor     bx, bx
.lp:
        cmp     bx, cx
        jae     .clear
        mov     ax, bx
        shl     ax, 2
        mov     [los_tmp], ax
        mov     ax, [los_tmp]
        mov     bx, ax
        mov     ax, [terrain_blocks+bx]
        cmp     ax, [los_cx]
        jne     .next
        mov     ax, [terrain_blocks+bx+2]
        cmp     ax, [los_cy]
        je      .blocked
.next:
        mov     bx, [los_tmp]
        shr     bx, 2
        inc     bx
        jmp     .lp
.clear:
        clc
        jmp     .done
.blocked:
        stc
.done:
        pop     cx
        jmp     shared_epi_ax_bx_cx

los_body_blocked:
        push    ax
        push    bx
        push    cx
        push    dx
        push    si
        xor     bx, bx
.lp:
        cmp     bx, [ncomb]
        jae     .clear
        mov     si, bx
        imul    si, si, C_REC
        add     si, comb
        cmp     si, [cur_ptr]
        je      .next
        cmp     si, [los_target_ptr]
        je      .next
        call    is_active_si
        jnc     .next
        mov     ax, [si+C_SIZE]
        cmp     ax, 1
        jg      .size_gt1
        mov     ax, 1
        jmp     .size_ok
.size_gt1:
        cmp     ax, 2
        jle     .size_ok
        mov     ax, 2
.size_ok:
        mov     cx, [si+C_COL]
        mov     dx, cx
        add     dx, ax
        dec     dx
        mov     ax, [los_cx]
        cmp     ax, cx
        jl      .next
        cmp     ax, dx
        jg      .next
        mov     ax, [si+C_SIZE]
        cmp     ax, 1
        jg      .ysize_gt1
        mov     ax, 1
        jmp     .ysize_ok
.ysize_gt1:
        cmp     ax, 2
        jle     .ysize_ok
        mov     ax, 2
.ysize_ok:
        mov     cx, [si+C_ROW]
        mov     dx, cx
        add     dx, ax
        dec     dx
        mov     ax, [los_cy]
        cmp     ax, cx
        jl      .next
        cmp     ax, dx
        jg      .next
        stc
        jmp     .done
.next:
        inc     bx
        jmp     .lp
.clear:
        clc
.done:
        pop     si
        jmp     shared_epi_ax_bx_cx_dx_si

; -- pick_weakest_target: among living foes of [cur_ptr] within MELEE_REACH
;    (footprint Chebyshev), pick lowest hp, tie-break nearest by distance.  Foe-list is
;    iterated in living(side) order = bySideThenId (the reduce seed is list[0]).
;    Mirrors meleeTargets() (filter by figureDistance<=reach) + weakest().
;    Sets [tgt_idx] (-1 if none) and [tgt_ptr].
pick_weakest_target:
        call    dqk_ai_gate
        jc      pick_random_target
        push    bx
        push    si
        push    di
        mov     word [tgt_idx], -1
        ; determine foe side
        mov     si, [cur_ptr]
        mov     al, [si+C_SIDE]
        xor     al, 1                        ; foe side
        mov     [foe_side], al
        ; iterate candidates in bySideThenId order: since the array is laid out
        ; party-first then enemy and ordinals ascending within a side, plain
        ; array order already equals living(side) order for one side's members.
        xor     bx, bx                       ; index
.lp:
        cmp     bx, [ncomb]
        jae     .done
        mov     si, bx
        imul    si, si, C_REC
        add     si, comb
        ; active?
        call    is_active_si
        jnc     .next
        ; correct foe side?
        mov     al, [si+C_SIDE]
        cmp     al, [foe_side]
        jne     .next
        ; within reach? footprint Chebyshev(cur,foe) <= MELEE_REACH
        mov     di, [cur_ptr]
        call    figure_distance              ; AX = min occupied-cell Chebyshev
        cmp     ax, MELEE_REACH
        jg      .next
        mov     [cand_dist], ax              ; Chebyshev dist of this candidate
        ; weakest reduce: if first candidate, take it; else compare
        cmp     word [tgt_idx], -1
        je      .take
        ; compare hp: c.hp < best.hp ? take ; if equal, nearer ? take
        mov     di, [tgt_ptr]
        mov     ax, [si+C_HP]
        cmp     ax, [di+C_HP]
        jl      .take
        jg      .next
        ; equal hp -> tie-break nearest (cand_dist < best_dist)
        mov     ax, [cand_dist]
        cmp     ax, [best_dist]
        jl      .take
        jmp     .next
.take:
        mov     [tgt_idx], bx
        mov     [tgt_ptr], si
        mov     ax, [cand_dist]
        mov     [best_dist], ax
.next:
        inc     bx
        jmp     .lp
.done:
        pop     di
        jmp     shared_epi_bx_si_di

; -- dqk_ai_gate: CF=1 for a DQK combat (GBPR title kind 3, or the CCECL D0xx
;    handoff tag).  CoK/DoK/builtin fixtures never satisfy either test.
dqk_ai_gate:
        cmp     byte [secret_profile], 0
        jne     .no                     ; generic D0xx is not Secret title evidence
        cmp     byte [party_dok], 2
        je      .yes
        cmp     byte [fxbuf+17], 0d0h
        je      .yes
.no:
        clc
        ret
.yes:
        stc
        ret

; -- pick_random_target: retail DQK find_target / 0x2EB70 pick: uniform random
;    among the in-reach hostile foes, roll(count,1); no HP or distance
;    preference.  Same candidate filter and array order as pick_weakest_target.
;    RNG: rng_die (legacy LCG, or the Borland recurrence under /J); retail's
;    48f:1968 generator was never examined, so no byte-exact replay is claimed.
pick_random_target:
        push    bx
        push    si
        push    di
        push    cx                           ; rng_die clobbers ECX/EDX; callers hold swing counts
        push    dx
        mov     word [tgt_idx], -1
        mov     word [rt_cnt], 0
        mov     word [rt_pass], 0
        call    rt_scan                      ; pass 1: count candidates
        mov     ax, [rt_cnt]
        or      ax, ax
        jz      .done
        call    rng_die
        dec     ax
        mov     [rt_k], ax
        mov     word [rt_pass], 1
        call    rt_scan                      ; pass 2: take the k-th
.done:
        pop     dx
        pop     cx
        pop     di
        jmp     shared_epi_bx_si_di

; rt_scan: one walk over eligible foes.  rt_pass 0 counts them into rt_cnt;
; rt_pass 1 skips rt_k of them and takes the next into tgt_idx/tgt_ptr.
rt_scan:
        xor     bx, bx
.lp:
        cmp     bx, [ncomb]
        jae     .ret
        mov     si, bx
        imul    si, si, C_REC
        add     si, comb
        call    is_active_si
        jnc     .next
        mov     al, [si+C_SIDE]
        mov     di, [cur_ptr]
        xor     al, [di+C_SIDE]
        jz      .next                        ; same side
        mov     di, [cur_ptr]
        call    figure_distance
        cmp     ax, MELEE_REACH
        jg      .next
        cmp     word [rt_pass], 0
        jne     .pass2
        inc     word [rt_cnt]
        jmp     .next
.pass2:
        cmp     word [rt_k], 0
        je      .take
        dec     word [rt_k]
        jmp     .next
.take:
        mov     [tgt_idx], bx
        mov     [tgt_ptr], si
        jmp     .ret
.next:
        inc     bx
        jmp     .lp
.ret:
        ret

; -- pick_weakest_foe: same reducer as pick_weakest_target, but without the
;    reach filter. Used by budgeted close movement when no foe is adjacent.
pick_weakest_foe:
        push    bx
        push    si
        push    di
        mov     word [tgt_idx], -1
        mov     si, [cur_ptr]
        mov     al, [si+C_SIDE]
        xor     al, 1
        mov     [foe_side], al
        xor     bx, bx
.lp:
        cmp     bx, [ncomb]
        jae     .done
        mov     si, bx
        imul    si, si, C_REC
        add     si, comb
        call    is_active_si
        jnc     .next
        mov     al, [si+C_SIDE]
        cmp     al, [foe_side]
        jne     .next
        mov     di, [cur_ptr]
        call    figure_distance
        mov     [cand_dist], ax
        cmp     word [tgt_idx], -1
        je      .take
        mov     di, [tgt_ptr]
        mov     ax, [si+C_HP]
        cmp     ax, [di+C_HP]
        jl      .take
        jg      .next
        mov     ax, [cand_dist]
        cmp     ax, [best_dist]
        jl      .take
        jmp     .next
.take:
        mov     [tgt_idx], bx
        mov     [tgt_ptr], si
        mov     ax, [cand_dist]
        mov     [best_dist], ax
.next:
        inc     bx
        jmp     .lp
.done:
        pop     di
        jmp     shared_epi_bx_si_di

; -- try_close_step: [cur_ptr] spends its movement allowance closing on the
;    weakest living foe. This is the terrain-free reachableCells slice:
;    Dijkstra over the 10x10 grid, with each proposed anchor checked against
;    the mover's whole footprint and every other living figure.
;    CF=0 if moved at least one cell, CF=1 if no target or no legal step.
try_close_step:
        push    bx
        push    si
        push    di
        call    pick_weakest_foe
        cmp     word [tgt_idx], -1
        je      .no
        mov     di, [cur_ptr]
        cmp     byte [quick_budget_active], 0
        je      .full_turn_budget
        mov     ax, [move_left]
        cmp     ax, 1
        jle     .no
        jmp     .budget_ready
.full_turn_budget:
        mov     ax, [di+C_MOVE]
        cmp     ax, 0
        jle     .no
        shl     ax, 1
.budget_ready:
        mov     [move_budget], ax
        mov     ax, [di+C_COL]
        mov     [route_orig_col], ax
        mov     ax, [di+C_ROW]
        mov     [route_orig_row], ax
        call    build_move_dist
        call    choose_routed_close
        jc      .no
        ; choose_routed_close leaves the chosen route index in route_best_idx.
        ; Its Dijkstra cost is exactly the carried Quick movement expenditure.
        cmp     byte [quick_budget_active], 0
        je      .moved
        mov     bx, [route_best_idx]
        movzx   ax, byte [move_dist+bx]
        sub     [move_left], ax
.moved:
        call    execute_route
        jc      .no
        clc
        jmp     .done
.no:
        stc
.done:
        pop     di
        jmp     shared_epi_bx_si_di

; -- try_flee_step: a feared/routed actor spends its movement allowance moving
;    toward the nearest reachable map edge. It only leaves combat after its
;    footprint actually touches that edge.
try_flee_step:
        push    ax
        push    bx
        push    si
        push    di
        mov     word [flee_dest_flag], 0
        mov     word [move_moved], 0
        mov     di, [cur_ptr]
        cmp     byte [quick_budget_active], 0
        je      .full_turn_budget
        mov     ax, [move_left]
        cmp     ax, 1
        jle     .check_edge
        jmp     .budget_ready
.full_turn_budget:
        mov     ax, [di+C_MOVE]
        cmp     ax, 0
        jle     .check_edge
        shl     ax, 1
.budget_ready:
        mov     [move_budget], ax
        mov     ax, [di+C_COL]
        mov     [route_orig_col], ax
        mov     ax, [di+C_ROW]
        mov     [route_orig_row], ax
        call    build_move_dist
        call    choose_flee_step
        jc      .check_edge
        cmp     byte [quick_budget_active], 0
        je      .flee_budget_done
        mov     bx, [route_best_idx]
        movzx   ax, byte [move_dist+bx]
        sub     [move_left], ax
.flee_budget_done:
        mov     word [flee_dest_flag], 1
        call    execute_route
        jc      .done
        mov     word [move_moved], 1
.check_edge:
        call    current_edge_dist
        cmp     ax, 0
        jne     .not_edge
        mov     si, [cur_ptr]
        or      word [si+C_FLAGS], CF_FLED
        jmp     .done
.not_edge:
.done:
        mov     word [flee_dest_flag], 0
        pop     di
        jmp     shared_epi_ax_bx_si_di

; -- build_move_dist: terrain-free Dijkstra reachability for [cur_ptr].
;    move_dist[index=row*10+col] is the cheapest half-step cost, ROUTE_INF
;    when unreachable within [move_budget].
build_move_dist:
        push    ax
        push    bx
        push    cx
        push    dx
        push    si
        push    di
        push    es
        push    cs
        pop     es
        mov     di, move_dist
        mov     cx, COMBAT_GRID_W*COMBAT_GRID_H
        mov     al, ROUTE_INF
        rep     stosb
        mov     di, move_rank
        mov     cx, COMBAT_GRID_W*COMBAT_GRID_H
        mov     al, ROUTE_INF
        rep     stosb
        ; route_prev records the predecessor cell for each reachable anchor,
        ; then the
        ; existing move_rank array is reused as a reverse path stack.
        mov     di, route_prev
        mov     cx, COMBAT_GRID_W*COMBAT_GRID_H
        mov     al, ROUTE_INF
        rep     stosb
        pop     es

        mov     ax, [route_orig_row]
        mov     cx, COMBAT_GRID_W
        mul     cx
        add     ax, [route_orig_col]
        mov     bx, ax
        mov     byte [move_dist+bx], 0
        mov     byte [move_rank+bx], 0
        mov     word [move_rank_next], 1

        mov     word [route_pass], ROUTE_PASSES
.pass:
        mov     word [route_changed], 0
        mov     word [route_i], 0
.cell:
        mov     bx, [route_i]
        cmp     bx, COMBAT_GRID_W*COMBAT_GRID_H
        jae     .pass_done
        movzx   ax, byte [move_dist+bx]
        cmp     ax, ROUTE_INF
        jae     .next_cell
        cmp     ax, [move_budget]
        ja      .next_cell
        mov     [route_cost], ax
        call    route_decode_i

        xor     si, si
.neighbor:
        cmp     si, 8
        jae     .next_cell
        movsx   ax, byte [route_dc+si]
        add     ax, [route_col]
        mov     [move_new_col], ax
        movsx   ax, byte [route_dr+si]
        add     ax, [route_row]
        mov     [move_new_row], ax

        mov     word [move_step_cost], 2
        cmp     byte [route_dc+si], 0
        je      .cost_ok
        cmp     byte [route_dr+si], 0
        je      .cost_ok
        mov     word [move_step_cost], 4
        cmp     byte [combat_ruleset], RULE_GEN2
        jne     .cost_ok
        mov     word [move_step_cost], 3
.cost_ok:
        call    terrain_cost_at
        mov     bx, ax
        mov     ax, [move_step_cost]
        mul     bx
        mov     [move_step_cost], ax
        mov     ax, [route_cost]
        add     ax, [move_step_cost]
        cmp     ax, [move_budget]
        ja      .next_neighbor
        mov     [route_new_cost], ax
        call    can_place_cur_at
        jc      .next_neighbor

        mov     ax, [move_new_row]
        mov     cx, COMBAT_GRID_W
        mul     cx
        add     ax, [move_new_col]
        mov     bx, ax
        movzx   ax, byte [move_dist+bx]
        cmp     [route_new_cost], ax
        jae     .next_neighbor
        cmp     byte [move_dist+bx], ROUTE_INF
        jne     .rank_ok
        mov     ax, [move_rank_next]
        mov     [move_rank+bx], al
        inc     word [move_rank_next]
.rank_ok:
        mov     ax, [route_new_cost]
        mov     [move_dist+bx], al
        mov     ax, [route_i]
        mov     [route_prev+bx], al
        mov     word [route_changed], 1
.next_neighbor:
        inc     si
        jmp     .neighbor
.next_cell:
        inc     word [route_i]
        jmp     .cell
.pass_done:
        cmp     word [route_changed], 0
        je      .done
        dec     word [route_pass]
        jg      .pass
.done:
        pop     di
        jmp     shared_epi_ax_bx_cx_dx_si_di

; -- choose_flee_step: pick the reachable anchor whose whole footprint is
;    closest to any map edge. Ties keep the earlier scan candidate.
choose_flee_step:
        push    ax
        push    bx
        push    cx
        push    dx
        push    si
        push    di
        mov     di, [cur_ptr]
        mov     ax, [di+C_COL]
        mov     [move_new_col], ax
        mov     ax, [di+C_ROW]
        mov     [move_new_row], ax
        call    edge_dist_candidate
        mov     [route_best_dist], ax
        mov     word [route_best_rank], 0
        mov     word [route_best_idx], -1
        mov     word [route_i], 0
.lp:
        mov     bx, [route_i]
        cmp     bx, COMBAT_GRID_W*COMBAT_GRID_H
        jae     .finish
        movzx   ax, byte [move_dist+bx]
        cmp     ax, ROUTE_INF
        jae     .next
        call    route_decode_i
        mov     ax, [route_col]
        mov     [move_new_col], ax
        mov     ax, [route_row]
        mov     [move_new_row], ax
        call    edge_dist_candidate
        cmp     ax, [route_best_dist]
        jl      .take
        jg      .next
        movzx   cx, byte [move_rank+bx]
        cmp     cx, [route_best_rank]
        jae     .next
.take:
        mov     [route_best_dist], ax
        movzx   cx, byte [move_rank+bx]
        mov     [route_best_rank], cx
        mov     ax, [route_i]
        mov     [route_best_idx], ax
        mov     ax, [route_col]
        mov     [route_best_col], ax
        mov     ax, [route_row]
        mov     [route_best_row], ax
.next:
        inc     word [route_i]
        jmp     .lp
.finish:
        mov     di, [cur_ptr]
        cmp     word [route_best_idx], -1
        je      .no
        clc
        jmp     .done
.no:
        stc
.done:
        pop     di
        jmp     shared_epi_ax_bx_cx_dx_si_di

; current_edge_dist: AX = distance from [cur_ptr]'s footprint to nearest edge.
current_edge_dist:
        push    si
        mov     si, [cur_ptr]
        mov     ax, [si+C_COL]
        mov     [move_new_col], ax
        mov     ax, [si+C_ROW]
        mov     [move_new_row], ax
        call    edge_dist_candidate
        pop     si
        ret

; edge_dist_candidate: AX = min(left, top, right, bottom) for [move_new_*].
edge_dist_candidate:
        push    bx
        push    cx
        push    dx
        push    si
        mov     si, [cur_ptr]
        mov     ax, [si+C_SIZE]
        cmp     ax, 1
        jg      .size_gt1
        mov     ax, 1
        jmp     .size_ok
.size_gt1:
        cmp     ax, 2
        jle     .size_ok
        mov     ax, 2
.size_ok:
        mov     [move_size], ax
        mov     bx, [move_new_col]
        mov     ax, [move_new_row]
        cmp     ax, bx
        jge     .top_ok
        mov     bx, ax
.top_ok:
        mov     ax, [move_new_col]
        add     ax, [move_size]
        dec     ax
        mov     cx, COMBAT_GRID_W-1
        sub     cx, ax
        cmp     cx, bx
        jge     .right_ok
        mov     bx, cx
.right_ok:
        mov     ax, [move_new_row]
        add     ax, [move_size]
        dec     ax
        mov     cx, COMBAT_GRID_H-1
        sub     cx, ax
        cmp     cx, bx
        jge     .bottom_ok
        mov     bx, cx
.bottom_ok:
        mov     ax, bx
        pop     si
        jmp     shared_epi_bx_cx_dx_si

; route_decode_i: [route_i] -> [route_col],[route_row].
route_decode_i:
        push    ax
        push    bx
        push    cx
        push    dx
        mov     ax, [route_i]
        xor     dx, dx
        mov     cx, COMBAT_GRID_W
        div     cx
        mov     [route_row], ax
        mov     [route_col], dx
        pop     dx
        jmp     shared_epi_ax_bx_cx_dx

; terrain_cost_at: [move_new_col,row] -> AX=movement-cost multiplier (minimum 1).
terrain_cost_at:
        push    bx
        push    cx
        push    dx
        push    si
        mov     ax, 1
        mov     cx, [terrain_cost_count]
        xor     si, si
.lp:
        cmp     si, cx
        jae     .done
        mov     bx, si
        shl     bx, 1
        mov     dx, bx
        shl     bx, 1
        add     bx, dx                      ; bx = i * 6 bytes (col,row,cost)
        mov     dx, [terrain_costs+bx]
        cmp     dx, [move_new_col]
        jne     .next
        mov     dx, [terrain_costs+bx+2]
        cmp     dx, [move_new_row]
        jne     .next
        mov     ax, [terrain_costs+bx+4]
        cmp     ax, 1
        jge     .done
        mov     ax, 1
        jmp     .done
.next:
        inc     si
        jmp     .lp
.done:
        pop     si
        jmp     shared_epi_bx_cx_dx_si

; -- choose_routed_close: select the reachable anchor that minimizes footprint
;    distance to [tgt_ptr]. Ties keep the earlier row-major candidate, matching
;    the "strictly closer only" shape of the TS stepToward reducer.
choose_routed_close:
        push    ax
        push    bx
        push    cx
        push    dx
        push    si
        push    di
        mov     di, [cur_ptr]
        mov     si, [tgt_ptr]
        call    figure_distance
        mov     [route_best_dist], ax
        mov     word [route_best_idx], -1
        mov     word [route_i], 0
.lp:
        mov     bx, [route_i]
        cmp     bx, COMBAT_GRID_W*COMBAT_GRID_H
        jae     .finish
        movzx   ax, byte [move_dist+bx]
        cmp     ax, ROUTE_INF
        jae     .next
        call    route_decode_i
        mov     di, [cur_ptr]
        mov     ax, [route_col]
        mov     [di+C_COL], ax
        mov     ax, [route_row]
        mov     [di+C_ROW], ax
        mov     si, [tgt_ptr]
        call    figure_distance
        cmp     ax, [route_best_dist]
        jge     .next
        mov     [route_best_dist], ax
        mov     ax, [route_i]
        mov     [route_best_idx], ax
        mov     ax, [route_col]
        mov     [route_best_col], ax
        mov     ax, [route_row]
        mov     [route_best_row], ax
.next:
        inc     word [route_i]
        jmp     .lp
.finish:
        mov     di, [cur_ptr]
        cmp     word [route_best_idx], -1
        je      .no
        mov     ax, [route_orig_col]
        mov     [di+C_COL], ax
        mov     ax, [route_orig_row]
        mov     [di+C_ROW], ax
        clc
        jmp     .done
.no:
        mov     ax, [route_orig_col]
        mov     [di+C_COL], ax
        mov     ax, [route_orig_row]
        mov     [di+C_ROW], ax
        stc
.done:
        pop     di
        jmp     shared_epi_ax_bx_cx_dx_si_di

; -- execute_route: replay the chosen Dijkstra route one square at a time.
; route_prev carries predecessor cells from build_move_dist; move_rank becomes a
; short reverse stack after selection.  flee_dest_flag selects flee tracing.
; CF=1 when a reaction, hazard, or Guard kills the mover before the route ends.
execute_route:
        push    ax
        push    bx
        push    si
        mov     word [route_pass], 0
        mov     bx, [route_best_idx]
.reverse:
        mov     si, [route_pass]
        mov     al, bl
        mov     [move_rank+si], al
        inc     word [route_pass]
        movzx   ax, byte [move_dist+bx]
        or      ax, ax
        jz      .replayed
        movzx   bx, byte [route_prev+bx]
        jmp     .reverse
.replayed:
        dec     word [route_pass]            ; stack slot holding the origin
.step:
        cmp     word [route_pass], 0
        je      .done
        dec     word [route_pass]
        mov     si, [route_pass]
        movzx   ax, byte [move_rank+si]
        mov     [route_i], ax
        call    route_decode_i
        mov     ax, [route_col]
        mov     [move_new_col], ax
        mov     ax, [route_row]
        mov     [move_new_row], ax
        call    trigger_leaving_reactions
        mov     si, [cur_ptr]
        call    is_active_si
        jnc     .dead
        mov     ax, [move_new_col]
        mov     [si+C_COL], ax
        mov     ax, [move_new_row]
        mov     [si+C_ROW], ax
        cmp     word [flee_dest_flag], 0
        je      .move_trace
        mov     ax, [move_new_col]
        mov     [flee_dest_col], ax
        mov     ax, [move_new_row]
        mov     [flee_dest_row], ax
        call    trace_flee
        jmp     .after_trace
.move_trace:
        call    trace_move
.after_trace:
        call    apply_hazard_cur
        mov     si, [cur_ptr]
        call    is_active_si
        jnc     .dead
        test    word [si+C_FLAGS], CF_DISABLED
        jnz     .dead
        call    trigger_guard_reactions
        mov     si, [cur_ptr]
        call    is_active_si
        jc      .step
.dead:
        stc
        jmp     .ret
.done:
        clc
.ret:
        pop     si
        jmp     shared_epi_ax_bx_si

; -- can_place_cur_at: proposed anchor [move_new_col,row] for [cur_ptr].
;    Checks 10x10 grid bounds and non-overlap with every other living footprint.
;    CF=0 if legal, CF=1 if blocked.
can_place_cur_at:
        push    bx
        push    cx
        push    dx
        push    si
        push    di
        mov     di, [cur_ptr]
        mov     ax, [di+C_SIZE]
        cmp     ax, 1
        jg      .size_gt1
        mov     ax, 1
        jmp     .size_ok
.size_gt1:
        cmp     ax, 2
        jle     .size_ok
        mov     ax, 2
.size_ok:
        mov     [move_size], ax
        mov     ax, [move_new_col]
        cmp     ax, 0
        jl      .fail
        add     ax, [move_size]
        dec     ax
        mov     [move_xmax], ax
        cmp     ax, COMBAT_GRID_W-1
        jg      .fail
        mov     ax, [move_new_row]
        cmp     ax, 0
        jl      .fail
        add     ax, [move_size]
        dec     ax
        mov     [move_ymax], ax
        cmp     ax, COMBAT_GRID_H-1
        jg      .fail

        mov     word [terrain_i], 0
.terrain_lp:
        mov     bx, [terrain_i]
        cmp     bx, [terrain_block_count]
        jae     .terrain_ok
        shl     bx, 2
        mov     ax, [terrain_blocks+bx]
        cmp     ax, [move_new_col]
        jl      .terrain_next
        cmp     ax, [move_xmax]
        jg      .terrain_next
        mov     ax, [terrain_blocks+bx+2]
        cmp     ax, [move_new_row]
        jl      .terrain_next
        cmp     ax, [move_ymax]
        jg      .terrain_next
        jmp     .fail
.terrain_next:
        inc     word [terrain_i]
        jmp     .terrain_lp
.terrain_ok:

        xor     bx, bx
.lp:
        cmp     bx, [ncomb]
        jae     .ok
        cmp     bx, [cur_idx]
        je      .next
        mov     si, bx
        imul    si, si, C_REC
        add     si, comb
        call    is_active_si
        jnc     .next
        mov     ax, [si+C_SIZE]
        cmp     ax, 1
        jg      .osize_gt1
        mov     ax, 1
        jmp     .osize_ok
.osize_gt1:
        cmp     ax, 2
        jle     .osize_ok
        mov     ax, 2
.osize_ok:
        mov     [other_size], ax
        mov     ax, [si+C_COL]
        mov     [other_col], ax
        add     ax, [other_size]
        dec     ax
        mov     [other_xmax], ax
        mov     ax, [si+C_ROW]
        mov     [other_row], ax
        add     ax, [other_size]
        dec     ax
        mov     [other_ymax], ax

        mov     ax, [move_new_col]
        cmp     ax, [other_xmax]
        jg      .next
        mov     ax, [other_col]
        cmp     ax, [move_xmax]
        jg      .next
        mov     ax, [move_new_row]
        cmp     ax, [other_ymax]
        jg      .next
        mov     ax, [other_row]
        cmp     ax, [move_ymax]
        jg      .next
        jmp     .fail
.next:
        inc     bx
        jmp     .lp
.ok:
        clc
        jmp     .done
.fail:
        stc
.done:
        pop     di
        jmp     shared_epi_bx_cx_dx_si_di

; ============================================================================
;  resolve_hit -- one attack by [cur_ptr] vs [tgt_ptr].  Exact port of
;  tactical.ts resolveHit (Tier-1 baseline: missile range bands only; no
;  rear/backstab; includes helpless auto-hit and Gen1 melee coup):
;     roll   = rng.die(20)
;     needed = thac0 - target.ac [-/+ missile range bracket]
;     hit    = helpless ? true : (roll==20)?true : (roll==1)?false : (roll>=needed)
;     on hit: dmg = max(1, rng.roll(count,sides,bonus)) ; applyHpLoss
;  Emits the 'attack' trace line and (if hp<=0) a 'slain' line.
;  applyHpLoss: hpBefore=hp; hp-=dmg; if hp>0 -> not dead; else
;     Gen1 lethal = dmg > hpBefore + 10; Gen2 lethal = false.
;  CRITICAL: die(20) is drawn BEFORE the damage roll (draw order gates trace).
; ============================================================================
resolve_hit:
        push    bx
        push    si
        push    di
        mov     bx, [cur_ptr]                ; attacker
        mov     si, [tgt_ptr]                ; target
        ; roll = die(20)
        mov     ax, 20
        call    rng_die
        mov     [r_roll], ax
        ; needed = thac0 - target.ac
        mov     ax, [bx+C_THAC0]
        sub     ax, [si+C_AC]
        mov     [r_needed], ax
        cmp     byte [attack_missile], 0
        je      .needed_ready
        call    apply_missile_range_mod
.needed_ready:
        ; Rear AC substitution.  needed = thac0 - ac here, so a target AC that
        ; is BACK_ATTACK_AC points worse is a needed that is that much lower.
        cmp     byte [back_attack], 0
        je      .no_back
        sub     word [r_needed], BACK_ATTACK_AC
.no_back:
        ; hit?
        test    word [si+C_FLAGS], CF_DISABLED
        jnz     .hit
        mov     ax, [r_roll]
        cmp     ax, 20
        je      .hit
        cmp     ax, 1
        je      .miss
        mov     ax, [r_roll]
        cmp     ax, [r_needed]
        jge     .hit
.miss:
        mov     word [r_hit], 0
        mov     word [r_dmg], 0
        ; targetHpAfter = current hp (unchanged); dead = '-'
        mov     ax, [si+C_HP]
        mov     [r_hpafter], ax
        mov     word [r_dead], -1            ; -1 sentinel => '-' for non-slain attack
        call    trace_attack
        jmp     .done
.hit:
        mov     word [r_hit], 1
        cmp     byte [attack_missile], 0
        jne     .normal_hit
        cmp     byte [combat_ruleset], RULE_GEN2
        je      .normal_hit
        test    word [si+C_FLAGS], CF_DISABLED
        jz      .normal_hit
        ; Gen1 melee coup-de-grace: no damage dice; helpless target dies.
        mov     ax, [si+C_HP]
        mov     [hp_before], ax
        cmp     ax, 1
        jge     .coup_dmgok
        mov     ax, 1
.coup_dmgok:
        mov     [r_dmg], ax
        xor     ax, ax
        mov     [si+C_HP], ax
        mov     [r_hpafter], ax
        and     word [si+C_FLAGS], 0FF7Fh
        or      word [si+C_FLAGS], CF_DEAD
        mov     word [r_dead], 1
        jmp     .award
.normal_hit:
        ; dmg = max(1, rng.roll(count,sides,bonus))  (die(20) already drawn)
        cmp     byte [attack_secondary], 0
        je      .primary_damage
        mov     bx, [cur_idx]
        shl     bx, 1
        mov     ax, [sec_dcount+bx]
        mov     cx, [sec_dsides+bx]
        mov     dx, [sec_dbonus+bx]
        mov     bx, ax                       ; BX = count   (rng_roll arg)
        jmp     .roll_damage
.primary_damage:
        mov     bx, [cur_ptr]
        mov     ax, [bx+C_DCOUNT]
        mov     bx, ax                       ; BX = count   (rng_roll arg)
        mov     di, [cur_ptr]
        mov     cx, [di+C_DSIDES]            ; CX = sides
        mov     dx, [di+C_DBONUS]            ; DX = bonus (signed)
.roll_damage:
        call    rng_roll                     ; AX = bonus + sum(die)
        cmp     byte [secret_profile], 0
        je      .damage_clamp
        mov     bx, [cur_ptr]
        cmp     byte [bx+C_SIDE], 1
        je      .secret_damage
        cmp     byte [secret_party_loaded], 1
        jne     .damage_clamp
.secret_damage:
        movzx   ax, al                       ; Secret normal prefix wraps as a byte
        jmp     .dmgok
.damage_clamp:
        ; max(1, dmg)
        cmp     ax, 1
        jge     .dmgok
        mov     ax, 1
.dmgok:
        mov     [r_dmg], ax
        mov     si, [tgt_ptr]
        test    word [si+C_FLAGS], CF_ASLEEP
        jz      .apply_damage
        and     word [si+C_FLAGS], 0FF7Fh
.apply_damage:
        ; applyHpLoss(target, dmg)
        mov     ax, [si+C_HP]
        mov     [hp_before], ax              ; hpBefore
        sub     ax, [r_dmg]
        mov     [si+C_HP], ax                ; hp -= dmg
        ; targetHpAfter reported as max(0, hp) (oracle Math.max(0,target.hp))
        mov     ax, [si+C_HP]
        test    ax, ax
        jg      .hpafterpos
        xor     ax, ax
.hpafterpos:
        mov     [r_hpafter], ax
        ; if hp>0 -> not dead, no slain line
        mov     ax, [si+C_HP]
        test    ax, ax
        jg      .survived
        cmp     byte [combat_ruleset], RULE_GEN2
        je      .unconscious
        ; lethal = dmg > hpBefore + 10  (Gen1)
        mov     ax, [hp_before]
        add     ax, 10
        mov     cx, [r_dmg]
        cmp     cx, ax
        jg      .lethal
        ; unconscious
.unconscious:
        or      word [si+C_FLAGS], CF_UNCON
        mov     word [r_dead], 0
        jmp     .award
.lethal:
        or      word [si+C_FLAGS], CF_DEAD
        mov     word [r_dead], 1
.award:
        ; if target.side==enemy: xpAwarded += target.xp
        mov     si, [tgt_ptr]
        cmp     byte [si+C_SIDE], 1
        jne     .noxp
        mov     ax, [xp_awarded]
        add     ax, [si+C_XP]
        mov     [xp_awarded], ax
.noxp:
        ; emit attack line then slain line
        call    trace_attack
        call    trace_slain
        call    check_morale_sweep
        jmp     .done
.survived:
        mov     word [r_dead], -1            ; '-' (no slain for a surviving target)
        call    trace_attack
        call    check_morale_sweep
.done:
        pop     di
        jmp     shared_epi_bx_si_di

; ============================================================================
;  Trace emission.  Line format (space-separated, CR/LF):
;     round type actor target roll needed hit damage hpAfter dead [moveCol moveRow]
;  '-' for any field not applicable to the event type.  actor/target are the
;  oracle ids: side letter ('p'/'e') + ordinal (e.g. p0, e1).
; ============================================================================

; trace_init: actor = combatant at SI (ptr); the rest '-'.
;   "<round> init <actor> - - - - - - -"
trace_init:
        mov     di, linebuf
        ; oracle emits init lines tagged round=1 (beginRound has run for round 1)
        mov     ax, 1
        call    put_sdec
        call    wsp
        mov     dx, t_init
        call    cat_word
        call    wsp
        call    put_id_si                    ; actor id from SI
        call    wsp_dash                          ; target
        call    wsp_dash                          ; roll
        call    wsp_dash                          ; needed
        call    wsp_dash                          ; hit
        call    wsp_dash                          ; damage
        call    wsp_dash                          ; hpAfter
        call    wsp_dash                          ; dead
        call    eol_flush
        ret

; trace_guard: uses SI as actor.
;   "<round> guard <actor> - - - - - - -"
trace_guard:
        mov     di, linebuf
        mov     ax, [round]
        call    put_sdec
        call    wsp
        mov     dx, t_guard
        call    cat_word
        call    wsp
        call    put_id_si
        call    wsp_dash                          ; target
        call    wsp_dash                          ; roll
        call    wsp_dash                          ; needed
        call    wsp_dash                          ; hit
        call    wsp_dash                          ; damage
        call    wsp_dash                          ; hpAfter
        call    wsp_dash                          ; dead
        call    eol_flush
        ret

; trace_reject: an unsupported headless player command.  This is deliberately
; observational: it consumes no RNG and changes no turn ledger or combat record.
;   "<round> reject <actor> <command> - - - - - -"
trace_reject:
        mov     di, linebuf
        mov     ax, [round]
        call    put_sdec
        call    wsp
        mov     dx, t_reject
        call    cat_word
        call    wsp
        mov     si, [cur_ptr]
        call    put_id_si
        call    wsp
        mov     al, [rejected_command]
        stosb
        call    wsp_dash
        call    wsp_dash
        call    wsp_dash
        call    wsp_dash
        call    wsp_dash
        call    wsp_dash
        call    eol_flush
        ret

; trace_move: uses [cur_ptr] actor; appends destination col,row after the
; stable combat columns for movement-specific assertions.
;   "<round> move <actor> - - - - - - - <col> <row>"
trace_move:
        mov     di, linebuf
        mov     ax, [round]
        call    put_sdec
        call    wsp
        mov     dx, t_move
        call    cat_word
        call    wsp
        mov     si, [cur_ptr]
        call    put_id_si
        call    wsp_dash                          ; target
        call    wsp_dash                          ; roll
        call    wsp_dash                          ; needed
        call    wsp_dash                          ; hit
        call    wsp_dash                          ; damage
        call    wsp_dash                          ; hpAfter
        call    wsp_dash                          ; dead
        call    wsp
        mov     si, [cur_ptr]
        mov     ax, [si+C_COL]
        call    put_sdec                       ; destination col
        call    wsp
        mov     ax, [si+C_ROW]
        call    put_sdec                       ; destination row
        call    eol_flush
        ret

; trace_status: morale fear break.  Uses SI for actor/target.
;   "<round> status <actor> <actor> - - - - <hpAfter> -"
trace_status:
        mov     di, linebuf
        mov     ax, [round]
        call    put_sdec
        call    wsp
        mov     dx, t_status
        call    cat_word
        call    wsp
        call    put_id_si
        call    wsp
        call    put_id_si
        call    wsp_dash                          ; roll
        call    wsp_dash                          ; needed
        call    wsp_dash                          ; hit
        call    wsp_dash                          ; damage
        call    wsp
        mov     ax, [si+C_HP]
        cmp     ax, 0
        jg      .hp_ok
        xor     ax, ax
.hp_ok:
        call    put_sdec
        call    wsp_dash                          ; dead
        call    eol_flush
        ret

; trace_flee: morale surrender/rout. Uses SI for actor.
;   "<round> flee <actor> - - - - - - -"
trace_flee:
        mov     di, linebuf
        mov     ax, [round]
        call    put_sdec
        call    wsp
        mov     dx, t_flee
        call    cat_word
        call    wsp
        call    put_id_si
        call    wsp_dash                          ; target
        call    wsp_dash                          ; roll
        call    wsp_dash                          ; needed
        call    wsp_dash                          ; hit
        call    wsp_dash                          ; damage
        call    wsp_dash                          ; hpAfter
        call    wsp_dash                          ; dead
        cmp     word [flee_dest_flag], 0
        je      .plain
        call    wsp
        mov     ax, [flee_dest_col]
        call    put_sdec                       ; destination col
        call    wsp
        mov     ax, [flee_dest_row]
        call    put_sdec                       ; destination row
.plain:
        call    eol_flush
        ret

; trace_party_flee: "<round> party-flee - escaped|blocked - - - - - -"
trace_party_flee:
        mov     di, linebuf
        mov     ax, [round]
        call    put_sdec
        call    wsp
        mov     dx, t_party_flee
        call    cat_word
        call    wsp_dash                          ; actor
        call    wsp
        mov     dx, t_blocked
        cmp     word [party_flee_escaped], 0
        je      .target_ready
        mov     dx, t_escaped
.target_ready:
        call    cat_word
        call    wsp_dash                          ; roll
        call    wsp_dash                          ; needed
        call    wsp_dash                          ; hit
        call    wsp_dash                          ; damage
        call    wsp_dash                          ; hpAfter
        call    wsp_dash                          ; dead
        call    eol_flush
        ret

; trace_status_expired: timed status expiration. Uses SI as target.
;   "<round> status - <target> - - - <status> <hpAfter> -"
trace_status_expired:
        mov     di, linebuf
        mov     ax, [round]
        call    put_sdec
        call    wsp
        mov     dx, t_status
        call    cat_word
        call    wsp_dash                          ; actor
        call    wsp
        call    put_id_si                    ; target
        call    wsp_dash                          ; roll
        call    wsp_dash                          ; needed
        call    wsp_dash                          ; hit
        call    wsp
        cmp     word [status_kind_cur], HAZ_STATUS_FEARED
        jne     .try_held
        mov     dx, t_feared
        call    cat_word
        jmp     .after_status
.try_held:
        cmp     word [status_kind_cur], HAZ_STATUS_HELD
        jne     .try_asleep
        mov     dx, t_held
        call    cat_word
        jmp     .after_status
.try_asleep:
        cmp     word [status_kind_cur], HAZ_STATUS_ASLEEP
        jne     .status_dash
        mov     dx, t_asleep
        call    cat_word
        jmp     .after_status
.status_dash:
        call    dash
.after_status:
        call    wsp
        mov     ax, [si+C_HP]
        cmp     ax, 0
        jg      .hp_ok
        xor     ax, ax
.hp_ok:
        call    put_sdec
        call    wsp_dash                          ; dead
        call    eol_flush
        ret

; trace_hazard: uses SI as target.
;   "<round> hazard - <target> - - - <damage> <hpAfter> -"
trace_hazard:
        mov     di, linebuf
        mov     ax, [round]
        call    put_sdec
        call    wsp
        mov     dx, t_hazard
        call    cat_word
        call    wsp_dash                          ; actor
        call    wsp
        call    put_id_si                    ; target
        call    wsp_dash                          ; roll
        call    wsp_dash                          ; needed
        call    wsp_dash                          ; hit
        call    wsp
        mov     ax, [r_dmg]
        call    put_sdec                       ; damage
        call    wsp
        mov     ax, [r_hpafter]
        call    put_sdec                       ; hpAfter
        call    wsp_dash                          ; dead
        call    eol_flush
        ret

; trace_hazard_status: uses SI as target.
;   "<round> hazard - <target> <saveRoll> <saveNeed> <saved> <status> <hpAfter> -"
trace_hazard_status:
        mov     di, linebuf
        mov     ax, [round]
        call    put_sdec
        call    wsp
        mov     dx, t_hazard
        call    cat_word
        call    wsp_dash                          ; actor
        call    wsp
        call    put_id_si                    ; target
        call    wsp
        mov     ax, [hazard_save_roll]
        cmp     ax, 0
        jl      .roll_dash
        call    put_sdec
        jmp     .after_roll
.roll_dash:
        call    dash
.after_roll:
        call    wsp
        mov     ax, [hazard_save_target]
        cmp     ax, 0
        jle     .need_dash
        call    put_sdec
        jmp     .after_need
.need_dash:
        call    dash
.after_need:
        call    wsp
        mov     ax, [hazard_saved]
        call    put_sdec                       ; saved 0/1
        call    wsp
        cmp     word [hazard_status], HAZ_STATUS_FEARED
        jne     .try_held
        mov     dx, t_feared
        call    cat_word
        jmp     .after_status
.try_held:
        cmp     word [hazard_status], HAZ_STATUS_HELD
        jne     .try_asleep
        mov     dx, t_held
        call    cat_word
        jmp     .after_status
.try_asleep:
        cmp     word [hazard_status], HAZ_STATUS_ASLEEP
        jne     .status_dash
        mov     dx, t_asleep
        call    cat_word
        jmp     .after_status
.status_dash:
        call    dash
.after_status:
        call    wsp
        mov     ax, [si+C_HP]
        cmp     ax, 0
        jg      .hp_ok
        xor     ax, ax
.hp_ok:
        call    put_sdec                       ; hpAfter
        call    wsp_dash                          ; dead
        call    eol_flush
        ret

; trace_slain_hazard: hazard/downed target, no actor.
;   "<round> slain - <target> - - - - 0 <dead>"
trace_slain_hazard:
        mov     di, linebuf
        mov     ax, [round]
        call    put_sdec
        call    wsp
        mov     dx, t_slain
        call    cat_word
        call    wsp_dash                          ; actor
        call    wsp
        call    put_id_si                    ; target
        call    wsp_dash                          ; roll
        call    wsp_dash                          ; needed
        call    wsp_dash                          ; hit
        call    wsp_dash                          ; damage
        call    wsp
        xor     ax, ax
        call    put_sdec                       ; hpAfter
        call    wsp
        mov     ax, [r_dead]
        call    put_sdec                       ; dead 0/1
        call    eol_flush
        ret

; trace_attack: uses [cur_ptr] actor, [tgt_ptr] target, r_* fields.
trace_attack:
        mov     di, linebuf
        mov     ax, [round]
        call    put_sdec
        call    wsp
        mov     dx, [trace_event_type]
        call    cat_word
        call    wsp
        mov     si, [cur_ptr]
        call    put_id_si
        call    wsp
        mov     si, [tgt_ptr]
        call    put_id_si
        call    wsp
        mov     ax, [r_roll]
        call    put_sdec
        call    wsp
        mov     ax, [r_needed]
        call    put_sdec
        call    wsp
        mov     ax, [r_hit]
        call    put_sdec
        call    wsp
        ; damage: '-' on a miss (oracle omits damage when !hit), else value
        cmp     word [r_hit], 0
        je      .dmgdash
        mov     ax, [r_dmg]
        call    put_sdec
        jmp     .afterdmg
.dmgdash:
        call    dash
.afterdmg:
        call    wsp
        mov     ax, [r_hpafter]
        call    put_sdec
        call    wsp
        ; dead field: the oracle 'attack' event never carries `dead` -> always '-'
        ; (the dead flag lives only on the following 'slain' event).
        call    dash
        call    eol_flush
        ret

; trace_slain: "<round> slain <actor> <target> - - - - <hpAfter=0> <dead>"
;   Matches the oracle slain event { actor, target, dead }.  hpAfter shown as
;   the post-blow hp (0) for column stability.
trace_slain:
        mov     di, linebuf
        mov     ax, [round]
        call    put_sdec
        call    wsp
        mov     dx, t_slain
        call    cat_word
        call    wsp
        mov     si, [cur_ptr]
        call    put_id_si
        call    wsp
        mov     si, [tgt_ptr]
        call    put_id_si
        call    wsp_dash                          ; roll
        call    wsp_dash                          ; needed
        call    wsp_dash                          ; hit
        call    wsp_dash                          ; damage
        call    wsp
        mov     ax, [r_hpafter]
        call    put_sdec                       ; hpAfter (0)
        call    wsp
        mov     ax, [r_dead]
        call    put_sdec                       ; dead 0/1
        call    eol_flush
        ret

; trace_end: "<round> end - <outcome> - - - - - -"  outcome in the target slot.
trace_end:
        mov     di, linebuf
        mov     ax, [round]
        call    put_sdec
        call    wsp
        mov     dx, t_end
        call    cat_word
        call    wsp_dash                          ; actor
        call    wsp
        ; outcome: party / enemy / flee / draw  (recompute from current side
        ; counts).  Keep the text token coherent with GBCR's outcome 3.
        call    count_sides
        mov     byte [outcome_code], 0       ; draw / non-victory default
        mov     dx, t_draw
        cmp     word [party_fled_flag], 0
        je      .notfled
        mov     byte [outcome_code], 3
        mov     dx, t_flee
        jmp     .haveout
.notfled:
        cmp     word [n_enemy], 0
        jne     .notparty
        cmp     word [n_party], 0
        jle     .haveout
        mov     byte [outcome_code], 1
        mov     dx, t_party
        jmp     .haveout
.notparty:
        cmp     word [n_party], 0
        jne     .haveout
        cmp     word [n_enemy], 0
        jle     .haveout
        mov     byte [outcome_code], 2
        mov     dx, t_enemy
.haveout:
        call    cat_word                      ; outcome string in target slot
        call    wsp_dash                          ; roll
        call    wsp_dash                          ; needed
        call    wsp_dash                          ; hit
        call    wsp_dash                          ; damage
        call    wsp_dash                          ; hpAfter
        call    wsp_dash                          ; dead
        call    eol_flush
        ret

write_outcome:
        cmp     byte [outcomename], 0
        je      .ok
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, outcomename
        int     21h
        jc      .err
        mov     [outfh], ax
        mov     dx, o_draw
        mov     cx, o_draw_len
        cmp     byte [outcome_code], 1
        jne     .notparty
        mov     dx, o_party
        mov     cx, o_party_len
        jmp     .write
.notparty:
        cmp     byte [outcome_code], 2
        jne     .notflee
        mov     dx, o_enemy
        mov     cx, o_enemy_len
        jmp     .write
.notflee:
        cmp     byte [outcome_code], 3
        jne     .write
        mov     dx, o_flee
        mov     cx, o_flee_len
.write:
        mov     bx, [outfh]
        mov     ah, 40h
        int     21h
        jc      .write_err
        cmp     ax, cx
        jne     .write_err
        mov     bx, [outfh]
        mov     ah, 3Eh
        int     21h
        jc      .err
.ok:
        clc
        ret
.write_err:
        ; The required text sidecar is the ECL continuation contract.  Close a
        ; partially written file, but never let a later GBCR imply success.
        mov     bx, [outfh]
        mov     ah, 3Eh
        int     21h
.err:
        stc
        ret

write_result:
        cmp     byte [resultname], 0
        je      .ok
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, resultname
        int     21h
        jc      .err
        mov     [resultfh], ax

        cmp     byte [cok_rng_mode], 0
        je      .version_ready
        mov     word [gbcr_version], 2
        mov     eax, [rng_state]
        mov     [gbcr_reserved], eax
.version_ready:
        cmp     byte [secret_party_loaded], 1
        jne     .ordinary_version
        mov     word [gbcr_version], 3
        mov     ax, [se_preimage_length]
        mov     [gbcr_reserved], ax
        mov     word [gbcr_reserved+2], 0
.ordinary_version:

        call    result_count_party
        mov     [gbcr_count], ax
        call    result_outcome_code
        mov     [gbcr_outcome], ax
        mov     ax, [xp_awarded]
        mov     [gbcr_xp], ax
        cmp     byte [secret_party_loaded], 1
        jne     .xp_ready
        mov     word [gbcr_xp], 0
.xp_ready:

        mov     bx, [resultfh]
        mov     ah, 40h
        mov     cx, GBCR_HDR_LEN
        mov     dx, gbcr_hdr
        int     21h
        jc      .close_err
        cmp     ax, GBCR_HDR_LEN
        jne     .close_err

        xor     bx, bx
.rec_loop:
        cmp     bx, [ncomb]
        jae     .close
        mov     si, bx
        imul    si, si, C_REC
        add     si, comb
        cmp     byte [si+C_SIDE], 0
        jne     .next
        call    fill_result_rec
        push    bx
        mov     bx, [resultfh]
        mov     ah, 40h
        mov     cx, GBCR_REC_LEN
        mov     dx, gbcr_rec
        int     21h
        pop     bx
        jc      .close_err
        cmp     ax, GBCR_REC_LEN
        jne     .close_err
.next:
        inc     bx
        jmp     .rec_loop
.close:
        cmp     byte [secret_party_loaded], 1
        jne     .close_handle
        mov     bx, [resultfh]
        mov     cx, [se_preimage_length]
        xor     dx, dx
        push    ds
        mov     ds, [se_preimage_seg]
        mov     ah, 40h
        int     21h
        pop     ds
        jc      .close_err
        cmp     ax, [se_preimage_length]
        jne     .close_err
.close_handle:
        mov     bx, [resultfh]
        mov     ah, 3Eh
        int     21h
        ret
.close_err:
        mov     bx, [resultfh]
        mov     ah, 3Eh
        int     21h
.err:   stc
        ret
.ok:    clc
        ret

result_count_party:
        push    bx
        push    si
        xor     ax, ax
        xor     bx, bx
.lp:
        cmp     bx, [ncomb]
        jae     .done
        mov     si, bx
        imul    si, si, C_REC
        add     si, comb
        cmp     byte [si+C_SIDE], 0
        jne     .next
        inc     ax
.next:
        inc     bx
        jmp     .lp
.done:
        pop     si
        pop     bx
        ret

result_outcome_code:
        cmp     byte [outcome_code], 1
        jne     .not_party
        xor     ax, ax                       ; party victory
        ret
.not_party:
        cmp     byte [outcome_code], 2
        jne     .not_enemy
        mov     ax, 1                        ; party loss
        ret
.not_enemy:
        cmp     word [party_fled_flag], 0
        je      .draw
        mov     ax, 3                        ; party fled
        ret
.draw:
        mov     ax, 2
        ret

fill_result_rec:
        mov     al, [si+C_ORD]
        mov     [gbcr_rec], al
        mov     al, 0
        test    word [si+C_FLAGS], CF_DEAD
        jnz     .dead
        test    word [si+C_FLAGS], CF_UNCON
        jnz     .uncon
        test    word [si+C_FLAGS], CF_FLED
        jnz     .fled
        jmp     .cond_ready
.uncon:
        mov     al, 1
        jmp     .cond_ready
.dead:
        mov     al, 2
        jmp     .cond_ready
.fled:
        mov     al, 3
.cond_ready:
        mov     [gbcr_rec+1], al
        mov     ax, [si+C_HP]
        cmp     byte [secret_party_loaded], 1
        jne     .hp_ready
        test    ax, ax
        jns     .hp_ready
        xor     ax, ax
.hp_ready:
        mov     [gbcr_rec+2], ax
        mov     ax, [si+C_MAXHP]
        mov     [gbcr_rec+4], ax
        ret

; -- tiny line-buffer helpers (DI = write cursor into linebuf) --
wsp:
        mov     al, ' '
        stosb
        ret
dash:
        mov     al, '-'
        stosb
        ret
wsp_dash:
        mov     al, ' '
        stosb
        mov     al, '-'
        stosb
        ret
; cat_word: copy ASCIIZ string at DX into [DI]
cat_word:
        push    si
        mov     si, dx
.lp:
        lodsb
        or      al, al
        jz      .d
        stosb
        jmp     .lp
.d:
        pop     si
        ret
; put_id_si: write the combatant id (side letter + ordinal) for record at SI.
put_id_si:
        push    ax
        mov     al, [si+C_SIDE]
        test    al, al
        jnz     .enemy
        mov     al, 'p'
        jmp     .wr
.enemy:
        mov     al, 'e'
.wr:
        stosb
        movzx   ax, byte [si+C_ORD]
        call    put_sdec
        pop     ax
        ret
; eol_flush: append CR/LF, write linebuf..DI to the trace file.
eol_flush:
        mov     al, 13
        stosb
        mov     al, 10
        stosb
        mov     cx, di
        sub     cx, linebuf
        mov     dx, linebuf
        mov     bx, [trcfh]
        mov     ah, 40h
        int     21h
        ret

; ============================================================================
;  put_sdec -- print signed AX as decimal at [di] (di advanced).  Verbatim from
;  ccfp.asm (the established numeric formatter; one source of truth for digits).
; ============================================================================
put_sdec:
        test    ax, ax
        jns     .pos
        push    ax
        mov     al, '-'
        stosb
        pop     ax
        neg     ax
.pos:
        push    bx
        push    cx
        mov     bx, 10
        xor     cx, cx
.dv:
        xor     dx, dx
        div     bx
        push    dx
        inc     cx
        test    ax, ax
        jnz     .dv
.pp:
        pop     dx
        add     dl, '0'
        mov     al, dl
        stosb
        loop    .pp
        pop     cx
        pop     bx
        ret

; ============================================================================
;  Argument parsing:
;    CCCOMBAT /T <encounter> <seed> [trace]
;    CCCOMBAT /F <encounter|effects.gbef> [moncha.dax|glb] <seed> [trace] [outcome]
;    CCCOMBAT /V <encounter|effects.gbef> [moncha.dax|glb] <seed> [raw]
;    CCCOMBAT /E <effects.gbef> [moncha.dax|glb] <seed> [trace] [outcome] [raw]
; ============================================================================
parse_args:
        mov     byte [tmode], 0
        mov     byte [fmode], 0
        mov     byte [vmode], 0
        mov     byte [vfxmode], 0
        mov     byte [emode], 0
        mov     byte [kmode], 0
        mov     byte [saw_keyboard], 0
        mov     byte [delay_request], 0
        mov     byte [monmode], 0
        mov     byte [monkind], 0
        mov     byte [cmdmode], 0
        mov     byte [vrawflag], 0
        mov     byte [combat_ruleset], RULE_GEN1
        mov     word [seed], 4660            ; default 0x1234
        mov     byte [encid], 0
        mov     byte [efxname], 0
        mov     byte [monname], 0
        mov     byte [vrawname], 0
        mov     byte [outcomename], 0
        mov     byte [resultname], 0
        mov     byte [iconname], 0
        mov     byte [partyname], 0
        mov     byte [wallname], 0
        mov     byte [cmdbuf], 0
        mov     word [wall_len], 0
        mov     byte [icon_valid], 0
        mov     word [party_fled_flag], 0
        mov     word [terrain_block_count], 0
        mov     word [terrain_cost_count], 0
        mov     word [hazard_count], 0
        mov     si, s_trcfile
        mov     di, trcname
        call    copy_asciiz
        call    scan_icon_arg
        mov     si, 81h
        call    skip_sp
        cmp     byte [si], '/'
        jne     .done
        inc     si
        mov     al, [si]
        and     al, 0DFh
        inc     si
        call    skip_sp
        cmp     al, 'T'
        je      .mode_t
        cmp     al, 'F'
        je      .mode_f
        cmp     al, 'V'
        je      .mode_v
        cmp     al, 'E'
        je      .mode_e
        cmp     al, 'K'
        je      .mode_k
        ret
.mode_t:
        mov     byte [tmode], 1
        mov     di, encid
        call    copy_token
        call    skip_sp
        call    read_num
        jc      .done
        mov     [seed], ax
        call    read_optional_trace
        ret
.mode_f:
        mov     byte [fmode], 1
        mov     al, [si]
        cmp     al, '0'
        jb      .mode_f_fx
        cmp     al, '9'
        ja      .mode_f_fx
        mov     di, encid
        call    copy_token
        call    skip_sp
        call    read_num
        jc      .done
        mov     [seed], ax
        call    read_optional_trace
        call    read_optional_outcome
        ret
.mode_f_fx:
        mov     byte [vfxmode], 1
        mov     di, efxname
        call    copy_token
        call    skip_sp
        mov     al, [si]
        or      al, al
        jz      .done
        cmp     al, 13
        je      .done
        cmp     al, '0'
        jb      .read_f_mon
        cmp     al, '9'
        ja      .read_f_mon
        call    read_num
        jc      .done
        mov     [seed], ax
        call    read_optional_trace
        call    read_optional_outcome
        ret
.read_f_mon:
        mov     byte [monmode], 1
        mov     di, monname
        call    copy_token
        call    skip_sp
        call    read_num
        jc      .done
        mov     [seed], ax
        call    read_optional_trace
        call    read_optional_outcome
        ret
.mode_v:
        mov     byte [vmode], 1
        mov     al, [si]
        cmp     al, '0'
        jb      .mode_v_fx
        cmp     al, '9'
        ja      .mode_v_fx
        mov     di, encid
        call    copy_token
        call    skip_sp
        call    read_num
        jc      .done
        mov     [seed], ax
        call    read_optional_raw
        ret
.mode_v_fx:
        mov     byte [vfxmode], 1
        mov     di, efxname
        call    copy_token
        call    skip_sp
        mov     al, [si]
        or      al, al
        jz      .done
        cmp     al, 13
        je      .done
        cmp     al, '0'
        jb      .read_v_mon
        cmp     al, '9'
        ja      .read_v_mon
        call    read_num
        jc      .done
        mov     [seed], ax
        call    read_optional_raw
        ret
.read_v_mon:
        mov     byte [monmode], 1
        mov     di, monname
        call    copy_token
        call    skip_sp
        call    read_num
        jc      .done
        mov     [seed], ax
        call    read_optional_raw
        ret
.mode_k:
        ; /K is /E plus a keyboard and a screen.  Falling through rather than
        ; duplicating .mode_e's positional parser is not just brevity: it
        ; guarantees the two modes can never drift in how they read the GBEF
        ; path, the MON archive, the seed, the trace or the outcome file.
        mov     byte [kmode], 1
.mode_e:
        mov     byte [emode], 1
        mov     di, efxname
        call    copy_token
        call    skip_sp
        mov     al, [si]
        or      al, al
        jz      .done
        cmp     al, 13
        je      .done
        cmp     al, '0'
        jb      .read_mon
        cmp     al, '9'
        ja      .read_mon
        call    read_num
        jc      .done
        mov     [seed], ax
        call    read_optional_trace
        call    read_optional_outcome
        call    read_optional_raw
        ret
.read_mon:
        mov     byte [monmode], 1
        mov     di, monname
        call    copy_token
        call    skip_sp
        call    read_num
        jc      .done
        mov     [seed], ax
        call    read_optional_trace
        call    read_optional_outcome
        call    read_optional_raw
        ret
.done:
        ret

; /U <0..3>: DoK first-round surprise mask (bit0 = party surprised, bit1 = enemy),
; the retail area2+2CBh byte; cleared after the first round's delays are rolled.
scan_surprise_arg:
        mov     si, 81h
.s:     lodsb
        or      al, al
        jz      .r
        cmp     al, 13
        je      .r
        cmp     al, '/'
        jne     .s
        mov     al, [si]
        and     al, 0DFh
        cmp     al, 'U'
        jne     .s
        inc     si
        call    skip_sp
        mov     al, [si]
        sub     al, '0'
        and     al, 3
        mov     [dok_surprise], al
.r:     ret

; DoK per-round initiative (dok-initiative.md; tools/dok_initiative.py).
; order[]/order_n hold the active combatants in array order on entry.
;  1. delay = max(1, d6 + dexadj); surprise side -6; outside 0..20 -> 0
;     (one rng_die(6) per combatant: /J => Borland recurrence, else LCG)
;  2. surprise mask cleared
;  3. in-place insertion sort, highest first, tie = rng_die(2)==1 puts newcomer ahead
;  4. emit '<round> order <actor> <delay>' per entry, drop delay<=0 entries
dok_init_round:
        push    ax
        push    bx
        push    cx
        push    dx
        push    si
        push    di
        mov     ax, [order_n]
        shl     ax, 1
        mov     [dok_n2], ax
        xor     bx, bx
.roll:
        cmp     bx, [dok_n2]
        jae     .rolled
        mov     si, [order+bx]
        mov     ax, 6
        call    rng_die
        mov     cx, ax
        movzx   ax, byte [dok_dex+si]
        cmp     ax, 25
        ja      .nodex
        mov     di, ax
        movsx   ax, byte [dok_dexadj+di]
        add     cx, ax
.nodex:
        cmp     cx, 1
        jge     .flo
        mov     cx, 1
.flo:
        mov     di, si
        imul    di, di, C_REC
        mov     al, [di+comb+C_SIDE]
        inc     al
        test    al, [dok_surprise]
        jz      .nosurp
        sub     cx, 6
.nosurp:
        cmp     cx, 20
        jbe     .st
        xor     cx, cx
.st:
        mov     [di+comb+C_INIT], cx
        add     bx, 2
        jmp     .roll
.rolled:
        mov     byte [dok_surprise], 0
        mov     bx, 2
.ins:
        cmp     bx, [dok_n2]
        jae     .sorted
        mov     dx, [order+bx]
        mov     ax, dx
        call    dok_init_of
        mov     cx, ax
        xor     si, si
.scan:
        cmp     si, bx
        jae     .place
        mov     ax, [order+si]
        call    dok_init_of
        cmp     cx, ax
        jg      .place
        jne     .next
        push    bx
        push    cx
        push    dx
        mov     ax, 2
        call    rng_die
        pop     dx
        pop     cx
        pop     bx
        cmp     ax, 1
        je      .place
.next:
        add     si, 2
        jmp     .scan
.place:
        mov     di, bx
.shift:
        cmp     di, si
        jbe     .put
        mov     ax, [order+di-2]
        mov     [order+di], ax
        sub     di, 2
        jmp     .shift
.put:
        mov     [order+si], dx
        add     bx, 2
        jmp     .ins
.sorted:
        xor     bx, bx
        xor     di, di
.cp:
        cmp     bx, [dok_n2]
        jae     .cpdone
        mov     dx, [order+bx]
        mov     si, dx
        imul    si, si, C_REC
        add     si, comb
        push    bx
        push    di
        mov     di, linebuf
        mov     ax, [round]
        call    put_sdec
        call    wsp
        mov     dx, t_order
        call    cat_word
        call    wsp
        call    put_id_si
        call    wsp
        mov     ax, [si+C_INIT]
        call    put_sdec
        call    wsp_dash
        call    wsp_dash
        call    wsp_dash
        call    wsp_dash
        call    wsp_dash
        call    wsp_dash
        call    eol_flush
        pop     di
        pop     bx
        mov     dx, [order+bx]
        cmp     word [si+C_INIT], 0
        je      .skip
        mov     [order+di], dx
        add     di, 2
.skip:
        add     bx, 2
        jmp     .cp
.cpdone:
        shr     di, 1
        mov     [order_n], di
        pop     di
        pop     si
        pop     dx
        pop     cx
        pop     bx
        pop     ax
        ret

; AX = combatant index -> AX = its stored initiative/delay word
dok_init_of:
        push    di
        mov     di, ax
        imul    di, di, C_REC
        mov     ax, [di+comb+C_INIT]
        pop     di
        ret

scan_icon_arg:
        mov     di, iconname
        mov     al, 'I'
        jmp     scan_option_token

; /P <file.gbpr> is scanned independently so it can follow the positional /E
; arguments and coexist with the numbered /I combat-icon series.
scan_party_arg:
        mov     di, partyname
        mov     al, 'P'
        jmp     scan_option_token

; /C <letters> supplies a tiny party command script for headless/player-driven
; turns. G/W = guard or wait, F = flee step, P = party flee, A/unknown/end =
; existing auto action.
scan_command_arg:
        mov     di, cmdbuf
        mov     al, 'C'
        call    scan_option_token
        jc      .ret
        cmp     byte [cmdbuf], 0
        je      .ret
        mov     byte [cmdmode], 1
        ret
.ret:
        ret

; /R <file.gbr> writes the binary combat-result sidecar used by the boot host
; for later party HP/condition/XP writeback. It is intentionally separate from
; the text outcome file consumed by CCECL /R.
scan_result_arg:
        mov     di, resultname
        mov     al, 'R'
        jmp     scan_option_token

; /W <walls.wgrd> imports solid CCGEO WGRD bridge cells as blocked tactical terrain.
; The option is scanned independently so it can follow the positional /E
; arguments without becoming a trace/outcome/raw filename.
scan_wall_arg:
        mov     di, wallname
        mov     al, 'W'
        jmp     scan_option_token

; AL = uppercase option letter, DI = destination buffer.
; CF=0 when the token was found and copied; CF=1 when absent.
scan_option_token:
        mov     bl, al
        mov     si, 81h
.scan:
        mov     al, [si]
        or      al, al
        jz      .not_found
        cmp     al, 13
        je      .not_found
        cmp     al, '/'
        jne     .next
        mov     al, [si+1]
        and     al, 0DFh
        cmp     al, bl
        jne     .next
        add     si, 2
        call    skip_sp
        call    copy_token
        clc
        ret
.next:
        inc     si
        jmp     .scan
.not_found:
        stc
        ret

; If /W was not supplied, probe a same-stem .WGR beside the /E effect file.
; GBBOOT uses this for compact DQK/HLIB combat terrain without growing the DOS
; command tail.
derive_default_wallname:
        cmp     byte [wallname], 0
        jne     .ret
        cmp     byte [efxname], 0
        je      .ret
        mov     word [wall_dotp], 0
        mov     si, efxname
        mov     di, wallname
.copy:
        mov     al, [si]
        or      al, al
        jz      .done_copy
        cmp     al, 13
        je      .done_copy
        cmp     al, '\'
        je      .slash
        cmp     al, '/'
        je      .slash
        cmp     al, ':'
        je      .slash
        cmp     al, '.'
        jne     .store
        mov     [wall_dotp], di
        jmp     .store
.slash:
        mov     word [wall_dotp], 0
.store:
        mov     [di], al
        inc     si
        inc     di
        jmp     .copy
.done_copy:
        cmp     word [wall_dotp], 0
        je      .at_end
        mov     di, [wall_dotp]
.at_end:
        mov     byte [di], '.'
        mov     byte [di+1], 'W'
        mov     byte [di+2], 'G'
        mov     byte [di+3], 'R'
        mov     byte [di+4], 0
.ret:
        ret

; Load a canonical CoK v1 roster or a known-identity v2 roster. V1 compact
; cannot distinguish DoK from DQK, so it is not a combat-stat authority.
; DQK v2 rows use the producer-verified shared GBD1 combat map; only DoK-only
; raw-record fallbacks and attack progression remain title-gated.
load_gbpr_party:
        cmp     byte [secret_profile], 0
        jne     se_load_secret_party
        mov     ax, 3D00h
        mov     dx, partyname
        int     21h
        jc      .err
        mov     [partyfh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, 16
        mov     dx, partyhdr
        int     21h
        jc      .close_err
        cmp     ax, 16
        jne     .close_err
        cmp     dword [partyhdr], 'GBPR'
        jne     .close_err
        mov     ax, [partyhdr+4]
        cmp     ax, 1
        je      .legacy_cok
        cmp     ax, 2
        jne     .close_err
        cmp     word [partyhdr+14], 1
        jne     .close_err
        mov     ax, [partyhdr+12]
        dec     ax
        cmp     ax, 2
        ja      .close_err
        mov     [party_dok], al
        or      ax, ax
        jnz     .v2_compact
        cmp     word [partyhdr+10], 0
        jne     .close_err
        jmp     short .identity_ok
.v2_compact:
        cmp     word [partyhdr+10], 1
        jne     .close_err
        jmp     short .identity_ok
.legacy_cok:
        cmp     word [partyhdr+10], 0
        jne     .close_err
        cmp     dword [partyhdr+12], 0
        jne     .close_err
        mov     byte [party_dok], 0
.identity_ok:
        cmp     word [partyhdr+8], 410
        jne     .close_err
        mov     cx, [partyhdr+6]
        or      cx, cx
        jz      .close_err
        cmp     cx, 6
        jbe     .rows_ok
        cmp     byte [party_dok], 2          ; only DQK rosters hold 7..8 rows
        jne     .close_err
        cmp     cx, 8
        ja      .close_err
.rows_ok:
        mov     [party_left], cx
        mov     word [ncomb], 0
.record:
        mov     bx, [partyfh]
        mov     ah, 3Fh
        mov     cx, 410
        mov     dx, partybuf
        int     21h
        jc      .close_err
        cmp     ax, 410
        jne     .close_err
        mov     al, [partybuf+1]
        cmp     al, 1
        jb      .close_err
        cmp     al, 15
        ja      .close_err
        mov     ax, [ncomb]
        imul    ax, ax, C_REC
        add     ax, comb
        mov     di, ax
        mov     byte [di+C_SIDE], 0
        mov     ax, [ncomb]
        mov     [di+C_ORD], al
        mov     word [di+C_MOVE], DEFAULT_MOVE_CELLS
        cmp     byte [party_dok], 0
        jne     .move_done
        mov     al, [partybuf+1+408]       ; CoK +0x198, CalcMoves 0x14EB7
        call    clamp_move_al
        mov     [di+C_MOVE], ax
.move_done:
        mov     word [di+C_MRANGE], 0
        mov     word [di+C_AMMO], 0
        cmp     byte [party_dok], 0
        jne     .dok_stats
        ; CoK's morale code (GAME.OVR D8D9/D8E4) divides current +197h
        ; by maximum +62h. Damage/death also reads +197h at AB1D.
        movzx   ax, byte [partybuf+1+98]
        mov     [di+C_MAXHP], ax
        movzx   ax, byte [partybuf+1+407]
        mov     [di+C_HP], ax
        mov     al, 60
        sub     al, [partybuf+1+89]
        cbw
        mov     [di+C_THAC0], ax
        mov     al, 60
        sub     al, [partybuf+1+275]
        cbw
        mov     [di+C_AC], ax
        movzx   ax, byte [partybuf+1+269]
        or      ax, ax
        jnz     .cok_dcount
        mov     ax, 1
.cok_dcount:
        mov     [di+C_DCOUNT], ax
        movzx   ax, byte [partybuf+1+271]
        or      ax, ax
        jnz     .cok_dsides
        mov     ax, 2
.cok_dsides:
        mov     [di+C_DSIDES], ax
        movzx   ax, byte [partybuf+1+270]
        mov     [di+C_DBONUS], ax
        mov     al, [partybuf]
        mov     [cok_slot], al
        mov     al, [partybuf+1+16]
        mov     [cok_str], al
        mov     al, [partybuf+1+22]
        mov     [cok_dex], al
        call    apply_cok_stf_equipment
        jmp     .stats_done
.dok_stats:
        mov     bx, [ncomb]
        mov     al, [partybuf+1+22]         ; DoK/DQK DEX (cur), same slot as CoK
        mov     [dok_dex+bx], al
        mov     al, 60
        sub     al, [partybuf+1+31]
        cbw
        mov     [di+C_THAC0], ax
        cmp     dword [partybuf+1+DOK_META_OFF], 'GBD1'
        jne     .dok_fallback
        test    word [partybuf+1+DOK_META_FLAGS], 1
        jz      .dok_fallback
        mov     ax, [partybuf+1+DOK_META_HP]
        ; The signature and flags establish metadata presence. Zero HP is a
        ; valid downed member, handled by .hp_status, not a missing-tail marker.
        mov     [di+C_HP], ax
        mov     [di+C_MAXHP], ax
        mov     ax, [partybuf+1+DOK_META_MAXHP]
        or      ax, ax
        jz      .dok_meta_maxhp_done
        mov     [di+C_MAXHP], ax
.dok_meta_maxhp_done:
        mov     ax, [partybuf+1+DOK_META_THAC0]
        or      ax, ax
        jz      .dok_meta_thac0_done
        mov     [di+C_THAC0], ax
.dok_meta_thac0_done:
        mov     ax, [partybuf+1+DOK_META_AC]
        mov     [di+C_AC], ax
        mov     ax, [partybuf+1+DOK_META_DCOUNT]
        mov     [di+C_DCOUNT], ax
        mov     ax, [partybuf+1+DOK_META_DSIDES]
        mov     [di+C_DSIDES], ax
        mov     ax, [partybuf+1+DOK_META_DBONUS]
        mov     [di+C_DBONUS], ax
        mov     ax, [partybuf+1+DOK_META_MOVE]
        cmp     ax, 1
        jb      .stats_done
        cmp     ax, 4
        ja      .stats_done
        mov     [di+C_MOVE], ax
        jmp     .stats_done
.dok_fallback:
        cmp     byte [party_dok], 2
        je      .close_err
        mov     word [di+C_HP], 24
        mov     word [di+C_MAXHP], 24
        mov     al, 60
        sub     al, [partybuf+1+95]
        cbw
        mov     [di+C_AC], ax
        movzx   ax, byte [partybuf+1+89]
        or      ax, ax
        jnz     .dok_dcount
        mov     ax, 1
.dok_dcount:
        mov     [di+C_DCOUNT], ax
        movzx   ax, byte [partybuf+1+91]
        or      ax, ax
        jnz     .dok_dsides
        mov     ax, 2
.dok_dsides:
        mov     [di+C_DSIDES], ax
        mov     al, [partybuf+1+90]
        cbw
        mov     [di+C_DBONUS], ax
.stats_done:
        mov     word [di+C_XP], 0
        mov     word [di+C_INIT], 0FFFFh
        mov     word [di+C_FLAGS], 0
        cmp     byte [party_dok], 0
        je      .cok_status
        cmp     dword [partybuf+1+DOK_META_OFF], 'GBD1'
        jne     .hp_status
        test    word [partybuf+1+DOK_META_FLAGS], 2
        jz      .hp_status
        mov     ax, [partybuf+1+DOK_META_COND]
        and     ax, 00FFh
        mov     [di+C_FLAGS], ax
        jmp     .hp_status
.cok_status:
        ; CoK GAME.OVR 38AE0/38AF1/38B18: dead=6, dying=5, down=4.
        ; Preserve dying in the raw record; native combat currently has one
        ; unconscious flag and does not simulate the retail bleed counter.
        mov     al, [partybuf+1+392]
        cmp     al, 6
        jne     .cok_not_dead
        mov     word [di+C_FLAGS], CF_DEAD
        jmp     .hp_status
.cok_not_dead:
        cmp     al, 4
        je      .cok_down
        cmp     al, 5
        jne     .hp_status
.cok_down:
        mov     word [di+C_FLAGS], CF_UNCON
.hp_status:
        cmp     word [di+C_HP], 0
        jg      .status_ready
        or      word [di+C_FLAGS], CF_UNCON
.status_ready:
        mov     word [di+C_COL], 3
        mov     ax, [ncomb]
        add     ax, 2
        mov     [di+C_ROW], ax
        mov     word [di+C_SIZE], 1
        mov     word [di+C_ATTACKS], 1
        mov     word [di+C_HALFATT], 0
        call    apply_dok_party_attacks
        mov     bx, [ncomb]
        mov     al, [partybuf]
        mov     [party_slots+bx], al
        ; DQK recruit control: retail 0x29B32 sets roster +0x18C = +0x9B & 80h and
        ; 0x22C89 sends nonzero actors to the AI turn. CCHOST /N keeps that flag at
        ; body +300 (partybuf+1+300). Gated to DQK rows; CoK/DoK own that byte.
        cmp     byte [party_dok], 2
        jne     .ai_flag_done
        mov     al, [partybuf+1+300]
        and     al, 80h
        mov     [party_ai+bx], al
.ai_flag_done:
        inc     word [ncomb]
        dec     word [party_left]
        jnz     .record
        ; Count-bounded row reads end at the exact declared extent. Probe one
        ; byte so any trailing data is rejected without a second seek pass.
        mov     bx, [partyfh]
        mov     ah, 3Fh
        mov     cx, 1
        mov     dx, party_eof_probe
        int     21h
        jc      .close_err
        or      ax, ax
        jnz     .close_err
        mov     bx, [partyfh]
        mov     ah, 3Eh
        int     21h
        clc
        ret
.close_err:
        mov     bx, [partyfh]
        mov     ah, 3Eh
        int     21h
.err:
        stc
        ret

apply_dok_party_attacks:
        cmp     byte [party_dok], 1
        jne     .ret
        cmp     dword [partybuf+1+DOK_META_OFF], 'GBD1'
        jne     .ret
        test    word [partybuf+1+DOK_META_FLAGS], 1
        jz      .ret
        mov     al, [partybuf+1+DOK_META_CLASS]
        cmp     al, 1
        je      .warrior
        cmp     al, 6
        jne     .ret
.warrior:
        mov     ax, [partybuf+1+DOK_META_LEVEL]
        cmp     ax, 13
        jae     .two
        cmp     ax, 7
        jb      .ret
        mov     word [di+C_HALFATT], 3
        ret
.two:
        mov     word [di+C_ATTACKS], 2
        mov     word [di+C_HALFATT], 0
.ret:
        ret

; CoK saves keep carried/readied item records in SAVE\CHRDATA#.STF sidecars.
; GBPR stays a lossless .SAV container; when CCCOMBAT is run from the game
; directory, import the readied STF equipment that has verified combat meaning.
apply_cok_stf_equipment:
        mov     [equip_di], di
        mov     al, [cok_slot]
        test    al, 80h
        jnz     .ret
        cmp     al, 1
        jb      .ret
        cmp     al, 6
        ja      .ret
        add     al, '0'
        mov     [stfpath+12], al
        mov     word [cok_base_ac], 10
        mov     ax, [di+C_THAC0]
        mov     [cok_base_thac0], ax
        mov     ax, 3D00h
        mov     dx, stfpath
        int     21h
        jc      .ret
        mov     [stffh], ax
.read:
        mov     bx, [stffh]
        mov     ah, 3Fh
        mov     cx, 63
        mov     dx, partybuf
        int     21h
        jc      .close
        cmp     ax, 63
        jne     .close
        cmp     byte [partybuf+34h], 0
        je      .read
        mov     al, [partybuf+2Eh]
        cmp     al, 18
        je      .long_sword
        cmp     al, 67
        je      .hoopak
        cmp     al, 8
        je      .mace
        cmp     al, 25
        je      .short_bow
        cmp     al, 30
        je      .arrows
        cmp     al, 36
        je      .plate
        cmp     al, 32
        je      .ring
        cmp     al, 37
        je      .shield
        jmp     .read
.plate:
        mov     di, [equip_di]
        cmp     word [cok_base_ac], 3
        jle     .plate_move
        mov     word [cok_base_ac], 3
.plate_move:
        cmp     word [di+C_MOVE], 2
        jle     .read
        mov     word [di+C_MOVE], 2
        jmp     .read
.ring:
        mov     di, [equip_di]
        cmp     word [cok_base_ac], 7
        jle     .ring_move
        mov     word [cok_base_ac], 7
.ring_move:
        cmp     word [di+C_MOVE], 3
        jle     .read
        mov     word [di+C_MOVE], 3
        jmp     .read
.shield:
        dec     word [cok_base_ac]
        jmp     .read
.long_sword:
        mov     di, [equip_di]
        mov     al, [partybuf+32h]
        cbw
        mov     [cok_hitbonus], ax
        mov     word [di+C_DCOUNT], 1
        mov     word [di+C_DSIDES], 8
        mov     [di+C_DBONUS], ax
        call    apply_cok_str_melee
        jmp     .read
.hoopak:
        mov     di, [equip_di]
        mov     al, [partybuf+32h]
        cbw
        mov     [cok_hitbonus], ax
        mov     word [di+C_DCOUNT], 1
        mov     word [di+C_DSIDES], 6
        add     ax, 2
        mov     [di+C_DBONUS], ax
        call    apply_cok_str_melee
        jmp     .read
.mace:
        mov     di, [equip_di]
        mov     al, [partybuf+32h]
        cbw
        mov     [cok_hitbonus], ax
        mov     word [di+C_DCOUNT], 1
        mov     word [di+C_DSIDES], 6
        mov     [di+C_DBONUS], ax
        call    apply_cok_str_melee
        jmp     .read
.short_bow:
        mov     di, [equip_di]
        mov     al, [partybuf+32h]
        cbw
        mov     [cok_hitbonus], ax
        mov     word [di+C_DCOUNT], 1
        mov     word [di+C_DSIDES], 6
        mov     [di+C_DBONUS], ax
        mov     word [di+C_MRANGE], 15
        cmp     word [di+C_AMMO], 0
        jne     .short_bow_hit
        mov     word [di+C_AMMO], 20
.short_bow_hit:
        call    apply_cok_weapon_thac0
        jmp     .read
.arrows:
        movzx   ax, byte [partybuf+39h]
        or      ax, ax
        jz      .read
        mov     di, [equip_di]
        mov     [di+C_AMMO], ax
        jmp     .read
.close:
        mov     bx, [stffh]
        mov     ah, 3Eh
        int     21h
        call    apply_cok_final_ac
.ret:
        mov     di, [equip_di]
        ret

apply_cok_str_melee:
        movzx   bx, byte [cok_str]
        cmp     bx, 3
        jae     .str_min_ok
        mov     bx, 3
.str_min_ok:
        cmp     bx, 19
        jbe     .str_max_ok
        mov     bx, 19
.str_max_ok:
        sub     bx, 3
        mov     di, [equip_di]
        mov     al, [cok_str_damage+bx]
        cbw
        add     [di+C_DBONUS], ax
        mov     al, [cok_str_hit+bx]
        cbw
        add     [cok_hitbonus], ax
        call    apply_cok_weapon_thac0
        ret

apply_cok_weapon_thac0:
        mov     di, [equip_di]
        mov     ax, [cok_base_thac0]
        sub     ax, [cok_hitbonus]
        cmp     ax, 1
        jge     .ok
        mov     ax, 1
.ok:
        mov     [di+C_THAC0], ax
        ret

apply_cok_final_ac:
        movzx   bx, byte [cok_dex]
        cmp     bx, 3
        jae     .dex_min_ok
        mov     bx, 3
.dex_min_ok:
        cmp     bx, 19
        jbe     .dex_max_ok
        mov     bx, 19
.dex_max_ok:
        sub     bx, 3
        mov     al, [cok_dex_ac+bx]
        cbw
        add     ax, [cok_base_ac]
        mov     di, [equip_di]
        mov     [di+C_AC], ax
        ret

load_icon_gbim:
        mov     byte [icon_valid], 0
        mov     byte [icon_count], 0
        mov     word [icon_next], 0
        mov     word [icon_digitp], 0
        cmp     byte [iconname], 0
        je      .ret
        mov     si, iconname
.find_end:
        cmp     byte [si], 0
        je      .have_end
        inc     si
        jmp     .find_end
.have_end:
        cmp     si, iconname+5
        jb      .open
        cmp     byte [si-4], '.'
        jne     .open
        mov     al, [si-5]
        cmp     al, '0'
        jb      .open
        cmp     al, '9'
        ja      .open
        lea     ax, [si-5]
        mov     [icon_digitp], ax
.open:
        mov     ax, 3D00h
        mov     dx, iconname
        int     21h
        jc      .ret
        mov     [infh], ax
        push    ds
        mov     ds, [cs:icon_seg]
        mov     ah, 3Fh
        mov     bx, [cs:infh]
        mov     cx, 60000
        sub     cx, [cs:icon_next]
        mov     dx, [cs:icon_next]
        int     21h
        pop     ds
        mov     [icon_len], ax
        mov     bx, [infh]
        mov     ah, 3Eh
        int     21h
        cmp     word [icon_len], 14+1+768
        jb      .ret
        push    ds
        mov     ds, [icon_seg]
        mov     bx, [cs:icon_next]
        cmp     byte [bx], 'G'
        jne     .bad
        cmp     byte [bx+1], 'B'
        jne     .bad
        cmp     byte [bx+2], 'I'
        jne     .bad
        cmp     byte [bx+3], 'M'
        jne     .bad
        cmp     word [bx+4], 1
        jne     .bad
        test    byte [bx+8], 1
        jz      .bad
        mov     ax, [bx+10]
        or      ax, ax
        jz      .bad
        cmp     ax, 304
        ja      .bad
        mov     [cs:icon_width], ax
        mov     ax, [bx+12]
        or      ax, ax
        jz      .bad
        cmp     ax, 168
        ja      .bad
        mov     [cs:icon_height], ax
        mul     word [cs:icon_width]
        or      dx, dx
        jnz     .bad
        mov     [cs:icon_npix], ax
        add     ax, 14+768
        cmp     ax, [cs:icon_len]
        ja      .bad
        mov     ax, [bx+6]
        mov     [cs:icon_block], ax
        movzx   si, byte [cs:icon_count]
        shl     si, 1
        mov     [cs:icon_blocks+si], ax
        mov     ax, [cs:icon_next]
        mov     [cs:icon_bases+si], ax
        mov     ax, [cs:icon_width]
        mov     [cs:icon_widths+si], ax
        mov     ax, [cs:icon_height]
        mov     [cs:icon_heights+si], ax
        mov     ax, [cs:icon_npix]
        mov     [cs:icon_npixels+si], ax
        add     ax, 14+768
        add     [cs:icon_next], ax
        inc     byte [cs:icon_count]
        mov     byte [cs:icon_valid], 1
.bad:
        pop     ds
        cmp     byte [icon_count], ICONCAP
        jae     .ret
        mov     si, [icon_digitp]
        or      si, si
        jz      .ret
        cmp     byte [si], '9'
        jae     .ret
        inc     byte [si]
        jmp     .open
.ret:
        ret

read_optional_raw:
        call    skip_sp
        mov     al, [si]
        or      al, al
        jz      .ret
        cmp     al, 13
        je      .ret
        cmp     al, '/'
        je      .ret
        mov     byte [vrawflag], 1
        mov     di, vrawname
        call    copy_token
.ret:
        ret

read_optional_trace:
        call    skip_sp
        mov     al, [si]
        or      al, al
        jz      .ret
        cmp     al, 13
        je      .ret
        cmp     al, '/'
        je      .ret
        mov     di, trcname
        call    copy_token
.ret:
        ret

read_optional_outcome:
        call    skip_sp
        mov     al, [si]
        or      al, al
        jz      .ret
        cmp     al, 13
        je      .ret
        cmp     al, '/'
        je      .ret
        mov     di, outcomename
        call    copy_token
.ret:
        ret

copy_token:
.lp:
        mov     al, [si]
        or      al, al
        jz      .done
        cmp     al, 13
        je      .done
        cmp     al, ' '
        je      .done
        mov     [di], al
        inc     si
        inc     di
        jmp     .lp
.done:
        mov     byte [di], 0
        ret

copy_asciiz:
.lp:
        lodsb
        mov     [di], al
        inc     di
        or      al, al
        jnz     .lp
        ret

; read_num: parse decimal at [si]; CF=1 if no digit, else CF=0, AX=value.
read_num:
        xor     bx, bx
        xor     cx, cx
.dl:
        mov     al, [si]
        cmp     al, '0'
        jb      .end
        cmp     al, '9'
        ja      .end
        sub     al, '0'
        movzx   ax, al
        push    ax
        mov     ax, bx
        mov     dx, 10
        mul     dx
        mov     bx, ax
        pop     ax
        add     bx, ax
        inc     cx
        inc     si
        jmp     .dl
.end:
        or      cx, cx
        jz      .none
        mov     ax, bx
        clc
        ret
.none:
        stc
        ret

skip_sp:
        cmp     byte [si], ' '
        jne     .d
        inc     si
        jmp     skip_sp
.d:
        ret

; ============================================================================
;  INTERACTIVE PLAYER TURN  (/K)
;
;  Until now a party member's turn came from one of two places and neither was
;  a player: /C <letters> fed a scripted tape (G/W guard, F flee, P party
;  flee, anything else -> ai_take_turn), and everything else fell straight to
;  the AI.  /K adds a real turn: draw the board, draw a command bar, block on
;  the keyboard, dispatch.
;
;  /K TAKES THE SAME POSITIONAL ARGUMENTS AS /E and is parsed by falling into
;  .mode_e, so it inherits the GBEF encounter path, the MON archive, the seed,
;  the trace and the outcome file unchanged.  It differs in exactly two ways:
;  it puts the screen in mode 13h and renders between actions, and
;  player_command_turn reads the keyboard.
;
;  THE TAPE STILL WINS.  player_command_turn consumes /C first and only calls
;  the keyboard when the tape is exhausted.  That is deliberate and it is what
;  makes this testable: /K ... /C GG runs two scripted guards with no human,
;  produces the same trace file every other mode produces, and only then waits
;  for a key.  A mode that could ONLY be driven by a human could not be pinned
;  by any golden, and this engine's whole test surface is trace goldens.
;
;  WHAT IS AND IS NOT IMPLEMENTED.  Move (with the movement budget and
;  move-into-an-enemy-is-an-attack), Guard, Delay, End, Quick, Flee and
;  party-Flee are real.  Aim, Cast, Use, Turn, Bandage, View and Speed print
;  "not yet" and re-prompt rather than silently doing nothing -- a command that
;  quietly no-ops is indistinguishable from one that worked.
;
;  THE COMMAND BAR IS NOT YET PER-TITLE.  Retail carries at least three menu
;  framings and three vocabularies (see docs/engine/research/
;  combat-screen-plan-cok.md section 7).  This bar is a single built-in list and
;  is labelled as such on screen; wiring the per-title shape needs a channel
;  from GBBOOT that does not exist yet, because the CCCOMBAT command tail is
;  measured at 114 of DOS's 127 bytes with a live margin of 2.
; ============================================================================

; -- ui_at: park the BIOS cursor at DH=row, DL=col on page 0.
ui_at:
        push    ax
        push    bx
        mov     ah, 02h
        xor     bh, bh
        int     10h
        pop     bx
        pop     ax
        ret

; -- ui_str: teletype the NUL-terminated string at SI.  Mode 13h renders the
;    BIOS 8x8 font, so a row is 40 columns; callers keep strings short rather
;    than relying on a clip that int 10h does not do (it wraps).
ui_str:
        push    ax
        push    bx
        push    si
.lp:
        lodsb
        or      al, al
        jz      .d
        mov     ah, 0Eh
        mov     bx, 000Fh
        int     10h
        jmp     .lp
.d:
        pop     si
        jmp     shared_epi_ax_bx_si

; -- ui_dec: teletype AX as unsigned decimal.
ui_dec:
        push    ax
        push    bx
        push    cx
        push    dx
        mov     bx, 10
        xor     cx, cx
.div:
        xor     dx, dx
        div     bx
        push    dx
        inc     cx
        or      ax, ax
        jnz     .div
.out:
        pop     ax
        add     al, '0'
        mov     ah, 0Eh
        mov     bx, 000Fh
        int     10h
        loop    .out
        pop     dx
        jmp     shared_epi_ax_bx_cx_dx

; -- ui_msg_line: clear text row 24 and print SI there.  Row 24 is y 192..199,
;    below the grid's bottom border row (y 176), so it cannot erase the frame.
;    ccfp.asm's draw_effect_text starts its own clear at y=176 and WOULD erase
;    that border; this deliberately does not copy that number.
ui_msg_line:
        push    ax
        push    bx
        push    cx
        push    dx
        push    si
        mov     dh, 24
        mov     dl, 0
        call    ui_at
        push    si
        mov     cx, 39
.blank:
        mov     al, ' '
        mov     ah, 0Eh
        mov     bx, 000Fh
        int     10h
        loop    .blank
        pop     si
        mov     dh, 24
        mov     dl, 0
        call    ui_at
        call    ui_str
        pop     si
        jmp     shared_epi_ax_bx_cx_dx_si

; -- redraw_board: repaint the tactical view without re-entering mode 13h or
;    reloading the DAC.  render_combat_view does those once at entry; doing
;    them per frame would flicker and would reload the palette dozens of times
;    a battle for no change.
redraw_board:
        push    ax
        push    cx
        push    di
        push    es
        mov     ax, 0A000h
        mov     es, ax
        xor     di, di
        xor     ax, ax
        mov     cx, 32000
        rep     stosw
        call    draw_combat_grid
        call    draw_combatants
        pop     es
        jmp     shared_epi_ax_cx_di_es

; -- center_view_on_cur: put [cur_ptr] in the middle of the 7x7 window and
;    clamp to the 10x10 logical grid.
;
;    THIS IS WHY THE VIEWPORT ORIGIN EXISTS.  draw_combatants used to test
;    C_COL/C_ROW against VIEW_VISIBLE_CELLS directly, so a combatant in
;    columns or rows 7..9 was simply not drawn -- 51 of the 100 logical cells
;    were invisible while the battle went on inside them.  That is tolerable
;    for a one-shot /V screenshot and impossible for a player.
;
;    The 7x7 window is NOT the bug and must not be "fixed" by enlarging it: the
;    COAB decompile pins retail CoK at draw_clipped_picture(..., 8,176, 8,176)
;    with 24px cells, i.e. exactly 7x7 visible, and retail scrolls a larger map
;    under it via mapScreenTopLeft.  See combat-screen-plan-cok.md section 1.3.
;    What was missing was that scroll offset, not screen area.
center_view_on_cur:
        push    ax
        push    si
        mov     si, [cur_ptr]
        mov     ax, [si+C_COL]
        sub     ax, VIEW_VISIBLE_CELLS/2
        jns     .colok
        xor     ax, ax
.colok:
        cmp     ax, COMBAT_GRID_W-VIEW_VISIBLE_CELLS
        jbe     .colsave
        mov     ax, COMBAT_GRID_W-VIEW_VISIBLE_CELLS
.colsave:
        mov     [view_col0], ax
        mov     ax, [si+C_ROW]
        sub     ax, VIEW_VISIBLE_CELLS/2
        jns     .rowok
        xor     ax, ax
.rowok:
        cmp     ax, COMBAT_GRID_H-VIEW_VISIBLE_CELLS
        jbe     .rowsave
        mov     ax, COMBAT_GRID_H-VIEW_VISIBLE_CELLS
.rowsave:
        mov     [view_row0], ax
        pop     si
        pop     ax
        ret

; -- draw_command_bar: the right-hand strip, x 177..319 = text columns 23..39,
;    which draw_combat_grid and draw_combatants never touch.
draw_command_bar:
        push    ax
        push    bx
        push    dx
        push    si
        mov     dh, 0
        mov     dl, 23
        call    ui_at
        mov     si, s_bar_hdr
        call    ui_str
        xor     bx, bx
.lp:
        cmp     bx, CMDBAR_N
        jae     .d
        mov     dh, bl
        add     dh, 2
        mov     dl, 24
        call    ui_at
        mov     si, bx
        shl     si, 1
        mov     si, [cmdbar_tbl+si]
        call    ui_str
        inc     bx
        jmp     .lp
.d:
        pop     si
        pop     dx
        pop     bx
        pop     ax
        ret

; -- draw_actor_banner: who is acting, on text row 23.
draw_actor_banner:
        push    ax
        push    dx
        push    si
        mov     dh, 23
        mov     dl, 0
        call    ui_at
        mov     si, s_turn
        call    ui_str
        mov     si, [cur_ptr]
        cmp     byte [si+C_SIDE], 0
        je      .party
        mov     si, s_side_e
        jmp     .side
.party:
        mov     si, s_side_p
.side:
        call    ui_str
        mov     si, [cur_ptr]
        movzx   ax, byte [si+C_ORD]
        call    ui_dec
        mov     si, s_hp
        call    ui_str
        mov     si, [cur_ptr]
        mov     ax, [si+C_HP]
        call    ui_dec
        pop     si
shared_epi_ax_dx_si:
        pop     dx
        pop     ax
        ret

; -- read_command_key: blocking BIOS keystroke.  AH = scan code, AL = ASCII.
read_command_key:
        mov     byte [saw_keyboard], 1
        xor     ah, ah
        int     16h
        ret

; -- interactive_prompt: one full frame, then wait.  Returns the key in AX.
interactive_prompt:
        call    center_view_on_cur
        call    redraw_board
        call    draw_actor_banner
        call    draw_command_bar
        call    read_command_key
        ret

; -- key_to_delta: map a keystroke to [move_dx]/[move_dy].  CF=1 if the key is
;    not a direction.  Accepts the numeric-keypad digits and the extended arrow
;    scan codes; DQK's own bytes say "(use cursor keys) " (DQK.EXE:0x688A5), so
;    arrows are the retail input, and the digits are kept because a headless
;    harness can deliver a plain ASCII byte far more easily than an extended
;    scan-code pair.
;
;    move_dx and move_dy were already declared in this file and referenced by
;    nothing -- one grep hit each, their own declaration.  They are fossils of
;    exactly this routine, and so is move_left below.
key_to_delta:
        push    bx
        push    cx
        push    si
        or      al, al
        jnz     .ascii
        mov     si, arrowtab
        mov     cx, ARROWN
.at:
        cmp     ah, [si]
        je      .athit
        add     si, 2
        loop    .at
        jmp     .no
.athit:
        mov     al, [si+1]
        xor     ah, ah
        jmp     .lookup
.ascii:
        cmp     al, '1'
        jb      .no
        cmp     al, '9'
        ja      .no
        sub     al, '1'
        xor     ah, ah
        cmp     al, 4                    ; keypad 5 is the centre, not a step
        je      .no
.lookup:
        mov     bx, ax
        shl     bx, 1
        mov     ax, [numpad_dx+bx]
        mov     [move_dx], ax
        mov     ax, [numpad_dy+bx]
        mov     [move_dy], ax
        clc
        jmp     .d
.no:
        stc
.d:
        pop     si
        pop     cx
        pop     bx
        ret

; -- foe_at_target: is an active combatant of the OPPOSITE side to [cur_ptr]
;    standing on [move_new_col],[move_new_row]?  CF=0 and BX/SI = its index and
;    record if so.  Footprints are honoured, so a size-2 figure is found from
;    any of its four cells.
foe_at_target:
        push    ax
        push    cx
        push    dx
        push    di
        mov     di, [cur_ptr]
        mov     dl, [di+C_SIDE]
        xor     bx, bx
.lp:
        cmp     bx, [ncomb]
        jae     .no
        cmp     bx, [cur_idx]
        je      .next
        mov     si, bx
        imul    si, si, C_REC
        add     si, comb
        call    is_active_si
        jnc     .next
        mov     dh, [si+C_SIDE]
        cmp     dh, dl
        je      .next
        mov     ax, [si+C_SIZE]
        cmp     ax, 1
        jg      .s2
        mov     ax, 1
        jmp     .sok
.s2:
        cmp     ax, 2
        jle     .sok
        mov     ax, 2
.sok:
        mov     cx, ax
        mov     ax, [si+C_COL]
        cmp     ax, [move_new_col]
        jg      .next
        add     ax, cx
        dec     ax
        cmp     ax, [move_new_col]
        jl      .next
        mov     ax, [si+C_ROW]
        cmp     ax, [move_new_row]
        jg      .next
        add     ax, cx
        dec     ax
        cmp     ax, [move_new_row]
        jl      .next
        clc
        jmp     .d
.next:
        inc     bx
        jmp     .lp
.no:
        stc
.d:
        pop     di
        pop     dx
        pop     cx
        pop     ax
        ret

; -- do_player_move: the retail move loop.
;
;    THE PROMPT IS THE SPECIFICATION.  Champions of Krynn's GAME.OVR at 0xBAC9
;    holds "Move/Attack, Move Left = " / " Done" / "Flee:" / "can't go there",
;    and DQK.EXE carries the same cluster at 0x688CA and 0x684D8.  Those strings
;    span two engine generations and pin the whole loop: a LIVE
;    remaining-movement counter that is displayed and decremented per step, an
;    early exit, flee reachable from inside move mode, and a named rejection for
;    a blocked square.  This is not one-action-per-turn, which is what the
;    engine did before -- combat_round_loop calls exactly one routine per
;    combatant, and ai_take_turn's own move is a single whole-budget jump to a
;    Dijkstra anchor (choose_routed_close), not a walk.
;
;    Attack is not a command anywhere in retail -- neither CoK, DoK, DQK, FRUA
;    nor either Buck Rogers menu contains the word.  Moving into an occupied
;    square IS the attack, which is why the foe test happens before
;    can_place_cur_at, which would simply reject the square as occupied.
do_player_move:
        push    ax
        push    bx
        push    cx
        push    dx
        push    si
        push    di
        ; [move_left] belongs to player_command_turn, not one invocation of
        ; move mode. Returning after Done lets a later M spend only this turn's
        ; remaining movement.
        cmp     word [move_left], 1
        jle     .done
.loop:
        call    center_view_on_cur
        call    redraw_board
        call    draw_actor_banner
        call    draw_move_prompt
        call    next_input_key
        or      al, al
        jz      .maybe_dir
        cmp     al, 27
        je      .done
        cmp     al, 13
        je      .done
        push    ax
        and     al, 0DFh
        cmp     al, 'D'
        pop     ax
        je      .done
        push    ax
        and     al, 0DFh
        cmp     al, 'F'
        pop     ax
        je      .flee
.maybe_dir:
        call    key_to_delta
        jc      .loop
        mov     si, [cur_ptr]
        mov     ax, [si+C_COL]
        add     ax, [move_dx]
        mov     [move_new_col], ax
        mov     ax, [si+C_ROW]
        add     ax, [move_dy]
        mov     [move_new_row], ax
        call    foe_at_target
        jc      .try_place
        mov     [tgt_idx], bx
        mov     [tgt_ptr], si
        ; RETRACTED 2026-09-07.  This was ONE call to resolve_hit followed by an
        ; unconditional `jmp .done`, commented "the swing ends the move, as in
        ; retail".  I had no evidence for that label when I wrote it, I flagged
        ; it as an unlabelled inference, and it is wrong in two ways.
        ;
        ; The Gen1 oracle's move loop (ovr009.cs:426-583) contains no break, no
        ; continue, no goto and no return -- the whole body was read for this.
        ; A bump attack is just a branch inside one iteration.  Move mode ends
        ; only as a SIDE EFFECT: AttackTarget sets turnComplete once the
        ; attacker's attacks are spent (ovr014.cs:864-868), that calls
        ; clear_actions (ovr014.cs:999-1002), and Action.Clear sets move = 0
        ; (Classes/Action.cs:33-39).  So:
        ;   * an attack costs NO movement -- it zeroes the budget rather than
        ;     debiting it, and anything modelling it as a debit diverges the
        ;     moment a character has more than one attack;
        ;   * KILLING the target leaves move mode OPEN.  The drain loop at
        ;     ovr014.cs:811-816 exits early on targetNotInCombat with attacks
        ;     unspent, so turnComplete stays false, clear_actions never runs,
        ;     and the walk continues on the untouched budget.
        ; A target that SURVIVES absorbs every remaining attack in this one
        ; command -- that is the same while loop draining -- and only then is
        ; the turn over.  Both halves are pinned by fixtures 43 and 44.
        ;
        ; SHORTFALL, stated: the oracle carries two counters (primary and
        ; secondary weapon, attackIdx 2 down to 1) and this ledger is one, so a
        ; one-attack character here ends its move on a kill where retail's
        ; second counter might still be positive.  The kill-keeps-moving rule
        ; is therefore only observable at 2+ attacks in this engine.
        mov     byte [attack_missile], 0
        mov     byte [attack_secondary], 0
.bump:
        cmp     word [player_attacks_left], 0
        jg      .attack_left
        mov     word [move_left], 0      ; retail clear_actions consumes movement
        jmp     .done                    ; attacks spent: the turn is over
.attack_left:
        mov     si, [tgt_ptr]
        call    is_active_si
        jnc     .loop                    ; target dropped, attacks remain: walk on
        dec     word [player_attacks_left]
        call    resolve_hit
        jmp     .bump
.try_place:
        call    can_place_cur_at
        jc      .blocked
        ; The step cost is computed and CHECKED before anything is committed.
        ; RETRACTED 2026-09-07: the note that used to sit below the charge said
        ; this branch "has not been read".  It has now.  ovr009.cs:544-546
        ; computes the cost and `if (cost > player.actions.move)` prints
        ; "can't go there" and skips the entire else-branch -- no back attack,
        ; no step, no charge -- leaving the loop to re-prompt.  Impassable
        ; terrain arrives at the same message through move_cost 0xFF forcing
        ; the cost to 0xFFFF, which is why one message serves both cases here
        ; as well.
        ;
        ; Retail charges terrain cost x2 for an orthogonal step and x3 for a
        ; diagonal, out of a budget of movement x2 -- so the x2 and the /2
        ; cancel and SQUARES PER ROUND EQUALS THE RECORD'S MOVEMENT VALUE.
        ; There is no inches-to-squares divisor; the search for one was looking
        ; for something that does not exist.  Verified by me in Champions of
        ; Krynn GAME.OVR: CalcMoves ends `d1 e0` (shl ax,1) at 0x14EFE, the
        ; orthogonal charge is `d1 e0` at 0x155AE, the diagonal is
        ; `d1 e0 01 f0` (shl then add = x3) at 0x1557C, and both the
        ; "Move Left = " display and the reachability test halve it back
        ; (`30 e4 d1 e8` at 0x15B59).  Terrain cost is 1 on open ground here.
        mov     ax, MOVE_COST_ORTH
        cmp     word [move_dx], 0
        je      .cost_ready
        cmp     word [move_dy], 0
        je      .cost_ready
        mov     ax, MOVE_COST_DIAG
.cost_ready:
        mov     [move_cost_cur], ax
        cmp     ax, [move_left]
        jg      .blocked                 ; unaffordable: no step, and no charge
        ; The back attack is taken from the square being LEFT, so it has to
        ; resolve before the position is committed -- and it can kill the
        ; mover, which is why the move is abandoned if it does.
        call    trigger_leaving_reactions
        mov     si, [cur_ptr]
        call    is_active_si
        jnc     .done
        mov     si, [cur_ptr]
        mov     ax, [move_new_col]
        mov     [si+C_COL], ax
        mov     ax, [move_new_row]
        mov     [si+C_ROW], ax
        call    trace_move
        call    apply_hazard_cur
        mov     si, [cur_ptr]
        call    is_active_si
        jnc     .done
        test    word [si+C_FLAGS], CF_DISABLED
        jnz     .done
        call    trigger_guard_reactions
        mov     si, [cur_ptr]
        call    is_active_si
        jnc     .done
        mov     ax, [move_cost_cur]
        sub     [move_left], ax
        ; The oracle's loop condition is `while (player.actions.move > 1 ...)`,
        ; so a budget of 1 half-square cannot buy another step, and its tail
        ; clamps a leftover 1 to 0 (ovr009.cs:584-587).  With the pre-check
        ; above the budget can no longer go negative.
        cmp     word [move_left], 1
        jle     .done
        jmp     .loop
.blocked:
        mov     si, s_cantgo
        call    ui_msg_line
        ; A live game waits for the acknowledgement key.  A /C tape is already
        ; its own deterministic acknowledgement stream: consuming one here
        ; would silently eat the next direction or End command and make a
        ; blocked step alter later input.
        cmp     byte [kmode], 0
        je      .loop
        call    ack_key
        jmp     .loop
.flee:
        ; Move-mode Flee inherits this invocation's remaining movement too.
        mov     byte [quick_budget_active], 1
        call    try_flee_step
        mov     byte [quick_budget_active], 0
.done:
        pop     di
        jmp     shared_epi_ax_bx_cx_dx_si_di

draw_move_prompt:
        push    ax
        push    dx
        push    si
        mov     dh, 24
        mov     dl, 0
        call    ui_at
        mov     si, s_moveprompt
        call    ui_str
        mov     ax, [move_left]
        shr     ax, 1                    ; budget is halves; the prompt is squares
        call    ui_dec
        mov     si, s_movedone
        call    ui_str
        pop     si
        jmp     shared_epi_ax_dx_si

; -- do_player_delay: ask combat_round_loop to re-run this order slot later.
;
;    The rotation itself belongs to the loop, not here: player_command_turn is
;    called with the loop's order index in BX and saves and restores BX, so it
;    cannot see or hold the slot.  Setting a flag and letting the loop rotate
;    order[] is also the only version that is safe -- .turnloop re-reads
;    order[bx] and order_n from memory on every iteration, so the array may be
;    mutated mid-round, but only by the code that owns the index.
;
;    delayed[] is a separate byte array rather than a C_FLAGS bit because
;    C_FLAGS has no free bit: bits 0..7 are CF_DEAD..CF_ASLEEP and the high
;    byte holds morale+1, read by get_morale_si.  One delay per combatant per
;    round, or a character could delay forever and the round would never end.
do_player_delay:
        push    ax
        push    bx
        push    si
        mov     bx, [cur_idx]
        cmp     byte [delayed+bx], 0
        jne     .refuse
        mov     byte [delayed+bx], 1
        mov     byte [delay_request], 1
        jmp     .d
.refuse:
        mov     si, s_nodelay
        call    ui_msg_line
        call    read_command_key
.d:
        pop     si
        jmp     shared_epi_ax_bx_si

; ============================================================================
;  Constants
; ============================================================================
ROUNDCAP  equ 60          ; tactical.ts default roundCap
VIEW_X0   equ 8
VIEW_Y0   equ 8
VIEW_VISIBLE_CELLS equ 7
CMDBAR_N  equ 8           ; rows drawn by draw_command_bar
ARROWN    equ 8           ; extended arrow scan codes recognised by key_to_delta
VIEW_CELL equ 24
VIEW_GRID_PIX equ 168
VIEW_BLOCK equ 22
VIEW_BLOCK_LARGE equ 46
VIEW_GRID_COL equ 8
VIEW_PARTY_COL equ 10
VIEW_ENEMY_COL equ 12
COMBAT_GRID_W equ 10
COMBAT_GRID_H equ 10
; CalcMoves (GAME.OVR 0x14EB7) clamp: AL outside 1..96 -> 1.  Out AX.
clamp_move_al:
        xor     ah, ah
        dec     ax
        cmp     ax, 95
        jbe     .ok
        xor     ax, ax
.ok:
        inc     ax
        ret

DEFAULT_MOVE_CELLS equ 4 ; Tier-1 fallback until real movement-rate offsets are decoded
ROUTE_INF equ 127
ROUTE_PASSES equ 10
MAX_TERRAIN_BLOCKS equ 64
MAX_TERRAIN_COSTS equ 64
MAX_HAZARDS equ 32
HAZ_WORDS equ 8
WALLBUF_LEN equ 646         ; Header + first 10 rows of a 16-wide Gen1 WGRD.
HAZ_STATUS_NONE equ 0
HAZ_STATUS_FEARED equ 1
HAZ_STATUS_HELD equ 2
HAZ_STATUS_ASLEEP equ 3
GBEF_LEN  equ 116         ; stable CCECL GBEF encounter prefix length
GBEF_MAX_GROUPS equ 8
ICONCAP equ 8
daxbuf equ 0              ; offset inside the FS-addressed DOS block (daxseg)
DAXPARAS equ DAX_FILEMAX/16
ICON_PARAS equ 3750       ; 60000-byte icon buffer at icon_seg
DAX_FILEMAX equ 32768     ; HLIB buffer and streamed DAX TOC/record scratch.
MON_RAW_MAX equ 2048      ; DAX monster records plus DQK MONCHA decoded members

; ---------------------------------------------------------------------------
;  DQK MONCHA.GLB record layout (fidelity-plan §29, 2026-08-21). Offsets are
;  into the DECOMPRESSED record, i.e. past the 2-byte big-endian length word.
;  Every one is fixed in all 98 shipped members.
; ---------------------------------------------------------------------------
DQK_MEMBER_HDR equ 2                ; u16be uncompressed length precedes the RLE stream
DQK_L_XP       equ 054h             ; u16 LE experience award
DQK_L_RACE     equ 058h             ; 7 = plain monster, 6 = humanoid, 5 = kender
DQK_L_ISMON    equ 066h             ; 1 = bestiary record, 0 = character/NPC record
DQK_L_NAME     equ 068h             ; 16-byte NUL-padded name
DQK_L_ABIL     equ 078h             ; 12-byte ability block; stats at DQK_L_ABIL+delta
DQK_L_FIXED    equ 1A0h             ; end of the fixed part
;
;  §29 CLEANUP COMPLETED 2026-09-07. The pre-§29 sniffing machinery that used to
;  sit above -- try_dqk_selected_ability / _compact / _canon_ac, find_dqk_ability
;  and its four sniffers, is_dqk_rolled_ability, name_is_dqk_umberhulk,
;  is_dqk_monster_default_ability, build_dqk_recon, scan_dqk_name,
;  is_dqk_name_byte, sign_word, the 'UMBERHULK' needle and the MON_RAW_MAX
;  reconraw shadow buffer -- was written before the 2-byte length word above was
;  known. It searched for the ability block instead of indexing it, and every one
;  of those searches now runs against correctly-phased bytes where the fixed
;  offsets are exact. All of it is deleted (3,448 bytes of resident image
;  reclaimed; 64,652 -> 61,204). Two routines that LOOKED like part of the same
;  cluster were kept because they are still called: sniff_dqk_npc_ability (from
;  try_dqk_selected_npc) and is_dqk_die_size.
;
;  The deleted compact path decoded a supposed attacks-per-round field at
;  A+42..A+46. The browser engine withdrew that claim in
;  packages/engine/src/loaders/moncha.ts:260-272: corrected records have zeros
;  there in every shipped member. The independent two-round rates at A+59/+60
;  are separately located and decoded in fill_enemy_from_mon; do not substitute
;  this deleted zero field for them.
;
HLIB_PTRCAP equ 256
MONK_DAX    equ 1
MONK_GLB    equ 2
RULE_GEN1   equ 1
RULE_GEN2   equ 2

; ============================================================================
;  Static data
; ============================================================================
; Keep the resident diagnostic bounded: the complete invocation contract lives
; in native/README.md, while this COM needs room for executable title behavior.
%include "secretcombat.inc"

s_usage   db 'CCCOMBAT',13,10,'$'
s_noopen  db 'output',13,10,'$'
s_badfx   db 'bad effect',13,10,'$'
s_nomem   db 'no memory',13,10,'$'
; The command bar.  DELIBERATELY NOT THE RETAIL WORD LIST, and the header says
; so on screen.  Retail carries at least three menu framings -- CoK and Buck
; Rogers use Pascal-prefixed cells in a main block plus a submenu, DoK one
; Pascal blob with an @ row break, DQK and FRUA a NUL-terminated blob -- over at
; least three vocabularies (Krynn ground, Buck ground, Buck ship).  Picking one
; of them and calling it the menu would be filing a true word list under the
; wrong title.  These are the commands this build can actually execute.
s_bar_hdr   db '[generic]',0
s_cmd_move  db 'M Move',0
s_cmd_aim   db 'C Cast',0
s_cmd_guard db 'G Guard',0
s_cmd_delay db 'D Delay',0
s_cmd_quick db 'Q Quick',0
s_cmd_flee  db 'F Flee',0
s_cmd_party db 'P PtyFlee',0
s_cmd_end   db 'E End',0
s_turn      db 'Turn ',0
s_side_p    db 'p',0
s_side_e    db 'e',0
s_hp        db '  hp ',0
; Quoted from the retail prompts, not invented: CoK GAME.OVR 0xBAC9 and DQK.EXE
; 0x688CA hold "Move/Attack, Move Left = " and " Done"; "can't go there" is at
; CoK 0xBAEA and DQK 0x684D8.
s_moveprompt db 'Move/Attack, Move Left = ',0
s_movedone   db ' Done',0
s_cantgo     db 'can',39,'t go there',0
s_notyet     db 'unavail',0
s_nodelay    db 'already delayed this round',0
s_battle_over db 'battle over - press a key',0
s_trcfile db 'CCCOMB.TRC',0
partyname times 112 db 0
wallname  times 128 db 0
partyhdr times 16 db 0
partybuf times 410 db 0
partyfh dw 0
wallfh dw 0
wall_len dw 0
wall_w dw 0
wall_h dw 0
wall_max_x dw 0
wall_max_y dw 0
wall_x dw 0
wall_y dw 0
party_left dw 0
party_eof_probe db 0
party_dok db 0
dok_surprise db 0
dok_n2    dw 0
dok_dexadj db -4,-4,-4,-3,-2,-1,0,0,0,0,0,0,0,0,0,0,1,2,3,3,3,4,4,4,5,5
stffh dw 0
equip_di dw 0
cok_base_ac dw 0
cok_base_thac0 dw 0
cok_hitbonus dw 0
cok_slot db 0
cok_str db 0
cok_dex db 0
stfpath db 'SAVE\CHRDATA1.STF',0
dokwizpath db 'SAVE\CHRDATA1.WIZ',0
party_slots times 8 db 0
party_ai times 8 db 0
party_cast_used times 8 db 0
cok_dex_ac db 4,3,2,1,0,0,0,0,0,0,0,0,-1,-2,-3,-4,-4
cok_str_hit db -3,-2,-2,-1,-1,0,0,0,0,0,0,0,0,0,1,1,3
cok_str_damage db -1,-1,-1,0,0,0,0,0,0,0,0,0,0,1,1,2,7

t_init    db 'init',0
t_order   db 'order',0
t_move    db 'move',0
t_attack  db 'attack',0
t_cast    db 'cast',0
t_slain   db 'slain',0
t_status  db 'status',0
t_flee    db 'flee',0
t_party_flee db 'party-flee',0
t_hazard  db 'hazard',0
t_guard   db 'guard',0
t_reject  db 'reject',0
t_feared  db 'feared',0
t_held    db 'held',0
t_asleep  db 'asleep',0
t_end     db 'end',0
t_party   db 'party',0
t_enemy   db 'enemy',0
t_draw    db 'draw',0
t_escaped db 'escaped',0
t_blocked db 'blocked',0
o_party   db 'party',13,10
o_party_len equ $ - o_party
o_enemy   db 'enemy',13,10
o_enemy_len equ $ - o_enemy
o_flee    db 'flee',13,10
o_flee_len equ $ - o_flee
o_draw    db 'draw',13,10
o_draw_len equ $ - o_draw
gbcr_hdr db 'GBCR'
gbcr_version dw 1
gbcr_outcome dw 0
gbcr_xp dw 0
gbcr_count dw 0
gbcr_reserved dw 0,0
trace_event_type dw t_attack
gbcr_rec times GBCR_REC_LEN db 0
route_dc  db 1,1,0,-1,-1,-1,0,1
route_dr  db 0,1,1,1,0,-1,-1,-1
; Effect-handoff enemy anchors.  The first three preserve the original adjacent
; slots; later LOAD_MONSTER groups spread across the right side of the 10x10 grid.
EFFECT_ENEMY_SLOT_COUNT equ 30
effect_enemy_slots:
  dw 5,4, 5,5, 5,6, 6,4, 6,5, 6,6, 7,4, 7,5, 7,6, 8,4
  dw 8,5, 8,6, 5,3, 6,3, 7,3, 8,3, 5,7, 6,7, 7,7, 8,7
  dw 5,2, 6,2, 7,2, 8,2, 5,8, 6,8, 7,8, 8,8, 5,1, 6,1

; -- Synthetic Tier-1 encounter fixture (encounter "1")
;  Commit-safe, hand-authored (NOT derived from copyrighted game data).  Two
;  party fighters vs three goblin-ish foes, all placed already in melee reach on
;  a flat open grid so Tier-1 needs no movement.  Initiative left UNSET (0xFFFF)
;  so each is seeded by die(10) in array order pre-round-1 (exercises seeding).
;  Layout (col,row), reach=1 Chebyshev keeps everyone mutually adjacent:
;     p0(4,5) p1(4,6)   e0(5,5) e1(5,6) e2(5,4)
;  Stats are arbitrary but chosen to last several rounds and trigger the common
;  downed/unconscious branch of applyHpLoss.
;
;  Record fields: side,ord, hp,maxhp, thac0,ac, dcount,dsides,dbonus, xp,
;                 init(0xFFFF), flags, col, row, size, move, missileRange, ammo,
;                 attacks, halfAttacks
align 2
fixture1:
  ; p0: party fighter
  db 0,0
  dw 14,14, 15,5, 1,8,1, 0, 0FFFFh, 0, 4,5, 1, DEFAULT_MOVE_CELLS, 0,0, 1,0
  ; p1: party fighter
  db 0,1
  dw 12,12, 16,6, 1,6,2, 0, 0FFFFh, 0, 4,6, 1, DEFAULT_MOVE_CELLS, 0,0, 1,0
  ; e0: foe
  db 1,0
  dw 7,7, 18,7, 1,6,0, 15, 0FFFFh, 0, 5,5, 1, DEFAULT_MOVE_CELLS, 0,0, 1,0
  ; e1: foe
  db 1,1
  dw 5,5, 18,7, 1,6,0, 15, 0FFFFh, 0, 5,6, 1, DEFAULT_MOVE_CELLS, 0,0, 1,0
  ; e2: foe
  db 1,2
  dw 9,9, 18,8, 1,4,1, 20, 0FFFFh, 0, 5,4, 1, DEFAULT_MOVE_CELLS, 0,0, 1,0
fixture1_n dw 5

; -- Synthetic boundary fixtures (encounters "2" and "3")
; Encounter "2": exact Gen1 overkill boundary.  A 5-HP foe takes 15 damage
; (damage == hp+10) and must be unconscious, not dead.
align 2
fixture2:
  ; p0: fixed-damage striker, explicit init so the first RNG draw is to-hit
  db 0,0
  dw 10,10, 1,10, 1,1,14, 0, 20, 0, 4,5, 1, DEFAULT_MOVE_CELLS, 0,0, 1,0
  ; e0: boundary target
  db 1,0
  dw 5,5, 20,10, 1,1,0, 25, 10, 0, 5,5, 1, DEFAULT_MOVE_CELLS, 0,0, 1,0
fixture2_n dw 2

; Encounter "3": just beyond the boundary.  A 5-HP foe takes 16 damage
; (damage > hp+10) and must be dead.
align 2
fixture3:
  ; p0: fixed-damage striker, explicit init so the first RNG draw is to-hit
  db 0,0
  dw 10,10, 1,10, 1,1,15, 0, 20, 0, 4,5, 1, DEFAULT_MOVE_CELLS, 0,0, 1,0
  ; e0: overkill target
  db 1,0
  dw 5,5, 20,10, 1,1,0, 25, 10, 0, 5,5, 1, DEFAULT_MOVE_CELLS, 0,0, 1,0
fixture3_n dw 2

; Encounter "5": reuses fixture3 under RULE_GEN2, where the same overkill
; blow leaves the target unconscious because DQK lacks the Gen1 +10 death rule.

; Encounter "4": Large-footprint reach.  p0 is two origin cells east of e0,
; but adjacent to e0's occupied 2x2 footprint, so footprint-aware reach must
; allow the melee swing while origin-to-origin Chebyshev would not.
align 2
fixture4:
  ; p0: fixed-damage striker, explicit init so the first RNG draw is to-hit
  db 0,0
  dw 10,10, 1,10, 1,1,3, 0, 20, 0, 7,4, 1, DEFAULT_MOVE_CELLS, 0,0, 1,0
  ; e0: Large target occupying cols 5..6, rows 4..5
  db 1,0
  dw 4,4, 20,10, 1,1,0, 25, 10, 0, 5,4, 2, DEFAULT_MOVE_CELLS, 0,0, 1,0
fixture4_n dw 2

; Encounter "6": Large-footprint close step.  p0 starts out of reach, moves one
; cell east as a 2x2 footprint, then reaches and drops e0 in the same turn.
align 2
fixture6:
  ; p0: Large fixed-damage striker, explicit init so the first RNG draw is to-hit
  db 0,0
  dw 10,10, 1,10, 1,1,3, 0, 20, 0, 2,4, 2, DEFAULT_MOVE_CELLS, 0,0, 1,0
  ; e0: target two cells beyond p0's starting eastern footprint edge
  db 1,0
  dw 4,4, 20,10, 1,1,0, 25, 10, 0, 5,4, 1, DEFAULT_MOVE_CELLS, 0,0, 1,0
fixture6_n dw 2

; Encounter "7": default open-grid movement allowance.  p0 starts four
; orthogonal steps from melee, spends the whole Tier-1 fallback, then attacks.
align 2
fixture7:
  ; p0: fixed-damage striker, explicit init so the first RNG draw is to-hit
  db 0,0
  dw 10,10, 1,10, 1,1,3, 0, 20, 0, 1,4, 1, DEFAULT_MOVE_CELLS, 0,0, 1,0
  ; e0: target just beyond the budget endpoint's reach
  db 1,0
  dw 4,4, 20,10, 1,1,0, 25, 10, 0, 6,4, 1, DEFAULT_MOVE_CELLS, 0,0, 1,0
fixture7_n dw 2

; Encounter "8": routed open-grid close.  p1 blocks p0's direct eastward
; approach, but p0 can still spend its movement allowance to route around p1 and
; reach melee this turn.
align 2
fixture8:
  ; p0: fixed-damage striker, explicit init so the first RNG draw is to-hit
  db 0,0
  dw 10,10, 1,10, 1,1,3, 0, 20, 0, 1,4, 1, DEFAULT_MOVE_CELLS, 0,0, 1,0
  ; p1: living party blocker directly on the old greedy path
  db 0,1
  dw 10,10, 20,10, 1,1,0, 0, 10, 0, 2,4, 1, DEFAULT_MOVE_CELLS, 0,0, 1,0
  ; e0: target behind the blocker
  db 1,0
  dw 4,4, 20,10, 1,1,0, 25, 5, 0, 4,4, 1, DEFAULT_MOVE_CELLS, 0,0, 1,0
fixture8_n dw 3

; Encounter "9": terrain blocked cells.  A wall column at x=2 separates p0 and
; e0. Respecting terrain means neither side can close, so the battle hits the
; round cap as a draw; ignoring terrain would let p0 step east and attack.
align 2
fixture9:
  ; p0: fixed-damage striker, explicit init so no RNG is spent unless a bad move reaches melee
  db 0,0
  dw 10,10, 1,10, 1,1,3, 0, 20, 0, 1,4, 1, DEFAULT_MOVE_CELLS, 0,0, 1,0
  ; e0: target immediately behind the blocked terrain column
  db 1,0
  dw 4,4, 20,10, 1,1,0, 25, 10, 0, 3,4, 1, DEFAULT_MOVE_CELLS, 0,0, 1,0
fixture9_n dw 2
fixture9_terrain:
  dw 2,0, 2,1, 2,2, 2,3, 2,4, 2,5, 2,6, 2,7, 2,8, 2,9
fixture9_terrain_n dw 10

; Encounter "10": terrain movement cost.  Cell (2,4) costs 4 terrain units.
; p0 can enter it but cannot also close to melee in the same default allowance.
align 2
fixture10:
  ; p0: fixed-damage striker; if terrain cost were ignored it would attack in round 1
  db 0,0
  dw 10,10, 1,10, 1,1,3, 0, 20, 0, 1,4, 1, DEFAULT_MOVE_CELLS, 0,0, 1,0
  ; e0: weak target just beyond the expensive approach cell
  db 1,0
  dw 4,4, 20,10, 1,1,0, 25, 10, 0, 4,4, 1, DEFAULT_MOVE_CELLS, 0,0, 1,0
fixture10_n dw 2
fixture10_terrain:
  dw 1,3, 1,5, 2,3, 2,5, 3,3, 3,5
fixture10_terrain_n dw 6
fixture10_cost:
  dw 2,4,4
fixture10_cost_n dw 1

; Encounter "11": per-combatant movement allowance.  p0 has move=1 and e0 is
; immobile, so p0 advances one orthogonal cell per round before attacking.
align 2
fixture11:
  ; p0: fixed-damage striker, explicit init so the first RNG draw is to-hit
  db 0,0
  dw 10,10, 1,10, 1,1,3, 0, 20, 0, 1,4, 1, 1, 0,0, 1,0
  ; e0: immobile target
  db 1,0
  dw 4,4, 20,10, 1,1,0, 25, 10, 0, 6,4, 1, 0, 0,0, 1,0
fixture11_n dw 2

; Encounter "12": finite-ammo missile fire.  p0 starts four cells away with a
; clear line and no movement allowance; a melee-only engine would stalemate.
align 2
fixture12:
  ; p0: fixed-damage archer, explicit init so the first RNG draw is to-hit
  db 0,0
  dw 10,10, 1,10, 1,1,3, 0, 20, 0, 1,1, 1, 0, 8,1, 1,0
  ; e0: target at range 4
  db 1,0
  dw 4,4, 20,10, 1,1,0, 25, 10, 0, 5,1, 1, 0, 0,0, 1,0
fixture12_n dw 2

; Encounter "13": a living body blocks the missile line from p0 to e0.
align 2
fixture13:
  ; p0: archer with no move, cannot shoot through p1
  db 0,0
  dw 10,10, 1,10, 1,1,3, 0, 20, 0, 1,1, 1, 0, 8,1, 1,0
  ; p1: intervening body
  db 0,1
  dw 10,10, 20,10, 1,1,0, 0, 15, 0, 3,1, 1, 0, 0,0, 1,0
  ; e0: target beyond the blocker
  db 1,0
  dw 4,4, 20,10, 1,1,0, 25, 10, 0, 5,1, 1, 0, 0,0, 1,0
fixture13_n dw 3

; Encounter "14": synthetic terrain blocks fixture12's missile line from p0 to e0.
align 2
fixture14_terrain:
  dw 3,1
fixture14_terrain_n dw 1

; Encounters "15".."17": missile range-band to-hit modifiers.  All use range 9
; and base needed 10 against AC 0, producing short=9, medium=10, long=12.
align 2
fixture15:
  ; p0: range-9 archer, target at distance 3 => short bracket
  db 0,0
  dw 10,10, 10,0, 1,1,3, 0, 20, 0, 1,1, 1, 0, 9,1, 1,0
  db 1,0
  dw 4,4, 20,0, 1,1,3, 25, 10, 0, 4,1, 1, 0, 0,0, 1,0
fixture15_n dw 2

align 2
fixture16:
  ; p0: range-9 archer, target at distance 4 => medium bracket
  db 0,0
  dw 10,10, 10,0, 1,1,3, 0, 20, 0, 1,1, 1, 0, 9,1, 1,0
  db 1,0
  dw 4,4, 20,0, 1,1,3, 25, 10, 0, 5,1, 1, 0, 0,0, 1,0
fixture16_n dw 2

align 2
fixture17:
  ; p0: range-9 archer, target at distance 7 => long bracket
  db 0,0
  dw 10,10, 10,0, 1,1,3, 0, 20, 0, 1,1, 1, 0, 9,1, 1,0
  db 1,0
  dw 4,4, 20,0, 1,1,3, 25, 10, 0, 8,1, 1, 0, 0,0, 1,0
fixture17_n dw 2

; Encounter "18": a Large target can be shot through any clear target footprint
; cell.  Terrain blocks the anchor-to-anchor line at (4,1), but the line to the
; target's lower-left cell is clear.
align 2
fixture18:
  db 0,0
  dw 10,10, 1,10, 1,1,3, 0, 20, 0, 1,1, 1, 0, 8,1, 1,0
  db 1,0
  dw 4,4, 20,10, 1,1,0, 25, 10, 0, 5,1, 2, 0, 0,0, 1,0
fixture18_n dw 2
fixture18_terrain:
  dw 4,1
fixture18_terrain_n dw 1

; Encounter "19": a Large shooter can fire from any clear shooter footprint
; cell.  Terrain blocks its anchor-to-anchor line, but the lower-right shooter
; cell has a clear line to the target.
align 2
fixture19:
  db 0,0
  dw 10,10, 1,10, 1,1,3, 0, 20, 0, 1,1, 2, 0, 8,1, 1,0
  db 1,0
  dw 4,4, 20,10, 1,1,0, 25, 10, 0, 5,1, 1, 0, 0,0, 1,0
fixture19_n dw 2
fixture19_terrain:
  dw 3,1
fixture19_terrain_n dw 1

; Encounter "20": a Large target still cannot be shot when every
; fixture18 footprint-to-footprint line is blocked by terrain.
align 2
fixture20_terrain:
  dw 4,1, 4,2
fixture20_terrain_n dw 2

; Encounter "21": decoded morale personal break.  e0 has morale 30% and drops
; from 20 HP to 4 HP (80% lost), so it becomes feared and routs on its turn.
align 2
fixture21:
  db 0,0
  dw 10,10, 1,10, 1,1,15, 0, 20, 0, 7,5, 1, 0, 0,0, 1,0
  db 1,0
  dw 20,20, 20,10, 1,1,0, 0, 1, 1F00h, 8,5, 1, 1, 0,0, 1,0
fixture21_n dw 2

; Encounter "22": decoded morale side-collapse surrender.  e1 is slain; e0 is
; personally sound but its morale 50% is below the enemy side's 75% HP loss.
align 2
fixture22:
  db 0,0
  dw 10,10, 1,10, 1,1,99, 0, 20, 0, 5,5, 1, 0, 0,0, 1,0
  db 1,0
  dw 20,20, 20,10, 1,1,0, 0, 1, 3300h, 1,1, 1, 0, 0,0, 1,0
  db 1,1
  dw 1,60, 20,10, 1,1,0, 0, 1, 3300h, 6,5, 1, 0, 0,0, 1,0
fixture22_n dw 3

; Encounter "23": a routed actor leaves p0's melee reach on its first flee
; step. The reaction must be traced before the destination commit, and a
; no-save hold hazard on that destination must stop the flee immediately.
align 2
fixture23:
  db 0,0
  dw 10,10, 20,10, 1,1,0, 0, 1, 0, 4,5, 1, 0, 0,0, 1,0
  db 1,0
  dw 8,8, 20,10, 1,1,0, 0, 20, CF_FEARED, 5,5, 1, 1, 0,0, 1,0
fixture23_n dw 2
fixture23_hazard:
  dw 6,5, 0,0,0, HAZ_STATUS_HELD,0,0
fixture23_hazard_n dw 1

; Encounter "24": party-wide flee succeeds because p0 can reach the border.
align 2
fixture24:
  db 0,0
  dw 10,10, 20,10, 1,1,0, 0, 20, 0, 5,5, 1, DEFAULT_MOVE_CELLS, 0,0, 1,0
  db 1,0
  dw 8,8, 20,10, 1,1,0, 0, 10, 0, 1,1, 1, 0, 0,0, 1,0
fixture24_n dw 2

; Encounter "25": party-wide flee is blocked because p0 is not on an edge and
; has no movement allowance; after the failed attempt, normal combat resumes.
align 2
fixture25:
  db 0,0
  dw 10,10, 1,10, 1,1,3, 0, 20, 0, 5,5, 1, 0, 0,0, 1,0
  db 1,0
  dw 4,4, 20,10, 1,1,0, 25, 10, 0, 6,5, 1, 0, 0,0, 1,0
fixture25_n dw 2

; Encounter "26": a figure starting its turn on a hazard takes damage before
; it acts, then continues if still active.  Uses fixture25's combatants.
align 2
fixture26_hazard:
  dw 5,5, 1,1,1, HAZ_STATUS_NONE,0,0
fixture26_hazard_n dw 1

; Encounter "27": a no-save hold hazard stops a figure immediately after its
; movement reaches the cell, before the melee attack that movement enabled.
align 2
fixture27:
  db 0,0
  dw 10,10, 1,10, 1,1,3, 0, 20, 0, 1,4, 1, 1, 0,0, 1,0
  db 1,0
  dw 4,4, 20,10, 1,1,0, 25, 10, 0, 3,4, 1, 0, 0,0, 1,0
fixture27_n dw 2
fixture27_hazard:
  dw 2,4, 1,1,1, HAZ_STATUS_HELD,0,0
fixture27_hazard_n dw 1

; Encounter "28": an actor with no immediate action readies guard; a foe that
; moves into reach triggers the reaction before taking its own attack.
align 2
fixture28:
  db 0,0
  dw 10,10, 1,10, 1,1,3, 0, 20, 0, 3,5, 1, 0, 0,0, 1,0
  db 1,0
  dw 4,4, 20,10, 1,1,0, 25, 10, 0, 5,5, 1, 1, 0,0, 1,0
fixture28_n dw 2

; Encounter "29": a status hazard with no save data inflicts fear before action.
; p0 starts on the edge, so the forced flee immediately removes the party.
align 2
fixture29:
  db 0,0
  dw 10,10, 1,10, 1,1,3, 0, 20, 0, 0,5, 1, 0, 0,0, 1,0
  db 1,0
  dw 4,4, 20,10, 1,1,0, 25, 10, 0, 9,5, 1, 0, 0,0, 1,0
fixture29_n dw 2
fixture29_hazard:
  dw 0,5, 0,0,0, HAZ_STATUS_FEARED,0,0
fixture29_hazard_n dw 1

; Encounter "30": the same status hazard with a save target.  The first d20
; after seed 4660 is 12, so save target 1 proves the successful-save path.
; Uses fixture25's combatants.
align 2
fixture30_hazard:
  dw 5,5, 0,0,0, HAZ_STATUS_FEARED,1,0
fixture30_hazard_n dw 1

; Encounter "31": a held actor remains active for side counts but skips its
; turn, letting the enemy act before it can make the otherwise-lethal swing.
align 2
fixture31:
  db 0,0
  dw 4,4, 1,10, 1,1,3, 0, 20, 0, 5,5, 1, 0, 0,0, 1,0
  db 1,0
  dw 10,10, 1,10, 1,1,3, 25, 10, 0, 6,5, 1, 0, 0,0, 1,0
fixture31_n dw 2
fixture31_hazard:
  dw 5,5, 0,0,0, HAZ_STATUS_HELD,0,0
fixture31_hazard_n dw 1

; Encounter "32": a held readied guard is still active but cannot react when a
; foe moves into reach.
align 2
fixture32:
  db 0,0
  dw 4,4, 1,10, 1,1,3, 0, 10, CF_GUARDING | CF_HELD, 3,5, 1, 0, 0,0, 1,0
  db 1,0
  dw 10,10, 1,10, 1,1,3, 25, 20, 0, 5,5, 1, 1, 0,0, 1,0
fixture32_n dw 2

; Encounter "33": a seeded held status with a timer skips two turns, expires
; before round 3 order, then lets the actor move and attack.
align 2
fixture33:
  db 0,0
  dw 10,10, 1,10, 1,1,3, 0, 20, CF_HELD, 1,4, 1, 4, 0,0, 1,0
  db 1,0
  dw 4,4, 20,10, 1,1,0, 25, 10, 0, 6,4, 1, 0, 0,0, 1,0
fixture33_n dw 2

; Encounter "34": a helpless held target is auto-hit and coup-de-graced even
; when the natural roll would miss the target number.
align 2
fixture34:
  db 0,0
  dw 10,10, 30,0, 1,1,0, 0, 20, 0, 5,5, 1, 0, 0,0, 1,0
  db 1,0
  dw 50,50, 20,0, 1,1,0, 25, 10, CF_HELD, 6,5, 1, 0, 0,0, 1,0
fixture34_n dw 2

; Encounter "35": under Gen2 a helpless asleep target is still auto-hit, but
; not coup-de-graced; a sleeper that survives ordinary damage wakes and acts.
align 2
fixture35:
  db 0,0
  dw 10,10, 30,10, 1,1,0, 0, 20, 0, 5,5, 1, 0, 0,0, 1,0
  db 1,0
  dw 20,20, 1,0, 1,1,9, 25, 10, CF_ASLEEP, 6,5, 1, 0, 0,0, 1,0
fixture35_n dw 2

; Encounter "36": Gen2/DQK diagonal movement costs 3 half-steps. With move=3,
; two diagonals can close from (1,1) to (3,3); Gen1's cost-4 diagonals cannot.
align 2
fixture36:
  db 0,0
  dw 10,10, 1,10, 1,1,3, 0, 20, 0, 1,1, 1, 3, 0,0, 1,0
  db 1,0
  dw 4,4, 20,10, 1,1,0, 25, 10, 0, 4,4, 1, 0, 0,0, 1,0
fixture36_n dw 2

; Encounter "37": missile attacks auto-hit helpless sleeping targets, but they
; never coup-de-grace; ordinary missile damage wakes a survivor.
align 2
fixture37:
  db 0,0
  dw 10,10, 30,10, 1,1,0, 0, 20, 0, 1,1, 1, 0, 8,1, 1,0
  db 1,0
  dw 20,20, 1,0, 1,1,9, 25, 10, CF_ASLEEP, 5,1, 1, 0, 8,1, 1,0
fixture37_n dw 2

; Encounter "38": integer attacks-per-round.  p0 gets three melee swings in
; one action and drops a 3-HP foe before it can act.
align 2
fixture38:
  db 0,0
  dw 10,10, 1,10, 1,1,0, 0, 20, 0, 5,5, 1, 0, 0,0, 3,0
  db 1,0
  dw 3,3, 20,10, 1,1,0, 25, 10, 0, 6,5, 1, 0, 0,0, 1,0
fixture38_n dw 2

; Encounter "39": half-attacks.  p0 has halfAttacks=3, so it fires two shots on
; odd rounds and one shot on even rounds (2,1,2,1...).
align 2
fixture39:
  db 0,0
  dw 10,10, 1,10, 1,1,0, 0, 20, 0, 1,1, 1, 0, 8,3, 1,3
  db 1,0
  dw 3,3, 20,10, 1,1,0, 25, 10, 0, 5,1, 1, 0, 0,0, 1,0
fixture39_n dw 2

; Encounter "40": the retail back attack.  p0 starts ADJACENT to e0 with a
; three-square allowance; e0 is immobile so it cannot follow, and its THAC0 of
; 1 against AC 10 needs -9, so it hits on everything but a natural 1 -- the
; reaction is therefore visible in the trace rather than probabilistic.  p0
; wins initiative 20 to 1, so round 1 opens with p0's turn and any attack line
; by e0 inside that turn can only be a reaction.
;
; Driven by two tapes over the SAME fixture and seed, which is what isolates
; the mechanic: "M4D..." walks one square west and must produce an e0 attack
; line IMMEDIATELY BEFORE p0's move line, while "G..." never moves and must
; produce no move line at all.  Deleting trigger_leaving_reactions removes that
; adjacency and turns the paired assertion red.
align 2
fixture40:
  ; p0: mover, adjacent to e0 at (5,4), allowance 3
  db 0,0
  dw 30,30, 20,10, 1,1,0, 0, 20, 0, 5,4, 1, 3, 0,0, 1,0
  ; e0: immobile reactor at (6,4), always-hits THAC0
  db 1,0
  dw 30,30, 1,10, 1,1,0, 25, 1, 0, 6,4, 1, 0, 0,0, 1,0
fixture40_n dw 2

; Encounter "41": the diagonal step costs more than the orthogonal one.
; p0 has movement 6, so a budget of 12 half-squares: 6 orthogonal steps at 2,
; but only 4 diagonal steps at 3.  That difference is the whole point -- an
; orthogonal walk CANNOT discriminate the cost models, because a budget of
; move*2 charged 2 per step and a budget of move charged 1 per step allow the
; same 6 steps.  Only the diagonal separates them: 4 steps under the measured
; model against 6 under the old one.
; e0 is parked far away, immobile, and dies to one hit so the battle ends
; quickly instead of grinding to the round cap.
align 2
fixture41:
  ; p0: movement 6 at (8,1), damage 10 so the cleanup is one swing
  db 0,0
  dw 40,40, 5,10, 1,1,9, 0, 20, 0, 8,1, 1, 6, 0,0, 1,0
  ; e0: immobile, 3 hp, far corner
  db 1,0
  dw 3,3, 20,10, 1,1,0, 25, 1, 0, 1,8, 1, 0, 0,0, 1,0
fixture41_n dw 2

; Encounter "42": an unaffordable step is REFUSED, not overdrawn.
; p0 has movement 4, so a budget of 8 half-squares.  Diagonal steps cost 3:
; two of them leave 2, and the third cannot be paid for.  Retail prints
; "can't go there" and takes TWO steps; charging first and letting the budget
; run negative takes THREE.  That one-step difference is the whole fixture.
align 2
fixture42:
  ; p0: movement 4 at (8,1)
  db 0,0
  dw 40,40, 5,10, 1,1,9, 0, 20, 0, 8,1, 1, 4, 0,0, 1,0
  ; e0: immobile, far corner, never reached by the walk
  db 1,0
  dw 3,3, 20,10, 1,1,0, 25, 1, 0, 1,8, 1, 0, 0,0, 1,0
fixture42_n dw 2

; Encounter "43": a bump attack that KILLS leaves move mode open.
; p0 has two attacks and kills e0 in one swing (THAC0 1 against AC 10 always
; hits; 1d1+9 against 3 hp always kills).  One attack is spent, one remains,
; so retail's turnComplete stays false and the walk continues -- the tape then
; steps west and that move line is the evidence.  e1 sits far away and
; immobile purely so the battle does not end on e0's death.
align 2
fixture43:
  ; p0: two attacks, THAC0 1, 10 damage, at (5,4), movement 5
  db 0,0
  dw 40,40, 1,10, 1,1,9, 0, 20, 0, 5,4, 1, 5, 0,0, 2,0
  ; e0: 3 hp, immobile, adjacent east at (6,4)
  db 1,0
  dw 3,3, 20,10, 1,1,0, 25, 1, 0, 6,4, 1, 0, 0,0, 1,0
  ; e1: keeps the battle alive, far away and immobile
  db 1,1
  dw 30,30, 20,10, 1,1,0, 25, 1, 0, 9,9, 1, 0, 0,0, 1,0
fixture43_n dw 3

; Encounter "44": the control for 43 -- a bump attack on a target that
; SURVIVES drains every remaining attack and then ends the turn.
; Identical to 43 except e0 has 100 hp, so the same two-attack p0 spends both
; swings and never gets to move.  Two attack lines and no move line.
align 2
fixture44:
  db 0,0
  dw 40,40, 1,10, 1,1,9, 0, 20, 0, 5,4, 1, 5, 0,0, 2,0
  ; e0: 100 hp, immobile, adjacent east -- survives both swings
  db 1,0
  dw 100,100, 20,10, 1,1,0, 25, 1, 0, 6,4, 1, 0, 0,0, 1,0
  db 1,1
  dw 30,30, 20,10, 1,1,0, 25, 1, 0, 9,9, 1, 0, 0,0, 1,0
fixture44_n dw 3

; Encounter "45": bounded player-turn control. p0 has four squares of
; movement, but the tape splits it across two move commands. e0 is adjacent at
; the final legal square and kills p0 after End, so a correct run is short.
; Reinitializing movement on the second M reaches and attacks e0 instead.
align 2
fixture45:
  ; p0: starts at (8,4), can spend exactly four westward squares to (4,4)
  db 0,0
  dw 20,20, 5,10, 1,1,9, 0, 20, 0, 8,4, 1, 4, 0,0, 1,0
  ; e0: adjacent at (3,4), one deterministic lethal melee attack
  db 1,0
  dw 3,3, 1,10, 1,1,39, 25, 1, 0, 3,4, 1, 0, 0,0, 1,0
fixture45_n dw 2

; Encounter "46": Quick must inherit movement already spent in Move mode.
; p0 spends two squares (8,4 -> 6,4), then Quick has only two squares left.
; The target at (0,4) makes the distinction visible: carried Quick ends at
; (4,4), whereas a fresh C_MOVE 4 allowance ends at (2,4).
align 2
fixture46:
  db 0,0
  dw 20,20, 5,10, 1,1,9, 0, 20, 0, 8,4, 1, 4, 0,0, 1,0
  db 1,0
  dw 30,30, 20,10, 0,0,0, 25, 1, 0, 0,4, 1, 0, 0,0, 1,0
fixture46_n dw 2

; Encounter "47": Delay must carry the same movement ledger to the rotated
; order slot.  Four total westward squares reach (4,4); a reset reaches e0.
align 2
fixture47:
  db 0,0
  dw 20,20, 5,10, 1,1,9, 0, 20, 0, 8,4, 1, 4, 0,0, 1,0
  db 1,0
  dw 3,3, 1,10, 1,1,39, 25, 1, 0, 3,4, 1, 0, 0,0, 1,0
fixture47_n dw 2

; Encounter "48": a bump kill spends one of p0's two attacks before Quick.
; Quick may swing once at e1, never refill both attacks from the record.
align 2
fixture48:
  db 0,0
  dw 20,20, 1,10, 1,1,9, 0, 20, 0, 5,4, 1, 4, 0,0, 2,0
  db 1,0
  dw 1,1, 20,10, 1,1,0, 25, 1, 0, 6,4, 1, 0, 0,0, 1,0
  db 1,1
  dw 100,100, 20,10, 1,1,0, 25, 1, 0, 5,5, 1, 0, 0,0, 1,0
fixture48_n dw 3

; ============================================================================
;  BSS-ish mutable state (kept in the .COM image; initialised at runtime)
; ============================================================================
align 2
tmode     db 0
fmode     db 0
vmode     db 0
vfxmode   db 0
emode     db 0
monmode   db 0
monkind   db 0
cmdmode   db 0
combat_ruleset db RULE_GEN1
vrawflag  db 0
encid     times 16 db 0
efxname   times 128 db 0
monname   times 128 db 0
trcname   times 128 db 0
vrawname  times 128 db 0
outcomename times 128 db 0
resultname times 128 db 0
cmdbuf    times 64 db 0
kmode     db 0
rejected_command db 0
saw_keyboard db 0
delay_request db 0
delayed   times MAXCOMB db 0
view_col0 dw 0
view_row0 dw 0
view_rc   dw 0
view_rr   dw 0
; Numeric-keypad direction table, indexed by (key - '1'); index 4 is the centre
; key and is rejected by key_to_delta.  Row 0 of the table is the BOTTOM row of
; the keypad, so dy is +1 there.
numpad_dx dw -1, 0, 1, -1, 0, 1, -1, 0, 1
numpad_dy dw  1, 1, 1,  0, 0, 0, -1, -1, -1
; Extended scan code -> numpad index.  Left/right/up/down plus the four
; diagonals on Home/PgUp/End/PgDn.
arrowtab  db 4Bh,3, 4Dh,5, 48h,7, 50h,1, 47h,6, 49h,8, 4Fh,0, 51h,2
cmdbar_tbl dw s_cmd_move, s_cmd_aim, s_cmd_guard, s_cmd_delay
           dw s_cmd_quick, s_cmd_flee, s_cmd_party, s_cmd_end
cmd_index dw 0
seed      dw 0
outcome_code db 0
party_fled_flag dw 0
party_flee_seen dw 0
party_flee_escaped dw 0
round     dw 0
ncomb     dw 0
order_n   dw 0
cur_idx   dw 0
cur_ptr   dw 0
tgt_idx   dw 0
tgt_ptr   dw 0
foe_side  db 0
cand_dist dw 0
best_dist dw 0
rt_cnt    dw 0
rt_k      dw 0
rt_pass   dw 0
attack_missile db 0
back_attack db 0
leave_save_col dw 0
leave_save_row dw 0
attack_secondary db 0
quick_budget_active db 0
missile_dist dw 0
flee_dest_flag dw 0
flee_dest_col dw 0
flee_dest_row dw 0
move_dx   dw 0
move_dy   dw 0
move_left dw 0
move_cost_cur dw 0
player_attacks_left dw 0
player_budget_live times MAXCOMB db 0
align 2
player_move_budget times MAXCOMB dw 0
player_attack_budget times MAXCOMB dw 0
move_moved dw 0
move_budget dw 0
move_rank_next dw 0
move_step_cost dw 0
move_new_col dw 0
move_new_row dw 0
move_size dw 0
move_xmax dw 0
move_ymax dw 0
other_col dw 0
other_row dw 0
other_size dw 0
other_xmax dw 0
other_ymax dw 0
terrain_i dw 0
terrain_block_count dw 0
terrain_cost_count dw 0
hazard_count dw 0
guard_ai_enabled dw 0
leave_i   dw 0
leave_mover_ptr dw 0
leave_mover_idx dw 0
guard_i   dw 0
guard_mover_ptr dw 0
guard_mover_idx dw 0
hazard_dcount dw 0
hazard_dsides dw 0
hazard_dbonus dw 0
hazard_status dw 0
hazard_save_target dw 0
hazard_save_roll dw 0
hazard_saved dw 0
hazard_rounds dw 0
status_i  dw 0
status_kind_cur dw 0
fixture_status_seed_idx dw 0
fixture_status_seed_kind dw 0
fixture_status_seed_timer dw 0
morale_score dw 0
morale_personal_pct dw 0
morale_side_pct dw 0
morale_cur_sum dw 0
morale_max_sum dw 0
route_i   dw 0
route_pass dw 0
route_changed dw 0
route_cost dw 0
route_new_cost dw 0
route_col dw 0
route_row dw 0
route_orig_col dw 0
route_orig_row dw 0
route_best_idx dw 0
route_best_dist dw 0
route_best_rank dw 0
route_best_col dw 0
route_best_row dw 0
los_target_ptr dw 0
los_from_col dw 0
los_from_row dw 0
los_from_size dw 0
los_from_dx dw 0
los_from_dy dw 0
los_to_col dw 0
los_to_row dw 0
los_to_size dw 0
los_to_dx dw 0
los_to_dy dw 0
los_cx    dw 0
los_cy    dw 0
los_tx    dw 0
los_ty    dw 0
los_dx    dw 0
los_dy    dw 0
los_sx    dw 0
los_sy    dw 0
los_err   dw 0
los_count dw 0
los_tmp   dw 0
n_party   dw 0
n_enemy   dw 0
xp_awarded dw 0
hp_before dw 0
trcfh     dw 0
outfh     dw 0
resultfh  dw 0
infh      dw 0
fx_group_count dw 0
fx_group_idx dw 0
; Packed low-nibble DUNGCOM / high-nibble WILDCOM group ordinals, 0=none.
combat_hlib_groups dw 0
dqk_combat_group_pairs db 0,11h,22h,03h,34h,41h,05h
fx_monster dw 0
fx_copies dw 0
fx_pic    dw 0
icon_seg  dw 0
daxseg    dw 0
icon_len  dw 0
icon_next dw 0
icon_digitp dw 0
icon_block dw 0
icon_base dw 0
icon_width dw 0
icon_height dw 0
icon_npix dw 0
icon_dstx dw 0
icon_dsty dw 0
icon_dstsize dw 0
icon_dx dw 0
icon_dy dw 0
icon_srcrow dw 0
icon_valid db 0
icon_count db 0
icon_blocks times ICONCAP dw 0
icon_bases times ICONCAP dw 0
icon_widths times ICONCAP dw 0
icon_heights times ICONCAP dw 0
icon_npixels times ICONCAP dw 0
effect_enemy_ord dw 0
dax_len   dw 0
dax_toc_bytes dw 0
dax_count dw 0
dax_data_base dw 0
dax_src   dw 0
dax_src_hi dw 0
dax_comp  dw 0
dax_toc_read_len dw 0
want_mon  dw 0
mon_raw_size dw 0
glb_decl_len dw 0   ; §29: the u16be uncompressed length a MONCHA member declares
hlib_ptr_count dw 0
hlib_mem_start dw 0
hlib_mem_end dw 0
hlib_src  dw 0
mon_glib  db 0
mon_record_loaded db 0
mon_id_count dw 0

; build_encounter id table: dw id chars 0..1, db id char 2 (0 for a two-char id),
; db kind (0 plain; type<<4|enc_spec row: 1 terrain, 2 hazard, 3 guard AI,
; 4 Gen2 ruleset, 5 held-status seed, 6 terrain+cost), dw fixture, dw count word.
%macro ENC 4
        db %1, %2, 0, %3
        dw %4, %4 %+ _n
%endmacro
%macro SPEC 1
        dw %1 %+ _n, %1
%endmacro
enc_table:
        ENC '2', 0, 0, fixture2
        ENC '3', 0, 0, fixture3
        ENC '4', 0, 0, fixture4
        ENC '5', 0, 40h, fixture3
        ENC '6', 0, 0, fixture6
        ENC '7', 0, 0, fixture7
        ENC '8', 0, 0, fixture8
        ENC '9', 0, 10h, fixture9
        ENC '1', '0', 061h, fixture10
        ENC '1', '1', 000h, fixture11
        ENC '1', '2', 000h, fixture12
        ENC '1', '3', 000h, fixture13
        ENC '1', '4', 012h, fixture12
        ENC '1', '5', 000h, fixture15
        ENC '1', '6', 000h, fixture16
        ENC '1', '7', 000h, fixture17
        ENC '1', '8', 013h, fixture18
        ENC '1', '9', 014h, fixture19
        ENC '2', '0', 015h, fixture18
        ENC '2', '1', 000h, fixture21
        ENC '2', '2', 000h, fixture22
        ENC '2', '3', 026h, fixture23
        ENC '2', '4', 000h, fixture24
        ENC '2', '5', 000h, fixture25
        ENC '2', '6', 027h, fixture25
        ENC '2', '7', 028h, fixture27
        ENC '2', '8', 030h, fixture28
        ENC '2', '9', 029h, fixture29
        ENC '3', '0', 02Ah, fixture25
        ENC '3', '1', 02Bh, fixture31
        ENC '3', '2', 000h, fixture32
        ENC '3', '3', 050h, fixture33
        ENC '3', '4', 000h, fixture34
        ENC '3', '5', 040h, fixture35
        ENC '3', '6', 040h, fixture36
        ENC '3', '7', 000h, fixture37
        ENC '3', '8', 000h, fixture38
        ENC '3', '9', 000h, fixture39
        ENC '4', '0', 000h, fixture40
        ENC '4', '1', 000h, fixture41
        ENC '4', '2', 000h, fixture42
        ENC '4', '3', 000h, fixture43
        ENC '4', '4', 000h, fixture44
        ENC '4', '5', 000h, fixture45
        ENC '4', '6', 000h, fixture46
        ENC '4', '7', 000h, fixture47
        ENC '4', '8', 000h, fixture48
        dw 0
enc_spec:
        SPEC fixture9_terrain
        SPEC fixture10_terrain
        SPEC fixture14_terrain
        SPEC fixture18_terrain
        SPEC fixture19_terrain
        SPEC fixture20_terrain
        SPEC fixture23_hazard
        SPEC fixture26_hazard
        SPEC fixture27_hazard
        SPEC fixture29_hazard
        SPEC fixture30_hazard
        SPEC fixture31_hazard
hlib_runval db 0
view_i    dw 0
rect_x    dw 0
rect_y    dw 0
rect_w    dw 0
rect_h    dw 0
rect_color db 0

; resolve_hit scratch / current-event fields
r_roll    dw 0
r_needed  dw 0
r_hit     dw 0
r_dmg     dw 0
r_hpafter dw 0
r_dead    dw 0

align 4
rng_state dd 0

rawhdr    dw 320, 200
combat_pal:
          db 0,0,0, 0,0,42, 0,42,0, 0,42,42
          db 42,0,0, 42,0,42, 42,21,0, 42,42,42
          db 21,21,21, 21,21,63, 21,63,21, 21,63,63
          db 63,21,21, 63,21,63, 63,63,21, 63,63,63
          times 720 db 0
fxbuf     times GBEF_LEN db 0
wallbuf   times WALLBUF_LEN db 0
wall_dotp dw 0
iconname  times 128 db 0
monraw    times MON_RAW_MAX db 0
order     times MAXCOMB dw 0
sec_dcount times MAXCOMB dw 0
sec_dsides times MAXCOMB dw 0
sec_dbonus times MAXCOMB dw 0
combat_pic times MAXCOMB dw 0
comb      times (MAXCOMB * C_REC) db 0
dok_dex   times MAXCOMB db 0
move_dist times (COMBAT_GRID_W * COMBAT_GRID_H) db 0
move_rank times (COMBAT_GRID_W * COMBAT_GRID_H) db 0
terrain_blocks times (MAX_TERRAIN_BLOCKS * 2) dw 0
terrain_costs times (MAX_TERRAIN_COSTS * 3) dw 0
hazard_cells times (MAX_HAZARDS * HAZ_WORDS) dw 0
status_timer times MAXCOMB dw 0
status_kind times MAXCOMB dw 0
linebuf   times 128 db 0
route_prev times COMBAT_GRID_W*COMBAT_GRID_H db 0
