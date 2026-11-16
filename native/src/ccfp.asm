; ============================================================================
;  CCFP.COM  --  first-person dungeon viewer (older Gold Box / CoK geometry).
;
;    CCFP <walls.bin> [px py facing] [/P] [/T] [/A n] [/E effects.bin]
;
;  Renders the classic Gold Box first-person dungeon viewport (the receding
;  stone corridor) in VGA mode 13h.  This is a 1:1 clean-room port of the COAB
;  cell-walk that the TS engine implements and the project has already VERIFIED:
;    packages/engine/src/world/wallview.ts   (planWallView / drawFar/Mid/Near)
;    packages/engine/src/world/wallpieces.ts (PIECES geometry, pieceRect)
;  Two render modes:
;    default  -- FLAT outlines, one colour per piece (painter order far->near);
;                proves the geometry without near panels blotting the view.
;    /T       -- TEXTURED: blits the real 8X8D wall tiles (WALLDEF -> routeTileId
;                -> keyed 8x8 blit), matching the engine oracle fp_cok_best.png.
;                SELF-CONTAINED: build_tables decodes 8X8Dn.DAX + WALLDEFn.DAX in
;                asm and reproduces the engine's RESOLVE table + deduped tile pool
;                + EGA palette -- no pre-baked BIN files needed. With /E it reads
;                CCECL's GBEF LOAD_PIECES result; without /E it keeps the original
;                CoK block-34 default pieces [3,0xff,23]. Global cap tile sets
;                0xCA/0xCB still load from 8X8D1.DAX, matching the original engine.
;    /A n     -- texture area digit for /T (default 1): opens WALLDEFn/8X8Dn.
;    /R       -- build the in-asm tables and dump RESOLVE.BIN/TILES.BIN/PAL.BIN
;                (byte-exact verification against the engine bake), then exit.
;    /P       -- dump the placement plan to PLAN.TXT and exit (port verification).
;                With /F, appends the selected GBWS image index per piece.
;    /Q       -- GBWS preview mode: render one decoded DQK/FRUA HLIB wall-set
;                bundle (one or more sets) into a mode-13h contact sheet. With /R it
;                dumps GBWVIEW.RAW (u16 320, u16 200, 64000 indices, 768 palette).
;    /F file  -- FIRST-PERSON GBWS preview: use the normal CCFP wall-walk on
;                <walls.bin>, but draw CCHLIB's decoded HLIB wall images instead
;                of EGA WALLDEF tiles. With /R, dumps GBWVIEW.RAW; with /W,
;                enters the same interactive movement loop as the other views.
;    /S [out] -- snapshot the normal first-person framebuffer to CCFPVIEW.RAW
;                or an explicit RAW path.
;                after rendering. When /E carries a v6+ GBSX inline text slot,
;                that text is overlaid in the bottom message band first. Also
;                works with /F, preserving the active GBWS palette. When no
;                script text is present, a v9 GBCL clock tail is shown there as
;                a compact native state line.
;    CCFP <pending-v15.EFX> <answer.GMO> [/S unsigned16] -- the two-path
;                sidecar menu mode uses /S as an explicit automated answer.
;                It pages validated narration without keys, then answers
;                INPUT_NUMBER or PARTY_SURPRISE. ACK always writes its 1/1 token.
;
;  Input <walls.bin> = either a legacy 16x16 raw wall grid, 4 bytes/cell
;  (N,E,S,W slot 0..15), or a WGRD headered CCGEO bridge: magic + W/H, wall
;  cells, optional plane2 backdrop/roof tail, optional plane3 door/gateway tail.
;  Pose defaults to 8 13 4 (the harness' richest corridor view).
;
;  Viewport = EGA dungeon box, screen (8,8)-(176,176) = 168x168; ceiling black
;  (mode-13h cleared), floor dim-grey from screen y=70 (the real horizon).
;
;  Build:  build.ps1 ccfp   (nasm -f bin -> build\ccfp.com)
; ============================================================================
        cpu     386
        bits    16
        org     100h

DAX_FILEMAX equ 60000           ; max DAX file image read into dax_seg
MAX_MAP_CELLS equ 784           ; largest verified GEO map shape: DQK 28x28
WALLBUF_SIZE equ (MAX_MAP_CELLS*4)
GBWS_IMAGE_MAX equ 4096         ; largest verified DQK GBWS image: 56x58
LOADBUF_SIZE equ 8192           ; shared WGRD input / GBWS image scratch
GBWS_WALL_GROUP equ 47
GBWS_WALLSETS equ 3
GBWS_IMAGE_COUNT equ (GBWS_WALL_GROUP*GBWS_WALLSETS)
TILEPOOL_TILE_CAP equ 256       ; original deduped tile-pool reservation
TILESET_TILE_CAP equ 512        ; high-scratch decoded source-tile capacity
SCRIPTCAP equ 64
SCRIPT_TEXT_BYTES equ 32
SCRIPT_TEXT_REC_BYTES equ 34
; The message band is three 39-column text rows, beginning at column 1.
; GBSX remains a fixed 32-byte-per-event transport; this is only CCFP's
; assembled, player-visible page buffer.
SCRIPT_PAGE_BYTES equ 117
MENU_TEXT_CAP equ 128
SX_MAGIC_OFF equ 2246
SX_COUNT_OFF equ 2250
SX_EVENTS_OFF equ 2252
SX_EVENT_BYTES equ 20
SX_TEXT_OFF equ SX_EVENTS_OFF + (SCRIPTCAP * 20)
ES_MAGIC_OFF equ SX_TEXT_OFF + (SCRIPTCAP * SCRIPT_TEXT_REC_BYTES)
ES_SPRITE_OFF equ ES_MAGIC_OFF + 4
ES_MAX_OFF equ ES_MAGIC_OFF + 6
ES_PIC_OFF equ ES_MAGIC_OFF + 8
ES_DIST_OFF equ ES_MAGIC_OFF + 10
CL_MAGIC_OFF equ ES_MAGIC_OFF + 24
CL_SLOTS_OFF equ CL_MAGIC_OFF + 4
RS_AREA_OFF equ 122
RS_PC_OFF equ 124
FX_V9_LEN equ CL_SLOTS_OFF + 14
MN_MAGIC_OFF equ FX_V9_LEN
MN_FLAGS_OFF equ MN_MAGIC_OFF + 4
MN_DEST_OFF equ MN_FLAGS_OFF + 2
MN_COUNT_OFF equ MN_DEST_OFF + 2
MN_OPCODE_OFF equ MN_COUNT_OFF + 2
MN_EVENT_OFF equ MN_OPCODE_OFF + 2
MN_RESERVED_OFF equ MN_EVENT_OFF + 2
MN_ID_PC_OFF equ MN_RESERVED_OFF + 2
MN_ID_AREA_OFF equ MN_ID_PC_OFF + 2
MN_ID_DEST_OFF equ MN_ID_AREA_OFF + 2
MN_ID_OPCODE_OFF equ MN_ID_DEST_OFF + 2
MS_MAGIC_OFF equ MN_ID_OPCODE_OFF + 2
MS_FLAGS_OFF equ MS_MAGIC_OFF + 10
MT_MAGIC_OFF equ MS_FLAGS_OFF + 2
MT_COUNT_OFF equ MT_MAGIC_OFF + 4
MT_DATA_OFF equ MT_COUNT_OFF + 2
FX_V14_LEN equ MT_DATA_OFF + 128
GBRF_MAGIC_OFF equ FX_V14_LEN
GBRF_FLAGS_OFF equ GBRF_MAGIC_OFF + 4
GBRF_RESERVED_OFF equ GBRF_FLAGS_OFF + 6
FX_V15_LEN equ GBRF_RESERVED_OFF + 2
FX_V16_LEN equ 5948
MS_SELECTED_OFF equ MS_MAGIC_OFF+8
SI_MAGIC_OFF equ FX_V15_LEN
SI_FLAGS_OFF equ SI_MAGIC_OFF+8
SI_SELECTED_OFF equ SI_MAGIC_OFF+10
SI_COUNT_OFF equ SI_MAGIC_OFF+12
GBMO_LEN equ 18

        jmp     start

clear_scratch:
        push    ax
        push    cx
        push    di
        push    es
        push    ds
        pop     es
        mov     di, ccfp_bss_start
        mov     cx, CCFP_BSS_LEN
        xor     ax, ax
        rep     stosb
        pop     es
        pop     di
        pop     cx
        pop     ax
        ret

start:
        cld
        call    clear_scratch
        ; Scratch segments live above our own 64 KB .COM segment (cgb pattern):
        ;   dax_seg     = cs+0x1000  (raw file image / final decompressed block)
        ;   dax_dseg    = cs+0x2000  (RLE decompress target, copied back to dax_seg)
        ;   tileset_seg = cs+0x3000  (decoded 8X8D source tiles while /T builds)
        ;   altsrc_seg  = cs+0x4000  (first bounded GBTS resource)
        ;   altsrc2_seg = cs+0x5000  (second bounded GBTS resource)
        ;   image_seg   = cs+0x6000  (bounded GBIM encounter image)
        ;   scene_seg   = cs+0x7000  (bounded GBIM PICTURE scene)
        mov     ax, cs
        add     ax, 1000h
        mov     [dax_seg], ax
        add     ax, 1000h
        mov     [dax_dseg], ax
        add     ax, 1000h
        mov     [tileset_seg], ax
        add     ax, 1000h
        mov     [altsrc_seg], ax
        add     ax, 1000h
        mov     [altsrc2_seg], ax
        add     ax, 1000h
        mov     [image_seg], ax
        add     ax, 1000h
        mov     [scene_seg], ax
        call    parse_args
        cmp     byte [menu_arg_bad], 0
        jne     .usage
        call    select_scene_overlay_namespace
        call    detect_toggle_once
        call    save_gbts_name
        cmp     byte [fname], 0
        je      .usage
        cmp     byte [ackmode], 0
        jne     .ack_start
        cmp     byte [gbwmode], 0
        je      .load_grid
        call    gbws_preview
        jc      .noopen
        mov     ax, 4C00h
        int     21h

.ack_start:
        call    load_effect_text
        call    validate_ack_effect
        jc      .noopen
        call    validate_auto_answer
        jc      .noopen
        cmp     byte [pending_menu], 0
        je      .ack_render
        cmp     word [effect_text_current], 0ffffh
        je      .menu_start
.ack_render:
        cmp     byte [pending_menu], 0
        je      .ack_graphics
        call    save_pending_prompt
.ack_graphics:
        call    probe_ack_mouse
        mov     ax, 0013h
        int     10h
        mov     ax, 0A000h
        mov     es, ax
        call    fill_floor
        call    draw_effect_text
.ack_wait:
        cmp     byte [sidecar_fault], 0
        jne     .noopen
        cmp     byte [menu_auto], 0
        jne     .ack_page
        xor     ax, ax
        int     16h
        cmp     ah, 01h
        jne     .ack_check_enter
        cmp     byte [pending_menu], 0
        je      .ack_accept
        jmp     .ack_wait
.ack_check_enter:
        cmp     al, 13
        je      .ack_page
        mov     dl, al
        and     dl, 0DFh
        cmp     dl, 'P'
        jne     .ack_wait
        cmp     byte [pending_menu], 0
        je      .ack_accept
        jmp     .ack_wait
.ack_page:
        cmp     byte [menu_auto], 0
        jne     .page_advance
        cmp     word [loadbuf+4], 16
        jne     .page_advance
        cmp     word [loadbuf+MN_OPCODE_OFF], 0039h
        jne     .page_advance
        call    who_drain_keys          ; Page input must not answer the subsequent WHO.
.page_advance:
        call    advance_effect_text
        pushf
        cmp     byte [sidecar_fault], 0
        je      .page_status
        popf
        jmp     .noopen
.page_status:
        popf
        jnc     .page_ready
        cmp     byte [pending_menu], 0
        je      .ack_accept
        jmp     .menu_start
.page_ready:
        cmp     byte [pending_menu], 0
        je      .page_graphics
        call    save_pending_prompt
.page_graphics:
        mov     ax, 0A000h
        mov     es, ax
        call    draw_effect_text
        jmp     .ack_wait
.ack_accept:
        call    write_ack_outcome
        jc      .noopen
        call    close_effect_sidecar
        mov     ax, 0003h
        int     10h
        call    cleanup_ack_row
        mov     ax, 4C00h
        int     21h
.menu_start:
        mov     ax, 0003h
        int     10h
        call    show_pending_menu
        jc      .noopen
        call    write_pending_outcome
        jc      .noopen
        call    close_effect_sidecar
        mov     ax, 4C00h
        int     21h

.load_grid:
        ; load the wall grid.  Two on-disk forms are accepted:
        ;   legacy  : raw 16x16, 4 bytes/cell, no header (1024 bytes) -- unchanged.
        ;   headered: 'WGRD' + u8 W + u8 H, then W*H*4 cells (the CCGEO /B bake)
        ;             plus optional W*H plane2 backdrop/roof and W*H plane3
        ;             door/gateway tails.
        ; Read the whole file into loadbuf, sniff the 4-byte magic, then publish
        ; gridW/gridH and copy the cell payload into wallbuf.  The optional tails
        ; go to roofbuf/doorbuf when present.  The legacy path sets gridW=gridH=16
        ; and copies verbatim, so /R /M /P stay byte-identical.
        mov     byte [roofmode], 0
        mov     byte [doormode], 0
        mov     byte [gridHeadered], 0
        mov     ax, 3D00h
        mov     dx, fname
        int     21h
        jc      .noopen
        mov     [fh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, LOADBUF_SIZE
        mov     dx, loadbuf
        int     21h
        jc      .read_fail
        mov     [loadlen], ax
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        ; magic check: loadbuf[0..3] == 'WGRD'
        mov     word [gridW], 16        ; legacy default
        mov     word [gridH], 16
        cmp     word [loadbuf], 'WG'
        jne     .legacy_grid
        cmp     word [loadbuf+2], 'RD'
        jne     .legacy_grid
        ; headered: pick up W,H and copy W*H*4 cell bytes from loadbuf+6
        mov     byte [gridHeadered], 1
        movzx   ax, byte [loadbuf+4]
        mov     [gridW], ax
        movzx   ax, byte [loadbuf+5]
        mov     [gridH], ax
        mov     ax, [gridW]
        mul     word [gridH]            ; ax = W*H
        or      ax, ax
        jz      .noopen
        cmp     ax, MAX_MAP_CELLS
        ja      .noopen
        mov     [gridCells], ax
        shl     ax, 2                   ; *4 cells (dx untouched; W*H*4 < 64K)
        mov     [gridCellBytes], ax
        mov     cx, ax
        mov     dx, cx
        add     dx, 6
        cmp     [loadlen], dx
        jb      .noopen
        mov     si, loadbuf+6
        jmp     .copy_grid
.legacy_grid:
        ; no header: the bytes already read ARE the grid (raw 16x16 = 1024 B).
        ; Reject short files; otherwise stale bytes in the un-emitted wallbuf
        ; scratch region could become live cells on DOS hosts that do not clear
        ; memory past the .COM image.
        mov     cx, [loadlen]
        cmp     cx, 1024
        jne     .noopen
        mov     si, loadbuf
.copy_grid:
        mov     di, wallbuf
        rep     movsb
        cmp     byte [gridHeadered], 0
        je      .grid_ready
        mov     ax, [gridCellBytes]
        add     ax, 6
        mov     dx, ax
        add     dx, [gridCells]
        cmp     [loadlen], dx
        jb      .grid_ready
        mov     cx, [gridCells]
        mov     di, roofbuf
        rep     movsb
        mov     byte [roofmode], 1
        mov     ax, [gridCellBytes]
        add     ax, 6
        add     ax, [gridCells]
        mov     dx, ax
        add     dx, [gridCells]
        cmp     [loadlen], dx
        jb      .grid_ready
        mov     cx, [gridCells]
        mov     di, doorbuf
        rep     movsb
        mov     byte [doormode], 1
.grid_ready:
        call    load_session_optional
        jc      .noopen

        ; /P : dump the placement plan to PLAN.TXT and exit (port verification)
        cmp     byte [dumpmode], 0
        je      .chkmove
        cmp     byte [gbwfpmode], 0
        je      .plan_open
        call    index_gbws_file
        jc      .noopen
.plan_open:
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, s_planfile
        int     21h
        jc      .plan_fail
        mov     [planfh], ax
        call    plan_wall_view
        mov     bx, [planfh]
        mov     ah, 3Eh
        int     21h
        cmp     byte [gbwfpmode], 0
        je      .plan_exit
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
.plan_exit:
        mov     ax, 4C00h
        int     21h
.plan_fail:
        cmp     byte [gbwfpmode], 0
        je      .noopen
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        jmp     .noopen

        ; /M : headless move-trace.  Apply the scripted F/B/L/R sequence from the
        ; live pose (px_pose,py_pose,facing) using try_step (the engine collision
        ; rule, Explorer.step) and dump the (px,py,facing) trace to CCFP.MOV, then
        ; exit.  No graphics, no table build -- this is the deterministic oracle.
.chkmove:
        cmp     byte [movemode], 0
        je      .render
        mov     byte [stepflag], 0
        call    run_move_script
        call    write_session_optional
        jc      .noopen
        cmp     byte [campflag], 0
        jne     .camp_exit
        cmp     byte [stepflag], 0
        je      .move_exit
        cmp     byte [stepname], 0
        je      .move_exit
        call    write_step_yield
        jc      .noopen
        mov     ax, 4C0Ah
        int     21h
.move_exit:
        mov     ax, 4C00h
        int     21h
.camp_exit:
        cmp     byte [stepname], 0
        je      .move_exit
        call    write_step_yield
        jc      .noopen
        mov     ax, 4C0Bh            ; camp request, never a movement yield
        int     21h
.render:
        call    load_effect_text
        call    load_gbim
        call    load_scene_gbim
        cmp     byte [gbwfpmode], 0
        jne     .render_gbws
        ; /T or /R : build the textured wall tables IN-ASM (no pre-baked BINs).
        ; build_tables reads 8X8Dn.DAX + WALLDEFn.DAX straight from the game dir and
        ; reproduces the engine's RESOLVE table + deduped tile pool + EGA palette.
        cmp     byte [texmode], 0
        jne     .build
        cmp     byte [dumpbin], 0
        je      .nomode
.build:
        call    build_tables
        jc      .notex
        call    apply_gbim_palette
        call    apply_scene_palette
        cmp     byte [toggleonce], 0
        je      .tables_ready
        mov     byte [gbtsname], 0
        mov     byte [gbtsname2], 0
        mov     byte [graphics_alt_enabled], 0
        mov     byte [gbim_enabled], 0
        mov     byte [scene_enabled], 0
        push    ds
        pop     es
        call    build_tables
        jc      .notex
        mov     byte [toggleonce], 0
.tables_ready:
        ; /R : dump RESOLVE.BIN / TILES.BIN / PAL.BIN and exit (byte-exact verify)
        cmp     byte [dumpbin], 0
        je      .nomode
        call    dump_bins
        mov     ax, 4C00h
        int     21h
.nomode:
        ; enter mode 13h (clears to 0 = ceiling), es = A000, paint floor
        mov     ax, 0013h
        int     10h
        cmp     byte [texmode], 0
        jne     .setpal
        ; A forced /K scene is self-contained and can be rendered without
        ; the wall-texture setup solely to keep a scripted DOS child tail
        ; bounded.  Its GBIM palette must still reach the DAC.
        cmp     byte [scene_enabled], 0
        je      .skippal
.setpal:
        push    ds                  ; ES=DS for the DAC table
        pop     es
        mov     ax, 1012h           ; set block of DAC registers
        xor     bx, bx              ; first reg 0
        mov     cx, [pal_colors]
        mov     dx, palbuf
        int     10h
.skippal:
        mov     ax, 0A000h
        mov     es, ax              ; ES = framebuffer for the render path
        call    render_view         ; clear viewport, floor, then the cell-walk
        cmp     byte [toggleonce], 0
        je      .after_toggle_once
        call    toggle_graphics
.after_toggle_once:
        cmp     byte [snapmode], 0
        je      .nosnap
        call    dump_view_raw
        jc      .noopen
        call    write_session_optional
        jc      .noopen
        mov     ax, 0003h
        int     10h
        mov     ax, 4C00h
        int     21h
.nosnap:

        ; /W : navigable walker -- re-render on each move.  Otherwise wait for one
        ; key and quit (the original single-view behaviour, unchanged).
        cmp     byte [walkmode], 0
        jne     .walk

        ; drain stale keys then wait, restore text
.drain:
        mov     ah, 1
        int     16h
        jz      .waitkey
        xor     ah, ah
        int     16h
        jmp     .drain
.waitkey:
        xor     ax, ax
        int     16h
.quit:
        call    write_session_optional
        mov     ax, 0003h
        int     10h
        mov     ax, 4C00h
        int     21h
.autowait:
        ; Bounded scene playback for GBBOOT's attract-mode narration.
        mov     ah, 00h
        int     1Ah
        mov     bp, dx
.auto_loop:
        mov     ah, 01h
        int     16h
        jnz     .auto_key
        mov     ah, 00h
        int     1Ah
        sub     dx, bp
        cmp     dx, 54
        jb      .auto_loop
        jmp     .quit
.auto_key:
        xor     ah, ah
        int     16h
        jmp     .quit

.render_gbws:
        call    index_gbws_file
        jc      .noopen
        mov     ax, 0013h
        int     10h
        call    load_gbws_dac
        mov     ax, 0A000h
        mov     es, ax
        call    render_view
        cmp     byte [snapmode], 0
        je      .gbws_dump_r
        call    dump_gbws_view_raw
        jc      .gbws_close_fail
        call    write_session_optional
        jc      .gbws_close_fail
.gbws_dump_r:
        cmp     byte [dumpbin], 0
        je      .gbws_maybe_exit
        call    dump_gbws_raw
        jc      .gbws_close_fail
.gbws_maybe_exit:
        cmp     byte [snapmode], 0
        jne     .gbws_close_exit
        cmp     byte [dumpbin], 0
        je      .gbws_wait
.gbws_close_exit:
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        mov     ax, 0003h
        int     10h
        mov     ax, 4C00h
        int     21h
.gbws_close_fail:
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        jmp     .noopen
.gbws_wait:
        ; [automode] can no longer be nonzero here: its only setter was the
        ; /L flag, retired 2026-09-05 (see the .notJ/.notL comment in the
        ; argument parser). This check and .autowait below are dead code as
        ; of that removal -- kept in place rather than excised, since /L was
        ; the only thing that made them reachable and this comment is the
        ; record of that, not a claim that something else still uses them.
        cmp     byte [walkmode], 0
        jne     .walk
        cmp     byte [automode], 0
        jne     .autowait
        xor     ax, ax
        int     16h
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        mov     ax, 0003h
        int     10h
        mov     ax, 4C00h
        int     21h

; ----------------------------------------------------------------------------
;  /W walk loop: drain stale keys, then block on INT 16h; an arrow key updates
;  the live pose (px_pose,py_pose,facing) via try_step / turn and re-renders the
;  EXISTING textured (/T) or outline (default) view -- tables are built ONCE in
;  build_tables, this loop never re-decodes.  Esc restores text mode and exits.
;    Up    (scancode 48h) = forward    Down (50h) = backward (no turn)
;    Left  (4Bh)          = turn left  Right(4Dh) = turn right
.walk:
        ; drain any keys buffered before the loop (the documented CCGB lesson)
.wdrain:
        mov     ah, 1
        int     16h
        jz      .wloop
        xor     ah, ah
        int     16h
        jmp     .wdrain
.wloop:
        xor     ax, ax              ; AH=0: wait for a key, AH<-scancode
        int     16h
        cmp     ah, 01h             ; Esc
        je      .quit
        mov     dl, al
        and     dl, 0DFh
        cmp     dl, 'G'
        je      .w_graphics
        cmp     dl, 'C'
        je      .w_camp
        cmp     al, 13               ; Enter advances captured ECL narration
        je      .w_text_next
        cmp     ah, 48h             ; Up    -> forward
        je      .w_fwd
        cmp     ah, 50h             ; Down  -> backward
        je      .w_back
        cmp     ah, 4Bh             ; Left  -> turn left
        je      .w_tl
        cmp     ah, 4Dh             ; Right -> turn right
        je      .w_tr
        jmp     .wloop              ; ignore everything else
.w_graphics:
        call    toggle_graphics
        jmp     .wloop
.w_camp:
        cmp     byte [stepname], 0
        je      .wloop
        call    write_session_optional
        jc      .quit
        call    write_step_yield
        jc      .quit
        mov     ax, 0003h
        int     10h
        mov     ax, 4C0Bh
        int     21h
.w_text_next:
        call    advance_effect_text
        jc      .wloop
        jmp     .w_redraw
.w_fwd:
        xor     al, al              ; 0 = forward
        jmp     .w_apply
.w_back:
        mov     al, 1               ; 1 = backward
        jmp     .w_apply
.w_tl:
        mov     al, 2               ; 2 = turn left
        jmp     .w_apply
.w_tr:
        mov     al, 3               ; 3 = turn right
.w_apply:
        mov     byte [stepflag], 0
        call    do_move             ; mutate live pose per the engine rule
        cmp     byte [stepflag], 0
        je      .w_redraw
        cmp     byte [stepname], 0
        je      .w_redraw
        call    write_session_optional
        call    write_step_yield
        jc      .quit
        mov     ax, 0003h
        int     10h
        mov     ax, 4C0Ah
        int     21h
.w_redraw:
        mov     ax, 0A000h
        mov     es, ax              ; restore ES (do_move/INT16 left it ours)
        call    render_view         ; redraw from the new pose
        jmp     .wloop

.usage:
        mov     dx, s_usage
        jmp     .die
.read_fail:
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
.noopen:
        mov     dx, s_noopen
        jmp     .die
.notex:
        cmp     byte [dumpbin], 0
        jne     .notex_strict
        mov     byte [texmode], 0
        jmp     .nomode
.notex_strict:
        mov     dx, s_notex
.die:
        mov     ah, 9
        int     21h
        mov     ax, 4C01h
        int     21h

; Toggle between the validated alternate resource and DOS fallback. Rebuilds
; presentation tables/palette only; wall grid, ECL text, pose and facing remain.
toggle_graphics:
        cmp     byte [graphics_alt_enabled], 0
        je      .enable
        mov     byte [gbtsname], 0
        mov     byte [gbtsname2], 0
        mov     byte [graphics_alt_enabled], 0
        mov     byte [gbim_enabled], 0
        mov     byte [scene_enabled], 0
        jmp     .rebuild
.enable:
        mov     si, gbts_saved
        mov     di, gbtsname
.copy:
        lodsb
        stosb
        or      al, al
        jnz     .copy
        mov     byte [graphics_alt_enabled], 1
        cmp     byte [gbim_valid], 0
        je      .copy_second
        mov     byte [gbim_enabled], 1
.copy_second:
        cmp     byte [scene_valid], 0
        je      .copy_second_name
        mov     byte [scene_enabled], 1
.copy_second_name:
        mov     si, gbts_saved2
        mov     di, gbtsname2
.copy2:
        lodsb
        stosb
        or      al, al
        jnz     .copy2
.rebuild:
        push    ds
        pop     es
        call    build_tables
        jnc     .palette
        mov     byte [gbtsname], 0
        mov     byte [gbtsname2], 0
        mov     byte [graphics_alt_enabled], 0
        mov     byte [gbim_enabled], 0
        mov     byte [scene_enabled], 0
        call    build_tables
        jc      .ret
.palette:
        call    apply_gbim_palette
        call    apply_scene_palette
        push    ds
        pop     es
        mov     ax, 1012h
        xor     bx, bx
        mov     cx, [pal_colors]
        mov     dx, palbuf
        int     10h
        mov     ax, 0A000h
        mov     es, ax
        call    render_view
.ret:
        ret

save_gbts_name:
        mov     si, gbtsname
        mov     di, gbts_saved
.copy:
        lodsb
        stosb
        or      al, al
        jnz     .copy
        mov     si, gbtsname2
        mov     di, gbts_saved2
.copy2:
        lodsb
        stosb
        or      al, al
        jnz     .copy2
        cmp     byte [gbts_saved], 0
        jne     .enabled
        cmp     byte [gbts_saved2], 0
        jne     .enabled
        cmp     byte [gbim_valid], 0
        je      .ret
.enabled:
        mov     byte [graphics_alt_enabled], 1
.ret:
        ret

; GBSN v1: magic, version, x, y, even facing, map width, map height.
load_session_optional:
        cmp     byte [sessionmode], 0
        je      .none
        cmp     byte [sessionname], 0
        je      .none
        mov     ax, 3D00h
        mov     dx, sessionname
        int     21h
        jc      .none                  ; absent means a new session
        mov     [sessionfh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, 16
        mov     dx, sessionbuf
        int     21h
        push    ax
        mov     bx, [sessionfh]
        mov     ah, 3Eh
        int     21h
        pop     ax
        cmp     ax, 16
        jne     .bad
        cmp     word [sessionbuf], 'GB'
        jne     .bad
        cmp     word [sessionbuf+2], 'SN'
        jne     .bad
        cmp     word [sessionbuf+4], 1
        jne     .bad
        mov     ax, [sessionbuf+12]
        cmp     ax, [gridW]
        jne     .bad
        mov     ax, [sessionbuf+14]
        cmp     ax, [gridH]
        jne     .bad
        mov     ax, [sessionbuf+6]
        cmp     ax, [gridW]
        jae     .bad
        mov     [px_pose], ax
        mov     ax, [sessionbuf+8]
        cmp     ax, [gridH]
        jae     .bad
        mov     [py_pose], ax
        mov     ax, [sessionbuf+10]
        test    ax, 0FFF9h             ; legal values are 0,2,4,6
        jnz     .bad
        mov     [facing], ax
.none:
        clc
        ret
.bad:
        stc
        ret

write_session_optional:
        cmp     byte [sessionmode], 0
        je      .none
        cmp     byte [sessionname], 0
        je      .none
        mov     ax, [px_pose]
        mov     [sessionbuf+6], ax
        mov     ax, [py_pose]
        mov     [sessionbuf+8], ax
        mov     ax, [facing]
        mov     [sessionbuf+10], ax
        mov     ax, [gridW]
        mov     [sessionbuf+12], ax
        mov     ax, [gridH]
        mov     [sessionbuf+14], ax
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, sessionname
        int     21h
        jc      .bad
        mov     [sessionfh], ax
        mov     bx, ax
        mov     ah, 40h
        mov     cx, 16
        mov     dx, sessionbuf
        int     21h
        push    ax
        mov     bx, [sessionfh]
        mov     ah, 3Eh
        int     21h
        pop     ax
        cmp     ax, 16
        jne     .bad
.none:
        clc
        ret
.bad:
        stc
        ret

; GBST v1: descriptor, x, y, facing. Exit 10 identifies movement; 11 camp.
write_step_yield:
        mov     word [stepbuf+6], 0
        cmp     byte [roofmode], 0
        je      .pose
        mov     ax, [py_pose]
        mul     word [gridW]
        add     ax, [px_pose]
        mov     si, ax
        movzx   ax, byte [roofbuf+si]
        mov     [stepbuf+6], ax
.pose:
        mov     ax, [px_pose]
        mov     [stepbuf+8], ax
        mov     ax, [py_pose]
        mov     [stepbuf+10], ax
        mov     ax, [facing]
        mov     [stepbuf+12], ax
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, stepname
        int     21h
        jc      .bad
        mov     bx, ax
        mov     ah, 40h
        mov     cx, 14
        mov     dx, stepbuf
        int     21h
        push    ax
        mov     ah, 3Eh
        int     21h
        pop     ax
        cmp     ax, 14
        jne     .bad
        clc
        ret
.bad:
        stc
        ret

; Independent exact flag pass. Path-copy branches in parse_args intentionally
; share AL, so presentation test control must not depend on their fall-through.
detect_toggle_once:
        mov     si, 81h
.scan:
        mov     al, [si]
        or      al, al
        jz      .ret
        cmp     al, 13
        je      .ret
        cmp     al, '/'
        jne     .next
        mov     al, [si+1]
        and     al, 0DFh
        cmp     al, 'J'
        jne     .next
        mov     byte [toggleonce], 1
        ret
.next:
        inc     si
        jmp     .scan
.ret:
        ret

; ============================================================================
;  fill_floor: viewport floor band, screen x[8,176) y[70,176), colour 8.
; ============================================================================
fill_floor:
        mov     ax, 70
.row:
        cmp     ax, 176
        jge     .done
        push    ax
        mov     bx, 320
        mul     bx                  ; ax = y*320 (dx=0)
        add     ax, 8
        mov     di, ax
        mov     cx, 168
        mov     al, 8
        rep     stosb
        pop     ax
        inc     ax
        jmp     .row
.done:
        ret

; ============================================================================
;  clear_viewport: blank the 168x168 dungeon box (8,8)-(176,176) to 0 (ceiling
;  black) so a re-render in /W walk mode does not leave the previous frame's
;  walls behind.  ES must already = A000.
; ============================================================================
clear_viewport:
        mov     ax, 8
.row:
        cmp     ax, 176
        jge     .done
        push    ax
        mov     bx, 320
        mul     bx
        add     ax, 8
        mov     di, ax
        mov     cx, 168
        xor     al, al
        rep     stosb
        pop     ax
        inc     ax
        jmp     .row
.done:
        ret

; ============================================================================
;  render_view: paint one whole frame from the live pose -- clear the viewport,
;  lay the floor band, then run the cell-walk (plan_wall_view -> fill_piece /
;  expand_piece).  ES must = A000.  Used by both the single-view and /W paths.
; ============================================================================
render_view:
        push    ax
        push    cx
        push    di
        xor     ax, ax
        xor     di, di
        mov     cx, 32000
        rep     stosw
        pop     di
        pop     cx
        pop     ax
        cmp     byte [effect_picture_valid], 0
        jne     .have_effect_picture
        ; /K without an ECL sidecar is a complete standalone scene request.
        ; Do not require the host-only /O marker for this documented form.
        jmp     .have_effect_picture
.have_effect_picture:
        cmp     byte [scene_enabled], 0
        je      .world
        cmp     byte [scene_valid], 0
        je      .world
        ; A caller that supplied /K but no /E is intentionally presenting a
        ; standalone scripted picture (GBBOOT's ordered replay).  There is no
        ; effect-sidecar picture id to compare in that form.
        cmp     byte [effect_picture_valid], 0
        je      .scene_match
        mov     ax, [effect_picture_id]
        cmp     ax, [scene_block]
        je      .scene_match
        cmp     byte [scene_force], 0
        je      .world
.scene_match:
        call    clear_viewport
        call    draw_scene_gbim
        ; A paper-doll scene is two source-owned EGA frames: the HEAD /K
        ; scene establishes the opaque 88x40 top, then the BODY /I frame is
        ; placed at its recovered screen offset.  This deliberately bypasses
        ; encounter-distance scaling and treats index zero as transparent.
        cmp     byte [scene_overlay], 0
        je      .scene_text
        cmp     byte [gbim_valid], 0
        je      .scene_text
        call    draw_scene_overlay
.scene_text:
        call    draw_effect_text
        ret
.world:
        call    clear_viewport
        call    draw_sky_backdrop
        call    fill_floor
        call    plan_wall_view
        call    draw_effect_setup
        call    draw_effect_text
        ret

; ============================================================================
;  load_effect_text: optional GBEF tail consumer.
;  Assembles source-ordered PRINT/PRINTCLEAR records into a bounded message
;  page. PRINT appends, PRINTCLEAR/CLEAR_BOX reset the page, and PRINT_RETURN
;  ends a page for /W Enter advancement. /Z retains its diagnostic single-slot
;  behaviour. Also reads the v7 GBES setup tail so render_view
;  can surface deterministic approach-distance state, and falls back to the v9
;  GBCL clock tail when no script text exists. Missing/older/malformed effect
;  files are ignored; texture-piece loading remains owned by init_piece_ids.
; ============================================================================
load_effect_text:
        call    close_effect_sidecar
        mov     byte [sidecar_fault], 0
        mov     byte [sidecar_active], 0
        mov     byte [effect_text_len], 0
        mov     byte [effect_setup_valid], 0
        mov     byte [effect_picture_valid], 0
        mov     byte [effect_clock_valid], 0
        mov     word [effect_text_current], 0FFFFh
        mov     word [effect_text_offset], 0
        cmp     byte [effectmode], 0
        je      .done
        mov     dx, effectname
        cmp     byte [effectname], 0
        jne     .open
        mov     dx, s_defeffect
.open:
        mov     ax, 3D00h
        int     21h
        jc      .done
        mov     [fxfh], ax
        mov bx, ax
        xor cx, cx
        xor dx, dx
        mov ax, 4202h
        int 21h
        jc .close_done
        mov [fx_physical_len], ax
        mov [fx_physical_hi], dx
        mov bx, [fxfh]
        xor cx, cx
        xor dx, dx
        mov ax, 4200h
        int 21h
        jc .close_done
        mov     bx, [fxfh]
        mov     ah, 3Fh
        mov     cx, LOADBUF_SIZE
        mov     dx, loadbuf
        int     21h
        jc      .close_done
        mov     [fxreadlen], ax
        mov     bx, [fxfh]
        mov     ah, 3Eh
        int     21h
        jc      .fx_fault
        cmp     word [fxreadlen], SX_COUNT_OFF + 2
        jb      .done
        cmp     word [loadbuf], 'GB'
        jne     .done
        cmp     word [loadbuf+2], 'EF'
        jne     .done
        test    word [loadbuf+6], 0100h
        jz      .no_sidecar
        ; GBSL is the authoritative event stream for a flagged bridge.  Do
        ; not fall back to its terminal 64-record GBSX tail: that would make a
        ; saturated route look playable while silently dropping earlier text
        ; and pictures.
        call    open_effect_sidecar
        jc      .done
        mov     byte [sidecar_active], 1
.no_sidecar:
        cmp     word [loadbuf+4], 7
        jb      .check_text
        cmp     word [fxreadlen], ES_DIST_OFF + 2
        jb      .check_text
        cmp     word [loadbuf+ES_MAGIC_OFF], 'GB'
        jne     .check_text
        cmp     word [loadbuf+ES_MAGIC_OFF+2], 'ES'
        jne     .check_text
        mov     byte [effect_setup_valid], 1
        mov     ax, [loadbuf+ES_SPRITE_OFF]
        mov     [effect_setup_sprite], ax
        mov     ax, [loadbuf+ES_MAX_OFF]
        mov     [effect_setup_max], ax
        mov     ax, [loadbuf+ES_PIC_OFF]
        mov     [effect_setup_pic], ax
        mov     ax, [loadbuf+ES_DIST_OFF]
        mov     [effect_setup_distance], ax
.check_text:
        cmp     word [loadbuf+4], 4
        jb      .clock
        cmp     word [fxreadlen], SX_TEXT_OFF
        jb      .clock
        mov     cx, [loadbuf+SX_COUNT_OFF]
        cmp     cx, SCRIPTCAP
        ja      .clock
        mov     si, loadbuf+SX_EVENTS_OFF
.picture_event:
        cmp     byte [sidecar_active], 0
        jne     .sidecar_pictures
        jcxz    .clock
        cmp     word [si], 000Eh
        jne     .picture_next
        cmp     word [si+2], 1
        jb      .picture_next
        mov     ax, [si+4]
        mov     [effect_picture_id], ax
        mov     byte [effect_picture_valid], 1
.picture_next:
        add     si, SX_EVENT_BYTES
        loop    .picture_event
.sidecar_pictures:
        cmp     byte [sidecar_active], 0
        je      .clock
        call    scan_sidecar_pictures
        jc      .maybe_clock
.clock:
        cmp     word [loadbuf+4], 9
        jb      .text_events
        cmp     word [fxreadlen], CL_SLOTS_OFF + 14
        jb      .text_events
        cmp     word [loadbuf+CL_MAGIC_OFF], 'GB'
        jne     .text_events
        cmp     word [loadbuf+CL_MAGIC_OFF+2], 'CL'
        jne     .text_events
        mov     byte [effect_clock_valid], 1
        mov     si, loadbuf+CL_SLOTS_OFF
        mov     di, effect_clock_slots
        mov     cx, 7
        rep     movsw
.text_events:
        cmp     word [loadbuf+4], 6
        jb      .maybe_clock
        cmp     word [loadbuf+SX_MAGIC_OFF], 'GB'
        jne     .maybe_clock
        cmp     word [loadbuf+SX_MAGIC_OFF+2], 'SX'
        jne     .maybe_clock
        cmp     byte [sidecar_active], 0
        jne     .sidecar_text_events
        mov     cx, [loadbuf+SX_COUNT_OFF]
        cmp     cx, SCRIPTCAP
        ja      .maybe_clock
        or      cx, cx
        jz      .maybe_clock
        cmp     word [effect_text_slot], 0FFFFh
        je      .first_page
        mov     ax, [effect_text_slot]
        cmp     ax, cx
        jae     .maybe_clock
        mov     bx, ax
        shl     bx, 5               ; slot * 32
        mov     dx, ax
        shl     dx, 1               ; slot * 2
        add     bx, dx              ; slot * 34
        mov     si, loadbuf+SX_TEXT_OFF
        add     si, bx
        jmp     .slot_value
.first_page:
        xor     bx, bx
        call    build_effect_page
        jc      .maybe_clock
        jmp     .done
.sidecar_text_events:
        mov     cx, [sidecar_count]
        mov     [effect_text_count], cx
        or      cx, cx
        jz      .maybe_clock
        cmp     word [effect_text_slot], 0FFFFh
        je      .sidecar_first_page
        mov     bx, [effect_text_slot]
        cmp     bx, cx
        jae     .maybe_clock
        call    read_sidecar_record
        jc      .maybe_clock
        mov     si, sidebuf+SX_EVENT_BYTES
        jmp     .slot_value
.sidecar_first_page:
        xor     bx, bx
        call    build_sidecar_effect_page
        jc      .maybe_clock
        jmp     .done
.slot_value:
        mov     ax, [si]
        or      ax, ax
        jz      .maybe_clock
        ; /Z is a single-slot diagnostic selector. Long v2 text is paged by
        ; /W only; never display the GBPX descriptor as literal characters.
        cmp     ax, 0ffffh
        je      .maybe_clock
.copy:
        cmp     ax, SCRIPT_TEXT_BYTES
        jbe     .len_ok
        mov     ax, SCRIPT_TEXT_BYTES
.len_ok:
        mov     [effect_text_len], al
        mov     cx, ax
        add     si, 2
        mov     di, effect_text
        rep     movsb
        mov     byte [di], 0
        mov     [effect_text_current], bx
        jmp     .done
.maybe_clock:
        cmp     byte [effect_clock_valid], 0
        je      .done
        call    format_clock_text
        jmp     .done
.close_done:
        mov byte [sidecar_fault], 1
        mov     bx, [fxfh]
        mov     ah, 3Eh
        int     21h
.done:
        ret
.fx_fault:
        mov byte [sidecar_fault], 1
        ret

; This mode accepts the DoK 1Dh acknowledgement or a sidecar-backed Gen2
; PARTY_SURPRISE / INPUT_NUMBER menu. Every answer remains bound to its pending
; identity and to the authoritative final GBSL event.
; Admit every stream row and bind its complete terminal chunk to the GBEF.
; Earlier rows have no inline counterpart, but their text framing must still
; be valid. V2's directory/payload ownership was checked at sidecar open.
validate_menu_stream:
        push    es
        push    ds
        pop     es
        cmp     byte [sidecar_active], 1
        jne     .bad
        cmp     dword [loadbuf+SX_MAGIC_OFF], 'GBSX'
        jne     .bad
        mov     ax, [loadbuf+SX_COUNT_OFF]
        or      ax, ax
        jz      .bad
        cmp     ax, SCRIPTCAP
        ja      .bad
        mov     bx, [sidecar_count]
        sub     bx, ax
        jc      .bad
        mov     [menu_stream_base], bx
        mov     word [menu_stream_index], 0
.row:
        mov     bx, [menu_stream_index]
        cmp     bx, [sidecar_count]
        jae     .ok
        call    read_sidecar_record
        jc      .bad
        cmp     word [sidebuf+SX_EVENT_BYTES], SCRIPT_TEXT_BYTES
        jbe     .framing_ok
        cmp     word [sidecar_version], 2
        jne     .bad
        cmp     word [sidebuf+SX_EVENT_BYTES], 0ffffh
        jne     .bad
.framing_ok:
        sub     bx, [menu_stream_base]
        jc      .next
        imul    di, bx, SX_EVENT_BYTES
        add     di, loadbuf+SX_EVENTS_OFF
        mov     si, sidebuf
        mov     cx, SX_EVENT_BYTES/2
        repe    cmpsw
        jne     .bad
        imul    di, bx, SCRIPT_TEXT_REC_BYTES
        add     di, loadbuf+SX_TEXT_OFF
        mov     si, sidebuf+SX_EVENT_BYTES
        cmp     word [di], SCRIPT_TEXT_BYTES
        ja      .private_text
        mov     cx, SCRIPT_TEXT_REC_BYTES/2
        repe    cmpsw
        jne     .bad
        jmp     .next
.private_text:
        cmp     word [sidecar_version], 2
        jne     .bad
        cmp     word [di], 0ffffh
        jne     .bad
        cmp     dword [di+2], 'DREF'
        jne     .bad
        cmp     word [di+6], 255
        ja      .bad
        mov     ax, [di+10]
        or      ax, ax
        jz      .bad
        cmp     ax, 255
        ja      .bad
        add     ax, [di+8]
        jc      .bad
        cmp     ax, [di+12]
        ja      .bad
        cmp     word [si], 0ffffh
        jne     .bad
        cmp     dword [si+2], 'GBPX'
        jne     .bad
        push    di
        mov     bx, [si+6]
        call    read_sidecar_directory
        pop     di
        jc      .bad
        mov     ax, [side_dir+4]
        cmp     ax, [di+10]
        jne     .bad
        add     di, 14
        mov     cx, 20
.private_padding:
        cmp     byte [di], 0
        jne     .bad
        inc     di
        loop    .private_padding
.next:
        inc     word [menu_stream_index]
        jmp     .row
.ok:
        pop     es
        clc
        ret
.bad:
        pop     es
        stc
        ret

; Automation presence is independent of its value. Acknowledgements use the
; existing canonical 1/1 token, regardless of a later numeric prompt's seed.
validate_auto_answer:
        cmp     byte [menu_arg_bad], 0
        jne     .bad
        cmp     byte [menu_auto], 0
        je      .ok
        ; /Z deliberately cycles individual diagnostic slots. It cannot be
        ; used as the ordered finite narration of an automated prompt.
        cmp     word [effect_text_slot], 0ffffh
        jne     .bad
        cmp word [loadbuf+MN_OPCODE_OFF], 39h
        je .ordinal_domain
        cmp word [loadbuf+MN_OPCODE_OFF], 2bh
        jne .party_domain
.ordinal_domain:
        mov ax, [menu_auto_answer]
        cmp ax, [loadbuf+MN_COUNT_OFF]
        jae .bad
        jmp .ok
.party_domain:
        cmp     word [loadbuf+MN_OPCODE_OFF], 0022h
        jne     .ok
        cmp     word [menu_auto_answer], 1
        ja      .bad
.ok:    clc
        ret
.bad:   stc
        ret

validate_ack_effect:
        cmp     byte [sidecar_fault], 0
        jne     .bad
        mov     byte [pending_menu], 0
        cmp word [fx_physical_hi], 0
        jne .bad
        mov ax, [fxreadlen]
        cmp ax, [fx_physical_len]
        jne .bad
        cmp word [loadbuf+4], 16
        je .v16
        cmp     word [fxreadlen], FX_V15_LEN
        jne     .bad
        jmp .prefix
.v16:
        cmp word [fxreadlen], FX_V16_LEN
        jne .bad
        call who_validate_state
        jc .bad
.prefix:
        cmp     dword [loadbuf], 'GBEF'
        jne     .bad
        cmp     word [loadbuf+4], 16
        je      .menu_version
        cmp     word [loadbuf+4], 15
        jne     .bad
.menu_version:
        cmp     word [loadbuf+8], 2
        jne     .bad
        test    word [loadbuf+6], 0100h
        jz      .bad
        ; Title-agnostic legacy admission cannot identify a stripped pair.
        mov     ax,[loadbuf+120]
        cmp     ax,1
        jbe     .semantics_ok          ; unsigned closed generic0/1 only
        cmp     ax,13                 ; Secret-marked pending state requires bit0 too
        jne     .bad
.semantics_ok:
        cmp     dword [loadbuf+GBRF_MAGIC_OFF], 'GBRF'
        jne     .bad
        cmp     word [loadbuf+GBRF_RESERVED_OFF], 0
        jne     .bad
        mov     ax, [loadbuf+GBRF_FLAGS_OFF]
        test    ax, 0FEFEh
        jnz     .bad
        mov     ax, [loadbuf+GBRF_FLAGS_OFF+2]
        test    ax, 0FEFEh
        jnz     .bad
        mov     ax, [loadbuf+GBRF_FLAGS_OFF+4]
        test    ax, 0FEFEh
        jnz     .bad
        cmp     dword [loadbuf+MS_MAGIC_OFF], 'GBMS'
        jne     .bad
        test    word [loadbuf+MS_FLAGS_OFF], 0fffch
        jnz     .bad
        call    validate_menu_stream
        jc      .bad
        cmp     word [loadbuf+MN_OPCODE_OFF], 001dh
        jne     .check_pending_menu
        cmp     dword [loadbuf+MN_MAGIC_OFF], 'GBMN'
        jne     .bad
        cmp     word [loadbuf+MN_FLAGS_OFF], 2
        jne     .bad
        cmp     word [loadbuf+MN_DEST_OFF], 0ffffh
        jne     .bad
        cmp     word [loadbuf+MN_COUNT_OFF], 1
        jne     .bad
        cmp     word [loadbuf+MN_OPCODE_OFF], 001dh
        jne     .bad
        cmp     word [loadbuf+MN_RESERVED_OFF], 0
        jne     .bad
        ; Copy only a pending ACK bound to this continuation's actual PC.
        mov     ax, [loadbuf+RS_PC_OFF]
        cmp     ax, [loadbuf+MN_ID_PC_OFF]
        jne     .bad
        mov     ax, [loadbuf+RS_AREA_OFF]
        cmp     ax, [loadbuf+MN_ID_AREA_OFF]
        jne     .bad
        cmp     word [loadbuf+MN_ID_DEST_OFF], 0ffffh
        jne     .bad
        cmp     word [loadbuf+MN_ID_OPCODE_OFF], 001dh
        jne     .bad
        cmp     dword [loadbuf+SX_MAGIC_OFF], 'GBSX'
        jne     .bad
        mov     ax, [loadbuf+SX_COUNT_OFF]
        or      ax, ax
        jz      .bad
        cmp     ax, SCRIPTCAP
        ja      .bad
        dec     ax
        cmp     ax, [loadbuf+MN_EVENT_OFF]
        jne     .bad
        imul    bx, ax, SX_EVENT_BYTES
        add     bx, SX_EVENTS_OFF
        cmp     word [loadbuf+bx], 001dh
        jne     .bad
        cmp     word [loadbuf+bx+2], 0
        jne     .bad
        cmp     byte [sidecar_active], 1
        jne     .bad
        cmp     word [sidecar_count], 0
        je      .bad
        mov     bx, [sidecar_count]
        dec     bx
        call    read_sidecar_record
        jc      .bad
        cmp     word [sidebuf], 001dh
        jne     .bad
        cmp     word [sidebuf+2], 0
        jne     .bad
        cmp     byte [ackname], 0
        je      .bad
        clc
        ret
.check_pending_menu:
        call    validate_pending_menu
        ret
.bad:   stc
        ret

; CCFP's accumulated-text input path currently supports the two DQK HLIB
; boundaries that need it: PARTY_SURPRISE and INPUT_NUMBER. The full pending
; 20-byte event must be the last fixed record and match the final GBSL row.
validate_pending_menu:
        cmp     dword [loadbuf+SX_MAGIC_OFF], 'GBSX'
        jne     .bad
        mov     ax, [loadbuf+SX_COUNT_OFF]
        or      ax, ax
        jz      .bad
        cmp     ax, SCRIPTCAP
        ja      .bad
        cmp     dword [loadbuf+MN_MAGIC_OFF], 'GBMN'
        jne     .bad
        mov     ax, [loadbuf+MN_COUNT_OFF]
        cmp     ax, 255
        ja      .bad
        cmp word [loadbuf+MN_OPCODE_OFF], 39h
        je .who
        cmp word [loadbuf+MN_OPCODE_OFF], 2bh
        je .horizontal
        cmp     word [loadbuf+MN_OPCODE_OFF], 0022h
        je      .party
        cmp     word [loadbuf+MN_OPCODE_OFF], 000fh
        jne     .bad
        cmp     word [loadbuf+MN_FLAGS_OFF], 1
        jne     .bad
        cmp     word [loadbuf+MN_RESERVED_OFF], 0
        jne     .bad
        cmp     word [loadbuf+MN_COUNT_OFF], 0
        jne     .bad
        jmp     .identity
.horizontal:
        call validate_secret_text_context
        jc .bad
        cmp word [loadbuf+MN_FLAGS_OFF],1
        jne .bad
        cmp word [loadbuf+MN_RESERVED_OFF],0
        jne .bad
        cmp word [loadbuf+MN_COUNT_OFF],1
        jb .bad
        jmp .identity
.who:
        cmp word [loadbuf+4], 16
        jne .bad
        cmp word [loadbuf+MN_FLAGS_OFF], 1
        jne .bad
        cmp word [loadbuf+MN_RESERVED_OFF], 0
        jne .bad
        cmp word [loadbuf+MN_DEST_OFF], 0FFFFh
        jne .bad
        mov ax, [loadbuf+MN_COUNT_OFF]
        cmp ax, 1
        jb .bad
        cmp ax, [loadbuf+SI_COUNT_OFF]
        jne .bad
        jmp .identity
.party:
        cmp     word [loadbuf+MN_FLAGS_OFF], 3
        jne     .bad
        cmp     word [loadbuf+MN_DEST_OFF], 0ffffh
        jne     .bad
        cmp     word [loadbuf+MN_COUNT_OFF], 2
        jne     .bad
        mov     ax, [loadbuf+MN_RESERVED_OFF]
        test    ax, 0fffch
        jnz     .bad
.identity:
        mov     byte [pending_menu], 1
        mov     ax, [loadbuf+RS_PC_OFF]
        cmp     ax, [loadbuf+MN_ID_PC_OFF]
        jne     .bad
        mov     ax, [loadbuf+RS_AREA_OFF]
        cmp     ax, [loadbuf+MN_ID_AREA_OFF]
        jne     .bad
        mov     ax, [loadbuf+MN_DEST_OFF]
        cmp     ax, [loadbuf+MN_ID_DEST_OFF]
        jne     .bad
        mov     ax, [loadbuf+MN_OPCODE_OFF]
        cmp     ax, [loadbuf+MN_ID_OPCODE_OFF]
        jne     .bad
        mov     ax, [loadbuf+SX_COUNT_OFF]
        or      ax, ax
        jz      .bad
        cmp     ax, SCRIPTCAP
        ja      .bad
        dec     ax
        cmp     ax, [loadbuf+MN_EVENT_OFF]
        jne     .bad
        imul    si, ax, SX_EVENT_BYTES
        add     si, loadbuf+SX_EVENTS_OFF
        mov     ax, [loadbuf+MN_OPCODE_OFF]
        cmp     word [si], ax
        jne     .bad
        cmp word [loadbuf+MN_OPCODE_OFF], 39h
        je .who_event
        cmp word [loadbuf+MN_OPCODE_OFF], 2bh
        je .horizontal_event
        cmp     word [loadbuf+MN_OPCODE_OFF], 0022h
        je      .party_event
        cmp     word [si+2], 2
        jb      .bad
        mov     ax, [si+6]              ; operand 1 is metadata; operand 2 is the destination
        cmp     ax, [loadbuf+MN_DEST_OFF]
        jne     .bad
        jmp     .sidecar_event
.horizontal_event:
        cmp word [si+2],2
        jb .bad
        mov ax,[si+4]           ; first operand is destination, unlike0F
        cmp ax,[loadbuf+MN_DEST_OFF]
        jne .bad
        mov ax,[si+6]
        cmp ax,[loadbuf+MN_COUNT_OFF]
        jne .bad
        jmp .sidecar_event
.who_event:
        cmp word [si+2], 1
        jne .bad
        mov ax, [si+4]
        cmp ax, 1
        jb .bad
        cmp ax, 128
        ja .bad
        movzx dx, byte [loadbuf+MT_DATA_OFF]
        cmp ax, dx
        jne .bad
        jmp .sidecar_event
.party_event:
        cmp     word [si+2], 0
        jne     .bad
.sidecar_event:
        cmp     byte [sidecar_active], 1
        jne     .bad
        cmp     word [sidecar_count], 0
        je      .bad
        mov     bx, [sidecar_count]
        dec     bx
        call    read_sidecar_record
        jc      .bad
        mov     ax, [loadbuf+MN_EVENT_OFF]
        imul    si, ax, SX_EVENT_BYTES
        add     si, loadbuf+SX_EVENTS_OFF
        mov     di, sidebuf
        mov     cx, SX_EVENT_BYTES/2
.compare_event:
        mov     ax, [si]
        cmp     ax, [di]
        jne     .bad
        add     si, 2
        add     di, 2
        loop    .compare_event
        cmp     dword [loadbuf+MT_MAGIC_OFF], 'GBMT'
        jne     .bad
        cmp word [loadbuf+MN_OPCODE_OFF], 39h
        jne .other_text
        call who_validate_labels
        ret
.other_text:
        cmp word [loadbuf+MN_OPCODE_OFF],2bh
        jne .other_legacy_text
        call validate_horizontal_labels
        ret
.other_legacy_text:
        cmp     word [loadbuf+MN_OPCODE_OFF], 0022h
        je      .party_text
        cmp     word [loadbuf+MT_COUNT_OFF], 0
        jne     .bad
        mov     si, MT_DATA_OFF
        mov     cx, MENU_TEXT_CAP
.number_padding:
        cmp     byte [loadbuf+si], 0
        jne     .bad
        inc     si
        loop    .number_padding
        cmp     byte [ackname], 0
        je      .bad
        clc
        ret
.party_text:
        cmp     word [loadbuf+MT_COUNT_OFF], 3
        jne     .bad
        mov     si, MT_DATA_OFF
        movzx   ax, byte [loadbuf+si]
        inc     si
        add     si, ax
        cmp     si, MT_DATA_OFF+MENU_TEXT_CAP-8
        ja      .bad
        cmp     byte [loadbuf+si], 3
        jne     .bad
        inc     si
        cmp     word [loadbuf+si], 05464h
        jne     .bad
        cmp     byte [loadbuf+si+2], 0c0h
        jne     .bad
        add     si, 3
        cmp     byte [loadbuf+si], 3
        jne     .bad
        inc     si
        cmp     word [loadbuf+si], 0f038h
        jne     .bad
        cmp     byte [loadbuf+si+2], 0
        jne     .bad
        add     si, 3
.party_padding:
        cmp     si, MT_DATA_OFF+MENU_TEXT_CAP
        jae     .party_ready
        cmp     byte [loadbuf+si], 0
        jne     .bad
        inc     si
        jmp     .party_padding
.party_ready:
        cmp     byte [ackname], 0
        je      .bad
        clc
        ret
.bad:   stc
        ret

show_pending_menu:
        cmp     byte [sidecar_fault], 0
        jne     .bad
        cmp     byte [menu_auto], 0
        je      .manual
        call    validate_auto_answer
        jc      .bad
        mov     ax, [menu_auto_answer]
        mov     [menu_selected], ax
        clc
        ret
.bad:   stc
        ret
.manual:
        cmp word [loadbuf+MN_OPCODE_OFF], 39h
        jne .ordinary_manual
        call who_show_labels
        call who_manual_choice
        mov [menu_selected], ax
        ret
.ordinary_manual:
        call    print_pending_prompt
        cmp word [loadbuf+MN_OPCODE_OFF],2bh
        jne .other_manual
        call show_horizontal_labels
        mov dx,s_horizontal_input
        mov ah,09h
        int 21h
        jmp .number_again
.other_manual:
        cmp     word [loadbuf+MN_OPCODE_OFF], 0022h
        je      .party
        mov     dx, s_number_input
        mov     ah, 09h
        int     21h
.number_again:
        mov     byte [menu_input], 6     ; five unsigned-16 digits plus CR
        mov     byte [menu_input+1], 0
        mov     dx, menu_input
        mov     ah, 0Ah
        int     21h
        call    parse_menu_number
        jc      .number_bad
        mov     [menu_selected], ax
        clc
        ret
.number_bad:
        mov     dx, s_menu_invalid
        mov     ah, 09h
        int     21h
        jmp     .number_again
.party:
        mov     dx, s_party_choice
        mov     ah, 09h
        int     21h
        cmp     byte [pending_prompt_len], 0
        jne     .party_prompt_shown
        mov     si, MT_DATA_OFF
        call    print_pending_label     ; fallback for a caption absent from GBSL
        mov     dl, 13
        mov     ah, 02h
        int     21h
        mov     dl, 10
        mov     ah, 02h
        int     21h
.party_prompt_shown:
        mov     si, MT_DATA_OFF
        movzx   ax, byte [loadbuf+si]
        inc     si
        add     si, ax
        mov     dx, s_yes_label
        mov     ah, 09h
        int     21h
        call    print_pending_label
        mov     dx, s_no_label
        mov     ah, 09h
        int     21h
        call    print_pending_label
.party_again:
        mov     dx, s_party_input
        mov     ah, 09h
        int     21h
        mov     ah, 08h
        int     21h
        and     al, 0dfh
        cmp     al, 'Y'
        je      .party_yes
        cmp     al, 'N'
        jne     .party_bad
        mov     word [menu_selected], 1
        clc
        ret
.party_yes:
        mov     word [menu_selected], 0
        clc
        ret
.party_bad:
        mov     dx, s_menu_invalid
        mov     ah, 09h
        int     21h
        jmp     .party_again

save_pending_prompt:
        push    es
        push    ds
        pop     es                  ; later pages arrive with caller ES=A000
        push    ax
        push    cx
        push    si
        push    di
        mov     cl, [effect_text_len]
        cmp     cl, SCRIPT_PAGE_BYTES
        jbe     .length_ok
        mov     cl, SCRIPT_PAGE_BYTES
.length_ok:
        mov     [pending_prompt_len], cl
        movzx   cx, cl
        mov     si, effect_text
        mov     di, pending_prompt
        rep     movsb
        mov     byte [di], 0
        pop     di
        pop     si
        pop     cx
        pop     ax
        pop     es
        ret

print_pending_prompt:
        movzx   cx, byte [pending_prompt_len]
        mov     si, pending_prompt
.char:
        jcxz    .newline
        mov     dl, [si]
        inc     si
        mov     ah, 02h
        int     21h
        loop    .char
.newline:
        mov     dl, 13
        mov     ah, 02h
        int     21h
        mov     dl, 10
        mov     ah, 02h
        int     21h
        ret

; SI addresses one validated GBMT length-prefixed packed segment.
print_pending_label:
        push    ax
        push    bx
        push    cx
        push    dx
        movzx   cx, byte [loadbuf+si]
        inc     si
        xor     dh, dh
.char:
        xor     al, al
        mov     bl, 6
.bits:
        cmp     bl, 0
        je      .have_char
        cmp     dh, 0
        jne     .source_ready
        cmp     cx, 0
        je      .done
        mov     dl, [loadbuf+si]
        inc     si
        dec     cx
        mov     dh, 8
.source_ready:
        shl     dl, 1
        rcl     al, 1
        dec     dh
        dec     bl
        jmp     .bits
.have_char:
        or      al, al
        jz      .done
        cmp     al, 31
        ja      .emit
        add     al, 64
.emit:
        push    cx
        push    dx
        mov     dl, al
        mov     ah, 02h
        int     21h
        pop     dx
        pop     cx
        jmp     .char
.done:
        add     si, cx
        pop     dx
        pop     cx
        pop     bx
        pop     ax
        ret

parse_menu_number:
        movzx   cx, byte [menu_input+1]
        or      cx, cx
        jz      .bad
        cmp     cx, 5
        ja      .bad
        mov     si, menu_input+2
        xor     bx, bx
.digit:
        mov     al, [si]
        cmp     al, '0'
        jb      .bad
        cmp     al, '9'
        ja      .bad
        mov     ax, bx
        mov     dx, 10
        mul     dx
        or      dx, dx
        jnz     .bad
        mov     bx, ax
        movzx   ax, byte [si]
        sub     ax, '0'
        add     bx, ax
        jc      .bad
        inc     si
        loop    .digit
        mov     ax, bx
        cmp word [loadbuf+MN_OPCODE_OFF],2bh
        jne .legacy_domain
        test ax,ax
        jz .bad
        dec ax                        ; manual menu1..N -> ordinary token0..N-1
        jmp .bounded
.legacy_domain:
        cmp     word [loadbuf+MN_COUNT_OFF], 0
        je      .ok
.bounded:
        cmp     ax, [loadbuf+MN_COUNT_OFF]
        jae     .bad
.ok:
        clc
        ret
.bad:   stc
        ret

%include "ccfp_secret_menu.inc"

write_pending_outcome:
        cmp     byte [sidecar_fault], 0
        jne     .bad
        cmp     byte [menu_arg_bad], 0
        jne     .bad
        call close_secret_text_sidecar
        jc .bad                       ; no WHO edit/token before checked close
        cmp word [loadbuf+4], 16
        jne .token
        cmp word [loadbuf+MN_OPCODE_OFF], 39h
        jne .token
        call who_commit_choice
        jc .bad
.token:
        mov     word [ackbuf], 'GB'
        mov     word [ackbuf+2], 'MO'
        mov     word [ackbuf+4], 2
        mov     ax, [menu_selected]
        mov     [ackbuf+6], ax
        mov     ax, [loadbuf+MN_COUNT_OFF]
        mov     [ackbuf+8], ax
        mov     ax, [loadbuf+MN_ID_PC_OFF]
        mov     [ackbuf+10], ax
        mov     ax, [loadbuf+MN_ID_AREA_OFF]
        mov     [ackbuf+12], ax
        mov     ax, [loadbuf+MN_ID_DEST_OFF]
        mov     [ackbuf+14], ax
        mov     ax, [loadbuf+MN_ID_OPCODE_OFF]
        mov     [ackbuf+16], ax
        jmp     write_bound_outcome
.bad:   stc
        ret

write_ack_outcome:
        cmp     byte [sidecar_fault], 0
        jne     .bad
        cmp     byte [menu_arg_bad], 0
        jne     .bad
        call close_secret_text_sidecar
        jc .bad
        mov     word [ackbuf], 'GB'
        mov     word [ackbuf+2], 'MO'
        mov     word [ackbuf+4], 2
        mov     word [ackbuf+6], 1
        mov     word [ackbuf+8], 1
        mov     ax, [loadbuf+MN_ID_PC_OFF]
        mov     [ackbuf+10], ax
        mov     ax, [loadbuf+MN_ID_AREA_OFF]
        mov     [ackbuf+12], ax
        mov     ax, [loadbuf+MN_ID_DEST_OFF]
        mov     [ackbuf+14], ax
        mov     ax, [loadbuf+MN_ID_OPCODE_OFF]
        mov     [ackbuf+16], ax
        jmp     write_bound_outcome
.bad:   stc
        ret

write_bound_outcome:
        mov     dx, ackname
        xor     cx, cx
        mov     ah, 3Ch
        int     21h
        jc      .bad
        mov     [ofh], ax
        mov     bx, ax
        mov     ah, 40h
        mov     cx, GBMO_LEN
        mov     dx, ackbuf
        int     21h
        pushf
        push    ax
        mov     bx, [ofh]
        mov     ah, 3Eh
        int     21h
        jc      .close_bad
        pop     ax
        popf
        jc      .bad
        cmp     ax, GBMO_LEN
        jne     .bad
        clc
        ret
.close_bad:
        pop     ax
        popf
.bad:   stc
        ret

; Reproduce the retail cleanup as a 40-cell space fill at row 24 with color 0.
; Set the cursor for each cell so the last column cannot trigger a scroll.
cleanup_ack_row:
        push    ax
        push    bx
        push    cx
        push    dx
        cmp     byte [ack_mouse_present], 0
        je      .fill
        mov     ax, 0002h             ; INT 33h hide cursor before drawing
        int     33h
.fill:
        mov     dx, 1800h
        mov     cx, 40
.cell:
        push    cx
        mov     ah, 02h
        xor     bx, bx
        int     10h
        mov     ax, 0920h
        xor     bx, bx
        mov     cx, 1
        int     10h
        pop     cx
        inc     dl
        loop    .cell
        cmp     byte [ack_mouse_present], 0
        je      .done
        mov     ax, 0001h             ; restore cursor after drawing
        int     33h
.done:
        pop     dx
        pop     cx
        pop     bx
        pop     ax
        ret

; Match START's mouse-presence gate before issuing hide/show cursor calls.
probe_ack_mouse:
        mov     byte [ack_mouse_present], 0
        xor     ax, ax                ; INT 33h reset driver and read status
        int     33h
        cmp     ax, 0ffffh
        jne     .done
        mov     byte [ack_mouse_present], 1
.done:  ret

; Build one player-visible source page from GBSX event BX through CX (exclusive).
; PRINT appends; PRINTCLEAR and CLEAR_BOX clear what preceded them; PRINT_RETURN
; ends a non-empty page. The current event is the last consumed source event, so
; a capacity boundary resumes at the first unconsumed string on Enter. CF=1 if
; no visible text exists in the remaining event stream. A consumed terminal
; CLEAR_BOX/PRINTCLEAR is different: it returns an empty successful page so
; the walk loop redraws and visibly clears stale narration.
build_effect_page:
        push    ax
        push    dx
        push    si
        push    di
        push    bp
        mov     [effect_text_count], cx
        mov     byte [effect_text_len], 0
        mov     byte [effect_text_cleared], 0
        mov     di, effect_text
        xor     bp, bp
.event:
        cmp     bx, [effect_text_count]
        jae     .end
        mov     ax, bx
        mov     dx, SX_EVENT_BYTES
        mul     dx
        add     ax, SX_EVENTS_OFF
        mov     si, loadbuf
        add     si, ax
        mov     dx, [si]
        cmp     dx, 3Dh              ; CLEAR_BOX
        je      .clear
        cmp     dx, 33h              ; PRINT_RETURN
        je      .return
        cmp     dx, 11h              ; PRINT
        je      .text
        cmp     dx, 12h              ; PRINTCLEAR
        jne     .next
.clear:
        mov     di, effect_text
        xor     bp, bp
        mov     byte [effect_text_len], 0
        mov     byte [effect_text_cleared], 1
        cmp     dx, 3Dh
        je      .next
.text:
        mov     ax, bx
        shl     ax, 5
        mov     dx, bx
        shl     dx, 1
        add     ax, dx
        mov     si, loadbuf+SX_TEXT_OFF
        add     si, ax
        mov     ax, [si]
        or      ax, ax
        jz      .next
        cmp     ax, SCRIPT_TEXT_BYTES
        jbe     .text_len_ok
        mov     ax, SCRIPT_TEXT_BYTES
.text_len_ok:
        mov     dx, ax
        cmp     bp, 0
        je      .capacity
        inc     dx                   ; separating space between source PRINTs
.capacity:
        mov     ax, bp
        add     ax, dx
        cmp     ax, SCRIPT_PAGE_BYTES
        ja      .page_full
        cmp     bp, 0
        je      .copy
        mov     al, ' '
        stosb
        inc     bp
.copy:
        mov     ax, bx
        shl     ax, 5
        mov     dx, bx
        shl     dx, 1
        add     ax, dx
        mov     si, loadbuf+SX_TEXT_OFF+2
        add     si, ax
        mov     cx, [si-2]
        cmp     cx, SCRIPT_TEXT_BYTES
        jbe     .copy_len_ok
        mov     cx, SCRIPT_TEXT_BYTES
.copy_len_ok:
        mov     dx, cx
        rep     movsb
        add     bp, dx
.next:
        mov     [effect_text_current], bx
        inc     bx
        jmp     .event
.return:
        mov     [effect_text_current], bx
        inc     bx
        cmp     bp, 0
        je      .event
        jmp     .have_page
.page_full:
        ; A single GBSX string is bounded to 32 bytes, so a full page always
        ; leaves this event intact for the next Enter page.
        cmp     bp, 0
        je      .next
.have_page:
        mov     ax, bp
        mov     [effect_text_len], al
        mov     byte [di], 0
        clc
        jmp     .ret
.end:
        cmp     bp, 0
        je      .none
        jmp     .have_page
.none:
        cmp     byte [effect_text_cleared], 0
        jne     .cleared
        stc
        jmp     .ret
.cleared:
        clc
.ret:
        pop     bp
        pop     di
        pop     si
        pop     dx
        pop     ax
        ret

; Open and validate the complete sibling stream for a flagged GBEF.  The file
; is left open so /W page advancement and /Z diagnostic selection can seek one
; source record at a time without imposing an artificial record-count cap.
open_effect_sidecar:
        call    make_effect_sidecar_name
        jc      .bad
        mov     ax, 3D00h
        mov     dx, sidecar_name
        int     21h
        jc      .bad
        mov     [sidefh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, 8
        mov     dx, sidebuf
        int     21h
        jc      .close_bad
        cmp     ax, 8
        jne     .close_bad
        cmp     word [sidebuf], 'GB'
        jne     .close_bad
        cmp     word [sidebuf+2], 'SL'
        jne     .close_bad
        mov     ax, [sidebuf+4]
        cmp     ax, 1
        je      .version_ok
        cmp     ax, 2
        jne     .close_bad
.version_ok:
        mov     [sidecar_version], ax
        mov     ax, [sidebuf+6]
        or      ax, ax
        jz      .close_bad
        mov     [sidecar_count], ax

        ; The fixed rows retain their v1 offsets in both versions.
        mov     bx, 54
        mul     bx
        add     ax, 8
        adc     dx, 0
        cmp     word [sidecar_version], 2
        je      .v2
        mov     [sidecar_len_lo], ax
        mov     [sidecar_len_hi], dx
        jmp     .check_extent
.v2:
        cmp     dx, 0
        jne     .close_bad
        mov     [sidecar_records_end], ax
        call    validate_sidecar_v2
        jc      .close_bad
.check_extent:
        mov     bx, [sidefh]
        mov     ax, 4202h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_bad
        cmp     ax, [sidecar_len_lo]
        jne     .close_bad
        cmp     dx, [sidecar_len_hi]
        jne     .close_bad
        clc
        ret
.close_bad:
        call    close_effect_sidecar
.bad:
        stc
        ret

close_effect_sidecar:
        cmp     word [sidefh], 0
        je      .done
        mov     bx, [sidefh]
        mov     ah, 3Eh
        int     21h
        mov     word [sidefh], 0
.done:
        ret


close_secret_text_sidecar:
        cmp word [sidecar_version], 2
        jne .ok
        cmp word [side_ext+4], 2
        jne .ok                       ; legacy close policy is unchanged
        jmp close_effect_sidecar       ; DOS carry survives its MOV/RET
.ok: clc
        ret

; GBSL v2 keeps every v1 row in place and adds a checked packed-text tail.
; Refuse malformed metadata before the renderer can select any text event.
validate_sidecar_v2:
        mov     bx, [sidefh]
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, [sidecar_records_end]
        int     21h
        jc      .bad
        mov     bx, [sidefh]
        mov     ah, 3fh
        mov     cx, 12
        mov     dx, side_ext
        int     21h
        jc      .bad
        cmp     ax, 12
        jne     .bad
        cmp     dword [side_ext], 'GBPX'
        jne     .bad
        cmp     word [side_ext+4], 1
        je      .codec_ok
        cmp     word [side_ext+4], 2
        jne     .bad
        call    validate_secret_text_context
        jc      .bad
.codec_ok:
        mov     ax, [side_ext+6]
        or      ax, ax
        jz      .bad
        cmp     ax, [sidecar_count]
        ja      .bad
        mov     [sidecar_tag_count], ax
        cmp     word [side_ext+10], 0
        jne     .bad
        mov     ax, [side_ext+8]
        mov     [sidecar_payload_len], ax
        mov     ax, [sidecar_records_end]
        add     ax, 12
        jc      .bad
        mov     [sidecar_dir_base], ax
        mov     bx, [sidecar_tag_count]
        shl     bx, 3
        add     ax, bx
        jc      .bad
        mov     [sidecar_payload_base], ax
        add     ax, [sidecar_payload_len]
        jc      .bad
        mov     [sidecar_len_lo], ax
        mov     word [sidecar_len_hi], 0
        mov     word [sidecar_seen_tags], 0
        mov     word [sidecar_seen_payload], 0
        mov     word [sidecar_index], 0
.record:
        mov     bx, [sidecar_index]
        cmp     bx, [sidecar_count]
        jae     .complete
        call    read_sidecar_record
        jc      .bad
        mov     ax, [sidebuf+SX_EVENT_BYTES]
        cmp     ax, 0ffffh
        je      .long
        cmp     ax, SCRIPT_TEXT_BYTES
        ja      .bad
        jmp     .next
.long:
        cmp     word [sidebuf], 11h
        je      .long_opcode_ok
        cmp     word [sidebuf], 12h
        jne     .bad
.long_opcode_ok:
        cmp     dword [sidebuf+SX_EVENT_BYTES+2], 'GBPX'
        jne     .bad
        mov     ax, [sidebuf+SX_EVENT_BYTES+6]
        cmp     ax, [sidecar_seen_tags]
        jne     .bad
        mov     si, sidebuf+SX_EVENT_BYTES+8
        mov     cx, 26
.reserved:
        cmp     byte [si], 0
        jne     .bad
        inc     si
        loop    .reserved
        mov     bx, [sidecar_seen_tags]
        call    read_sidecar_directory
        jc      .bad
        mov     ax, [side_dir]
        cmp     ax, [sidecar_index]
        jne     .bad
        mov     ax, [side_dir+2]
        cmp     ax, [sidecar_seen_payload]
        jne     .bad
        mov     ax, [side_dir+4]
        or      ax, ax
        jz      .bad
        cmp     ax, 255
        ja      .bad
        add     [sidecar_seen_payload], ax
        jc      .bad
        cmp     word [side_dir+6], 32
        jbe     .bad
        call    read_sidecar_packed
        jc      .bad
        call    count_sidecar_packed
        cmp     bp, [side_dir+6]
        jne     .bad
        inc     word [sidecar_seen_tags]
.next:
        inc     word [sidecar_index]
        jmp     .record
.complete:
        mov     ax, [sidecar_seen_tags]
        cmp     ax, [sidecar_tag_count]
        jne     .bad
        mov     ax, [sidecar_seen_payload]
        cmp     ax, [sidecar_payload_len]
        jne     .bad
        clc
        ret
.bad:   stc
        ret

; BX = v2 directory index; preserves BX.  The validated trailer fits inside
; the same 16-bit file offset cap used by the native damage journal.
read_sidecar_directory:
        push    bx
        cmp     bx, [sidecar_tag_count]
        jae     .bad
        shl     bx, 3
        add     bx, [sidecar_dir_base]
        jc      .bad
        mov     dx, bx
        mov     bx, [sidefh]
        mov     ax, 4200h
        xor     cx, cx
        int     21h
        jc      .bad
        mov     bx, [sidefh]
        mov     ah, 3fh
        mov     cx, 8
        mov     dx, side_dir
        int     21h
        jc      .bad
        cmp     ax, 8
        jne     .bad
        pop     bx
        clc
        ret
.bad:   mov     byte [sidecar_fault], 1
        pop     bx
        stc
        ret

read_sidecar_packed:
        mov     dx, [sidecar_payload_base]
        add     dx, [side_dir+2]
        jc      .bad
        mov     bx, [sidefh]
        mov     ax, 4200h
        xor     cx, cx
        int     21h
        jc      .bad
        mov     bx, [sidefh]
        mov     ah, 3fh
        mov     cx, [side_dir+4]
        mov     dx, side_packed
        int     21h
        jc      .bad
        cmp     ax, [side_dir+4]
        jne     .bad
        clc
        ret
.bad:   mov     byte [sidecar_fault], 1
        stc
        ret

count_sidecar_packed:
        mov     si, side_packed
        mov     cx, [side_dir+4]
        xor     bp, bp
        xor     dx, dx
.char:
        xor     al, al
        mov     ah, 6
.bits:
        cmp     dh, 0
        jne     .have
        jcxz    .done
        mov     dl, [si]
        inc     si
        dec     cx
        mov     dh, 8
.have:
        shl     dl, 1
        rcl     al, 1
        dec     dh
        dec     ah
        jnz     .bits
        or      al, al
        jnz     .nonzero
        cmp     word [side_ext+4], 2
        je      .char
        jmp     .done
.nonzero:
        cmp     word [side_ext+4], 2
        jne     .count
        cmp     bp, 255
        jae     .char
.count:
        inc     bp
        jmp     .char
.done:  ret

; Construct only the same-stem .GBS name.  An extensionless effect path has no
; unambiguous sibling and therefore rejects instead of selecting a stale global
; stream.
make_effect_sidecar_name:
        mov     si, effectname
        cmp     byte [si], 0
        jne     .copy
        mov     si, s_defeffect
.copy:
        mov     di, sidecar_name
        xor     bx, bx
.loop:
        lodsb
        mov     [di], al
        or      al, al
        jz      .end
        cmp     al, '.'
        jne     .next
        mov     bx, di
.next:
        inc     di
        jmp     .loop
.end:
        or      bx, bx
        jz      .bad
        cmp     bx, sidecar_name+123
        ja      .bad
        mov     byte [bx+1], 'G'
        mov     byte [bx+2], 'B'
        mov     byte [bx+3], 'S'
        mov     byte [bx+4], 0
        clc
        ret
.bad:
        stc
        ret

; BX = zero-based source index.  Reads exactly one {event[20], text[34]}
; record into sidebuf.  The validated count and exact file length make every
; seek bounded, but retain the read-length check against host I/O failures.
read_sidecar_record:
        push    bx
        cmp     bx, [sidecar_count]
        jae     .bad
        mov     ax, bx
        mov     cx, 54
        mul     cx
        add     ax, 8
        adc     dx, 0
        mov     [sidecar_seek_lo], ax
        mov     [sidecar_seek_hi], dx
        mov     bx, [sidefh]
        mov     ax, 4200h
        mov     cx, [sidecar_seek_hi]
        mov     dx, [sidecar_seek_lo]
        int     21h
        jc      .bad
        mov     bx, [sidefh]
        mov     ah, 3Fh
        mov     cx, 54
        mov     dx, sidebuf
        int     21h
        jc      .bad
        cmp     ax, 54
        jne     .bad
        pop     bx
        clc
        ret
.bad:
        mov     byte [sidecar_fault], 1
        pop     bx
        stc
        ret

; Preserve the old "latest picture" contract, but scan the complete source
; stream instead of merely the final 64 records in GBEF.
scan_sidecar_pictures:
        push    bx
        push    cx
        mov     word [sidecar_index], 0
.loop:
        mov     bx, [sidecar_index]
        cmp     bx, [sidecar_count]
        jae     .done
        call    read_sidecar_record
        jc      .bad
        cmp     word [sidebuf], 000Eh
        jne     .next
        cmp     word [sidebuf+2], 1
        jb      .next
        mov     ax, [sidebuf+4]
        mov     [effect_picture_id], ax
        mov     byte [effect_picture_valid], 1
.next:
        inc     word [sidecar_index]
        jmp     .loop
.done:
        pop     cx
        pop     bx
        clc
        ret
.bad:
        pop     cx
        pop     bx
        stc
        ret

; Sidecar analogue of build_effect_page.  It intentionally has the same
; PRINT/PRINTCLEAR/CLEAR_BOX/PRINT_RETURN page semantics as the fixed GBSX
; path, differing only in where it obtains the next record.
build_sidecar_effect_page:
        cmp     word [sidecar_version], 2
        je      build_sidecar_v2_page
        push    es
        push    ds
        pop     es                  ; Page text belongs to DS, even after rendering.
        push    ax
        push    cx
        push    dx
        push    si
        push    di
        push    bp
        mov     ax, [sidecar_count]
        mov     [effect_text_count], ax
        mov     byte [effect_text_len], 0
        mov     byte [effect_text_cleared], 0
        mov     di, effect_text
        xor     bp, bp
.event:
        cmp     bx, [effect_text_count]
        jae     .end
        call    read_sidecar_record
        jc      .none
        mov     dx, [sidebuf]
        cmp     dx, 3Dh
        je      .clear
        cmp     dx, 33h
        je      .return
        cmp     dx, 11h
        je      .text
        cmp     dx, 12h
        jne     .next
.clear:
        mov     di, effect_text
        xor     bp, bp
        mov     byte [effect_text_len], 0
        mov     byte [effect_text_cleared], 1
        cmp     dx, 3Dh
        je      .next
.text:
        mov     ax, [sidebuf+SX_EVENT_BYTES]
        or      ax, ax
        jz      .next
        cmp     ax, SCRIPT_TEXT_BYTES
        jbe     .text_len_ok
        mov     ax, SCRIPT_TEXT_BYTES
.text_len_ok:
        mov     dx, ax
        cmp     bp, 0
        je      .capacity
        inc     dx
.capacity:
        mov     ax, bp
        add     ax, dx
        cmp     ax, SCRIPT_PAGE_BYTES
        ja      .page_full
        cmp     bp, 0
        je      .copy
        mov     al, ' '
        stosb
        inc     bp
.copy:
        mov     si, sidebuf+SX_EVENT_BYTES+2
        mov     cx, [sidebuf+SX_EVENT_BYTES]
        cmp     cx, SCRIPT_TEXT_BYTES
        jbe     .copy_len_ok
        mov     cx, SCRIPT_TEXT_BYTES
.copy_len_ok:
        mov     dx, cx
        rep     movsb
        add     bp, dx
.next:
        mov     [effect_text_current], bx
        inc     bx
        jmp     .event
.return:
        mov     [effect_text_current], bx
        inc     bx
        cmp     bp, 0
        je      .event
        jmp     .have_page
.page_full:
        cmp     bp, 0
        je      .next
.have_page:
        mov     ax, bp
        mov     [effect_text_len], al
        mov     byte [di], 0
        clc
        jmp     .ret
.end:
        cmp     bp, 0
        jne     .have_page
.none:
        cmp     byte [effect_text_cleared], 0
        jne     .cleared
        cmp     word [loadbuf+4], 16
        jne     .no_text
        cmp     word [loadbuf+MN_OPCODE_OFF], 0039h
        jne     .no_text
        mov     word [effect_text_current], 0ffffh ; No WHO narration to acknowledge.
.no_text:
        stc
        jmp     .ret
.cleared:
        clc
.ret:
        pop     bp
        pop     di
        pop     si
        pop     dx
        pop     cx
        pop     ax
        pop     es
        ret

; A v2 page can stop inside one packed source string.  The cursor is the
; event ordinal plus decoded-character offset, so Enter resumes on the next
; character and does not apply PRINTCLEAR a second time.
build_sidecar_v2_page:
        push    es
        push    ds
        pop     es                  ; /W arrives with ES=A000h; STOSB targets text
        push    ax
        push    cx
        push    dx
        push    si
        push    di
        push    bp
        mov     ax, [sidecar_count]
        mov     [effect_text_count], ax
        mov     byte [effect_text_len], 0
        mov     byte [effect_text_cleared], 0
        mov     di, effect_text
        xor     bp, bp
.event:
        cmp     bx, [effect_text_count]
        jae     .end
        call    read_sidecar_record
        jc      .none
        mov     dx, [sidebuf]
        cmp     dx, 3dh
        je      .clear
        cmp     dx, 33h
        je      .return
        cmp     dx, 11h
        je      .text
        cmp     dx, 12h
        jne     .next
.clear:
        cmp     word [effect_text_offset], 0
        jne     .text
        mov     di, effect_text
        xor     bp, bp
        mov     byte [effect_text_len], 0
        mov     byte [effect_text_cleared], 1
        cmp     dx, 3dh
        je      .next
.text:
        mov     ax, [sidebuf+SX_EVENT_BYTES]
        cmp     ax, 0ffffh
        je      .long
        or      ax, ax
        jz      .next
        mov     dx, ax
        cmp     word [side_ext+4], 2
        je      .short_capacity
        cmp     bp, 0
        je      .short_capacity
        inc     dx
.short_capacity:
        mov     ax, bp
        add     ax, dx
        cmp     ax, SCRIPT_PAGE_BYTES
        ja      .page_full
        cmp     bp, 0
        je      .short_copy
        cmp     word [side_ext+4], 2
        je      .short_copy
        mov     al, ' '
        stosb
        inc     bp
.short_copy:
        mov     si, sidebuf+SX_EVENT_BYTES+2
        mov     cx, [sidebuf+SX_EVENT_BYTES]
        add     bp, cx
        rep     movsb
        jmp     .next
.long:
        push    bx
        mov     bx, [sidebuf+SX_EVENT_BYTES+6]
        call    read_sidecar_directory
        jc      .long_fail
        call    read_sidecar_packed
        jc      .long_fail
        pop     bx
        cmp     word [effect_text_offset], 0
        jne     .decode
        cmp     word [side_ext+4], 2
        jne     .separator
        ; An exact full preceding page has not consumed this event. Keep
        ; the previous ordinal so zero-offset advance selects this row.
        cmp     bp, SCRIPT_PAGE_BYTES
        jae     .page_full
        jmp     .decode
.separator:
        cmp     bp, 0
        je      .decode
        ; Reserve one column for the separator and one for at least the
        ; first source character.  Otherwise the zero-offset cursor would
        ; look like a consumed event on the next Enter.
        cmp     bp, SCRIPT_PAGE_BYTES-1
        jae     .page_full
        mov     al, ' '
        stosb
        inc     bp
.decode:
        mov     word [v2_char_index], 0
        mov     si, side_packed
        mov     cx, [side_dir+4]
        xor     dx, dx
.char:
        xor     al, al
        mov     ah, 6
.bits:
        cmp     dh, 0
        jne     .have_source
        jcxz    .long_done
        mov     dl, [si]
        inc     si
        dec     cx
        mov     dh, 8
.have_source:
        shl     dl, 1
        rcl     al, 1
        dec     dh
        dec     ah
        jnz     .bits
        or      al, al
        jnz     .nonzero
        cmp     word [side_ext+4], 2
        je      .char
        jmp     .long_done
.nonzero:
        cmp     word [side_ext+4], 2
        jne     .bounded
        cmp     word [v2_char_index], 255
        jae     .char
.bounded:
        push    ax
        mov     ax, [v2_char_index]
        cmp     ax, [effect_text_offset]
        pop     ax
        jb      .skip_char
        cmp     bp, SCRIPT_PAGE_BYTES
        jae     .long_page_full
        cmp     al, 31
        ja      .emit
        add     al, 64
.emit:
        stosb
        inc     bp
.skip_char:
        inc     word [v2_char_index]
        jmp     .char
.long_page_full:
        mov     ax, [v2_char_index]
        mov     [effect_text_offset], ax
        mov     [effect_text_current], bx
        jmp     .have_page
.long_done:
        mov     word [effect_text_offset], 0
        jmp     .next
.long_fail:
        pop     bx
        jmp     .none
.next:
        mov     [effect_text_current], bx
        inc     bx
        jmp     .event
.return:
        mov     [effect_text_current], bx
        inc     bx
        cmp     bp, 0
        je      .event
        jmp     .have_page
.page_full:
        cmp     bp, 0
        je      .next
.have_page:
        mov     ax, bp
        mov     [effect_text_len], al
        mov     byte [di], 0
        clc
        jmp     .ret
.end:
        cmp     bp, 0
        jne     .have_page
.none:
        cmp     byte [effect_text_cleared], 0
        jne     .cleared
        cmp     word [loadbuf+4], 16
        jne     .no_text
        cmp     word [loadbuf+MN_OPCODE_OFF], 0039h
        jne     .no_text
        mov     word [effect_text_current], 0ffffh ; No WHO narration to acknowledge.
.no_text:
        stc
        jmp     .ret
.cleared:
        clc
.ret:
        pop     bp
        pop     di
        pop     si
        pop     dx
        pop     cx
        pop     ax
        pop     es
        ret

; Advance the normal /W view to the next source page. /Z remains a diagnostic
; slot selector and cycles its old record-by-record view.
advance_effect_text:
        cmp     byte [effectmode], 0
        je      .none
        cmp     byte [sidecar_active], 0
        jne     advance_sidecar_effect_text
        mov     cx, [loadbuf+SX_COUNT_OFF]
        or      cx, cx
        jz      .none
        cmp     cx, SCRIPTCAP
        ja      .none
        mov     bx, [effect_text_current]
        cmp     word [effect_text_slot], 0FFFFh
        jne     .slot_next
        cmp     bx, 0FFFFh
        je      .none
        inc     bx
        cmp     bx, cx
        jae     .none
        call    build_effect_page
        jc      .none
        clc
        ret
.slot_next:
        cmp     bx, 0FFFFh
        jne     .slot_inc
        mov     bx, 0FFFFh
.slot_inc:
        inc     bx
        cmp     bx, cx
        jb      .slot_try
        xor     bx, bx
.slot_try:
        mov     ax, bx
        shl     ax, 5
        mov     dx, bx
        shl     dx, 1
        add     ax, dx
        mov     si, loadbuf+SX_TEXT_OFF
        add     si, ax
        cmp     word [si], 0
        je      .slot_skip
        mov     ax, bx
        mov     dx, SX_EVENT_BYTES
        mul     dx
        add     ax, SX_EVENTS_OFF
        mov     si, ax
        add     si, loadbuf
        cmp     word [si], 11h
        je      .slot_found
        cmp     word [si], 12h
        je      .slot_found
.slot_skip:
        dec     cx
        jnz     .slot_inc
        jmp     .none
.slot_found:
        cmp     bx, [effect_text_current]
        je      .none
        mov     [effect_text_slot], bx
        call    load_effect_text
        clc
        ret
.none:
        stc
        ret

; /W and /Z navigation over an exact, arbitrary-length GBSL stream.
advance_sidecar_effect_text:
        mov     cx, [sidecar_count]
        or      cx, cx
        jz      .none
        mov     bx, [effect_text_current]
        cmp     word [effect_text_slot], 0FFFFh
        jne     .slot_next
        cmp     bx, 0FFFFh
        je      .none
        cmp     word [effect_text_offset], 0
        jne     .continue_long
        inc     bx
        cmp     bx, cx
        jae     .none
.continue_long:
        call    build_sidecar_effect_page
        jc      .none
        clc
        ret
.slot_next:
        cmp     bx, 0FFFFh
        jne     .slot_inc
        mov     bx, 0FFFFh
.slot_inc:
        inc     bx
        cmp     bx, cx
        jb      .slot_try
        xor     bx, bx
.slot_try:
        call    read_sidecar_record
        jc      .none
        cmp     word [sidebuf+SX_EVENT_BYTES], 0
        je      .slot_skip
        cmp     word [sidebuf+SX_EVENT_BYTES], 0ffffh
        je      .slot_skip
        cmp     word [sidebuf], 11h
        je      .slot_found
        cmp     word [sidebuf], 12h
        je      .slot_found
.slot_skip:
        dec     cx
        jnz     .slot_inc
        jmp     .none
.slot_found:
        cmp     bx, [effect_text_current]
        je      .none
        mov     [effect_text_slot], bx
        call    load_effect_text
        clc
        ret
.none:
        stc
        ret

; Build the fallback bottom-band message from CCECL's seven-slot GBCL clock:
; "TIME HH:MM DNN". Slot 1 is minutes, slot 2 is 10-minute units, slot 3 is
; hours, and slot 4 is the zero-based day-of-month.
format_clock_text:
        push    ax
        push    bx
        push    dx
        push    di
        mov     di, effect_text
        mov     al, 'T'
        stosb
        mov     al, 'I'
        stosb
        mov     al, 'M'
        stosb
        mov     al, 'E'
        stosb
        mov     al, ' '
        stosb
        mov     ax, [effect_clock_slots+6]      ; hour
        call    append_2dig
        mov     al, ':'
        stosb
        mov     ax, [effect_clock_slots+4]      ; 10-minute slot
        mov     bx, 10
        mul     bx
        add     ax, [effect_clock_slots+2]      ; minute slot
        call    append_2dig
        mov     al, ' '
        stosb
        mov     al, 'D'
        stosb
        mov     ax, [effect_clock_slots+8]      ; day, display 1-based
        inc     ax
        call    append_2dig
        mov     byte [di], 0
        mov     ax, di
        sub     ax, effect_text
        mov     [effect_text_len], al
        pop     di
        pop     dx
        pop     bx
        pop     ax
        ret

append_2dig:                              ; AX 0..99, DI advanced by two chars
        push    ax
        push    bx
        push    dx
        cmp     ax, 99
        jbe     .ok
        mov     ax, 99
.ok:
        xor     dx, dx
        mov     bx, 10
        div     bx
        add     al, '0'
        stosb
        mov     al, dl
        add     al, '0'
        stosb
        pop     dx
        pop     bx
        pop     ax
        ret

; ============================================================================
;  draw_sky_backdrop: when CCECL supplied a GBCL clock tail, paint the open-sky
;  backdrop used by Draw3dWorldBackground: blue sky band plus an 8x8 sun block
;  for the pinned hour/facing cases. If WGRD supplied a plane2 backdrop tail,
;  the current cell's high bit marks a roofed/indoor cell and keeps the legacy
;  black ceiling. No GBCL means retain the legacy black ceiling.
; ============================================================================
draw_sky_backdrop:
        cmp     byte [effect_clock_valid], 0
        je      .ret
        push    ax
        push    bx
        push    dx

        cmp     byte [roofmode], 0
        je      .paint
        mov     ax, [px_pose]
        cmp     ax, [gridW]
        jae     .paint
        mov     ax, [py_pose]
        cmp     ax, [gridH]
        jae     .paint
        mul     word [gridW]
        add     ax, [px_pose]
        cmp     ax, [gridCells]
        jae     .paint
        mov     bx, ax
        mov     al, [roofbuf+bx]
        test    al, 80h
        jnz     .done

.paint:
        mov     word [xs], 8
        mov     word [xe], 176
        mov     word [ys], 8
        mov     word [ye], 70
        mov     byte [fp_color], 11
        call    fill_rect

        call    place_sky_body
        jc      .done
        mov     ax, [tmpx]
        shl     ax, 3
        add     ax, 8
        mov     [xs], ax
        add     ax, 8
        mov     [xe], ax
        mov     ax, [tmpy]
        shl     ax, 3
        add     ax, 8
        mov     [ys], ax
        add     ax, 8
        mov     [ye], ax
        mov     byte [fp_color], 14
        call    fill_rect
.done:
        pop     dx
        pop     bx
        pop     ax
.ret:
        ret

; CF=0 with tmpx=col,tmpy=row when a body is visible; CF=1 otherwise.
place_sky_body:
        mov     bx, [facing]
        cmp     bx, 0
        jne     .sunrise
        mov     word [tmpx], 10
        mov     word [tmpy], 1
        clc
        ret
.sunrise:
        mov     ax, [effect_clock_slots+6]      ; hour
        cmp     ax, 1
        jb      .sunset
        cmp     ax, 5
        ja      .sunset
        cmp     bx, 2
        je      .rise_east
        cmp     bx, 4
        jne     .sunset
        cmp     ax, 2
        jbe     .sunset
        mov     word [tmpx], 14
        jmp     .rise_row
.rise_east:
        mov     word [tmpx], 10
.rise_row:
        mov     dx, 7
        sub     dx, ax
        mov     [tmpy], dx
        clc
        ret
.sunset:
        mov     ax, [effect_clock_slots+6]
        cmp     ax, 13
        jb      .none
        cmp     ax, 18
        ja      .none
        cmp     bx, 6
        jne     .none
        mov     word [tmpx], 10
        sub     ax, 11
        mov     [tmpy], ax
        clc
        ret
.none:
        stc
        ret

; ============================================================================
;  draw_effect_setup: draw a compact approach marker from CCECL's GBES setup
;  tail. This is the renderer bridge for SETUP_MONSTER/APPROACH until native
;  CPIC/sprite art exists: lower distance draws a larger, nearer marker in the
;  center of the first-person viewport.
;  ES must be A000 on entry; it is restored before returning.
; ============================================================================
draw_effect_setup:
        cmp     byte [effect_setup_valid], 0
        je      .ret
        cmp     byte [gbim_enabled], 0
        je      .marker
        cmp     byte [gbim_valid], 0
        je      .marker
        mov     ax, [effect_setup_pic]
        cmp     ax, [gbim_block]
        jne     .marker
        call    draw_gbim
        ret
.marker:
        push    ax
        push    bx
        push    cx
        push    dx
        push    di

        mov     ax, [effect_setup_distance]
        cmp     ax, [effect_setup_max]
        jbe     .max_ok
        mov     ax, [effect_setup_max]
.max_ok:
        cmp     ax, 5
        jbe     .clamp_ok
        mov     ax, 5
.clamp_ok:
        mov     [effect_setup_draw_dist], ax

        ; width = max(8, 28 - distance*4)
        shl     ax, 2
        mov     bx, 28
        sub     bx, ax
        cmp     bx, 8
        jge     .w_ok
        mov     bx, 8
.w_ok:
        mov     [effect_setup_w], bx
        mov     ax, bx
        add     ax, 8
        mov     [effect_setup_h], ax

        ; x center = 92, y bottom = 132 - distance*12.
        mov     ax, bx
        shr     ax, 1
        mov     bx, 92
        sub     bx, ax
        mov     [xs], bx
        add     bx, [effect_setup_w]
        mov     [xe], bx

        mov     ax, [effect_setup_draw_dist]
        mov     bx, 12
        mul     bx
        mov     bx, 132
        sub     bx, ax
        mov     [ye], bx
        sub     bx, [effect_setup_h]
        mov     [ys], bx

        ; Clip to the first-person viewport.
        mov     ax, [xs]
        cmp     ax, 9
        jge     .xs_ok
        mov     word [xs], 8
.xs_ok:
        mov     ax, [xe]
        cmp     ax, 176
        jle     .xe_ok
        mov     word [xe], 176
.xe_ok:
        mov     ax, [ys]
        cmp     ax, 8
        jge     .ys_ok
        mov     word [ys], 8
.ys_ok:
        mov     ax, [ye]
        cmp     ax, 176
        jle     .ye_ok
        mov     word [ye], 176
.ye_ok:
        mov     ax, [xs]
        cmp     ax, [xe]
        jge     .done
        mov     ax, [ys]
        cmp     ax, [ye]
        jge     .done
        mov     byte [fp_color], 12
        call    fill_rect
.done:
        pop     di
        pop     dx
        pop     cx
        pop     bx
        pop     ax
.ret:
        ret

; Draw the matched GBIM encounter frame, treating colour zero as transparent.
; Near approach distances use a deterministic 2x nearest-neighbour scale.
draw_gbim:
        push    ax
        push    bx
        push    cx
        push    dx
        push    si
        push    di
        push    bp
        push    ds
        mov     word [gbim_scale], 1
        cmp     word [effect_setup_distance], 1
        ja      .scale_ready
        mov     word [gbim_scale], 2
.scale_ready:
        mov     ax, [gbim_width]
        mul     word [gbim_scale]
        mov     bx, ax
        shr     ax, 1
        mov     dx, 92
        sub     dx, ax
        mov     [gbim_dstx], dx
        mov     ax, [gbim_height]
        mul     word [gbim_scale]
        mov     dx, 132
        sub     dx, ax
        mov     [gbim_dsty], dx
        mov     word [gbim_sy], 0
        mov     ds, [cs:image_seg]
.src_row:
        mov     ax, [cs:gbim_sy]
        cmp     ax, [cs:gbim_height]
        jae     .done
        mul     word [cs:gbim_width]
        add     ax, 14
        mov     si, ax
        mov     word [cs:gbim_ry], 0
.repeat_row:
        mov     ax, [cs:gbim_ry]
        cmp     ax, [cs:gbim_scale]
        jae     .next_src_row
        mov     ax, [cs:gbim_sy]
        mul     word [cs:gbim_scale]
        add     ax, [cs:gbim_ry]
        add     ax, [cs:gbim_dsty]
        mov     bx, 320
        mul     bx
        add     ax, [cs:gbim_dstx]
        mov     di, ax
        push    si
        mov     cx, [cs:gbim_width]
.pixel:
        lodsb
        mov     bp, [cs:gbim_scale]
.repeat_pixel:
        or      al, al
        jz      .transparent
        mov     [es:di], al
.transparent:
        inc     di
        dec     bp
        jnz     .repeat_pixel
        loop    .pixel
        pop     si
        inc     word [cs:gbim_ry]
        jmp     .repeat_row
.next_src_row:
        inc     word [cs:gbim_sy]
        jmp     .src_row
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

; Draw /I art as an unscaled transparent overlay at the explicit /H x y
; coordinates.  /H is used only for recovered HEAD/BODY paper dolls; unlike
; draw_gbim it is independent of an encounter's approach distance.
draw_scene_overlay:
        push    ax
        push    bx
        push    cx
        push    dx
        push    si
        push    di
        push    ds
        mov     ds, [cs:image_seg]
        mov     word [cs:gbim_sy], 0
.src_row:
        mov     ax, [cs:gbim_sy]
        cmp     ax, [cs:gbim_height]
        jae     .done
        mul     word [cs:gbim_width]
        add     ax, 14
        mov     si, ax
        mov     ax, [cs:gbim_sy]
        add     ax, [cs:scene_overlay_y]
        mov     bx, 320
        mul     bx
        add     ax, [cs:scene_overlay_x]
        mov     di, ax
        mov     cx, [cs:gbim_width]
.pixel:
        lodsb
        or      al, al
        jz      .transparent
        mov     [es:di], al
.transparent:
        inc     di
        loop    .pixel
        inc     word [cs:gbim_sy]
        jmp     .src_row
.done:
        pop     ds
        pop     di
        pop     si
        pop     dx
        pop     cx
        pop     bx
        pop     ax
        ret

; Load and validate one bounded row-major GBIM resource. Failure is optional.
load_gbim:
        mov     byte [gbim_valid], 0
        cmp     byte [gbimname], 0
        je      .ret
        mov     ax, 3D00h
        mov     dx, gbimname
        int     21h
        jc      .ret
        mov     [fh], ax
        push    ds
        mov     ds, [cs:image_seg]
        mov     ah, 3Fh
        mov     bx, [cs:fh]
        mov     cx, DAX_FILEMAX
        xor     dx, dx
        int     21h
        pop     ds
        mov     [gbim_len], ax
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        cmp     word [gbim_len], 14+1+768
        jb      .ret
        push    ds
        mov     ds, [image_seg]
        cmp     byte [0], 'G'
        jne     .bad
        cmp     byte [1], 'B'
        jne     .bad
        cmp     byte [2], 'I'
        jne     .bad
        cmp     byte [3], 'M'
        jne     .bad
        cmp     word [4], 1
        jne     .bad
        test    byte [8], 1
        jz      .bad
        mov     ax, [10]
        or      ax, ax
        jz      .bad
        cmp     ax, 160
        ja      .bad
        mov     [cs:gbim_width], ax
        mov     ax, [12]
        or      ax, ax
        jz      .bad
        cmp     ax, 160
        ja      .bad
        mov     [cs:gbim_height], ax
        mul     word [cs:gbim_width]
        or      dx, dx
        jnz     .bad
        mov     [cs:gbim_npix], ax
        add     ax, 14+768
        cmp     ax, [cs:gbim_len]
        ja      .bad
        mov     ax, [6]
        mov     [cs:gbim_block], ax
        mov     byte [cs:gbim_valid], 1
        ; T6-2: a validated GBIM is enabled on every graphics set (DOS CPIC1
        ; icons arrive via CGB with graphics_alt_enabled == 0).  The
        ; effect_setup_pic == gbim_block provenance check in draw_effect_setup
        ; is what keeps a stale or foreign image from drawing.
        mov     byte [cs:gbim_enabled], 1
.bad:
        pop     ds
.ret:
        ret

; Let matched Amiga encounter art own the same 0..31 DAC window as its archive.
apply_gbim_palette:
        cmp     byte [graphics_alt_enabled], 0
        je      .ret
        cmp     byte [gbim_enabled], 0
        je      .ret
        cmp     byte [gbim_valid], 0
        je      .ret
        push    ds
        push    es
        mov     ds, [image_seg]
        push    cs
        pop     es
        mov     si, [cs:gbim_npix]
        add     si, 14
        mov     di, palbuf
        mov     cx, 96
.copy:
        lodsb
        shr     al, 2
        stosb
        loop    .copy
        mov     word [cs:pal_colors], 32
        pop     es
        pop     ds
.ret:
        ret

; Opaque classic scene at screen (8,8), up to 304x168.
draw_scene_gbim:
        push    ax
        push    bx
        push    cx
        push    si
        push    di
        push    ds
        mov     ds, [cs:scene_seg]
        mov     si, 14
        ; BIGPIC fills the classic inner frame at (8,8). Gen1 PICTURE can
        ; also select an 88x88 PIC portrait; the original draws that at the
        ; 3x3-cell inset, so preserve its distinct placement.
        mov     word [cs:scene_x], 8
        mov     word [cs:scene_top], 8
        cmp     word [cs:scene_width], 120
        jae     .placement_ready
        mov     word [cs:scene_x], 24
        mov     word [cs:scene_top], 24
.placement_ready:
        mov     word [cs:scene_y], 0
.row:
        mov     ax, [cs:scene_y]
        cmp     ax, [cs:scene_height]
        jae     .done
        add     ax, [cs:scene_top]
        mov     bx, 320
        mul     bx
        add     ax, [cs:scene_x]
        mov     di, ax
        mov     cx, [cs:scene_width]
        rep     movsb
        inc     word [cs:scene_y]
        jmp     .row
.done:
        pop     ds
        pop     di
        pop     si
        pop     cx
        pop     bx
        pop     ax
        ret

load_scene_gbim:
        mov     byte [scene_valid], 0
        cmp     byte [scenename], 0
        je      .ret
        mov     ax, 3D00h
        mov     dx, scenename
        int     21h
        jc      .ret
        mov     [fh], ax
        push    ds
        mov     ds, [cs:scene_seg]
        mov     ah, 3Fh
        mov     bx, [cs:fh]
        mov     cx, DAX_FILEMAX
        xor     dx, dx
        int     21h
        pop     ds
        mov     [scene_len], ax
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        cmp     word [scene_len], 14+1+768
        jb      .ret
        push    ds
        mov     ds, [scene_seg]
        cmp     byte [0], 'G'
        jne     .bad
        cmp     byte [1], 'B'
        jne     .bad
        cmp     byte [2], 'I'
        jne     .bad
        cmp     byte [3], 'M'
        jne     .bad
        cmp     word [4], 1
        jne     .bad
        test    byte [8], 1
        jz      .bad
        mov     ax, [10]
        or      ax, ax
        jz      .bad
        cmp     ax, 304
        ja      .bad
        mov     [cs:scene_width], ax
        mov     ax, [12]
        or      ax, ax
        jz      .bad
        cmp     ax, 168
        ja      .bad
        mov     [cs:scene_height], ax
        mul     word [cs:scene_width]
        or      dx, dx
        jnz     .bad
        mov     [cs:scene_npix], ax
        add     ax, 14+768
        cmp     ax, [cs:scene_len]
        ja      .bad
        mov     ax, [6]
        mov     [cs:scene_block], ax
        mov     byte [cs:scene_valid], 1
        ; GBIM scenes are self-contained (indexed pixels plus their own
        ; palette).  They must not depend on a wall-art GBTS resource having
        ; been enabled: scripted DOS BIGPIC/PIC fallback uses precisely this
        ; path, and load_scene_gbim runs before the texture-table build.
        mov     byte [cs:scene_enabled], 1
.bad:
        pop     ds
.ret:
        ret

apply_scene_palette:
        cmp     byte [scene_enabled], 0
        je      .ret
        cmp     byte [scene_valid], 0
        je      .ret
        cmp     byte [effect_picture_valid], 0
        jne     .have_effect_picture
        jmp     .have_effect_picture
.have_effect_picture:
        cmp     byte [effect_picture_valid], 0
        je      .scene_match
        mov     ax, [effect_picture_id]
        cmp     ax, [scene_block]
        je      .scene_match
        cmp     byte [scene_force], 0
        je      .ret
.scene_match:
        push    ds
        push    es
        mov     ds, [scene_seg]
        push    cs
        pop     es
        mov     si, [cs:scene_npix]
        add     si, 14
        mov     di, palbuf
        mov     cx, 96
.copy:
        lodsb
        shr     al, 2
        stosb
        loop    .copy
        mov     word [cs:pal_colors], 32
        pop     es
        pop     ds
.ret:
        ret

; filled rectangle [xs,xe) x [ys,ye), colour [fp_color]. ES=A000.
fill_rect:
        mov     ax, [ys]
.row:
        cmp     ax, [ye]
        jge     .ret
        push    ax
        mov     bx, 320
        mul     bx
        add     ax, [xs]
        mov     di, ax
        mov     cx, [xe]
        sub     cx, [xs]
        mov     al, [fp_color]
        rep     stosb
        pop     ax
        inc     ax
        jmp     .row
.ret:
        ret

; ============================================================================
;  draw_effect_text: draw captured ECL text in a bottom message band.
;  ES must be A000 on entry; it is restored before returning.
; ============================================================================
draw_effect_text:
        cmp     byte [effect_text_len], 0
        je      .ret
        push    ax
        push    bx
        push    cx
        push    dx
        push    si
        push    di
        push    bp
        push    ds
        push    es

        ; Clear screen rows y=176..199 so repeated /W redraws do not leave text.
        mov     ax, 176
.row:
        cmp     ax, 200
        jge     .text
        push    ax
        mov     bx, 320
        mul     bx
        mov     di, ax
        mov     cx, 320
        xor     al, al
        rep     stosb
        pop     ax
        inc     ax
        jmp     .row

.text:
        push    cs
        pop     ds
        mov     ax, 0200h           ; set cursor page 0, row 22, col 1
        xor     bx, bx
        mov     dx, 1601h
        int     10h
        mov     si, effect_text
        movzx   cx, byte [effect_text_len]
        xor     bp, bp
.ch:
        jcxz    .done
        cmp     bp, 39
        jb      .emit
        mov     al, 13
        mov     ah, 0Eh
        mov     bx, 000Fh
        int     10h
        mov     al, 10
        int     10h
        xor     bp, bp
.emit:
        lodsb
        mov     ah, 0Eh             ; teletype in graphics mode
        mov     bx, 000Fh           ; page 0, bright white
        int     10h
        inc     bp
        loop    .ch
.done:
        pop     es
        pop     ds
        pop     bp
        pop     di
        pop     si
        pop     dx
        pop     cx
        pop     bx
        pop     ax
.ret:
        ret

; ============================================================================
;  try_step: AL = even dir (0/2/4/6).  Attempt one cell step from the live pose
;  (px_pose,py_pose) in that direction, applying the VERIFIED engine collision
;  rule (Explorer.step, packages/engine/src/world/explorer.ts):
;    * blocked when the leaving cell's wall slot for `dir` is non-zero unless
;      the optional WGRD plane3 tail marks that edge as a door/gateway;
;    * else blocked when the destination leaves the 16x16 grid (no wrap);
;    * else the party advances into the destination cell.
;  Mutates px_pose,py_pose on success; leaves them unchanged when blocked.
;  Trashes AX,BX,CX,DX,SI; CF unused.
; ============================================================================
try_step:
        mov     [ts_dir], al
        ; slot = wallbuf[(py*16+px)*4 + dir/2]  (current cell is in-bounds: no wrap)
        mov     ax, [px_pose]
        mov     [wt_x], ax
        mov     ax, [py_pose]
        mov     [wt_y], ax
        mov     al, [ts_dir]
        call    wt                  ; AL = wall slot for this edge
        cmp     al, 0
        je      .open_edge
        cmp     byte [doormode], 0
        je      .ret                ; non-zero wall slot, no door tail -> blocked
        call    current_edge_door
        cmp     al, 0
        je      .ret                ; wall slot with no door/gateway -> blocked
.open_edge:
        ; nx = px + XD[dir]; ny = py + YD[dir]
        mov     bx, 0
        mov     bl, [ts_dir]
        movsx   ax, byte [XD+bx]
        add     ax, [px_pose]
        mov     [ts_nx], ax
        movsx   ax, byte [YD+bx]
        add     ax, [py_pose]
        mov     [ts_ny], ax
        ; in-bounds [0,W-1]x[0,H-1]?
        mov     ax, [ts_nx]
        cmp     ax, 0
        jl      .ret
        mov     bx, [gridW]
        dec     bx
        cmp     ax, bx
        jg      .ret
        mov     ax, [ts_ny]
        cmp     ax, 0
        jl      .ret
        mov     bx, [gridH]
        dec     bx
        cmp     ax, bx
        jg      .ret
        ; DQK walk sound, mirroring DQK.EXE 0x43B26: PlaySound(0x0B) fires on an
        ; ALLOWED step, BEFORE the position advances (never on turns or blocked steps).
        call    step_sound
        ; commit
        mov     ax, [ts_nx]
        mov     [px_pose], ax
        mov     ax, [ts_ny]
        mov     [py_pose], ax
        mov     byte [stepflag], 1
.ret:
        ret

; ============================================================================
;  step_sound: DQK walk sound via CCSND /P 8 7418 DISK1\SOUNDS.GLB (member 8 =
;  PlaySound id 0x0B, header rate 7418 Hz).  Active only when DISK1\SOUNDS.GLB
;  opens relative to the current directory (the game dir), so CoK/DoK and every
;  title without that file are untouched.  The .COM block is shrunk to 64 KiB
;  for the EXEC and regrown after; CCSND's stdout is routed to NUL so neither
;  the mode-13h frame nor a redirected /M trace is disturbed.  Every failure
;  (no CCSND.COM, no memory) is silent.  Preserves all registers.
; ============================================================================
step_sound:
        pusha
        push    es
        ; GBIM encounter/scene art lives in image_seg/scene_seg (cs+6000h/7000h) and is read on every redraw,
        ; even while toggled off (G re-enables it): never EXEC over it.  No sound while either is resident.
        cmp     byte [gbim_valid], 0
        jne     .out
        cmp     byte [scene_valid], 0
        jne     .out
        mov     ax, 3D00h
        mov     dx, snd_glb
        int     21h
        jc      .out
        mov     bx, ax
        mov     ah, 3Eh
        int     21h
        mov     ax, [2]
        mov     cx, cs
        sub     ax, cx
        mov     [snd_full], ax
        mov     bx, 1000h           ; keep only our 64 KiB segment ...
        cmp     byte [gbwfpmode], 0
        je      .keep
        add     bh, 10h             ; ... plus dax_seg (cs+1000h), which /F redraws read live
.keep:
        mov     ah, 4Ah
        push    ds
        pop     es
        int     21h
        jc      .regrow
        mov     bx, 1
        mov     ah, 45h
        int     21h
        jc      .regrow
        mov     [snd_save], ax
        mov     ax, 3D01h
        mov     dx, snd_nul
        int     21h
        jc      .closesave
        mov     bx, ax
        mov     cx, 1
        mov     ah, 46h
        int     21h
        mov     ah, 3Eh
        int     21h
        mov     ax, ds
        mov     word [snd_epb], 0
        mov     word [snd_epb+2], snd_tail
        mov     [snd_epb+4], ax
        mov     word [snd_epb+6], 5Ch
        mov     [snd_epb+8], ax
        mov     word [snd_epb+10], 6Ch
        mov     [snd_epb+12], ax
        mov     [snd_sp], sp
        mov     [snd_ss], ss
        mov     dx, snd_com
        mov     bx, snd_epb
        mov     ax, 4B00h
        int     21h
        cli
        mov     ss, [cs:snd_ss]
        mov     sp, [cs:snd_sp]
        sti
        push    cs
        pop     ds
        push    cs
        pop     es
        mov     bx, [snd_save]
        mov     cx, 1
        mov     ah, 46h
        int     21h
.closesave:
        mov     bx, [snd_save]
        mov     ah, 3Eh
        int     21h
.regrow:
        mov     bx, [snd_full]
        mov     ah, 4Ah
        push    ds
        pop     es
        int     21h
.out:
        pop     es
        popa
        ret
; current_edge_door: return AL = door/gateway flag for [px_pose,py_pose] and
; [ts_dir] from the optional WGRD plane3 tail. Bits are N=0..1, E=2..3,
; S=4..5, W=6..7; 0 = plain wall, nonzero = passable door/gateway.
current_edge_door:
        push    bx
        push    cx
        push    dx
        push    si
        mov     ax, [py_pose]
        mul     word [gridW]        ; ax = py*W (W*H <= MAX_MAP_CELLS)
        add     ax, [px_pose]
        mov     si, ax
        mov     al, [doorbuf + si]
        mov     cl, [ts_dir]
        shr     al, cl
        and     al, 3
        pop     si
        pop     dx
        pop     cx
        pop     bx
        ret

; ============================================================================
;  do_move: AL = move code (0=forward, 1=backward, 2=turn left, 3=turn right).
;  Forward/backward call try_step in the facing / opposite direction; turns
;  rotate `facing` by +/-2 (mod 8 over even values), matching Explorer's
;  turnLeft/turnRight/forward/backward.  Trashes AX,BX,CX,DX,SI.
; ============================================================================
do_move:
        cmp     al, 0
        je      .fwd
        cmp     al, 1
        je      .back
        cmp     al, 2
        je      .tl
        cmp     al, 3
        je      .tr
        ret
.fwd:
        mov     al, [facing]
        call    try_step
        ret
.back:
        mov     al, [facing]
        add     al, 4               ; opposite even dir
        and     al, 6
        call    try_step
        ret
.tl:
        mov     ax, [facing]
        sub     ax, 2
        and     ax, 6
        mov     [facing], ax
        ret
.tr:
        mov     ax, [facing]
        add     ax, 2
        and     ax, 6
        mov     [facing], ax
        ret

; ============================================================================
;  run_move_script (/M): create CCFP.MOV, walk the script in [movescr] applying
;  do_move for each F/B/L/R char, and after EACH step append a trace line
;  "px py facing\r\n" (facing 0..3 = N/E/S/W, i.e. the even ccfp value /2) so a
;  TS oracle can diff against Explorer.  An initial line is emitted for the start
;  pose so the trace length = steps+1. C requests camp and ends the script;
;  other non-FBLR chars are ignored.
; ============================================================================
run_move_script:
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, movpath
        int     21h
        jc      .ret
        mov     [movfh], ax
        call    emit_trace          ; start pose
        mov     si, movescr
.l:
        mov     al, [si]
        or      al, al
        jz      .done
        inc     si
        push    si
        ; map char -> move code; ignore others
        and     al, 0DFh            ; upper-case
        cmp     al, 'C'
        je      .camp
        cmp     al, 'F'
        je      .mf
        cmp     al, 'B'
        je      .mb
        cmp     al, 'L'
        je      .ml
        cmp     al, 'R'
        je      .mr
        pop     si
        jmp     .l
.mf:
        xor     al, al
        jmp     .apply
.mb:
        mov     al, 1
        jmp     .apply
.ml:
        mov     al, 2
        jmp     .apply
.mr:
        mov     al, 3
.apply:
        call    do_move
        call    emit_trace
        pop     si
        jmp     .l
.camp:
        mov     byte [campflag], 1
        pop     si
        jmp     .done
.done:
        mov     bx, [movfh]
        mov     ah, 3Eh
        int     21h
.ret:
        ret

; emit_trace: append "px py facing\r\n" (facing = [facing]/2 = 0..3) to CCFP.MOV.
emit_trace:
        mov     di, linebuf
        mov     ax, [px_pose]
        call    put_sdec
        mov     al, ' '
        stosb
        mov     ax, [py_pose]
        call    put_sdec
        mov     al, ' '
        stosb
        mov     ax, [facing]
        shr     ax, 1               ; even ccfp dir -> 0..3 (N/E/S/W)
        call    put_sdec
        mov     al, 13
        stosb
        mov     al, 10
        stosb
        mov     cx, di
        sub     cx, linebuf
        mov     dx, linebuf
        mov     bx, [movfh]
        mov     ah, 40h
        int     21h
        ret

; ============================================================================
;  wt (wallType): AL=dir(0/2/4/6); reads [wt_y],[wt_x]; returns AL = slot 0..15.
;  Faithful port of wallview.ts wallType: off-map in ECL block 0/10 -> open(0),
;  else the coord clamp-wraps to the opposite edge (>W-1->0, <0->W-1; same for H)
;  and a real cell is read.  The 16x16 literals of the oracle are generalised to
;  [gridW]x[gridH]: for the legacy 16x16 grid this is byte-identical (W=H=16).
; ============================================================================
wt:
        push    bx
        push    cx
        push    dx
        push    si
        mov     [wt_dir], al
        ; inMap(y,x)?  x in [0,W-1], y in [0,H-1]
        mov     ax, [wt_x]
        cmp     ax, 0
        jl      .notin
        mov     bx, [gridW]
        dec     bx
        cmp     ax, bx
        jg      .notin
        mov     ax, [wt_y]
        cmp     ax, 0
        jl      .notin
        mov     bx, [gridH]
        dec     bx
        cmp     ax, bx
        jg      .notin
        jmp     .wrap
.notin:
        mov     ax, [ecl]
        cmp     ax, 0
        je      .ret0
        cmp     ax, 10
        je      .ret0
.wrap:
        ; wx: >W-1 -> 0 ; <0 -> W-1 ; else keep
        mov     ax, [wt_x]
        mov     bx, [gridW]
        dec     bx                  ; W-1
        cmp     ax, bx
        jle     .wxlo
        xor     ax, ax
        jmp     .wxd
.wxlo:
        cmp     ax, 0
        jge     .wxd
        mov     ax, bx              ; W-1
.wxd:
        mov     cx, ax              ; wx
        ; wy: >H-1 -> 0 ; <0 -> H-1 ; else keep
        mov     ax, [wt_y]
        mov     bx, [gridH]
        dec     bx                  ; H-1
        cmp     ax, bx
        jle     .wylo
        xor     ax, ax
        jmp     .wyd
.wylo:
        cmp     ax, 0
        jge     .wyd
        mov     ax, bx              ; H-1
.wyd:
        ; index = (wy*W + wx)*4 + dir/2
        mul     word [gridW]        ; ax = wy*W (dx:ax; W*H < 16K so dx=0)
        add     ax, cx              ; + wx
        shl     ax, 2               ; *4 (cell = 4 bytes N,E,S,W)
        mov     bl, [wt_dir]
        shr     bl, 1               ; dir/2 (dir is even)
        xor     bh, bh
        add     ax, bx
        mov     si, ax
        mov     al, [wallbuf + si]
        jmp     .done
.ret0:
        xor     al, al
.done:
        pop     si
        pop     dx
        pop     cx
        pop     bx
        ret

; wt using [fx],[fy] as y,x: AL=dir in -> AL=slot out.
wt_fxy:
        mov     [wt_dir], al
        mov     ax, [fy]
        mov     [wt_y], ax
        mov     ax, [fx]
        mov     [wt_x], ax
        mov     al, [wt_dir]
        call    wt
        ret

; inMap(fy,fx): AL=1 if fx in [0,W-1] and fy in [0,H-1], else 0.
inmap_fxy:
        mov     ax, [fx]
        cmp     ax, 0
        jl      .no
        mov     bx, [gridW]
        dec     bx
        cmp     ax, bx
        jg      .no
        mov     ax, [fy]
        cmp     ax, 0
        jl      .no
        mov     bx, [gridH]
        dec     bx
        cmp     ax, bx
        jg      .no
        mov     al, 1
        ret
.no:
        xor     al, al
        ret

; ============================================================================
;  do_emit:  DX=pieceIdx, AX=slot, BX=colStart(signed), CX=rowStart(signed).
;  Skips slot<=0 (open edge).  Else fills the piece rectangle.
; ============================================================================
do_emit:
        cmp     ax, 0
        jle     .skip
        mov     [emit_slot], ax
        mov     [fp_piece], dx
        mov     [fp_col], bx
        mov     [fp_row], cx
        cmp     byte [dumpmode], 0
        jne     .dump
        cmp     byte [gbwfpmode], 0
        jne     .gbws
        cmp     byte [texmode], 0
        jne     .tex
        call    fill_piece
        ret
.tex:
        call    expand_piece
        ret
.gbws:
        call    draw_gbws_piece
        ret
.dump:
        ; "  piece=P slot=S colStart=C rowStart=R\r\n" -> match fp_cok_plan.txt
        mov     di, linebuf
        mov     si, s_piece
        call    cat_si
        mov     ax, [fp_piece]
        call    put_sdec
        mov     si, s_slot
        call    cat_si
        mov     ax, [emit_slot]
        call    put_sdec
        mov     si, s_col
        call    cat_si
        mov     ax, [fp_col]
        call    put_sdec
        mov     si, s_row
        call    cat_si
        mov     ax, [fp_row]
        call    put_sdec
        cmp     byte [gbwfpmode], 0
        je      .dump_write
        call    select_gbws_piece
        jc      .dump_gbw_skip
        mov     si, s_gbwidx
        call    cat_si
        mov     ax, [gbw_drawidx]
        call    put_sdec
        jmp     .dump_write
.dump_gbw_skip:
        mov     si, s_gbwidx
        call    cat_si
        mov     ax, -1
        call    put_sdec
.dump_write:
        mov     al, 13
        stosb
        mov     al, 10
        stosb
        mov     cx, di
        sub     cx, linebuf
        mov     dx, linebuf
        mov     bx, [planfh]
        mov     ah, 40h
        int     21h
.skip:
        ret

; ============================================================================
;  fill_piece: draw the OUTLINE of PIECES[fp_piece] anchored at draw-grid
;  (fp_col,fp_row), clipped to the 168x168 viewport (8,8)-(176,176).  Outlines
;  (not solid fills) because the real wall pieces are mostly-transparent tile
;  grids you see the corridor through -- nested rectangle borders reproduce the
;  receding perspective without one near panel blotting out the whole view.
;    x0=(col+3)*8  y0=(row+3)*8  w=cols*8  h=rows*8   colour = pcolor[piece]
;  An edge is drawn only when its line sits inside the viewport, so an off-edge
;  piece never paints a spurious bar on the viewport border.
; ============================================================================
fill_piece:
        mov     bx, [fp_piece]
        mov     al, [pcolor+bx]
        mov     [fp_color], al
        mov     ax, [fp_col]
        add     ax, 3
        shl     ax, 3
        mov     [rx0], ax
        movzx   cx, byte [pcols+bx]
        shl     cx, 3
        add     cx, ax
        mov     [rx1], cx
        mov     ax, [fp_row]
        add     ax, 3
        shl     ax, 3
        mov     [ry0], ax
        movzx   cx, byte [prows+bx]
        shl     cx, 3
        add     cx, ax
        mov     [ry1], cx
        ; clipped x span [xs,xe)
        mov     ax, [rx0]
        cmp     ax, 8
        jge     .xs
        mov     ax, 8
.xs:
        mov     [xs], ax
        mov     ax, [rx1]
        cmp     ax, 176
        jle     .xe
        mov     ax, 176
.xe:
        mov     [xe], ax
        ; clipped y span [ys,ye)
        mov     ax, [ry0]
        cmp     ax, 8
        jge     .ys
        mov     ax, 8
.ys:
        mov     [ys], ax
        mov     ax, [ry1]
        cmp     ax, 176
        jle     .ye
        mov     ax, 176
.ye:
        mov     [ye], ax
        ; fully outside?
        mov     ax, [xs]
        cmp     ax, [xe]
        jge     .ret
        mov     ax, [ys]
        cmp     ax, [ye]
        jge     .ret
        ; TOP edge at y = ry0
        mov     ax, [ry0]
        cmp     ax, 8
        jl      .nt
        cmp     ax, 176
        jge     .nt
        mov     [tmpy], ax
        call    hspan
.nt:
        ; BOTTOM edge at y = ry1-1
        mov     ax, [ry1]
        dec     ax
        cmp     ax, 8
        jl      .nb
        cmp     ax, 176
        jge     .nb
        mov     [tmpy], ax
        call    hspan
.nb:
        ; LEFT edge at x = rx0
        mov     ax, [rx0]
        cmp     ax, 8
        jl      .nl
        cmp     ax, 176
        jge     .nl
        mov     [tmpx], ax
        call    vspan
.nl:
        ; RIGHT edge at x = rx1-1
        mov     ax, [rx1]
        dec     ax
        cmp     ax, 8
        jl      .nr
        cmp     ax, 176
        jge     .nr
        mov     [tmpx], ax
        call    vspan
.nr:
.ret:
        ret

; horizontal span at y=[tmpy], x in [xs,xe), colour [fp_color]
hspan:
        mov     ax, [tmpy]
        mov     bx, 320
        mul     bx
        add     ax, [xs]
        mov     di, ax
        mov     cx, [xe]
        sub     cx, [xs]
        mov     al, [fp_color]
        rep     stosb
        ret

; vertical span at x=[tmpx], y in [ys,ye), colour [fp_color]
vspan:
        mov     ax, [ys]
        mov     bx, 320
        mul     bx
        add     ax, [tmpx]
        mov     di, ax
        mov     cx, [ye]
        sub     cx, [ys]
        mov     al, [fp_color]
.l:
        mov     [es:di], al
        add     di, 320
        loop    .l
        ret

; ============================================================================
;  expand_piece (textured): port of expandWallPiece -- walk PIECES[fp_piece]'s
;  rows x cols, advancing the WALLDEF pool column every cell; for each in-grid
;  cell look up RESOLVE[(ws*5+slice)*156 + col] (0xFFFF=none) and blit that 8x8
;  tile at ((colX+3)*8,(rowY+3)*8).  slot -> ws/slice = wallSlotRouting(slot).
; ============================================================================
expand_piece:
        mov     ax, [emit_slot]
        and     ax, 0Fh
        jz      .ret                ; open edge
        dec     ax                  ; s-1
        xor     dx, dx
        mov     bx, 5
        div     bx                  ; ax = ws, dx = slice
        mov     [ex_ws], ax
        mov     [ex_slice], dx
        ; base = (ws*5 + slice) * 156
        mov     bx, 5
        mul     bx
        add     ax, [ex_slice]
        mov     bx, 156
        mul     bx
        mov     [ex_base], ax
        ; col = idxOffset[piece]; cols/rows
        mov     bx, [fp_piece]
        movzx   ax, byte [pidx+bx]
        mov     [ex_col], ax
        movzx   ax, byte [pcols+bx]
        mov     [ex_cols], ax
        movzx   ax, byte [prows+bx]
        mov     [ex_rows], ax
        mov     word [ex_r], 0
.rl:
        mov     ax, [ex_r]
        cmp     ax, [ex_rows]
        jge     .ret
        mov     word [ex_c], 0
.cl:
        mov     ax, [ex_c]
        cmp     ax, [ex_cols]
        jge     .rdone
        ; colX = colStart + c ; rowY = rowStart + r
        mov     ax, [fp_col]
        add     ax, [ex_c]
        mov     [ex_colX], ax
        mov     ax, [fp_row]
        add     ax, [ex_r]
        mov     [ex_rowY], ax
        ; clip rowY,colX to [0,10]
        mov     ax, [ex_rowY]
        cmp     ax, 0
        jl      .skip
        cmp     ax, 10
        jg      .skip
        mov     ax, [ex_colX]
        cmp     ax, 0
        jl      .skip
        cmp     ax, 10
        jg      .skip
        ; RESOLVE[base+col]
        mov     bx, [ex_base]
        add     bx, [ex_col]
        shl     bx, 1
        mov     ax, [resolvebuf+bx]
        cmp     ax, 0FFFFh
        je      .skip
        mov     [ex_slot], ax
        mov     ax, [ex_colX]
        add     ax, 3
        shl     ax, 3
        mov     [ex_px], ax
        mov     ax, [ex_rowY]
        add     ax, 3
        shl     ax, 3
        mov     [ex_py], ax
        call    blit_tile
.skip:
        inc     word [ex_col]
        inc     word [ex_c]
        jmp     .cl
.rdone:
        inc     word [ex_r]
        jmp     .rl
.ret:
        ret

; blit the 8x8 tile [ex_slot] at (ex_px,ex_py), skipping key index 13, clipped
; to the viewport (8,8)-(176,176).  Tile data = tilesbuf + slot*64 (row-major).
blit_tile:
        mov     ax, [ex_slot]
        shl     ax, 6               ; *64
        add     ax, tilesbuf
        mov     si, ax
        mov     word [bt_ty], 0
.ty:
        mov     ax, [bt_ty]
        cmp     ax, 8
        jge     .ret
        mov     ax, [ex_py]
        add     ax, [bt_ty]
        cmp     ax, 8
        jl      .rowskip
        cmp     ax, 176
        jge     .rowskip
        mov     bx, 320
        mul     bx
        mov     [bt_rowbase], ax
        mov     word [bt_tx], 0
.tx:
        mov     ax, [bt_tx]
        cmp     ax, 8
        jge     .rowdone
        mov     al, [si]
        inc     si
        cmp     al, 13              ; magenta key -> transparent
        je      .adv
        mov     [bt_pix], al
        mov     ax, [ex_px]
        add     ax, [bt_tx]
        cmp     ax, 8
        jl      .adv
        cmp     ax, 176
        jge     .adv
        mov     di, [bt_rowbase]
        add     di, ax
        mov     al, [bt_pix]
        mov     [es:di], al
.adv:
        inc     word [bt_tx]
        jmp     .tx
.rowdone:
        inc     word [bt_ty]
        jmp     .ty
.rowskip:
        add     si, 8               ; consume this row's 8 source bytes
        inc     word [bt_ty]
        jmp     .ty
.ret:
        ret

; load_named: open [ln_name], read up to [ln_len] into [ln_buf], close.
; CF=1 on open failure, else CF=0 and AX = bytes read.
load_named:
        mov     ax, 3D00h
        mov     dx, [ln_name]
        int     21h
        jc      .f
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, [ln_len]
        mov     dx, [ln_buf]
        int     21h
        push    ax
        mov     ah, 3Eh
        int     21h
        pop     ax
        clc
        ret
.f:
        stc
        ret

; ============================================================================
;  IN-ASM textured-wall table builder.  Reproduces, byte-for-byte, the engine's
;  baked RESOLVE.BIN / TILES.BIN / PAL.BIN directly from the game's DAX files --
;  a clean-room port of loadDungeonWalls + expandWallPiece's resolve walk
;  (packages/engine/src/world/dungeonWalls.ts, wallpieces.ts).  CoK ECL1 block 34
;  yields loadPieces setBlockIds [3,0xff,23]: WALLDEF1 block 3 (2 records -> wall
;  sets 0,1) + block 23 (1 record -> wallset 2); the matching 8X8D pools are
;  31/32 (CoK k>1 split) and 23, plus boot sets 0xCB (set0) and 0xCA (set4).
;
;  build_tables: CF=1 on any file/format error, else CF=0 and all of wdtab[],
;  high-scratch source tiles, tilesbuf[] (pool), resolvebuf[] and palbuf[] are
;  populated.
; ============================================================================
build_tables:
        call    set_texture_area_names
        ; --- decode the five 8X8D tile pools into high scratch, recording each
        ;     set's base byte-offset + tile count -------------------------------
        call    init_piece_ids
        jc      .err
        mov     byte [singlebank], 0
        mov     word [ts_next], 0      ; running byte offset into tileset_seg
        mov     di, gbts_set_seg
        mov     cx, 5*3
        xor     ax, ax
        rep     stosw                    ; seg/base/width arrays
        mov     di, ts_base
        mov     cx, 5
        xor     ax, ax
        rep     stosw
        mov     di, ts_cnt
        mov     cx, 5
        xor     ax, ax
        rep     stosw
        mov     di, wdtab
        mov     cx, 3*5*156
        xor     ax, ax
        rep     stosb

        mov     word [tiles_namep], s_tiles8_boot
        ; set 0 <- 8X8D block 0xCB
        mov     bx, 0
        mov     ax, 0CBh
        call    load_tileset
        jc      .err
        ; set 4 <- 8X8D block 0xCA
        mov     bx, 4
        mov     ax, 0CAh
        call    load_tileset
        jc      .err

        mov     word [tiles_namep], s_tiles8
        call    load_piece_tables
        jc      .err

        ; --- build the EGA-16 6-bit DAC palette into palbuf --------------------
        mov     word [pal_colors], 16
        mov     si, ega_pal
        mov     di, palbuf
        mov     cx, 48
.pl:
        mov     al, [si]
        shr     al, 2
        mov     [di], al
        inc     si
        inc     di
        loop    .pl
        cmp     byte [altpal_valid], 0
        je      .palette_done
        push    ds
        push    es
        mov     ds, [gbts_palette_seg]
        push    cs
        pop     es
        mov     si, [cs:gbts_palette_off]
        mov     di, palbuf
        mov     cx, [cs:gbts_pal_colors]
        mov     ax, cx
        shl     cx, 1
        add     cx, ax
.alt_pl:
        lodsb
        shr     al, 2
        mov     [es:di], al
        inc     di
        loop    .alt_pl
        pop     es
        pop     ds
        mov     ax, [gbts_pal_colors]
        mov     [pal_colors], ax
.palette_done:
        ; --- walk ws 0..2, slice 0..4, col 0..155 -> RESOLVE + deduped pool ----
        ; init RESOLVE to 0xFFFF and poolmap to 0xFFFF
        mov     di, resolvebuf
        mov     cx, 3*5*156
        mov     ax, 0FFFFh
        rep     stosw
        mov     di, poolmap
        mov     cx, 5*256
        mov     ax, 0FFFFh
        rep     stosw
        mov     word [pool_n], 0       ; tiles in pool so far

        mov     word [rb_ws], 0
.ws:
        cmp     word [rb_ws], 3
        jge     .done
        mov     word [rb_sl], 0
.sl:
        cmp     word [rb_sl], 5
        jge     .sl_done
        mov     word [rb_col], 0
.col:
        cmp     word [rb_col], 156
        jge     .col_done
        ; id = wdtab[(ws*5 + sl)*156 + col]
        mov     ax, [rb_ws]
        mov     bx, 5
        mul     bx
        add     ax, [rb_sl]
        mov     bx, 156
        mul     bx
        add     ax, [rb_col]
        mov     si, ax
        mov     al, [wdtab + si]
        movzx   ax, al
        cmp     ax, 0                   ; id<=0 -> no tile
        jle     .colnext
        mov     [rb_id], ax
        ; routeTileId(id) -> set, index
        call    route_tile             ; in [rb_id] -> [rt_set],[rt_index]
        cmp     byte [singlebank], 0
        je      .lookup_normal
        cmp     word [rt_set], 1
        jb      .lookup_normal
        cmp     word [rt_set], 3
        ja      .lookup_normal
        mov     word [rt_set], 1        ; DoK: wall sets 1..3 share 8X8D bank B
        mov     ax, [rb_id]
        dec     ax                      ; global tile id -> bank index (SYMBOL_SET_FIX[0]=1)
        mov     [rt_index], ax
.lookup_normal:
        ; lookupTile: must resolve to a real tile (index within set's count)
        mov     bx, [rt_set]
        mov     ax, [rt_index]
        cmp     ax, 0
        jl      .colnext
        shl     bx, 1
        mov     dx, [ts_cnt + bx]
        cmp     ax, dx
        jge     .colnext                ; index out of range -> skip (lookupTile null)
        ; dedup key = set*256 + index -> poolmap
        mov     bx, [rt_set]
        shl     bx, 8                   ; set*256
        add     bx, [rt_index]
        shl     bx, 1                   ; word index
        mov     ax, [poolmap + bx]
        cmp     ax, 0FFFFh
        jne     .have_slot
        ; new tile: copy 64 bytes into the deduped pool. Normal DAX sets are
        ; tile-major; a GBTS override remains row-major until this point.
        mov     ax, [pool_n]
        mov     [poolmap + bx], ax      ; record slot
        push    ax
        ; src = tileset_seg:ts_base[set] + index*64
        mov     bx, [rt_set]
        shl     bx, 1
        mov     si, [ts_base + bx]
        ; dst = tilesbuf + pool_n*64
        mov     ax, [pool_n]
        shl     ax, 6
        mov     di, tilesbuf
        add     di, ax
        push    ds
        push    es
        mov     ax, [tileset_seg]
        mov     ds, ax
        mov     ax, cs
        mov     es, ax
        mov     bx, [cs:rt_set]
        shl     bx, 1
        cmp     word [cs:gbts_set_seg+bx], 0
        jne     .copy_gbts_tile
        mov     ax, [cs:rt_index]
        shl     ax, 6
        add     si, ax
        mov     cx, 64
        rep     movsb
        jmp     .copy_tile_done
.copy_gbts_tile:
        mov     bx, [cs:rt_set]
        shl     bx, 1
        mov     ax, [cs:gbts_set_seg+bx]
        mov     ds, ax
        mov     si, [cs:gbts_set_base+bx]
        mov     ax, [cs:rt_index]
        shl     ax, 3
        add     si, ax
%rep 8
        movsw
        movsw
        movsw
        movsw
        add     si, [cs:gbts_set_width+bx]
        sub     si, 8
%endrep
.copy_tile_done:
        pop     es
        pop     ds
        inc     word [pool_n]
        pop     ax                      ; slot just assigned
.have_slot:
        ; RESOLVE[(ws*5+sl)*156+col] = slot
        push    ax
        mov     ax, [rb_ws]
        mov     bx, 5
        mul     bx
        add     ax, [rb_sl]
        mov     bx, 156
        mul     bx
        add     ax, [rb_col]
        shl     ax, 1
        mov     di, resolvebuf
        add     di, ax
        pop     ax
        mov     [di], ax
.colnext:
        inc     word [rb_col]
        jmp     .col
.col_done:
        inc     word [rb_sl]
        jmp     .sl
.sl_done:
        inc     word [rb_ws]
        jmp     .ws
.done:
        clc
        ret
.err:
        stc
        ret

; ----------------------------------------------------------------------------
; init_piece_ids: default to CoK block-34 pieces, or read CCECL's GBEF /E file.
;   piece_ids = resolved LOAD_PIECES setBlockIds [set1,set2,set3].
init_piece_ids:
        mov     word [piece_ids+0], 3
        mov     word [piece_ids+2], 0FFh
        mov     word [piece_ids+4], 23
        cmp     byte [effectmode], 0
        je      .ok
        mov     dx, effectname
        cmp     byte [effectname], 0
        jne     .open
        mov     dx, s_defeffect
.open:
        mov     ax, 3D00h
        int     21h
        jc      .err
        mov     [fxfh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, 32
        mov     dx, fxbuf
        int     21h
        jc      .close_err
        cmp     ax, 32
        jne     .close_err
        mov     bx, [fxfh]
        mov     ah, 3Eh
        int     21h
        cmp     word [fxbuf], 'GB'
        jne     .err
        cmp     word [fxbuf+2], 'EF'
        jne     .err
        mov     ax, [fxbuf+4]
        cmp     ax, 1
        jb      .err
        cmp     ax, 9
        jbe     .version_ok
        cmp     ax, 14
        je      .version_ok
        cmp     ax, 15
        jne     .err
.version_ok:
        mov     ax, [fxbuf+6]
        test    ax, 2                   ; FX_HAVE_PIECES
        jz      .err
        mov     ax, [fxbuf+24]
        mov     [piece_ids+0], ax
        mov     ax, [fxbuf+26]
        mov     [piece_ids+2], ax
        mov     ax, [fxbuf+28]
        mov     [piece_ids+4], ax
.ok:
        clc
        ret
.close_err:
        mov     bx, [fxfh]
        mov     ah, 3Eh
        int     21h
.err:
        stc
        ret

; ----------------------------------------------------------------------------
; load_piece_tables: apply loadDungeonWalls(setBlockIds) for Gen1 DAX art.
;   Supports CoK split blocks (B*10+i+1) and DoK single-bank 8X8D block B.
load_piece_tables:
        mov     word [piece_s], 1
.set_loop:
        cmp     word [piece_s], 4
        jae     .done
        mov     ax, [piece_s]
        dec     ax
        shl     ax, 1
        mov     si, piece_ids
        add     si, ax
        mov     ax, [si]
        cmp     ax, 0FFh
        je      .next_set
        mov     byte [piece_default], 0
        cmp     ax, 07Fh
        jne     .have_block
        mov     byte [piece_default], 1
        xor     ax, ax                  ; sentinel 0x7F -> WALLDEF block 0
.have_block:
        mov     [piece_block], ax
        mov     word [ln_name], s_walldef
        call    dax_get_to_wdraw
        jc      .missing_wd
        mov     ax, [dax_raw]
        xor     dx, dx
        mov     bx, 780
        div     bx
        or      dx, dx
        jnz     .err
        or      ax, ax
        jz      .err
        mov     [piece_k], ax
        mov     bx, [piece_s]
        add     bx, ax
        cmp     bx, 4                   ; s + k must not overflow past set 3
        ja      .err

        call    detect_single_bank
        jc      .err
        call    relocate_piece_records
        jc      .err
        jmp     .next_set
.missing_wd:
        cmp     byte [piece_default], 0
        jne     .next_set               ; missing default block 0 is an empty set
        stc
        ret
.next_set:
        inc     word [piece_s]
        jmp     .set_loop
.done:
        clc
        ret
.err:
        stc
        ret

detect_single_bank:
        mov     byte [piece_single], 0
        cmp     word [piece_k], 1
        jbe     .no
        ; If B*10+1 exists, this is CoK's split packing.
        mov     ax, [piece_block]
        mov     bx, 10
        mul     bx
        inc     ax
        mov     word [ln_name], s_tiles8
        call    dax_get
        jnc     .no
        ; Otherwise, DoK may pack all three records into one 256-tile bank at B.
        mov     ax, [piece_block]
        mov     word [ln_name], s_tiles8
        call    dax_get
        jc      .no
        cmp     word [dax_raw], 4113    ; 17 + 128*32: large enough for single-bank mode
        jb      .no
        mov     bx, 1
        mov     ax, [piece_block]
        call    load_tileset
        jc      .err
        mov     byte [singlebank], 1
        mov     byte [piece_single], 1
        ; Sets 2/3 share the same decoded bank; the resolve walker indexes set 1.
        mov     ax, [ts_base+2]
        mov     [ts_base+4], ax
        mov     [ts_base+6], ax
        mov     ax, [ts_cnt+2]
        mov     [ts_cnt+4], ax
        mov     [ts_cnt+6], ax
.no:
        clc
        ret
.err:
        stc
        ret

relocate_piece_records:
        mov     word [piece_i], 0
        mov     word [piece_off], 0
.loop:
        mov     ax, [piece_i]
        cmp     ax, [piece_k]
        jae     .done
        mov     ax, [piece_s]
        add     ax, [piece_i]
        mov     [piece_slot], ax
        ; varA = singleBank ? FIX[slot]-FIX[1] : FIX[callSet]-FIX[1].
        cmp     byte [piece_single], 0
        je      .call_set
        mov     bx, [piece_slot]
        jmp     .var_from_bx
.call_set:
        mov     bx, [piece_s]
.var_from_bx:
        shl     bx, 1
        mov     ax, [sym_fix+bx]
        sub     ax, [sym_fix+2]
        mov     [reloc_varA], ax

        mov     si, wdraw
        add     si, [piece_off]
        mov     ax, [piece_slot]
        dec     ax
        mov     bx, 780
        mul     bx
        mov     di, wdtab
        add     di, ax
        call    reloc_record

        cmp     byte [piece_single], 0
        jne     .advance
        mov     ax, [piece_k]
        cmp     ax, 1
        jbe     .one_tile
        mov     ax, [piece_block]
        mov     bx, 10
        mul     bx
        add     ax, [piece_i]
        inc     ax
        jmp     .load_tile
.one_tile:
        mov     ax, [piece_block]
.load_tile:
        mov     bx, [piece_slot]
        call    load_tileset
        jc      .err
.advance:
        inc     word [piece_i]
        add     word [piece_off], 780
        jmp     .loop
.done:
        clc
        ret
.err:
        stc
        ret

; ----------------------------------------------------------------------------
; route_tile: in [rb_id] -> [rt_set], [rt_index] (routeTileId, wallpieces.ts).
;   set = id<=0x2d?0 : id<=0x73?1 : id<=0xb9?2 : id<=0xff?3 : 4
;   index = id - SYMBOL_SET_FIX[set]
route_tile:
        mov     ax, [rb_id]
        cmp     ax, 02Dh
        jg      .n0
        xor     bx, bx
        jmp     .got
.n0:
        cmp     ax, 073h
        jg      .n1
        mov     bx, 1
        jmp     .got
.n1:
        cmp     ax, 0B9h
        jg      .n2
        mov     bx, 2
        jmp     .got
.n2:
        cmp     ax, 0FFh
        jg      .n3
        mov     bx, 3
        jmp     .got
.n3:
        mov     bx, 4
.got:
        mov     [rt_set], bx
        mov     ax, [rb_id]
        shl     bx, 1
        sub     ax, [sym_fix + bx]
        mov     [rt_index], ax
        ret

; ----------------------------------------------------------------------------
; reloc_record: copy 5*156 bytes from [si] to [di], relocating each entry
;   v>=0x2d ? (v+[reloc_varA])&0xff : v   (relocateRecord, dungeonWalls.ts).
reloc_record:
        mov     cx, 5*156
.l:
        mov     al, [si]
        cmp     al, 02Dh
        jb      .keep
        add     al, byte [reloc_varA]   ; byte add, auto-wraps to 8 bits
.keep:
        mov     [di], al
        inc     si
        inc     di
        loop    .l
        ret

; ----------------------------------------------------------------------------
; load_tileset: decode 8X8D block AX into tileset_seg at [ts_next], recording
;   ts_base[BX]=offset, ts_cnt[BX]=tile count, and advancing ts_next.  Uses
;   dax_get (block -> dax raw decompressed in the scratch segment).  CF on error.
;   BX = routeTileId set slot (0..4).  AX = 8X8D block id.
load_tileset:
        cmp     byte [gbtsname], 0
        je      .try_second
        mov     word [gbts_load_namep], gbtsname
        mov     dx, [altsrc_seg]
        mov     [gbts_load_seg], dx
        push    ax
        push    bx
        call    load_gbts
        pop     bx
        pop     ax
        jnc     .ok_gbts
.try_second:
        cmp     byte [gbtsname2], 0
        je      .dax
        mov     word [gbts_load_namep], gbtsname2
        mov     dx, [altsrc2_seg]
        mov     [gbts_load_seg], dx
        push    ax
        push    bx
        call    load_gbts
        pop     bx
        pop     ax
        jnc     .ok_gbts
.dax:
        push    bx
        push    ax
        mov     ax, [tiles_namep]
        mov     [ln_name], ax
        pop     ax
        call    dax_get                 ; AX=blockId -> decompress to dax_seg:0, AX=rawlen
        pop     bx
        jc      .err
        ; record base for this set
        mov     ax, [ts_next]
        mov     di, bx
        shl     di, 1
        mov     [ts_base + di], ax
        ; tile count: cb=raw[8]; avail=(rawlen-17)/32; if cb==0xff && exact -> avail
        ;             else min(cb,avail)
        push    ds
        push    es
        mov     ax, [dax_seg]
        mov     es, ax                  ; es:0 = decompressed block
        mov     ax, [dax_raw]
        sub     ax, 17
        xor     dx, dx
        mov     cx, 32
        div     cx                      ; ax = avail (DoK single-bank can be exactly 256), dx = remainder
        mov     cx, ax                  ; avail
        mov     [tile_rem], dx
        mov     al, [es:8]              ; count byte
        cmp     al, 0FFh
        jne     .useb
        cmp     word [tile_rem], 0
        jne     .useb                   ; saturated but not exact framing -> use byte path
        ; cb==0xff and exact: count = avail
        jmp     .cntset
.useb:
        movzx   ax, al                  ; cb
        cmp     ax, cx
        jbe     .ok
        mov     ax, cx                  ; min(cb,avail)
        jmp     .cnt2
.ok:
        ; ax = cb
        jmp     .cnt2
.cntset:
        mov     ax, cx                  ; avail
.cnt2:
        mov     cx, ax                  ; cx = tile count
        pop     es
        pop     ds
        mov     di, bx
        shl     di, 1
        mov     [ts_cnt + di], cx
        mov     ax, cx
        shl     ax, 6
        add     ax, [ts_next]
        jc      .err
        cmp     ax, (TILESET_TILE_CAP*64)
        ja      .err
        ; decode cx tiles: each 32 src bytes -> 64 dst index bytes (hi nibble first)
        ; src = dax_seg:17 ; dst = tileset_seg:ts_next
        push    ds
        push    es
        mov     ax, [tileset_seg]
        mov     es, ax                  ; dst seg = high scratch
        mov     di, [ts_next]
        mov     ax, [dax_seg]
        mov     ds, ax
        mov     si, 17
        ; cx = tiles; each tile 32 src bytes
.tloop:
        jcxz    .tdone
        push    cx
        mov     cx, 32                  ; 32 src bytes -> 64 dst
.bloop:
        lodsb                           ; ds:si
        mov     dl, al
        shr     al, 4
        mov     [es:di], al             ; hi nibble = left pixel
        inc     di
        mov     al, dl
        and     al, 0Fh
        mov     [es:di], al
        inc     di
        loop    .bloop
        pop     cx
        dec     cx
        jmp     .tloop
.tdone:
        pop     es
        pop     ds
        ; ts_next += ts_cnt[set]*64   (bx still = set slot on entry)
        mov     di, bx
        shl     di, 1
        mov     ax, [ts_cnt + di]
        shl     ax, 6
        add     [ts_next], ax
        clc
        ret
.ok_gbts:
        clc
        ret
.err:
        stc
        ret

; Load one versioned row-major GBTS resource. A mismatch or malformed file
; returns CF so load_tileset transparently uses the original DAX block.
load_gbts:
        mov     [gbts_set], bx
        mov     [gbts_wanted], ax
        mov     ax, 3D00h
        mov     dx, [gbts_load_namep]
        int     21h
        jc      .err
        mov     [fh], ax
        push    ds
        mov     ds, [cs:gbts_load_seg]
        mov     ah, 3Fh
        mov     bx, [cs:fh]
        mov     cx, DAX_FILEMAX
        xor     dx, dx
        int     21h
        pop     ds
        mov     [gbts_len], ax
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        cmp     word [gbts_len], 12+64+768
        jb      .err
        push    ds
        mov     ds, [gbts_load_seg]
        cmp     byte [0], 'G'
        jne     .bad_ds
        cmp     byte [1], 'B'
        jne     .bad_ds
        cmp     byte [2], 'T'
        jne     .bad_ds
        cmp     byte [3], 'S'
        jne     .bad_ds
        cmp     word [4], 1
        jne     .bad_ds
        test    byte [7], 1
        jz      .bad_ds
        mov     word [cs:gbts_pal_colors], 16
        test    byte [7], 2
        jz      .pal_count_ok
        mov     word [cs:gbts_pal_colors], 32
.pal_count_ok:
        mov     ax, [cs:gbts_wanted]
        cmp     [6], al
        jne     .bad_ds
        mov     ax, [8]
        or      ax, ax
        jz      .bad_ds
        cmp     ax, TILESET_TILE_CAP
        ja      .bad_ds
        mov     [cs:gbts_count], ax
        shl     ax, 3
        cmp     ax, [10]
        jne     .bad_ds
        mov     [cs:gbts_width], ax
        mov     ax, [cs:gbts_count]
        shl     ax, 6
        mov     [cs:gbts_npix], ax
        add     ax, 12+768
        cmp     ax, [cs:gbts_len]
        ja      .bad_ds
        pop     ds

        mov     bx, [gbts_set]
        mov     di, bx
        shl     di, 1
        mov     word [ts_base+di], 12
        mov     ax, [gbts_load_seg]
        mov     [gbts_set_seg+di], ax
        mov     word [gbts_set_base+di], 12
        mov     ax, [gbts_width]
        mov     [gbts_set_width+di], ax
        mov     ax, [gbts_count]
        mov     [ts_cnt+di], ax
        mov     byte [altpal_valid], 1
        mov     ax, [gbts_load_seg]
        mov     [gbts_palette_seg], ax
        mov     ax, [gbts_npix]
        add     ax, 12
        mov     [gbts_palette_off], ax
        mov     bx, [gbts_set]
        clc
        ret
.bad_ds:
        pop     ds
.err:
        mov     bx, [gbts_set]
        stc
        ret

set_texture_area_names:
        mov     al, [texarea]
        mov     [s_walldef+7], al
        mov     [s_tiles8+4], al
        ret

; ----------------------------------------------------------------------------
; dax_get: open [ln_name], read the whole DAX file into dax_seg:0, scan the TOC
;   for block id AX, then signed-byte-RLE-decompress that block (via dax_rle, into
;   dax_dseg and copied back) so the DECOMPRESSED block ends up at dax_seg:0.
;   Returns AX = [dax_raw] = decompressed length; CF=1 on open/not-found.
; ----------------------------------------------------------------------------
dax_get:
        mov     [dax_blk], ax
        ; open + read whole file into dax_seg:0
        mov     ax, 3D00h
        mov     dx, [ln_name]
        int     21h
        jc      .err
        mov     [fh], ax
        push    ds
        mov     ax, [dax_seg]
        mov     ds, ax
        mov     ah, 3Fh
        mov     bx, [cs:fh]
        mov     cx, DAX_FILEMAX
        xor     dx, dx
        int     21h
        pop     ds
        push    ax                      ; bytes read (file length)
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        pop     ax                      ; file length (unused beyond bounds)
        ; --- parse TOC in dax_seg:0, find block [dax_blk] ---
        push    ds
        mov     ax, [dax_seg]
        mov     ds, ax
        mov     ax, [0]                 ; toc_bytes = entry_count*9
        mov     [cs:dax_tocb], ax
        xor     dx, dx
        mov     bx, 9
        div     bx
        mov     [cs:dax_cnt], ax        ; entry count
        ; data_base = 2 + toc_bytes
        mov     ax, [cs:dax_tocb]
        add     ax, 2
        mov     [cs:dax_dbase], ax
        ; scan TOC entries (each 9 bytes from offset 2)
        mov     si, 2
        mov     cx, [cs:dax_cnt]
.scan:
        jcxz    .nf
        mov     al, [si]                ; id
        movzx   ax, al
        cmp     ax, [cs:dax_blk]
        je      .found
        add     si, 9
        dec     cx
        jmp     .scan
.found:
        ; entry at si: u8 id, u32 dataOff@1, u16 raw@5, u16 comp@7
        mov     ax, [si+5]
        mov     [cs:dax_raw], ax
        mov     ax, [si+7]
        mov     [cs:dax_comp], ax
        mov     ax, [si+1]              ; dataOff low (blocks well under 64K)
        add     ax, [cs:dax_dbase]
        mov     [cs:dax_src], ax        ; src offset in dax_seg
        pop     ds
        ; --- RLE decompress dax_seg:[dax_src] -> dax_dseg:0, raw length [dax_raw] ---
        call    dax_rle
        mov     ax, [dax_raw]
        clc
        ret
.nf:
        pop     ds
.err:
        stc
        ret

; dax_rle: decompress [dax_comp] bytes of signed-byte RLE from dax_seg:[dax_src]
;   into dax_dseg:0, producing [dax_raw] bytes.  After this, the convention used
;   by load_tileset/dax_get_to_wdraw is that the DECOMPRESSED block lives in
;   dax_seg:0 -- so we copy dax_dseg:0 back to dax_seg:0 at the end.  (Simpler:
;   decompress straight to dax_dseg and have callers read dax_dseg.)
dax_rle:
        push    ds
        push    es
        mov     ax, [dax_seg]
        mov     ds, ax                  ; src seg
        mov     ax, [cs:dax_dseg]
        mov     es, ax                  ; dst seg
        mov     si, [cs:dax_src]
        xor     di, di
.loop:
        mov     ax, di
        cmp     ax, [cs:dax_raw]
        jae     .done
        lodsb                           ; control byte (ds:si)
        cmp     al, 80h
        jae     .rep
        movzx   cx, al
        inc     cx
.lit:
        lodsb
        mov     [es:di], al
        inc     di
        loop    .lit
        jmp     .loop
.rep:
        neg     al
        movzx   cx, al
        lodsb                           ; value
        mov     ah, al
.rl:
        mov     [es:di], ah
        inc     di
        loop    .rl
        jmp     .loop
.done:
        ; copy decompressed (dax_dseg:0) back to dax_seg:0 so callers read dax_seg:0
        mov     ax, [cs:dax_dseg]
        mov     ds, ax
        mov     ax, [cs:dax_seg]
        mov     es, ax
        xor     si, si
        xor     di, di
        mov     cx, [cs:dax_raw]
        rep     movsb
        pop     es
        pop     ds
        ret

; dax_get_to_wdraw: dax_get block AX from [ln_name], then copy the decompressed
;   block (dax_seg:0, [dax_raw] bytes) into the near wdraw buffer. CF on error.
dax_get_to_wdraw:
        call    dax_get
        jc      .err
        push    ds
        push    es
        mov     ax, ds
        mov     es, ax
        mov     di, wdraw
        mov     ax, [dax_seg]
        mov     ds, ax
        xor     si, si
        mov     cx, [cs:dax_raw]
        rep     movsb
        pop     es
        pop     ds
        clc
        ret
.err:
        stc
        ret

; ----------------------------------------------------------------------------
; dump_bins: write RESOLVE.BIN / TILES.BIN / PAL.BIN for byte-exact verification.
;   TILES.BIN length = pool_n*64.
dump_bins:
        ; RESOLVE.BIN (4680 bytes)
        mov     dx, s_resolve
        mov     cx, 4680
        mov     bx, resolvebuf
        call    write_file
        ; TILES.BIN (pool_n*64)
        mov     ax, [pool_n]
        shl     ax, 6
        mov     cx, ax
        mov     dx, s_tiles
        mov     bx, tilesbuf
        call    write_file
        ; PAL.BIN (48)
        mov     dx, s_pal
        mov     cx, 48
        mov     bx, palbuf
        call    write_file
        ret

; write_file: create file named [DS:DX], write CX bytes from [DS:BX], close.
write_file:
        push    cx
        push    bx
        mov     ah, 3Ch
        xor     cx, cx
        int     21h
        jc      .ret
        mov     [ofh], ax
        pop     dx                      ; buffer ptr
        pop     cx                      ; length
        mov     bx, [ofh]
        mov     ah, 40h
        int     21h
        mov     bx, [ofh]
        mov     ah, 3Eh
        int     21h
        ret
.ret:
        pop     bx
        pop     cx
        ret

; ----------------------------------------------------------------------------
;  GBWS preview mode (/Q): consume a CCHLIB W wall-set bundle, draw a compact
;  grouped contact sheet in A000, and optionally dump GBWVIEW.RAW with /R.
; ----------------------------------------------------------------------------
gbws_preview:
        mov     ax, 3D00h
        mov     dx, fname
        int     21h
        jc      .err
        mov     [fh], ax
        mov     dx, gbwhdr
        mov     cx, GBWHDR_LEN
        call    read_exact
        jc      .close_err
        cmp     word [gbwhdr], 'GB'
        jne     .close_err
        cmp     word [gbwhdr+2], 'WS'
        jne     .close_err
        mov     ax, [gbwhdr+4]
        cmp     ax, 1
        je      .gbws_v1
        cmp     ax, 2
        jne     .close_err
        mov     word [gbw_version], ax
        mov     word [gbwihdr_len], GBWIHDR_V2_LEN
        jmp     .gbws_version_ok
.gbws_v1:
        mov     word [gbw_version], ax
        mov     word [gbwihdr_len], GBWIHDR_V1_LEN
.gbws_version_ok:
        mov     ax, [gbwhdr+8]
        call    validate_gbws_count
        jc      .close_err
        mov     [gbw_count], ax

        mov     ax, 0013h
        int     10h
        mov     ax, 0A000h
        mov     es, ax
        xor     di, di
        xor     ax, ax
        mov     cx, 32000
        rep     stosw

        mov     word [gbw_xpos+2], 0
        mov     word [gbw_xpos+4], 0
        mov     word [gbw_xpos+6], 0
        mov     word [gbw_xpos+8], 0
        mov     word [gbw_xpos+10], 0
        call    init_gbws_palette
        mov     word [gbw_idx], 0
.loop:
        mov     ax, [gbw_idx]
        cmp     ax, [gbw_count]
        jae     .done
        mov     dx, gbwihdr
        mov     cx, [gbwihdr_len]
        call    read_exact
        jc      .close_err_text
        cmp     word [gbwihdr], 'GB'
        jne     .close_err_text
        cmp     word [gbwihdr+2], 'WI'
        jne     .close_err_text
        call    validate_gbwi_dims
        jc      .close_err_text
        mov     ax, [gbwihdr+8]
        mov     [gbw_w], ax
        mov     ax, [gbwihdr+10]
        mov     [gbw_h], ax
        mov     ax, [gbwihdr+12]
        mov     [gbw_npix], ax
        mov     al, [gbwihdr+19]
        mov     [gbw_group], al

        mov     dx, loadbuf
        mov     cx, [gbw_npix]
        call    read_exact
        jc      .close_err_text
        call    blit_gbws_half

        mov     dx, loadbuf
        mov     cx, 768
        call    read_exact
        jc      .close_err_text
        call    merge_gbws_palette
        jc      .close_err_text
.next:
        inc     word [gbw_idx]
        jmp     .loop
.done:
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        call    load_gbws_dac
        cmp     byte [dumpbin], 0
        je      .wait
        call    dump_gbws_raw
        jc      .err_text
        mov     ax, 0003h
        int     10h
        clc
        ret
.wait:
        xor     ax, ax
        int     16h
        mov     ax, 0003h
        int     10h
        clc
        ret
.close_err_text:
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
.err_text:
        mov     ax, 0003h
        int     10h
.err:
        stc
        ret
.close_err:
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        stc
        ret

blit_gbws_half:
        movzx   bx, byte [gbw_group]
        cmp     bx, 1
        jb      .ret
        cmp     bx, 5
        ja      .ret
        shl     bx, 1
        mov     ax, [gbw_xpos+bx]
        mov     [gbw_dstx], ax
        mov     ax, [gbw_ybase+bx]
        mov     [gbw_dsty], ax
        mov     ax, [gbw_w]
        inc     ax
        shr     ax, 1
        add     ax, 2
        add     [gbw_xpos+bx], ax
        mov     word [gbw_sy], 0
.row:
        mov     ax, [gbw_sy]
        cmp     ax, [gbw_h]
        jae     .ret
        mov     ax, [gbw_dsty]
        cmp     ax, 200
        jae     .ret
        mov     ax, [gbw_sy]
        mul     word [gbw_w]
        mov     [gbw_src], ax
        mov     ax, [gbw_dsty]
        mov     bx, 320
        mul     bx
        add     ax, [gbw_dstx]
        mov     [gbw_dst], ax
        mov     word [gbw_sx], 0
.col:
        mov     ax, [gbw_sx]
        cmp     ax, [gbw_w]
        jae     .row_done
        mov     ax, [gbw_dstx]
        mov     bx, [gbw_sx]
        shr     bx, 1
        add     ax, bx
        cmp     ax, 320
        jae     .row_done
        mov     si, [gbw_src]
        add     si, [gbw_sx]
        mov     al, [loadbuf+si]
        cmp     al, 255
        je      .skip
        mov     di, [gbw_dst]
        mov     bx, [gbw_sx]
        shr     bx, 1
        add     di, bx
        mov     [es:di], al
.skip:
        add     word [gbw_sx], 2
        jmp     .col
.row_done:
        add     word [gbw_sy], 2
        inc     word [gbw_dsty]
        jmp     .row
.ret:
        ret

index_gbws_file:
        mov     ax, 3D00h
        mov     dx, gbwname
        int     21h
        jc      .err
        mov     [fh], ax
        mov     dx, gbwhdr
        mov     cx, GBWHDR_LEN
        call    read_exact
        jc      .close_err
        cmp     word [gbwhdr], 'GB'
        jne     .close_err
        cmp     word [gbwhdr+2], 'WS'
        jne     .close_err
        mov     ax, [gbwhdr+4]
        cmp     ax, 1
        je      .gbws_v1
        cmp     ax, 2
        jne     .close_err
        mov     word [gbw_version], ax
        mov     word [gbwihdr_len], GBWIHDR_V2_LEN
        jmp     .gbws_version_ok
.gbws_v1:
        mov     word [gbw_version], ax
        mov     word [gbwihdr_len], GBWIHDR_V1_LEN
.gbws_version_ok:
        mov     ax, [gbwhdr+8]
        call    validate_gbws_count
        jc      .close_err
        mov     [gbw_count], ax
        mov     word [gbw_curlo], GBWHDR_LEN
        mov     word [gbw_curhi], 0
        call    init_gbws_palette
        mov     word [gbw_idx], 0
.loop:
        mov     ax, [gbw_idx]
        cmp     ax, [gbw_count]
        jae     .done
        mov     dx, gbwihdr
        mov     cx, [gbwihdr_len]
        call    read_exact
        jc      .close_err
        cmp     word [gbwihdr], 'GB'
        jne     .close_err
        cmp     word [gbwihdr+2], 'WI'
        jne     .close_err
        call    validate_gbwi_dims
        jc      .close_err

        mov     bx, [gbw_idx]
        shl     bx, 1
        mov     ax, [gbw_curlo]
        add     ax, [gbwihdr_len]
        mov     [gbw_offlo+bx], ax
        mov     ax, [gbw_curhi]
        adc     ax, 0
        mov     [gbw_offhi+bx], ax
        mov     ax, [gbwihdr+8]
        mov     [gbw_imgw+bx], ax
        mov     ax, [gbwihdr+10]
        mov     [gbw_imgh+bx], ax
        mov     ax, [gbwihdr+12]
        cmp     ax, GBWS_IMAGE_MAX
        ja      .close_err
        mov     [gbw_imgnp+bx], ax
        mov     bx, [gbw_idx]
        shl     bx, 1
        mov     word [gbw_imgyo+bx], 0
        mov     word [gbw_imgxo+bx], 0
        cmp     word [gbw_version], 2
        jb      .no_v2_offsets
        mov     ax, [gbwihdr+20]
        mov     [gbw_imgyo+bx], ax
        mov     ax, [gbwihdr+22]
        mov     [gbw_imgxo+bx], ax
.no_v2_offsets:

        mov     bx, [gbw_idx]
        shl     bx, 1
        mov     ax, [gbw_offlo+bx]
        mov     dx, [gbw_offhi+bx]
        add     ax, [gbw_imgnp+bx]
        adc     dx, 0
        mov     [seeklo], ax
        mov     [seekhi], dx
        call    seek_abs
        jc      .close_err
        mov     dx, loadbuf
        mov     cx, 768
        call    read_exact
        jc      .close_err
        call    merge_gbws_palette
        jc      .close_err
        mov     bx, [gbw_idx]
        shl     bx, 1
        mov     ax, [gbw_offlo+bx]
        mov     dx, [gbw_offhi+bx]
        add     ax, [gbw_imgnp+bx]
        adc     dx, 0
        add     ax, 768
        adc     dx, 0
        mov     [gbw_curlo], ax
        mov     [gbw_curhi], dx
        mov     [seeklo], ax
        mov     [seekhi], dx
        call    seek_abs
        jc      .close_err
        inc     word [gbw_idx]
        jmp     .loop
.done:
        clc
        ret
.close_err:
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
.err:
        stc
        ret

select_gbws_piece:
        mov     ax, [emit_slot]
        and     ax, 0Fh
        jz      .bad
        dec     ax
        xor     dx, dx
        mov     bx, 5
        div     bx                  ; ax = wallset, dx = slice
        mov     [gbw_setw], ax
        inc     dx                  ; group 1..5
        mov     [gbw_groupw], dx
        mov     bx, dx
        shl     bx, 1
        mov     ax, [gbw_group_base+bx]
        mov     [gbw_drawidx], ax
        mov     bx, [fp_piece]
        mov     ax, [gbw_groupw]
        cmp     ax, 2
        ja      .noextra
        movzx   ax, byte [gbw_piece_extra+bx]
        jmp     .have_piece
.noextra:
        cmp     bx, 9
        je      .bad
        movzx   ax, byte [gbw_piece_plain+bx]
.have_piece:
        add     [gbw_drawidx], ax
        mov     ax, [gbw_setw]
        cmp     ax, GBWS_WALLSETS
        jae     .use_local_set
        mov     bx, GBWS_WALL_GROUP
        mul     bx
        add     ax, [gbw_drawidx]
        cmp     ax, [gbw_count]
        jb      .have_index
.use_local_set:
        mov     ax, [gbw_drawidx]
        cmp     ax, [gbw_count]
        jae     .bad
.have_index:
        mov     [gbw_drawidx], ax
        clc
        ret
.bad:
        stc
        ret

draw_gbws_piece:
        call    select_gbws_piece
        jc      .ret
        mov     ax, [gbw_drawidx]
        mov     bx, ax
        shl     bx, 1
        mov     ax, [gbw_imgw+bx]
        mov     [gbw_w], ax
        mov     ax, [gbw_imgh+bx]
        mov     [gbw_h], ax
        mov     ax, [gbw_imgnp+bx]
        mov     [gbw_npix], ax
        mov     ax, [gbw_imgyo+bx]
        mov     [gbw_yoff], ax
        mov     ax, [gbw_imgxo+bx]
        mov     [gbw_xoff], ax
        mov     ax, [gbw_offlo+bx]
        mov     [seeklo], ax
        mov     ax, [gbw_offhi+bx]
        mov     [seekhi], ax
        call    seek_abs
        jc      .ret
        mov     dx, loadbuf
        mov     cx, [gbw_npix]
        call    read_exact
        jc      .ret

        mov     ax, [fp_col]
        add     ax, 3
        shl     ax, 3
        mov     [gbw_dstx], ax
        mov     ax, [gbw_xoff]
        ; HLIB offsets are signed placement hints: positive horizontal moves
        ; left, negative moves right (hackdocs TLBFORM.TXT).
        sub     [gbw_dstx], ax
        mov     ax, [fp_row]
        add     ax, 3
        shl     ax, 3
        mov     [gbw_dsty], ax
        mov     bx, [fp_piece]
        movzx   ax, byte [prows+bx]
        shl     ax, 3
        sub     ax, [gbw_h]
        jle     .anchor_ok
        add     [gbw_dsty], ax
.anchor_ok:
        mov     ax, [gbw_yoff]
        ; Positive vertical moves up, negative moves down.
        sub     [gbw_dsty], ax
        call    blit_gbws_full
.ret:
        ret

blit_gbws_full:
        mov     word [gbw_sy], 0
.row:
        mov     ax, [gbw_sy]
        cmp     ax, [gbw_h]
        jae     .ret
        mov     ax, [gbw_dsty]
        add     ax, [gbw_sy]
        cmp     ax, 8
        jl      .next_row
        cmp     ax, 176
        jge     .next_row
        mov     bx, 320
        mul     bx
        mov     [gbw_dst], ax
        mov     ax, [gbw_sy]
        mul     word [gbw_w]
        mov     [gbw_src], ax
        mov     word [gbw_sx], 0
.col:
        mov     ax, [gbw_sx]
        cmp     ax, [gbw_w]
        jae     .next_row
        mov     ax, [gbw_dstx]
        add     ax, [gbw_sx]
        cmp     ax, 8
        jl      .skip
        cmp     ax, 176
        jge     .next_row
        mov     si, [gbw_src]
        add     si, [gbw_sx]
        mov     al, [loadbuf+si]
        cmp     al, 255
        je      .skip
        mov     di, [gbw_dst]
        add     di, [gbw_dstx]
        add     di, [gbw_sx]
        mov     [es:di], al
.skip:
        inc     word [gbw_sx]
        jmp     .col
.next_row:
        inc     word [gbw_sy]
        jmp     .row
.ret:
        ret

init_gbws_palette:
        push    ax
        push    cx
        push    di
        push    es
        mov     ax, [dax_seg]
        mov     es, ax
        xor     di, di
        xor     ax, ax
        mov     cx, 384
        rep     stosw
        pop     es
        pop     di
        pop     cx
        pop     ax
        ret

; Merge the palette window declared by the current GBWI header from loadbuf[]
; into the active GBWS DAC buffer in dax_seg.  GBWS stores a full 768-byte
; palette after each image, but only palFirst/palN is owned by that image.
merge_gbws_palette:
        push    ax
        push    bx
        push    cx
        push    dx
        push    si
        push    di
        push    es
        mov     ax, [gbwihdr+16]    ; palN
        or      ax, ax
        jz      .ok
        cmp     ax, 256
        ja      .bad
        mov     bx, [gbwihdr+14]    ; palFirst
        cmp     bx, 256
        jae     .bad
        mov     dx, bx
        add     dx, ax
        jc      .bad
        cmp     dx, 256
        ja      .bad

        mov     si, bx              ; byte offset = palFirst * 3
        shl     si, 1
        add     si, bx
        mov     di, si
        add     si, loadbuf
        mov     cx, ax              ; byte count = palN * 3
        shl     cx, 1
        add     cx, ax
        mov     ax, [dax_seg]
        mov     es, ax
        rep     movsb
.ok:
        clc
        jmp     .ret
.bad:
        stc
.ret:
        pop     es
        pop     di
        pop     si
        pop     dx
        pop     cx
        pop     bx
        pop     ax
        ret

load_gbws_dac:
        mov     dx, 3C8h
        xor     al, al
        out     dx, al
        mov     dx, 3C9h
        push    ds
        mov     ax, [dax_seg]
        mov     ds, ax
        xor     si, si
        mov     cx, 768
.dac:
        lodsb
        shr     al, 2
        out     dx, al
        loop    .dac
        pop     ds
        ret

validate_gbws_count:
        push    bx
        push    dx
        push    ax
        or      ax, ax
        jz      .bad
        cmp     ax, GBWS_IMAGE_COUNT
        ja      .bad
        xor     dx, dx
        mov     bx, GBWS_WALL_GROUP
        div     bx
        or      dx, dx
        jnz     .bad
        pop     ax
        clc
        jmp     .ret
.bad:
        pop     ax
        stc
.ret:
        pop     dx
        pop     bx
        ret

validate_gbwi_dims:
        push    ax
        push    bx
        push    dx
        mov     ax, [gbwihdr+8]     ; width
        or      ax, ax
        jz      .bad
        mov     bx, [gbwihdr+10]    ; height
        or      bx, bx
        jz      .bad
        mul     bx                  ; dx:ax = width * height
        or      dx, dx
        jnz     .bad
        cmp     ax, GBWS_IMAGE_MAX
        ja      .bad
        cmp     ax, [gbwihdr+12]    ; npix must match drawable area exactly
        jne     .bad
        clc
        jmp     .ret
.bad:
        stc
.ret:
        pop     dx
        pop     bx
        pop     ax
        ret

seek_abs:
        push    ax
        push    bx
        push    cx
        push    dx
        mov     bx, [fh]
        mov     ax, 4200h
        mov     cx, [seekhi]
        mov     dx, [seeklo]
        int     21h
        jc      .bad
        clc
        jmp     .ret
.bad:
        stc
.ret:
        pop     dx
        pop     cx
        pop     bx
        pop     ax
        ret

dump_gbws_raw:
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, s_gbwraw
        int     21h
        jc      .err
        mov     [ofh], ax
        mov     dx, rawhdr
        mov     cx, 4
        call    write_out
        jc      .close_err
        push    ds
        mov     ax, 0A000h
        mov     ds, ax
        xor     dx, dx
        mov     cx, 64000
        call    write_out
        pop     ds
        jc      .close_err
        push    ds
        mov     ax, [dax_seg]
        mov     ds, ax
        xor     dx, dx
        mov     cx, 768
        call    write_out
        pop     ds
        jc      .close_err
        mov     bx, [ofh]
        mov     ah, 3Eh
        int     21h
        clc
        ret
.close_err:
        mov     bx, [ofh]
        mov     ah, 3Eh
        int     21h
.err:
        stc
        ret

dump_gbws_view_raw:
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, s_viewraw
        cmp     byte [snapname], 0
        je      .open
        mov     dx, snapname
.open:
        int     21h
        jc      .err
        mov     [ofh], ax
        mov     dx, rawhdr
        mov     cx, 4
        call    write_out
        jc      .close_err
        push    ds
        mov     ax, 0A000h
        mov     ds, ax
        xor     dx, dx
        mov     cx, 64000
        call    write_out
        pop     ds
        jc      .close_err
        push    ds
        mov     ax, [dax_seg]
        mov     ds, ax
        xor     dx, dx
        mov     cx, 768
        call    write_out
        pop     ds
        jc      .close_err
        mov     bx, [ofh]
        mov     ah, 3Eh
        int     21h
        clc
        ret
.close_err:
        mov     bx, [ofh]
        mov     ah, 3Eh
        int     21h
.err:
        stc
        ret

dump_view_raw:
        call    build_view_raw_palette
        mov     ah, 3Ch
        xor     cx, cx
        mov     dx, s_viewraw
        cmp     byte [snapname], 0
        je      .open
        mov     dx, snapname
.open:
        int     21h
        jc      .err
        mov     [ofh], ax
        mov     dx, rawhdr
        mov     cx, 4
        call    write_out
        jc      .close_err
        push    ds
        mov     ax, 0A000h
        mov     ds, ax
        xor     dx, dx
        mov     cx, 64000
        call    write_out
        pop     ds
        jc      .close_err
        push    ds
        mov     ax, [dax_seg]
        mov     ds, ax
        xor     dx, dx
        mov     cx, 768
        call    write_out
        pop     ds
        jc      .close_err
        mov     bx, [ofh]
        mov     ah, 3Eh
        int     21h
        clc
        ret
.close_err:
        mov     bx, [ofh]
        mov     ah, 3Eh
        int     21h
.err:
        stc
        ret

build_view_raw_palette:
        push    ax
        push    cx
        push    si
        push    di
        push    es
        mov     ax, [dax_seg]
        mov     es, ax
        xor     di, di
        xor     ax, ax
        mov     cx, 384
        rep     stosw
        mov     si, palbuf
        xor     di, di
        mov     cx, [pal_colors]
        mov     ax, cx
        shl     cx, 1
        add     cx, ax              ; palette bytes = colours * 3
        rep     movsb
        pop     es
        pop     di
        pop     si
        pop     cx
        pop     ax
        ret

read_exact:
        push    bx
        mov     bx, [cs:fh]
        mov     ah, 3Fh
        int     21h
        jc      .bad
        cmp     ax, cx
        jne     .bad
        clc
        jmp     .ret
.bad:
        stc
.ret:
        pop     bx
        ret

write_out:
        push    ax
        push    bx
        mov     bx, [cs:ofh]
        mov     ah, 40h
        int     21h
        jc      .bad
        cmp     ax, cx
        jne     .bad
        clc
        jmp     .ret
.bad:
        stc
.ret:
        pop     bx
        pop     ax
        ret

; ============================================================================
;  plan_wall_view: the far->mid->near cell walk (planWallView), 1:1 port.
; ============================================================================
plan_wall_view:
        ; left=(facing+6)&7, right=(facing+2)&7, behind=(facing+4)&7
        mov     ax, [facing]
        add     ax, 6
        and     ax, 7
        mov     [pleft], ax
        mov     ax, [facing]
        add     ax, 2
        and     ax, 7
        mov     [pright], ax
        mov     ax, [facing]
        add     ax, 4
        and     ax, 7
        mov     [pbehind], ax
        ; dx0 = px + 2*XD[facing]; dy0 = py + 2*YD[facing]
        mov     bx, [facing]
        movsx   ax, byte [XD+bx]
        shl     ax, 1
        add     ax, [px_pose]
        mov     [wdx], ax
        movsx   ax, byte [YD+bx]
        shl     ax, 1
        add     ax, [py_pose]
        mov     [wdy], ax

        call    draw_far
        call    step_behind
        call    draw_mid
        call    step_behind
        call    draw_near
        ret

; dx += XD[behind]; dy += YD[behind]
step_behind:
        mov     bx, [pbehind]
        movsx   ax, byte [XD+bx]
        add     [wdx], ax
        movsx   ax, byte [YD+bx]
        add     [wdy], ax
        ret

; ============================================================================
;  draw_far  (Draw3dWorldFar): left/right 4-cell front fans + caps, side walls.
; ============================================================================
draw_far:
        ; ---------------- LEFT FAN ----------------
        mov     ax, [wdx]
        mov     [fx], ax
        mov     ax, [wdy]
        mov     [fy], ax
        mov     word [fcol], 0
        mov     word [fcarry], 0
        mov     word [fn], 0
.lf:
        cmp     word [fn], 4
        jge     .lf_done
        mov     al, [facing]
        call    wt_fxy
        mov     [ffront], al
        ; if !inMap && wt(right)==0 -> carry=0
        call    inmap_fxy
        cmp     al, 0
        jne     .lf_in
        mov     al, [pright]
        call    wt_fxy
        cmp     al, 0
        jne     .lf_in
        mov     word [fcarry], 0
.lf_in:
        mov     al, [ffront]
        cmp     al, 0
        je      .lf_f0
        ; front != 0
        cmp     word [fcarry], 0
        jle     .lf_nocap
        mov     dx, 9
        mov     ax, [fcarry]
        mov     bx, [fcol]
        add     bx, 6               ; cB(9)=5, +1
        mov     cx, 4               ; rB(9)=4
        call    do_emit
.lf_nocap:
        movzx   ax, byte [ffront]
        mov     [fcarry], ax
        mov     dx, 0
        movzx   ax, byte [ffront]
        mov     bx, [fcol]
        add     bx, 5               ; cB(0)=5
        mov     cx, 4               ; rB(0)=4
        call    do_emit
        jmp     .lf_step
.lf_f0:
        cmp     word [fcarry], 0
        jle     .lf_c0
        ; wt(left, fy-YD[left], fx-XD[left])
        mov     bx, [pleft]
        movsx   ax, byte [YD+bx]
        mov     cx, [fy]
        sub     cx, ax
        mov     [wt_y], cx
        mov     bx, [pleft]
        movsx   ax, byte [XD+bx]
        mov     cx, [fx]
        sub     cx, ax
        mov     [wt_x], cx
        mov     al, [pleft]
        call    wt
        cmp     al, 0
        je      .lf_c0
        mov     dx, 9
        mov     ax, [fcarry]
        mov     bx, [fcol]
        add     bx, 6               ; 5+1
        mov     cx, 4
        call    do_emit
.lf_c0:
        mov     word [fcarry], 0
.lf_step:
        sub     word [fcol], 2
        mov     bx, [pleft]
        movsx   ax, byte [XD+bx]
        add     [fx], ax
        movsx   ax, byte [YD+bx]
        add     [fy], ax
        inc     word [fn]
        jmp     .lf
.lf_done:

        ; ---------------- RIGHT FAN ----------------
        mov     ax, [wdx]
        mov     [fx], ax
        mov     ax, [wdy]
        mov     [fy], ax
        mov     word [fcol], 0
        mov     word [fcarry], 0
        mov     word [fn], 0
.rf:
        cmp     word [fn], 4
        jge     .rf_done
        mov     al, [facing]
        call    wt_fxy
        mov     [ffront], al
        call    inmap_fxy
        cmp     al, 0
        jne     .rf_in
        mov     al, [pleft]
        call    wt_fxy
        cmp     al, 0
        jne     .rf_in
        mov     word [fcarry], 0
.rf_in:
        mov     al, [ffront]
        cmp     al, 0
        je      .rf_f0
        cmp     word [fcarry], 0
        jle     .rf_nocap
        mov     dx, 9
        mov     ax, [fcarry]
        mov     bx, [fcol]
        add     bx, 4               ; cB(9)=5, -1
        mov     cx, 4
        call    do_emit
.rf_nocap:
        movzx   ax, byte [ffront]
        mov     [fcarry], ax
        mov     dx, 0
        movzx   ax, byte [ffront]
        mov     bx, [fcol]
        add     bx, 5               ; cB(0)=5
        mov     cx, 4
        call    do_emit
        jmp     .rf_step
.rf_f0:
        cmp     word [fcarry], 0
        jle     .rf_c0
        mov     bx, [pright]
        movsx   ax, byte [YD+bx]
        mov     cx, [fy]
        sub     cx, ax
        mov     [wt_y], cx
        mov     bx, [pright]
        movsx   ax, byte [XD+bx]
        mov     cx, [fx]
        sub     cx, ax
        mov     [wt_x], cx
        mov     al, [pright]
        call    wt
        cmp     al, 0
        je      .rf_c0
        mov     dx, 9
        mov     ax, [fcarry]
        mov     bx, [fcol]
        add     bx, 4               ; 5-1
        mov     cx, 4
        call    do_emit
.rf_c0:
        mov     word [fcarry], 0
.rf_step:
        add     word [fcol], 2
        mov     bx, [pright]
        movsx   ax, byte [XD+bx]
        add     [fx], ax
        movsx   ax, byte [YD+bx]
        add     [fy], ax
        inc     word [fn]
        jmp     .rf
.rf_done:

        ; ---------------- LEFT SIDE (piece 1) ----------------
        mov     ax, [wdx]
        mov     [fx], ax
        mov     ax, [wdy]
        mov     [fy], ax
        mov     word [fcol], 0
        mov     word [fn], 0
.ls:
        cmp     word [fn], 3
        jge     .ls_done
        mov     al, [pleft]
        call    wt_fxy
        cmp     al, 0
        je      .ls_step
        mov     [fside], al
        ; colStart = cB(1) + (n==0 ? col : col-1); cB(1)=4
        mov     bx, [fcol]
        cmp     word [fn], 0
        je      .ls_c
        dec     bx
.ls_c:
        add     bx, 4
        mov     dx, 1
        movzx   ax, byte [fside]
        mov     cx, 3               ; rB(1)=3
        call    do_emit
.ls_step:
        sub     word [fcol], 2
        mov     bx, [pleft]
        movsx   ax, byte [XD+bx]
        add     [fx], ax
        movsx   ax, byte [YD+bx]
        add     [fy], ax
        inc     word [fn]
        jmp     .ls
.ls_done:

        ; ---------------- RIGHT SIDE (piece 2) ----------------
        mov     ax, [wdx]
        mov     [fx], ax
        mov     ax, [wdy]
        mov     [fy], ax
        mov     word [fcol], 0
        mov     word [fn], 0
.rs:
        cmp     word [fn], 3
        jge     .rs_done
        mov     al, [pright]
        call    wt_fxy
        cmp     al, 0
        je      .rs_step
        mov     [fside], al
        ; colStart = cB(2) + (n==0 ? col : col+1); cB(2)=6
        mov     bx, [fcol]
        cmp     word [fn], 0
        je      .rs_c
        inc     bx
.rs_c:
        add     bx, 6
        mov     dx, 2
        movzx   ax, byte [fside]
        mov     cx, 3               ; rB(2)=3
        call    do_emit
.rs_step:
        add     word [fcol], 2
        mov     bx, [pright]
        movsx   ax, byte [XD+bx]
        add     [fx], ax
        movsx   ax, byte [YD+bx]
        add     [fy], ax
        inc     word [fn]
        jmp     .rs
.rs_done:
        ret

; ============================================================================
;  draw_mid  (Draw3dWorldMid): two 3-cell scans, pieces 3/4 then 3/5.
; ============================================================================
draw_mid:
        ; L->R: start 2 cells left of focus, step right, v12 = -6,-3,0
        mov     bx, [pleft]
        movsx   ax, byte [XD+bx]
        shl     ax, 1
        add     ax, [wdx]
        mov     [fx], ax
        movsx   ax, byte [YD+bx]
        shl     ax, 1
        add     ax, [wdy]
        mov     [fy], ax
        mov     word [fv12], -6
        mov     word [fn], 0
.l1:
        cmp     word [fn], 3
        jge     .l1d
        mov     al, [facing]
        call    wt_fxy
        cmp     al, 0
        je      .l1_nf
        mov     dx, 3
        movzx   ax, al
        mov     bx, [fv12]
        add     bx, 4               ; cB(3)=4
        mov     cx, 3               ; rB(3)=3
        call    do_emit
.l1_nf:
        mov     al, [pleft]
        call    wt_fxy
        cmp     al, 0
        je      .l1_ns
        mov     dx, 4
        movzx   ax, al
        mov     bx, [fv12]
        add     bx, 2               ; cB(4)=2
        mov     cx, 1               ; rB(4)=1
        call    do_emit
.l1_ns:
        add     word [fv12], 3
        mov     bx, [pright]
        movsx   ax, byte [XD+bx]
        add     [fx], ax
        movsx   ax, byte [YD+bx]
        add     [fy], ax
        inc     word [fn]
        jmp     .l1
.l1d:
        ; R->L: start 2 cells right of focus, step left, v12 = 6,3,0
        mov     bx, [pright]
        movsx   ax, byte [XD+bx]
        shl     ax, 1
        add     ax, [wdx]
        mov     [fx], ax
        movsx   ax, byte [YD+bx]
        shl     ax, 1
        add     ax, [wdy]
        mov     [fy], ax
        mov     word [fv12], 6
        mov     word [fn], 0
.r1:
        cmp     word [fn], 3
        jge     .r1d
        mov     al, [facing]
        call    wt_fxy
        cmp     al, 0
        je      .r1_nf
        mov     dx, 3
        movzx   ax, al
        mov     bx, [fv12]
        add     bx, 4               ; cB(3)=4
        mov     cx, 3
        call    do_emit
.r1_nf:
        mov     al, [pright]
        call    wt_fxy
        cmp     al, 0
        je      .r1_ns
        mov     dx, 5
        movzx   ax, al
        mov     bx, [fv12]
        add     bx, 7               ; cB(5)=7
        mov     cx, 1               ; rB(5)=1
        call    do_emit
.r1_ns:
        sub     word [fv12], 3
        mov     bx, [pleft]
        movsx   ax, byte [XD+bx]
        add     [fx], ax
        movsx   ax, byte [YD+bx]
        add     [fy], ax
        inc     word [fn]
        jmp     .r1
.r1d:
        ret

; ============================================================================
;  draw_near (Draw3dWorldNear): two 2-cell scans, pieces 6/7 then 6/8.
; ============================================================================
draw_near:
        ; L->R: start 1 cell left, step right, v12 = -7,0
        mov     bx, [pleft]
        movsx   ax, byte [XD+bx]
        add     ax, [wdx]
        mov     [fx], ax
        movsx   ax, byte [YD+bx]
        add     ax, [wdy]
        mov     [fy], ax
        mov     word [fv12], -7
        mov     word [fn], 0
.l1:
        cmp     word [fn], 2
        jge     .l1d
        mov     al, [facing]
        call    wt_fxy
        cmp     al, 0
        je      .l1_nf
        mov     dx, 6
        movzx   ax, al
        mov     bx, [fv12]
        add     bx, 2               ; cB(6)=2
        mov     cx, 1               ; rB(6)=1
        call    do_emit
.l1_nf:
        mov     al, [pleft]
        call    wt_fxy
        cmp     al, 0
        je      .l1_ns
        mov     dx, 7
        movzx   ax, al
        mov     bx, [fv12]
        add     bx, 0               ; cB(7)=0
        mov     cx, 0               ; rB(7)=0
        call    do_emit
.l1_ns:
        add     word [fv12], 7
        mov     bx, [pright]
        movsx   ax, byte [XD+bx]
        add     [fx], ax
        movsx   ax, byte [YD+bx]
        add     [fy], ax
        inc     word [fn]
        jmp     .l1
.l1d:
        ; R->L: start 1 cell right, step left, v12 = 7,0
        mov     bx, [pright]
        movsx   ax, byte [XD+bx]
        add     ax, [wdx]
        mov     [fx], ax
        movsx   ax, byte [YD+bx]
        add     ax, [wdy]
        mov     [fy], ax
        mov     word [fv12], 7
        mov     word [fn], 0
.r1:
        cmp     word [fn], 2
        jge     .r1d
        mov     al, [facing]
        call    wt_fxy
        cmp     al, 0
        je      .r1_nf
        mov     dx, 6
        movzx   ax, al
        mov     bx, [fv12]
        add     bx, 2               ; cB(6)=2
        mov     cx, 1
        call    do_emit
.r1_nf:
        mov     al, [pright]
        call    wt_fxy
        cmp     al, 0
        je      .r1_ns
        mov     dx, 8
        movzx   ax, al
        mov     bx, [fv12]
        add     bx, 9               ; cB(8)=9
        mov     cx, 0               ; rB(8)=0
        call    do_emit
.r1_ns:
        sub     word [fv12], 7
        mov     bx, [pleft]
        movsx   ax, byte [XD+bx]
        add     [fx], ax
        movsx   ax, byte [YD+bx]
        add     [fy], ax
        inc     word [fn]
        jmp     .r1
.r1d:
        ret

; ============================================================================
;  parse_args:  <file> [px py facing]
; ============================================================================
parse_args:
        mov     byte [fname], 0
        mov     byte [ackmode], 0
        mov     byte [menu_auto], 0
        mov     byte [menu_arg_bad], 0
        mov     word [menu_auto_answer], 0
        mov     byte [ackname], 0
        mov     byte [dumpmode], 0
        mov     byte [texmode], 0
        mov     byte [effectmode], 0
        mov     byte [effectname], 0
        mov     byte [dumpbin], 0
        mov     byte [walkmode], 0
        mov     byte [movemode], 0
        mov     byte [gbwmode], 0
        mov     byte [gbwfpmode], 0
        mov     byte [snapmode], 0
        mov     byte [automode], 0
        mov     byte [gbwname], 0
        mov     byte [snapname], 0
        mov     byte [gbtsname], 0
        mov     byte [gbtsname2], 0
        mov     byte [gbimname], 0
        mov     byte [scenename], 0
        mov     byte [sessionname], 0
        mov     byte [sessionmode], 0
        mov     byte [stepname], 0
        mov     byte [gbts_saved], 0
        mov     byte [gbts_saved2], 0
        mov     byte [altpal_valid], 0
        mov     byte [toggleonce], 0
        mov     byte [scene_force], 0
        mov     byte [scene_overlay], 0
        mov     word [scene_overlay_x], 0
        mov     word [scene_overlay_y], 0
        mov     word [effect_text_slot], 0FFFFh
        mov     byte [graphics_alt_enabled], 0
        mov     byte [movescr], 0
        mov     byte [texarea], '1'
        ; scan whole tail for "/P","/T","/A","/R","/W","/M","/Q","/F","/S" flags first
        mov     si, 81h
.scan:
        mov     al, [si]
        or      al, al
        jz      .scandone
        cmp     al, 13
        je      .scandone
        cmp     al, '/'
        jne     .scannext
        mov     al, [si+1]
        and     al, 0DFh
        cmp     al, 'J'
        jne     .notJearly
        mov     byte [toggleonce], 1
.notJearly:
        cmp     al, 'O'
        jne     .notOearly
        mov     byte [scene_force], 1
.notOearly:
        cmp     al, 'H'
        jne     .notHearly
        mov     byte [scene_overlay], 1
        ; GBBOOT writes the paired BODY frame at this fixed sidecar path.
        ; Supplying it implicitly keeps the multi-scene DOS child tail below
        ; the 127-byte DOS limit (the normal /I path remains available for
        ; encounter art).
        push    si
        mov     si, s_scene_overlay_image
        mov     di, gbimname
.hname:
        lodsb
        stosb
        or      al, al
        jnz     .hname
        pop     si
        push    si
        add     si, 2
        call    skip_sp
        call    read_num
        jc      .hskip
        mov     [scene_overlay_x], ax
        call    skip_sp
        call    read_num
        jc      .hskip
        mov     [scene_overlay_y], ax
.hskip:
        pop     si
.notHearly:
        cmp     al, 'P'
        jne     .notP
        mov     byte [dumpmode], 1
.notP:
        cmp     al, 'T'
        jne     .notT
        mov     byte [texmode], 1
.notT:
        cmp     al, 'A'
        jne     .notA
        push    si
        add     si, 2
.askip:
        mov     al, [si]
        cmp     al, ' '
        jne     .aread
        inc     si
        jmp     .askip
.aread:
        cmp     al, '1'
        jb      .aend
        cmp     al, '9'
        ja      .aend
        mov     [texarea], al
.aend:
        pop     si
.notA:
        cmp     al, 'E'
        jne     .notE
        mov     byte [effectmode], 1
        ; capture the GBEF path that follows "/E".
        push    si
        add     si, 2
.eskip:
        mov     al, [si]
        cmp     al, ' '
        jne     .ecopy0
        inc     si
        jmp     .eskip
.ecopy0:
        mov     di, effectname
.ecopy:
        mov     al, [si]
        or      al, al
        jz      .ecend
        cmp     al, 13
        je      .ecend
        cmp     al, ' '
        je      .ecend
        cmp     al, '/'
        je      .ecend
        mov     [di], al
        inc     si
        inc     di
        jmp     .ecopy
.ecend:
        mov     byte [di], 0
        pop     si
.notE:
        cmp     al, 'R'
        jne     .notR
        mov     byte [dumpbin], 1
.notR:
        cmp     al, 'W'
        jne     .notW
        mov     byte [walkmode], 1
.notW:
        cmp     al, 'M'
        jne     .notM
        mov     byte [movemode], 1
        ; capture the script token that follows "/M": skip "/M" + spaces, copy
        ; the run of non-space/non-CR chars into movescr (ASCIIZ).
        push    si
        add     si, 2               ; past "/M"
.mskip:
        mov     al, [si]
        cmp     al, ' '
        jne     .mcopy0
        inc     si
        jmp     .mskip
.mcopy0:
        mov     di, movescr
.mcopy:
        mov     al, [si]
        or      al, al
        jz      .mcend
        cmp     al, 13
        je      .mcend
        cmp     al, ' '
        je      .mcend
        cmp     al, '/'             ; another flag ends the token
        je      .mcend
        mov     [di], al
        inc     si
        inc     di
        jmp     .mcopy
.mcend:
        mov     byte [di], 0
        pop     si
.notM:
        cmp     al, 'Q'
        jne     .notQ
        mov     byte [gbwmode], 1
.notQ:
        cmp     al, 'F'
        jne     .notF
        mov     byte [gbwfpmode], 1
        push    si
        add     si, 2
.fskip:
        mov     al, [si]
        cmp     al, ' '
        jne     .fcopy0
        inc     si
        jmp     .fskip
.fcopy0:
        mov     di, gbwname
.fcopy:
        mov     al, [si]
        or      al, al
        jz      .fcend
        cmp     al, 13
        je      .fcend
        cmp     al, ' '
        je      .fcend
        cmp     al, '/'
        je      .fcend
        mov     [di], al
        inc     si
        inc     di
        jmp     .fcopy
.fcend:
        mov     byte [di], 0
        pop     si
.notF:
        cmp     al, 'U'
        jne     .notU
        push    si
        add     si, 2
.uskip:
        mov     al, [si]
        cmp     al, ' '
        jne     .ucopy0
        inc     si
        jmp     .uskip
.ucopy0:
        mov     di, gbtsname
.ucopy:
        mov     al, [si]
        or      al, al
        jz      .ucend
        cmp     al, 13
        je      .ucend
        cmp     al, ' '
        je      .ucend
        cmp     al, '/'
        je      .ucend
        mov     [di], al
        inc     si
        inc     di
        jmp     .ucopy
.ucend:
        mov     byte [di], 0
        pop     si
.notU:
        cmp     al, 'V'
        jne     .notV
        push    si
        add     si, 2
.vskip:
        mov     al, [si]
        cmp     al, ' '
        jne     .vcopy0
        inc     si
        jmp     .vskip
.vcopy0:
        mov     di, gbtsname2
.vcopy:
        mov     al, [si]
        or      al, al
        jz      .vcend
        cmp     al, 13
        je      .vcend
        cmp     al, ' '
        je      .vcend
        cmp     al, '/'
        je      .vcend
        mov     [di], al
        inc     si
        inc     di
        jmp     .vcopy
.vcend:
        mov     byte [di], 0
        pop     si
.notV:
        cmp     al, 'K'
        jne     .notK
        push    si
        add     si, 2
.kskip:
        cmp     byte [si], ' '
        jne     .kcopy0
        inc     si
        jmp     .kskip
.kcopy0:
        mov     di, scenename
.kcopy:
        mov     al, [si]
        or      al, al
        jz      .kcend
        cmp     al, 13
        je      .kcend
        cmp     al, ' '
        je      .kcend
        cmp     al, '/'
        je      .kcend
        stosb
        inc     si
        jmp     .kcopy
.kcend:
        mov     byte [di], 0
        pop     si
.notK:
        cmp     al, 'I'
        jne     .notI
        push    si
        add     si, 2
.iskip:
        cmp     byte [si], ' '
        jne     .icopy0
        inc     si
        jmp     .iskip
.icopy0:
        mov     di, gbimname
.icopy:
        mov     al, [si]
        or      al, al
        jz      .icend
        cmp     al, 13
        je      .icend
        cmp     al, ' '
        je      .icend
        cmp     al, '/'
        je      .icend
        stosb
        inc     si
        jmp     .icopy
.icend:
        mov     byte [di], 0
        pop     si
.notI:
        cmp     al, 'N'
        jne     .notN
        mov     byte [sessionmode], 1
        push    si
        add     si, 2
.nskip:
        cmp     byte [si], ' '
        jne     .ncopy0
        inc     si
        jmp     .nskip
.ncopy0:
        mov     di, sessionname
.ncopy:
        mov     al, [si]
        or      al, al
        jz      .ncend
        cmp     al, 13
        je      .ncend
        cmp     al, ' '
        je      .ncend
        cmp     al, '/'
        je      .ncend
        stosb
        inc     si
        jmp     .ncopy
.ncend:
        mov     byte [di], 0
        pop     si
.notN:
        cmp     al, 'Y'
        jne     .notY
        push    si
        add     si, 2
.yskip:
        cmp     byte [si], ' '
        jne     .ycopy0
        inc     si
        jmp     .yskip
.ycopy0:
        mov     di, stepname
.ycopy:
        mov     al, [si]
        or      al, al
        jz      .ycend
        cmp     al, 13
        je      .ycend
        cmp     al, ' '
        je      .ycend
        cmp     al, '/'
        je      .ycend
        stosb
        inc     si
        jmp     .ycopy
.ycend:
        mov     byte [di], 0
        pop     si
.notY:
        cmp     al, 'J'
        jne     .notJ
        mov     byte [toggleonce], 1
.notJ:
        ; /L was retired 2026-09-05 (round 37 R3).  It used to set [automode]=1,
        ; which is read at exactly one site (.gbws_wait, below) reachable only
        ; when /F has set [gbwfpmode].  GBBOOT's scene-replay builder
        ; (.replay_scene in gbboot.asm) never emits /F, so on the path /L was
        ; introduced to bound -- narrated headless scene playback -- it was
        ; never consulted.  MEASURED, not inferred, on identical artifacts:
        ; standalone CCFP `/K scene.gbi /O /L` killed at 30.12 s (did not
        ; exit), `/O` alone killed at 30.03 s (same, /L changed nothing), `/O
        ; /S <raw>` exited in 1.04 s.  GBBOOT was fixed on its side (round 36,
        ; 42c315e) to append /S instead of /L for its non-interactive host
        ; arm; this side retires the now-unreachable flag rather than wiring
        ; it up, because /S already proves out the bounded-exit case and the
        ; interactive arm's blocking key-wait is correct there (a human is
        ; the exit).  [automode] and .autowait below are now permanently
        ; dead -- nothing sets [automode] to nonzero any more -- and are left
        ; in place rather than excised, since a second, unrelated flag would
        ; have to be invented to prove removing them is safe; this comment is
        ; that proof for /L alone.  Confirmed nothing in the repo still
        ; passes CCFP's /L: `grep -rn "CCFP" native --include=*.ps1
        ; --include=*.asm` turned up no caller appending it (the /L strings
        ; in gbboot.asm's own usage/`s_arg_seed_input` and in
        ; native/gbboot-test.ps1 are GBBOOT's *own*, unrelated /L flag).
.notL:
        cmp     al, 'Z'
        jne     .notZ
        ; /Z n selects the matching v6 GBSX text record. GBBOOT uses this
        ; during narrated attract-mode scene replay.
        push    si
        add     si, 2
        call    skip_sp
        call    read_num
        jc      .zdone
        mov     [effect_text_slot], ax
.zdone:
        pop     si
.notZ:
        cmp     al, 'S'
        jne     .notS
        mov     byte [snapmode], 1
        push    si
        add     si, 2
.sskip:
        mov     al, [si]
        cmp     al, ' '
        jne     .scopy0
        inc     si
        jmp     .sskip
.scopy0:
        or      al, al
        jz      .scend
        cmp     al, 13
        je      .scend
        cmp     al, '/'
        je      .scend
        mov     di, snapname
.scopy:
        mov     al, [si]
        or      al, al
        jz      .scend_store
        cmp     al, 13
        je      .scend_store
        cmp     al, ' '
        je      .scend_store
        cmp     al, '/'
        je      .scend_store
        mov     [di], al
        inc     si
        inc     di
        jmp     .scopy
.scend_store:
        mov     byte [di], 0
.scend:
        pop     si
.notS:
.scannext:
        inc     si
        jmp     .scan
.scandone:
        mov     si, 81h
        call    skip_sp
        mov     di, fname
.cf:
        mov     al, [si]
        or      al, al
        jz      .fin
        cmp     al, 13
        je      .fin
        cmp     al, ' '
        je      .cfd
        mov     [di], al
        inc     si
        inc     di
        jmp     .cf
.cfd:
        mov     byte [di], 0
        ; optional px py facing
        call    skip_sp
        call    probe_ack_args
        jc      .fin2
        call    read_num            ; CF=0 if a number was read -> AX
        jc      .fin2
        mov     [px_pose], ax
        call    skip_sp
        call    read_num
        jc      .fin2
        mov     [py_pose], ax
        call    skip_sp
        call    read_num
        jc      .fin2
        mov     [facing], ax
        and     word [facing], 6    ; force even facing (0/2/4/6)
.fin2:
        call    parse_ack_selection
        ret
.fin:
        mov     byte [di], 0
        ret

; GBBOOT keeps its existing two-path menu tail. A v15 terminal GBEF in the
; first slot selects this CCFP input mode; the second path is the GBMO output.
; Ordinary wall-grid invocations keep their positional parser unchanged.
; Only a recognized two-path effect invocation reinterprets /S as an answer.
; Scan whole tokens after mode discovery so option ordering and compact /S0
; work, while ordinary snapshot paths (even numeric ones) remain unchanged.
parse_ack_selection:
        cmp     byte [ackmode], 1
        jne     .done
        mov     byte [snapmode], 0
        mov     si, 81h
        movzx   di, byte [80h]
        add     di, si
.token:
        cmp     si, di
        jae     .done
        cmp     byte [si], 13
        je      .done
        cmp     byte [si], ' '
        je      .space
        cmp     byte [si], 9
        je      .space
        cmp     byte [si], '/'
        jne     .skip_token
        lea     ax, [si+1]
        cmp     ax, di
        jae     .done
        mov     al, [si+1]
        and     al, 0dfh
        cmp     al, 'S'
        jne     .skip_token
        add     si, 2
.answer_space:
        cmp     si, di
        jae     .bad
        cmp     byte [si], ' '
        je      .answer_next
        cmp     byte [si], 9
        jne     .answer_start
.answer_next:
        inc     si
        jmp     .answer_space
.answer_start:
        xor     bx, bx
        xor     cx, cx
.digit:
        cmp     si, di
        jae     .value
        mov     al, [si]
        cmp     al, 13
        je      .value
        cmp     al, ' '
        je      .value
        cmp     al, 9
        je      .value
        cmp     al, '0'
        jb      .bad
        cmp     al, '9'
        ja      .bad
        movzx   bp, al
        sub     bp, '0'
        mov     ax, bx
        mov     dx, 10
        mul     dx
        or      dx, dx
        jnz     .bad
        add     ax, bp
        jc      .bad
        mov     bx, ax
        inc     cx
        inc     si
        jmp     .digit
.value:
        or      cx, cx
        jz      .bad
        mov     [menu_auto_answer], bx
        mov     byte [menu_auto], 1
        jmp     .token
.bad:
        mov     byte [menu_arg_bad], 1
.skip_token:
        cmp     si, di
        jae     .done
        cmp     byte [si], 13
        je      .done
        cmp     byte [si], ' '
        je      .space
        cmp     byte [si], 9
        je      .space
        inc     si
        jmp     .skip_token
.space:
        inc     si
        jmp     .token
.done:
        ret

probe_ack_args:
        mov     ax, 3D00h
        mov     dx, fname
        int     21h
        jc      .no_ack
        mov     [fh], ax
        mov     bx, ax
        mov     ah, 3Fh
        mov     cx, 10
        mov     dx, loadbuf
        int     21h
        push    ax
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        pop     ax
        cmp     ax, 10
        jne     .no_ack
        cmp     dword [loadbuf], 'GBEF'
        jne     .no_ack
        cmp     word [loadbuf+4], 16
        je      .ack_version
        cmp     word [loadbuf+4], 15
        jne     .no_ack
.ack_version:
        cmp     word [loadbuf+8], 2
        jne     .no_ack
        mov     byte [ackmode], 1
        mov     byte [effectmode], 1
        push    si
        mov     si, fname
        mov     di, effectname
.effect_copy:
        lodsb
        stosb
        or      al, al
        jnz     .effect_copy
        pop     si
        mov     di, ackname
        xor     cx, cx
.answer_copy:
        mov     al, [si]
        or      al, al
        jz      .answer_end
        cmp     al, 13
        je      .answer_end
        cmp     al, ' '
        je      .answer_end
        cmp     cx, 127
        jae     .no_ack
        stosb
        inc     si
        inc     cx
        jmp     .answer_copy
.answer_end:
        mov     byte [di], 0
        or      cx, cx
        jz      .no_ack
        stc
        ret
.no_ack:
        clc
        ret

; GBBOOT /8 passes <ABC>WALL.BIN as CCFP's primary grid and writes the
; companion overlay as <ABC>AMIGA.GBI.  /H intentionally omits that image
; path to protect the DOS child-tail limit, so derive the paired fixed-width
; basename here.  Legacy _GBWALL.BIN retains the original _GBAMIGA.GBI.
select_scene_overlay_namespace:
        ; Legacy movement traces retain the documented CCFP.MOV basename.
        mov     si, s_movfile
        mov     di, movpath
.default_mov:
        lodsb
        stosb
        or      al, al
        jnz     .default_mov
        mov     si, fname
        mov     bx, si
.scan:
        lodsb
        or      al, al
        jz      .found
        cmp     al, '\'
        je      .separator
        cmp     al, ':'
        jne     .scan
.separator:
        mov     bx, si
        jmp     .scan
.found:
        cmp     byte [bx], '_'
        je      .done
        cmp     byte [bx+3], 'W'
        jne     .done
        cmp     byte [bx+4], 'A'
        jne     .done
        cmp     byte [bx+5], 'L'
        jne     .done
        cmp     byte [bx+6], 'L'
        jne     .done
        cmp     byte [bx+7], '.'
        jne     .done
        cmp     byte [bx+8], 'B'
        jne     .done
        cmp     byte [bx+9], 'I'
        jne     .done
        cmp     byte [bx+10], 'N'
        jne     .done
        cmp     byte [bx+11], 0
        jne     .done
        ; A /M trace is state, never a title asset.  Keep it beside the
        ; absolute namespaced wall sidecar (D:\COKFP.MOV), not in GAME\COK.
        mov     si, fname
        mov     di, movpath
.copy_dir:
        cmp     si, bx
        je      .mov_suffix
        lodsb
        stosb
        jmp     .copy_dir
.mov_suffix:
        mov     ax, [bx]
        mov     [di], ax
        add     di, 2
        mov     al, [bx+2]
        mov     [di], al
        inc     di
        mov     si, s_mov_suffix
.copy_suffix:
        lodsb
        stosb
        or      al, al
        jnz     .copy_suffix
        cmp     byte [scene_overlay], 0
        je      .done
        mov     ax, [bx]
        mov     [gbimname], ax
        mov     al, [bx+2]
        mov     [gbimname+2], al
.done:
        ret

; read_num: parse decimal at [si]; CF=1 if no digit, else CF=0, AX=value, si advanced
read_num:
        xor     bx, bx
        xor     cx, cx              ; digit count
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

; copy ASCIIZ [si] to [di] (di advanced)
cat_si:
        lodsb
        or      al, al
        jz      .d
        stosb
        jmp     cat_si
.d:
        ret

; print signed AX as decimal at [di] (di advanced)
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
;  Data
; ============================================================================
; /L removed from the usage string 2026-09-05 (round 37 R3): it was a dead flag,
; see the .notJ/.notL comment above for the measurement. Use /S to bound a
; non-interactive scene replay instead.
s_usage   db 'CCFP walls [x y f] [/P][/T][/U a.gbt][/V b.gbt][/I art.gbi][/K scene.gbi][/H x y][/N state.gbs][/Y step.gbs][/J][/A n][/E fx][/R][/W][/M FBLRC][/S [out]][/Z n]',13,10
s_scene_overlay_image db '_GBAMIGA.GBI',0
          db 'CCFP wallset.gbw /Q [/R]  |  CCFP walls /F wallset.gbw [/E fx][/R][/S [out]]',13,10,'$'
s_number_input db 'Enter a number, then press Enter: $'
s_party_choice db 13,10,'Choose one:',13,10,'$'
s_yes_label db 'Y. $'
s_no_label db 13,10,'N. $'
s_party_input db 13,10,'Y/N? $'
s_menu_invalid db 13,10,'Invalid choice.',13,10,'$'
s_noopen  db 'cannot open walls file',13,10,'$'
s_notex   db 'cannot read selected 8X8D/WALLDEF DAX for /T',13,10,'$'
s_resolve db 'RESOLVE.BIN',0
s_tiles   db 'TILES.BIN',0
s_pal     db 'PAL.BIN',0
s_walldef db 'WALLDEF1.DAX',0
s_tiles8  db '8X8D1.DAX',0
s_tiles8_boot db '8X8D1.DAX',0
s_defeffect db '_GBECL.BIN',0
s_planfile db 'PLAN.TXT',0
s_movfile db 'CCFP.MOV',0
s_mov_suffix db 'FP.MOV',0
s_gbwraw  db 'GBWVIEW.RAW',0
s_viewraw db 'CCFPVIEW.RAW',0

; routeTileId set bases (SYMBOL_SET_FIX, wallpieces.ts), as words for bx*2 index.
sym_fix   dw 0x01, 0x2e, 0x74, 0xba, 0x100

; Fixed EGA-16 palette, RGB 0..255 (brown corrected at 6); >>2 -> 6-bit DAC.
ega_pal:
        db 000h,000h,000h
        db 000h,000h,0AAh
        db 000h,0AAh,000h
        db 000h,0AAh,0AAh
        db 0AAh,000h,000h
        db 0AAh,000h,0AAh
        db 0AAh,055h,000h
        db 0AAh,0AAh,0AAh
        db 055h,055h,055h
        db 055h,055h,0FFh
        db 055h,0FFh,055h
        db 055h,0FFh,0FFh
        db 0FFh,055h,055h
        db 0FFh,055h,0FFh
        db 0FFh,0FFh,055h
        db 0FFh,0FFh,0FFh
s_piece   db '  piece=',0
s_slot    db ' slot=',0
s_col     db ' colStart=',0
s_row     db ' rowStart=',0
s_gbwidx  db ' gbwIndex=',0

; MapDirection{X,Y}Delta -- index by dir 0..8 (8 = zero). Verbatim Gbl.cs.
XD        db 0, 1, 1, 1, 0, -1, -1, -1, 0
YD        db -1, -1, 0, 1, 1, 1, 0, -1, 0

; PIECES[0..9] geometry (wallpieces.ts) + one flat-shade colour each.
colBase   db 5, 4, 6, 4, 2, 7, 2, 0, 9, 5
rowBase   db 4, 3, 3, 3, 1, 1, 1, 0, 0, 4
pcols     db 1, 1, 1, 3, 2, 2, 7, 2, 2, 1
prows     db 2, 4, 4, 4, 8, 8, 8, 11, 11, 2
; WALLDEF pool start column per piece (wallpieces.ts idxOffset); 132,154 > 127
; so this MUST be read with movzx (unsigned), never movsx.
pidx      db 0, 2, 6, 10, 22, 38, 54, 110, 132, 154
; far=dim, mid=mid, near=bright; front grey, left blue-ish, right red/green, cap yellow
pcolor    db 8, 1, 4, 7, 9, 12, 15, 11, 14, 14


; Secret v16 selected identity, kept distinct from other-title WHO.
who_validate_state:
        cmp word [loadbuf+120], 13
        jne who_validate_identity.bad
who_validate_identity:
        cmp dword [loadbuf+SI_MAGIC_OFF], 'GBSI'
        jne .bad
        cmp dword [loadbuf+SI_MAGIC_OFF+4], 00100001h
        jne .bad
        cmp word [loadbuf+SI_MAGIC_OFF+14], 0
        jne .bad
        cmp dword [loadbuf+MS_MAGIC_OFF], 'GBMS'
        jne .bad
        mov ax, [loadbuf+SI_COUNT_OFF]
        cmp ax, 6
        ja .bad
        mov dx, [loadbuf+SI_FLAGS_OFF]
        cmp dx, 2
        ja .bad
        cmp dx, [loadbuf+MS_FLAGS_OFF]
        jne .bad
        mov bx, [loadbuf+SI_SELECTED_OFF]
        cmp bx, [loadbuf+MS_SELECTED_OFF]
        jne .bad
        cmp dx, 1
        jne .null
        test bx, bx
        jz .bad
        cmp bx, ax
        ja .bad
        clc
        ret
.null:  test bx, bx
        jnz .bad
        clc
        ret
.bad:   stc
        ret

; Extension2 is a typed Secret codec capability, admitted before row0.
; Legacy extension1 keeps its exact decoding/spacing, even in old Secret GSK.
validate_secret_text_context:
        cmp word [fxreadlen], FX_V16_LEN
        jne .bad
        cmp word [fx_physical_hi], 0
        jne .bad
        cmp word [fx_physical_len], FX_V16_LEN
        jne .bad
        cmp dword [loadbuf], 'GBEF'
        jne .bad
        cmp word [loadbuf+4], 16
        jne .bad
        cmp dword [loadbuf+116], 'GBRS'
        jne .bad
        mov ax, [loadbuf+120]
        and ax, 0fffeh
        cmp ax, 12
        jne .bad
        mov ax, [loadbuf+8]
        cmp ax, 4
        ja .bad
        cmp ax, 2
        je .pending
        cmp ax, 3
        jne .raw
.pending:
        test word [loadbuf+120], 1
        jz .bad
.raw:
        cmp dword [loadbuf+GBRF_MAGIC_OFF], 'GBRF'
        jne .bad
        cmp word [loadbuf+GBRF_RESERVED_OFF], 0
        jne .bad
        mov si, loadbuf+GBRF_FLAGS_OFF
        mov cx, 6
.flag: cmp byte [si], 1
        ja .bad
        inc si
        loop .flag
        jmp who_validate_identity
.bad: stc
        ret

who_drain_keys:
        mov ah, 1
        int 16h
        jz .done
        xor ax, ax
        int 16h
        jmp who_drain_keys
.done:  ret

who_manual_choice:
        mov word [who_cursor], 0FFFFh
        cmp word [loadbuf+SI_FLAGS_OFF], 1
        jne .ready
        mov ax, [loadbuf+SI_SELECTED_OFF]
        dec ax
        mov [who_cursor], ax
.ready:
        mov si, who_key_guide
        call who_print_z
        call who_display_current
.key:
        xor ax, ax
        int 16h
        push ax
        call who_drain_keys
        pop ax                      ; Original helper drains pending keys after read.
        cmp al, 13
        je .enter
        cmp al, '2'
        je .down
        cmp al, '8'
        je .up
        test al, al
        jnz .key                  ; Escape has no cancel semantics here.
        cmp ah, 50h
        je .down
        cmp ah, 48h
        jne .key
.up:
        mov ax, [who_cursor]
        cmp ax, 0FFFFh
        je .last
        test ax, ax
        jz .last
        dec ax
        jmp .store
.last:
        mov ax, [loadbuf+SI_COUNT_OFF]
        dec ax
        jmp .store
.down:
        mov ax, [who_cursor]
        inc ax                    ; FFFFh (null) wraps to first ordinal0.
        cmp ax, [loadbuf+SI_COUNT_OFF]
        jb .store
        xor ax, ax
.store:
        mov [who_cursor], ax
        call who_display_current
        jmp .key
.enter:
        mov ax, [who_cursor]
        clc
        ret

; Commit only GBMS selected/flags and GBSI flags/selected (8 bytes), close
; the existing effect before GBMO creation, preserving every other byte.
who_commit_choice:
        call who_distinct_output
        jc .bad
        mov ax, [menu_selected]
        cmp ax, 0FFFFh
        je .null
        cmp ax, [loadbuf+SI_COUNT_OFF]
        jae .bad
        inc ax
        mov [loadbuf+MS_SELECTED_OFF], ax
        mov [loadbuf+SI_SELECTED_OFF], ax
        mov word [loadbuf+MS_FLAGS_OFF], 1
        mov word [loadbuf+SI_FLAGS_OFF], 1
        jmp .open
.null:
        cmp word [loadbuf+SI_FLAGS_OFF], 1
        je .bad
.open:
        mov ax, 3D02h
        mov dx, effectname
        int 21h
        jc .bad
        mov [ofh], ax
        mov bx, ax
        xor cx, cx
        xor dx, dx
        mov ax, 4202h
        int 21h
        jc .close_bad
        or dx, dx
        jnz .close_bad
        cmp ax, FX_V16_LEN
        jne .close_bad
        mov dx, MS_SELECTED_OFF
        call .write4
        jc .close_bad
        mov dx, SI_FLAGS_OFF
        call .write4
        jc .close_bad
        mov bx, [ofh]
        mov ah, 3Eh
        int 21h
        jc .bad
        clc
        ret
.write4:
        push dx
        xor cx, cx
        mov bx, [ofh]
        mov ax, 4200h
        int 21h
        pop dx
        jc .write_bad
        add dx, loadbuf
        mov bx, [ofh]
        mov cx, 4
        mov ah, 40h
        int 21h
        jc .write_bad
        cmp ax, 4
        jne .write_bad
        clc
        ret
.write_bad:
        stc
        ret
.close_bad:
        mov bx, [ofh]
        mov ah, 3Eh
        int 21h
.bad:   stc
        ret

who_validate_labels:
        mov ax, [loadbuf+MN_COUNT_OFF]
        inc ax
        cmp ax, [loadbuf+MT_COUNT_OFF]
        jne .bad
        mov si, loadbuf+MT_DATA_OFF
        movzx ax, byte [si]
        inc si
        add si, ax                 ; Source-shaped packed prompt.
        mov cx, [loadbuf+MN_COUNT_OFF]
.name:
        movzx dx, byte [si]
        inc si
        cmp dx, 1
        jb .bad
        cmp dx, 15
        ja .bad
.char:
        cmp si, loadbuf+MT_DATA_OFF+MENU_TEXT_CAP
        jae .bad
        cmp byte [si], 32
        jb .bad
        cmp byte [si], 127
        jae .bad
        inc si
        dec dx
        jnz .char
        loop .name
.padding:
        cmp si, loadbuf+MT_DATA_OFF+MENU_TEXT_CAP
        jae .ok
        cmp byte [si], 0
        jne .bad
        inc si
        jmp .padding
.ok:    clc
        ret
.bad:   stc
        ret

who_show_labels:
        call print_pending_prompt
        mov si, MT_DATA_OFF
        call print_pending_label
        mov dl, 13
        mov ah, 02h
        int 21h
        mov dl, 10
        int 21h
        mov cx, [loadbuf+MN_COUNT_OFF]
.next:
        movzx bx, byte [loadbuf+si]
        inc si
.char:
        mov dl, [loadbuf+si]
        inc si
        mov ah, 02h
        int 21h
        dec bx
        jnz .char
        mov dl, 13
        mov ah, 02h
        int 21h
        mov dl, 10
        int 21h
        loop .next
        ret


; A WHO answer cannot truncate its own effect through a DOS path alias.
who_distinct_output:
        push es
        push ds
        pop es
        mov si, effectname
        mov di, who_canon_in
        xor cx, cx
        mov ax, 6000h
        int 21h
        jc .bad
        mov si, ackname
        mov di, who_canon_out
        mov ax, 6000h
        int 21h
        jc .bad
        mov si, who_canon_in
        mov di, who_canon_out
        mov cx, 128
.byte:
        lodsb
        cmp al, [di]
        jne .ok
        inc di
        test al, al
        jz .bad
        loop .byte
.bad:   pop es
        stc
        ret
.ok:    pop es
        clc
        ret
who_canon_in times 128 db 0
who_canon_out times 128 db 0

; Explicit current actor feedback for the source-faithful key interface.
; Save ES as CCFP may still own VGA rendering state when called directly.
who_display_current:
        push ax
        push bx
        push cx
        push dx
        push si
        push es
        mov si, who_current_label
        call who_print_z
        mov bx, [who_cursor]
        cmp bx, 0FFFFh
        jne .actor
        mov si, who_null_label
        call who_print_z
        jmp .done
.actor:
        mov dl, bl
        add dl, '1'                 ; Distinguish duplicate display names by row.
        mov ah, 02h
        int 21h
        mov dl, '.'
        int 21h
        mov dl, ' '
        int 21h
        mov si, loadbuf+MT_DATA_OFF
        movzx ax, byte [si]
        inc si
        add si, ax                  ; Skip packed prompt; remaining names ASCII.
.skip:
        test bx, bx
        jz .name
        movzx ax, byte [si]
        inc si
        add si, ax
        dec bx
        jmp .skip
.name:
        movzx cx, byte [si]
        inc si
.char:
        mov dl, [si]
        inc si
        mov ah, 02h
        int 21h
        loop .char
.done:
        mov dl, 13
        mov ah, 02h
        int 21h
        mov dl, 10
        int 21h
        pop es
        pop si
        pop dx
        pop cx
        pop bx
        pop ax
        ret
who_print_z:
        lodsb
        test al, al
        jz .done
        mov dl, al
        mov ah, 02h
        int 21h
        jmp who_print_z
.done:  ret
who_key_guide db 'Enter selects current actor; Down/2 next; Up/8 previous.',13,10,0
who_current_label db 'Current: ',0
who_null_label db '(none selected)',0
who_cursor dw 0FFFFh

fname     times 128 db 0
effectname times 128 db 0
ackname times 128 db 0
ackbuf times GBMO_LEN db 0
menu_input db 6,0,6 dup(0)
menu_selected dw 0
menu_auto db 0
menu_arg_bad db 0
menu_auto_answer dw 0
menu_stream_index dw 0
menu_stream_base dw 0
sidecar_fault db 0
pending_prompt_len db 0
pending_prompt times SCRIPT_PAGE_BYTES+1 db 0
sidecar_name times 128 db 0
gbtsname times 128 db 0
gbtsname2 times 128 db 0
gbts_saved times 128 db 0
gbts_saved2 times 128 db 0
gbimname times 128 db 0
scenename times 128 db 0
sessionname times 128 db 0
stepname times 128 db 0
campflag db 0
fh        dw 0
ofh       dw 0
fxfh      dw 0
sidefh    dw 0
dumpmode  db 0
texmode   db 0
effectmode db 0
ackmode db 0
pending_menu db 0
ack_mouse_present db 0
dumpbin   db 0
walkmode  db 0
automode  db 0
sessionmode db 0
stepflag db 0
movemode  db 0
gbwmode   db 0
gbwfpmode db 0
snapmode  db 0
texarea   db '1'
altpal_valid db 0
toggleonce db 0
graphics_alt_enabled db 0
gbim_valid db 0
gbim_enabled db 0
scene_valid db 0
scene_enabled db 0
scene_force db 0
scene_overlay db 0
scene_overlay_x dw 0
scene_overlay_y dw 0
scene_len dw 0
scene_block dw 0
scene_width dw 0
scene_height dw 0
scene_npix dw 0
scene_y dw 0
scene_x dw 0
scene_top dw 0
gbim_len dw 0
gbim_block dw 0
gbim_width dw 0
gbim_height dw 0
gbim_npix dw 0
gbim_scale dw 1
gbim_dstx dw 0
gbim_dsty dw 0
gbim_sy dw 0
gbim_ry dw 0
gbts_len dw 0
gbts_set dw 0
gbts_wanted dw 0
gbts_count dw 0
gbts_npix dw 0
gbts_width dw 0
gbts_pal_colors dw 16
gbts_load_namep dw 0
gbts_load_seg dw 0
gbts_palette_seg dw 0
gbts_palette_off dw 0
gbts_set_seg times 5 dw 0
gbts_set_base times 5 dw 0
gbts_set_width times 5 dw 0
planfh    dw 0
movfh     dw 0
emit_slot dw 0
linebuf   times 64 db 0
movescr   times 256 db 0          ; /M script: F/B/L/R chars, ASCIIZ
movpath   times 128 db 0
effect_text_len db 0
effect_text_cleared db 0
effect_text_slot dw 0FFFFh
effect_text_current dw 0FFFFh
effect_text_count dw 0
sidecar_count dw 0
sidecar_version dw 0
sidecar_records_end dw 0
sidecar_dir_base dw 0
sidecar_payload_base dw 0
sidecar_payload_len dw 0
sidecar_tag_count dw 0
sidecar_seen_tags dw 0
sidecar_seen_payload dw 0
effect_text_offset dw 0
sidecar_index dw 0
sidecar_len_lo dw 0
sidecar_len_hi dw 0
sidecar_seek_lo dw 0
sidecar_seek_hi dw 0
sidecar_active db 0
sidebuf times 54 db 0
side_ext times 12 db 0
side_dir times 8 db 0
side_packed times 255 db 0
v2_char_index dw 0
effect_text times SCRIPT_PAGE_BYTES+1 db 0
effect_setup_valid db 0
effect_setup_sprite dw 0
effect_setup_max dw 0
effect_setup_pic dw 0
effect_setup_distance dw 0
effect_setup_draw_dist dw 0
effect_setup_w dw 0
effect_setup_h dw 0
effect_picture_valid db 0
effect_picture_id dw 0
effect_clock_valid db 0
effect_clock_slots times 7 dw 0
fx_physical_len dw 0
fx_physical_hi dw 0
fxreadlen dw 0
gbwname   times 128 db 0
snapname  times 128 db 0
rawhdr    dw 320, 200
GBWHDR_LEN  equ 16
GBWIHDR_V1_LEN equ 20
GBWIHDR_V2_LEN equ 24
GBWIHDR_LEN equ GBWIHDR_V2_LEN
gbwhdr    times GBWHDR_LEN db 0
gbwihdr   times GBWIHDR_LEN db 0
gbw_group_base dw 0,0,10,20,29,38
gbw_piece_extra db 1,2,3,4,5,6,7,8,9,0
gbw_piece_plain db 0,1,2,3,4,5,6,7,8,0
gbw_ybase dw 0, 0, 46, 92, 126, 154
gbw_xpos  times 6 dw 0
gbw_idx   dw 0
gbw_w     dw 0
gbw_h     dw 0
gbw_npix  dw 0
gbw_group db 0
gbw_firstpal db 0
gbw_dstx  dw 0
gbw_dsty  dw 0
gbw_sy    dw 0
gbw_sx    dw 0
gbw_src   dw 0
gbw_dst   dw 0
gbw_curlo dw 0
gbw_curhi dw 0
gbw_count dw GBWS_WALL_GROUP
gbw_version dw 0
gbwihdr_len dw 0
gbw_setw  dw 0
gbw_groupw dw 0
gbw_drawidx dw 0
gbw_yoff  dw 0
gbw_xoff  dw 0
seeklo    dw 0
seekhi    dw 0
gbw_offlo times GBWS_IMAGE_COUNT dw 0
gbw_offhi times GBWS_IMAGE_COUNT dw 0
gbw_imgw  times GBWS_IMAGE_COUNT dw 0
gbw_imgh  times GBWS_IMAGE_COUNT dw 0
gbw_imgnp times GBWS_IMAGE_COUNT dw 0
gbw_imgyo times GBWS_IMAGE_COUNT dw 0
gbw_imgxo times GBWS_IMAGE_COUNT dw 0
; try_step locals
ts_dir    db 0
ts_nx     dw 0
ts_ny     dw 0
; step_sound state (initialised data: stays out of the cleared BSS span)
snd_glb   db 'DISK1\SOUNDS.GLB',0
snd_nul   db 'NUL',0
snd_com   db 'CCSND.COM',0
snd_tail  db SND_TAIL_LEN
          db ' /P 8 7418 DISK1\SOUNDS.GLB'
SND_TAIL_LEN equ $ - snd_tail - 1
          db 13
snd_full  dw 0
snd_save  dw 0
snd_sp    dw 0
snd_ss    dw 0
snd_epb   times 14 db 0

; load_named I/O
ln_name   dw 0
tiles_namep dw s_tiles8
ln_buf    dw 0
ln_len    dw 0

; --- in-asm DAX decode scratch ---
dax_seg   dw 0
dax_dseg  dw 0
tileset_seg dw 0
altsrc_seg dw 0
altsrc2_seg dw 0
image_seg dw 0
scene_seg dw 0
dax_blk   dw 0
dax_tocb  dw 0
dax_cnt   dw 0
dax_dbase dw 0
dax_raw   dw 0
dax_comp  dw 0
dax_src   dw 0

; --- build_tables tile-set bookkeeping (routeTileId set 0..4) ---
ts_next   dw 0                  ; running byte offset into tileset_seg
ts_base   times 5 dw 0          ; per-set byte offset into tileset_seg
ts_cnt    times 5 dw 0          ; per-set tile count

reloc_varA dw 0

; --- resolve-walk locals ---
rb_ws     dw 0
rb_sl     dw 0
rb_col    dw 0
rb_id     dw 0
rt_set    dw 0
rt_index  dw 0
pool_n    dw 0
singlebank db 0
piece_default db 0
piece_single db 0
piece_ids  dw 3, 0ffh, 23
piece_s    dw 0
piece_i    dw 0
piece_k    dw 0
piece_block dw 0
piece_slot dw 0
piece_off  dw 0
tile_rem   dw 0
fxbuf     times 32 db 0

; expand_piece locals
ex_ws     dw 0
ex_slice  dw 0
ex_base   dw 0
ex_col    dw 0
ex_cols   dw 0
ex_rows   dw 0
ex_r      dw 0
ex_c      dw 0
ex_colX   dw 0
ex_rowY   dw 0
ex_slot   dw 0
ex_px     dw 0
ex_py     dw 0

; blit_tile locals
bt_ty     dw 0
bt_tx     dw 0
bt_rowbase dw 0
bt_pix    db 0

px_pose   dw 8
py_pose   dw 13
facing    dw 4
sessionfh dw 0
sessionbuf db 'GBSN'
           dw 1,0,0,0,0,0
stepbuf db 'GBST'
        dw 1,0,0,0,0
ecl       dw 34

pleft     dw 0
pright    dw 0
pbehind   dw 0
wdx       dw 0
wdy       dw 0

fx        dw 0
fy        dw 0
fcol      dw 0
fcarry    dw 0
fn        dw 0
fv12      dw 0
ffront    db 0
fside     db 0

wt_dir    db 0
wt_y      dw 0
wt_x      dw 0

fp_piece  dw 0
fp_col    dw 0
fp_row    dw 0
fp_color  db 0
rx0       dw 0
rx1       dw 0
ry0       dw 0
ry1       dw 0
xs        dw 0
xe        dw 0
ys        dw 0
ye        dw 0
tmpx      dw 0
tmpy      dw 0

; grid dimensions: 16x16 by default (legacy raw WALLS.BIN); overridden by a
; 'WGRD'+W+H header (the CCGEO /B bake) at load time.
gridW     dw 16
gridH     dw 16
gridCells dw 256
gridCellBytes dw 1024
gridHeadered db 0
roofmode  db 0
doormode  db 0
loadlen   dw 0
; raw file image (header + cells + optional plane2/plane3) before it is unpacked into
; wallbuf/roofbuf. Real GEO maps currently top out at DQK's 28x28 (3136 cell
; bytes + two 784-byte tails + 6-byte header).
; The same scratch buffer holds one GBWS image; verified DQK wall images top out
; at 56x58 (3248 bytes).  The /T table-build scratch reuses this same region
; after WGRD input has been copied into wallbuf; GBWS modes never build /T
; tables.  wdraw is used before poolmap, so those two also share the first
; scratch span.  The decoded source tileset cache lives in tileset_seg above the
; .COM segment; only the final deduped tile pool remains resident for rendering.
; NASM -f bin gives a separate .bss section zero-based labels here, so reserve
; these scratch buffers with absolute at the current flat offset instead.
ccfp_bss_start equ $
absolute ccfp_bss_start
transient_scratch:
loadbuf   equ transient_scratch
wdraw     equ transient_scratch        ; one WALLDEF block's decompressed bytes
poolmap   equ transient_scratch        ; (set*256+index) -> pool slot
          resb LOADBUF_SIZE            ; largest of loadbuf/wdraw/poolmap
wallbuf   resb WALLBUF_SIZE   ; W*H*4 cells (legacy 16x16 = 1024 B)
roofbuf   resb MAX_MAP_CELLS  ; optional W*H plane2 backdrop/roof bytes
doorbuf   resb MAX_MAP_CELLS  ; optional W*H plane3 door/gateway flags
resolvebuf resb 4680           ; 3*5*156 LE words (0xFFFF = no tile)
pal_colors resw 1
palbuf    resb 96              ; up to 32 Amiga colours as 6-bit DAC
tilesbuf  resb (TILEPOOL_TILE_CAP*64)
                                ; deduped 8x8 indexed tile pool

; in-asm build buffers
wdtab     resb (3*5*156)       ; relocated WALLDEF: 3 wallsets x 5 slices x 156 cols
CCFP_BSS_LEN equ $ - ccfp_bss_start
