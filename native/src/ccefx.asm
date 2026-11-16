; ============================================================================
;  CCEFX.COM -- DOS-side GBEF/GBSX effect dump helper.
;
;  CCECL /E emits a compact GBEF bridge record for the native GBBOOT engine
;  path.  This read-only utility gives that path a DOS-native inspection tool:
;  it validates the record header, prints the stable bridge fields, and dumps
;  the LOAD_FILES/LOAD_PIECES bridge prefix, the encounter/NPC handoff, the GBRS
;  resume state summary, each captured GBSX script effect with opcode, operands,
;  the v6-format decoded inline text tail, the v7 encounter-setup tail, the
;  v8 halt-diagnostic tail, and the v9 clock tail when present.
;
;  Usage:  CCEFX <effect.gbef> [out.txt]
;  Build:  native\build.ps1 -Target ccefx
; ============================================================================
        cpu     386
        bits    16
        org     100h

FXMAX       equ 8192             ; v9 GBEF with 64 GBSX records is 5746 bytes
SCRIPTCAP   equ 64
SCRIPT_ARGS equ 8
SCRIPT_REC_BYTES equ 20
SCRIPT_TEXT_BYTES equ 32
SCRIPT_TEXT_REC_BYTES equ 34
ENCCAP      equ 8
NPCCAP      equ 8
CALLCAP     equ 32
MAXMEM      equ 512
RSMEM_DUMP_CAP equ 16
FX_HAVE_FILES equ 0001h
FX_HAVE_PIECES equ 0002h
FX_HAVE_ENC equ 0008h
FX_HAVE_NPC equ 0010h
FX_HAVE_SIDECAR equ 0100h

FX_VERSION_OFF equ 4
FX_FLAGS_OFF   equ 6
FX_STATUS_OFF  equ 8
FX_GEO_OFF     equ 10
FX_FILES_OPS_OFF equ 12
FX_PIECES_RAW_OFF equ 18
FX_PIECES_SET_OFF equ 24
FX_CHAIN_OFF   equ 30
FX_ENC_COUNT_OFF equ 32
FX_ENC_GROUPS_OFF equ 34
FX_NPC_COUNT_OFF equ 82
FX_NPC_JOINS_OFF equ 84
RS_MAGIC_OFF  equ 116
RS_FLAGS_OFF  equ 120
RS_AREA_OFF   equ 122
RS_PC_OFF     equ 124
RS_RNG_OFF    equ 126
RS_CALLSP_OFF equ 130
RS_STACK_OFF  equ 132
RS_MEMCOUNT_OFF equ 196
RS_MEM_KEYS_OFF equ 198
RS_MEM_VALS_OFF equ 1222
SX_MAGIC_OFF   equ 2246
SX_COUNT_OFF   equ 2250
SX_EVENTS_OFF  equ 2252
SX_TEXT_OFF    equ SX_EVENTS_OFF + (SCRIPTCAP * SCRIPT_REC_BYTES)
ES_MAGIC_OFF   equ SX_TEXT_OFF + (SCRIPTCAP * SCRIPT_TEXT_REC_BYTES)
ES_SPRITE_OFF  equ ES_MAGIC_OFF + 4
ES_MAX_OFF     equ ES_MAGIC_OFF + 6
ES_PIC_OFF     equ ES_MAGIC_OFF + 8
ES_DIST_OFF    equ ES_MAGIC_OFF + 10
HD_MAGIC_OFF   equ ES_MAGIC_OFF + 12
HD_REASON_OFF  equ HD_MAGIC_OFF + 4
HD_PC_OFF      equ HD_MAGIC_OFF + 6
HD_OPCODE_OFF  equ HD_MAGIC_OFF + 8
HD_AREA_OFF    equ HD_MAGIC_OFF + 10
CL_MAGIC_OFF   equ HD_MAGIC_OFF + 12
CL_SLOTS_OFF   equ CL_MAGIC_OFF + 4

start:
        cld
        mov     sp, stacktop
        push    cs
        pop     ds
        mov     word [outfh], 0

        call    parse_args
        cmp     byte [fname], '/'
        jne     .args_ready
        cmp     byte [fname+1], 'H'
        je      .host
        cmp     byte [fname+1], 'h'
        jne     .args_ready
.host:
        cmp     byte [fname+2], 0
        jne     .args_ready
        cmp     byte [outname], 0
        je      .host_default
        mov     si, outname
        mov     di, hoststate_name
        call    copy_z
        mov     byte [outname], 0
        jmp     .host_load
.host_default:
        mov     si, s_host_state
        mov     di, hoststate_name
        call    copy_z
.host_load:
        call    load_host_state
        jc      .bad
.args_ready:
        cmp     byte [fname], 0
        je      .usage

        cmp     byte [outname], 0
        je      .stdout
        call    open_output
        jc      .outerr
.stdout:
        call    read_file
        jc      .openerr

        cmp     word [fx_len], 12
        jb      .bad
        cmp     word [fxbuf], 'GB'
        jne     .bad
        cmp     word [fxbuf+2], 'EF'
        jne     .bad

        mov     ax, [fxbuf+FX_VERSION_OFF]
        mov     [version_seen], ax
        cmp     ax, 9
        jbe     .supported
        cmp     ax, 14             ; v10 was intentionally never a bridge ABI
        je      .supported
        cmp ax,16
        je .secret_v16
        cmp     ax, 15             ; v15 adds DoK raw flag state
        jne     .unsupported
        jmp .supported
.secret_v16:
        call validate_v16_dump
        jc .bad
.supported:

        call    print_header
        call    dump_bridge_prefix
        jc      .bad
        call    dump_handoff
        jc      .bad
        call    dump_resume
        jc      .bad
        call    dump_gbsx
        jc      .bad
        call    dump_setup
        jc      .bad
        call    dump_halt_diag
        jc      .bad
        call    dump_clock
        jc      .bad
        call dump_selected_actor
        jc .bad
        call    close_output
        mov     ax, 4C00h
        int     21h

.usage:
        mov     dx, s_usage
        call    print_z
        mov     ax, 4C01h
        int     21h
.openerr:
        mov     dx, s_openerr
        call    print_z
        call    close_output
        mov     ax, 4C01h
        int     21h
.outerr:
        mov     dx, s_outerr
        call    print_z
        mov     ax, 4C01h
        int     21h
.unsupported:
        mov     dx, s_unsupported
        call    print_z
        call    close_output
        mov     ax, 4C01h
        int     21h
.bad:
        mov     dx, s_bad
        call    print_z
        call    close_output
        mov     ax, 4C01h
        int     21h

; ============================================================================
;  load_host_state: strict GBHS v1 dispatcher for GBBOOT's transcript bridge.
; ============================================================================
load_host_state:
        ; GBBOOT /8 writes a fixed-width title prefix (for example COKHOST)
        ; into every sidecar.  Keep the /H diagnostic reader in that same
        ; namespace rather than falling back to a stale legacy _GB* file.
        call    select_host_sidecar_namespace
        mov     ax, 3D00h
        mov     dx, hoststate_name
        int     21h
        jc      host_state_bad
        mov     [fh], ax
        mov     bx, ax
        mov     cx, 13                    ; exact 12 bytes only
        mov     dx, hostbuf
        mov     ah, 3Fh
        int     21h
        push    ax
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        pop     ax
        cmp     ax, 12
        jne     host_state_bad
        cmp     word [hostbuf], 'GB'
        jne     host_state_bad
        cmp     word [hostbuf+2], 'HS'
        jne     host_state_bad
        cmp     word [hostbuf+4], 1
        jne     host_state_bad
        cmp     word [hostbuf+8], 0
        jne     host_state_bad
        cmp     word [hostbuf+10], 0
        jne     host_state_bad
        cmp     word [hostbuf+6], 1
        je      .effect
        cmp     word [hostbuf+6], 2
        jne     host_state_bad
        mov     si, s_resume_input
        mov     dx, s_resume_output
        jmp     host_paths
.effect:
        mov     si, s_effect_input
        mov     dx, s_effect_output
host_paths:
        ; Copy the absolute host-state directory twice, then replace its
        ; basename with the selected fixed input/output names.
        push    dx
        mov     di, fname
        call    copy_host_prefix
        call    copy_z
        pop     si
        mov     di, outname
        call    copy_host_prefix
        call    copy_z
        clc
        ret

; A host-state name of <ABC>HOST.BIN selects <ABC>ECL.{BIN,TXT} and
; <ABC>RES.{BIN,TXT}.  The ordinary _GBHOST.BIN contract remains unchanged
; for standalone and legacy callers.
select_host_sidecar_namespace:
        mov     si, hoststate_name
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
        cmp     byte [bx+3], 'H'
        jne     .done
        cmp     byte [bx+4], 'O'
        jne     .done
        cmp     byte [bx+5], 'S'
        jne     .done
        cmp     byte [bx+6], 'T'
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
        mov     ax, [bx]
        mov     [s_effect_input], ax
        mov     [s_effect_output], ax
        mov     [s_resume_input], ax
        mov     [s_resume_output], ax
        mov     al, [bx+2]
        mov     [s_effect_input+2], al
        mov     [s_effect_output+2], al
        mov     [s_resume_input+2], al
        mov     [s_resume_output+2], al
.done:
        ret

copy_host_prefix:
        push    ax
        push    bx
        push    si
        mov     bx, di
        mov     si, hoststate_name
.loop:
        mov     al, [si]
        or      al, al
        jz      .done
        mov     [di], al
        inc     di
        cmp     al, '\'
        je      .mark
        cmp     al, ':'
        jne     .next
.mark:
        mov     bx, di
.next:
        inc     si
        jmp     .loop
.done:
        mov     di, bx
        pop     si
        pop     bx
        pop     ax
        ret
host_state_bad:
        stc
        ret

copy_z:
        lodsb
        stosb
        or      al, al
        jne     copy_z
        ret

; ============================================================================
;  read_file: read the first FXMAX bytes of fname into fxbuf.
; ============================================================================
read_file:
        mov     ax, 3D00h
        mov     dx, fname
        int     21h
        jc      .fail
        mov     [fh], ax
        mov bx,ax
        xor cx,cx
        xor dx,dx
        mov ax,4202h
        int 21h
        jc .readfail
        mov [fx_physical_lo],ax
        mov [fx_physical_hi],dx
        mov bx,[fh]
        xor cx,cx
        xor dx,dx
        mov ax,4200h
        int 21h
        jc .readfail
        mov     bx, [fh]
        mov     dx, fxbuf
        mov     cx, FXMAX
        mov     ah, 3Fh
        int     21h
        jc      .readfail
        mov     [fx_len], ax

        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
        jc .fail
        clc
        ret

.readfail:
        mov     bx, [fh]
        mov     ah, 3Eh
        int     21h
.fail:
        stc
        ret

; ============================================================================
;  Optional output-file sink. With no outname, putc writes to STDOUT.
; ============================================================================
open_output:
        mov     dx, outname
        xor     cx, cx
        mov     ah, 3Ch
        int     21h
        jc      .fail
        mov     [outfh], ax
        clc
        ret
.fail:
        stc
        ret

close_output:
        cmp     word [outfh], 0
        je      .done
        mov     bx, [outfh]
        mov     ah, 3Eh
        int     21h
        mov     word [outfh], 0
.done:
        ret

; ============================================================================
;  Header and GBSX dump
; ============================================================================
print_header:
        mov     dx, s_hdr0
        call    print_z
        mov     ax, [fxbuf+FX_VERSION_OFF]
        call    print_hex_word
        mov     dx, s_hdr_flags
        call    print_z
        mov     ax, [fxbuf+FX_FLAGS_OFF]
        call    print_hex_word
        mov     dx, s_hdr_status
        call    print_z
        mov     ax, [fxbuf+FX_STATUS_OFF]
        call    print_hex_word
        mov     dx, s_hdr_geo
        call    print_z
        mov     ax, [fxbuf+FX_GEO_OFF]
        call    print_hex_word
        mov     dx, s_hdr_chain
        call    print_z
        mov     ax, [fxbuf+FX_CHAIN_OFF]
        call    print_hex_word
        call    print_crlf
        ret

dump_bridge_prefix:
        mov     ax, [fxbuf+FX_FLAGS_OFF]
        test    ax, FX_HAVE_FILES
        jz      .pieces
        cmp     word [fx_len], FX_FILES_OPS_OFF + 6
        jb      .bad
        mov     dx, s_gblf0
        call    print_z
        mov     ax, [fxbuf+FX_FILES_OPS_OFF]
        call    print_hex_word
        mov     dl, ' '
        call    putc
        mov     ax, [fxbuf+FX_FILES_OPS_OFF+2]
        call    print_hex_word
        mov     dl, ' '
        call    putc
        mov     ax, [fxbuf+FX_FILES_OPS_OFF+4]
        call    print_hex_word
        call    print_crlf

.pieces:
        mov     ax, [fxbuf+FX_FLAGS_OFF]
        test    ax, FX_HAVE_PIECES
        jz      .done
        cmp     word [fx_len], FX_PIECES_SET_OFF + 6
        jb      .bad
        mov     dx, s_gblp0
        call    print_z
        mov     ax, [fxbuf+FX_PIECES_RAW_OFF]
        call    print_hex_word
        mov     dl, ' '
        call    putc
        mov     ax, [fxbuf+FX_PIECES_RAW_OFF+2]
        call    print_hex_word
        mov     dl, ' '
        call    putc
        mov     ax, [fxbuf+FX_PIECES_RAW_OFF+4]
        call    print_hex_word
        mov     dx, s_gblp_sets
        call    print_z
        mov     ax, [fxbuf+FX_PIECES_SET_OFF]
        call    print_hex_word
        mov     dl, ' '
        call    putc
        mov     ax, [fxbuf+FX_PIECES_SET_OFF+2]
        call    print_hex_word
        mov     dl, ' '
        call    putc
        mov     ax, [fxbuf+FX_PIECES_SET_OFF+4]
        call    print_hex_word
        call    print_crlf
.done:
        clc
        ret
.bad:
        stc
        ret

dump_handoff:
        mov     ax, [fxbuf+FX_FLAGS_OFF]
        test    ax, FX_HAVE_ENC
        jz      .npc
        cmp     word [fx_len], FX_ENC_COUNT_OFF + 2
        jb      .bad
        mov     ax, [fxbuf+FX_ENC_COUNT_OFF]
        cmp     ax, ENCCAP
        ja      .bad
        mov     [enc_count], ax
        mov     bx, ax
        shl     bx, 1                  ; count * 2
        mov     dx, bx
        shl     bx, 1                  ; count * 4
        add     bx, dx                 ; count * 6
        add     bx, FX_ENC_GROUPS_OFF
        cmp     bx, [fx_len]
        ja      .bad

        mov     dx, s_gbec_count
        call    print_z
        mov     ax, [enc_count]
        call    print_hex_word
        call    print_crlf

        mov     word [event_idx], 0
.enc_loop:
        mov     ax, [event_idx]
        cmp     ax, [enc_count]
        jae     .npc
        mov     bx, ax
        shl     bx, 1                  ; index * 2
        mov     dx, bx
        shl     bx, 1                  ; index * 4
        add     bx, dx                 ; index * 6
        add     bx, fxbuf + FX_ENC_GROUPS_OFF
        mov     [handoff_base], bx
        mov     dl, '@'
        call    putc
        mov     al, [event_idx]
        call    print_hex_byte
        mov     dx, s_gbec_monster
        call    print_z
        mov     bx, [handoff_base]
        mov     ax, [bx]
        call    print_hex_word
        mov     dx, s_gbec_count_field
        call    print_z
        mov     bx, [handoff_base]
        mov     ax, [bx+2]
        call    print_hex_word
        mov     dx, s_gbec_pic
        call    print_z
        mov     bx, [handoff_base]
        mov     ax, [bx+4]
        call    print_hex_word
        call    print_crlf
        inc     word [event_idx]
        jmp     .enc_loop

.npc:
        mov     ax, [fxbuf+FX_FLAGS_OFF]
        test    ax, FX_HAVE_NPC
        jz      .done
        cmp     word [fx_len], FX_NPC_COUNT_OFF + 2
        jb      .bad
        mov     ax, [fxbuf+FX_NPC_COUNT_OFF]
        cmp     ax, NPCCAP
        ja      .bad
        mov     [npc_count], ax
        mov     bx, ax
        shl     bx, 2                  ; count * 4
        add     bx, FX_NPC_JOINS_OFF
        cmp     bx, [fx_len]
        ja      .bad

        mov     dx, s_gbnj_count
        call    print_z
        mov     ax, [npc_count]
        call    print_hex_word
        call    print_crlf

        mov     word [event_idx], 0
.npc_loop:
        mov     ax, [event_idx]
        cmp     ax, [npc_count]
        jae     .done
        mov     bx, ax
        shl     bx, 2                  ; index * 4
        add     bx, fxbuf + FX_NPC_JOINS_OFF
        mov     [handoff_base], bx
        mov     dl, '@'
        call    putc
        mov     al, [event_idx]
        call    print_hex_byte
        mov     dx, s_gbnj_npc
        call    print_z
        mov     bx, [handoff_base]
        mov     ax, [bx]
        call    print_hex_word
        mov     dx, s_gbnj_morale
        call    print_z
        mov     bx, [handoff_base]
        mov     ax, [bx+2]
        call    print_hex_word
        call    print_crlf
        inc     word [event_idx]
        jmp     .npc_loop
.done:
        clc
        ret
.bad:
        stc
        ret

dump_resume:
        cmp     word [version_seen], 3
        jb      .done
        cmp     word [fx_len], RS_MAGIC_OFF + 4
        jb      .done
        cmp     word [fxbuf+RS_MAGIC_OFF], 'GB'
        jne     .done
        cmp     word [fxbuf+RS_MAGIC_OFF+2], 'RS'
        jne     .done
        cmp     word [fx_len], RS_MEMCOUNT_OFF + 2
        jb      .bad

        mov     ax, [fxbuf+RS_CALLSP_OFF]
        cmp     ax, CALLCAP
        ja      .bad
        mov     [resume_callsp], ax
        mov     bx, ax
        shl     bx, 1
        add     bx, RS_STACK_OFF
        cmp     bx, [fx_len]
        ja      .bad

        mov     ax, [fxbuf+RS_MEMCOUNT_OFF]
        cmp     ax, MAXMEM
        ja      .bad
        mov     [resume_memcount], ax
        mov     bx, ax
        shl     bx, 1
        add     bx, RS_MEM_KEYS_OFF
        cmp     bx, [fx_len]
        ja      .bad
        mov     bx, [resume_memcount]
        shl     bx, 1
        add     bx, RS_MEM_VALS_OFF
        cmp     bx, [fx_len]
        ja      .bad

        mov     dx, s_gbrs0
        call    print_z
        mov     ax, [fxbuf+RS_FLAGS_OFF]
        call    print_hex_word
        mov     dx, s_gbrs_area
        call    print_z
        mov     ax, [fxbuf+RS_AREA_OFF]
        call    print_hex_word
        mov     dx, s_gbrs_pc
        call    print_z
        mov     ax, [fxbuf+RS_PC_OFF]
        call    print_hex_word
        mov     dx, s_gbrs_rng
        call    print_z
        mov     ax, [fxbuf+RS_RNG_OFF+2]
        call    print_hex_word
        mov     ax, [fxbuf+RS_RNG_OFF]
        call    print_hex_word
        mov     dx, s_gbrs_callsp
        call    print_z
        mov     ax, [resume_callsp]
        call    print_hex_word
        mov     dx, s_gbrs_mem
        call    print_z
        mov     ax, [resume_memcount]
        call    print_hex_word
        call    print_crlf

        cmp     word [resume_callsp], 0
        je      .mem
        mov     dx, s_gbrs_stack
        call    print_z
        mov     word [resume_idx], 0
.stack_loop:
        mov     ax, [resume_idx]
        cmp     ax, [resume_callsp]
        jae     .stack_done
        mov     dl, ' '
        call    putc
        mov     bx, ax
        shl     bx, 1
        add     bx, fxbuf + RS_STACK_OFF
        mov     ax, [bx]
        call    print_hex_word
        inc     word [resume_idx]
        jmp     .stack_loop
.stack_done:
        call    print_crlf

.mem:
        cmp     word [resume_memcount], 0
        je      .done
        mov     ax, [resume_memcount]
        cmp     ax, RSMEM_DUMP_CAP
        jbe     .mem_count_ok
        mov     ax, RSMEM_DUMP_CAP
.mem_count_ok:
        mov     [resume_dump_count], ax
        mov     dx, s_gbrs_memdump
        call    print_z
        call    print_hex_word
        call    print_crlf
        mov     word [resume_idx], 0
.mem_loop:
        mov     ax, [resume_idx]
        cmp     ax, [resume_dump_count]
        jae     .done
        mov     dl, '@'
        call    putc
        mov     al, [resume_idx]
        call    print_hex_byte
        mov     dx, s_gbrs_memkey
        call    print_z
        mov     bx, [resume_idx]
        shl     bx, 1
        add     bx, fxbuf + RS_MEM_KEYS_OFF
        mov     ax, [bx]
        call    print_hex_word
        mov     dx, s_gbrs_memvalue
        call    print_z
        mov     bx, [resume_idx]
        shl     bx, 1
        add     bx, fxbuf + RS_MEM_VALS_OFF
        mov     ax, [bx]
        call    print_hex_word
        call    print_crlf
        inc     word [resume_idx]
        jmp     .mem_loop
.done:
        clc
        ret
.bad:
        stc
        ret

dump_gbsx:
        test    word [fxbuf+FX_FLAGS_OFF], FX_HAVE_SIDECAR
        jnz     dump_gbsl
        cmp     word [fx_len], SX_COUNT_OFF + 2
        jb      .none
        cmp     word [fxbuf+SX_MAGIC_OFF], 'GB'
        jne     .none
        cmp     word [fxbuf+SX_MAGIC_OFF+2], 'SX'
        jne     .none

        mov     ax, [fxbuf+SX_COUNT_OFF]
        cmp     ax, SCRIPTCAP
        ja      .bad
        mov     [script_count], ax

        ; Require the event array slice that the count says is populated.
        mov     bx, ax
        mov     dx, bx
        shl     bx, 4                  ; count * 16
        shl     dx, 2                  ; count * 4
        add     bx, dx                 ; count * 20
        add     bx, SX_EVENTS_OFF
        cmp     bx, [fx_len]
        ja      .bad

        cmp     word [version_seen], 6
        jb      .print_count
        mov     bx, [script_count]
        mov     dx, bx
        shl     bx, 5                  ; count * 32
        shl     dx, 1                  ; count * 2
        add     bx, dx                 ; count * 34
        add     bx, SX_TEXT_OFF
        cmp     bx, [fx_len]
        ja      .bad

.print_count:
        mov     dx, s_gbsx_count
        call    print_z
        mov     ax, [script_count]
        call    print_hex_word
        call    print_crlf

        mov     word [event_idx], 0
.event_loop:
        mov     ax, [event_idx]
        cmp     ax, [script_count]
        jae     .done
        mov     ax, [event_idx]
        mov     [display_idx], ax
        call    print_event
        inc     word [event_idx]
        jmp     .event_loop

.done:
        clc
        ret
.none:
        mov     dx, s_gbsx_none
        call    print_z
        clc
        ret
.bad:
        stc
        ret

; A sidecar is streamed one 54-byte record at a time. Its 16-bit count does
; not imply a memory cap: DOS seek validates the exact file extent before any
; transcript output is produced.
dump_gbsl:
        call    make_side_name
        jc      .bad
        mov     ax, 3d00h
        mov     dx, side_name
        int     21h
        jc      .bad
        mov     [sidefh], ax
        mov     bx, ax
        mov     cx, 8
        mov     dx, sidebuf
        mov     ah, 3fh
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
        mov     [side_version], ax
        mov     ax, [sidebuf+6]
        or      ax, ax
        jz      .close_bad
        mov     [script_count], ax

        ; v1 is the exact fixed body. v2 retains that body and appends one
        ; strictly validated packed-text directory/payload extension.
        mov     bx, 54
        mul     bx
        add     ax, 8
        adc     dx, 0
        mov     [side_len_lo], ax
        mov     [side_len_hi], dx
        cmp     word [side_version], 2
        jne     .check_extent
        mov     bx, [sidefh]
        mov     ax, 4202h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_bad
        or      dx, dx
        jnz     .close_bad
        mov     [v2_extent], ax
        mov     [side_len_lo], ax
        mov     word [side_len_hi], 0
        mov     ax, [sidefh]
        mov     [v2_fh], ax
        mov     word [v2_base], 0
        call    validate_gbsl_v2
        jc      .close_bad
        mov     ax, [v2_count]
        cmp     ax, [script_count]
        jne     .close_bad
.check_extent:
        mov     bx, [sidefh]
        mov     ax, 4202h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_bad
        cmp     dx, [side_len_hi]
        jne     .close_bad
        cmp     ax, [side_len_lo]
        jne     .close_bad
        mov     bx, [sidefh]
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, 8
        int     21h
        jc      .close_bad

        mov     dx, s_gbsl_count
        call    print_z
        mov     ax, [script_count]
        call    print_hex_word
        call    print_crlf
        mov     word [side_index], 0
.loop:
        mov     ax, [side_index]
        cmp     ax, [script_count]
        jae     .done
        mov     bx, 54
        mul     bx
        add     ax, 8
        adc     dx, 0
        mov     cx, dx
        mov     dx, ax
        mov     bx, [sidefh]
        mov     ax, 4200h
        int     21h
        jc      .close_bad
        mov     bx, [sidefh]
        mov     cx, 54
        mov     dx, sidebuf
        mov     ah, 3fh
        int     21h
        jc      .close_bad
        cmp     ax, 54
        jne     .close_bad

        ; Reuse the established bounded formatter. The effect buffer is no
        ; longer needed after the bridge fields were printed; record zero is
        ; a staging slot, while display_idx retains the source ordering.
        push    ds
        pop     es
        mov     si, sidebuf
        mov     di, fxbuf + SX_EVENTS_OFF
        mov     cx, 20
        rep     movsb
        mov     si, sidebuf + 20
        mov     di, fxbuf + SX_TEXT_OFF
        mov     cx, 34
        rep     movsb
        mov     word [event_idx], 0
        mov     ax, [side_index]
        mov     [display_idx], ax
        call    print_event
        jc      .close_bad
        inc     word [side_index]
        jmp     .loop
.done:
        mov     bx, [sidefh]
        mov     ah, 3eh
        int     21h
        mov     word [sidefh], 0
        clc
        ret
.close_bad:
        mov     bx, [sidefh]
        mov     ah, 3eh
        int     21h
        mov     word [sidefh], 0
.bad:
        stc
        ret

; Replace only the final effect-file extension. A flagged record without an
; unambiguous sibling is rejected; it must never select a global stale stream.
make_side_name:
        mov     si, fname
        mov     di, side_name
        xor     bx, bx
.copy:
        lodsb
        mov     [di], al
        or      al, al
        je      .end
        cmp     al, '.'
        jne     .next
        mov     bx, di
.next:
        inc     di
        jmp     .copy
.end:
        or      bx, bx
        jz      .bad
        cmp     bx, side_name + 123
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
dump_setup:
        cmp     word [version_seen], 7
        jb      .none
        cmp     word [fx_len], ES_DIST_OFF + 2
        jb      .bad
        cmp     word [fxbuf+ES_MAGIC_OFF], 'GB'
        jne     .none
        cmp     word [fxbuf+ES_MAGIC_OFF+2], 'ES'
        jne     .none

        mov     dx, s_setup0
        call    print_z
        mov     ax, [fxbuf+ES_SPRITE_OFF]
        call    print_hex_word
        mov     dx, s_setup_max
        call    print_z
        mov     ax, [fxbuf+ES_MAX_OFF]
        call    print_hex_word
        mov     dx, s_setup_pic
        call    print_z
        mov     ax, [fxbuf+ES_PIC_OFF]
        call    print_hex_word
        mov     dx, s_setup_dist
        call    print_z
        mov     ax, [fxbuf+ES_DIST_OFF]
        call    print_hex_word
        call    print_crlf
.none:
        clc
        ret
.bad:
        stc
        ret

dump_halt_diag:
        cmp     word [version_seen], 8
        jb      .none
        cmp     word [fx_len], HD_AREA_OFF + 2
        jb      .bad
        cmp     word [fxbuf+HD_MAGIC_OFF], 'GB'
        jne     .bad
        cmp     word [fxbuf+HD_MAGIC_OFF+2], 'HD'
        jne     .bad

        mov     ax, [fxbuf+HD_REASON_OFF]
        cmp     ax, 0
        jne     .print
        cmp     word [fxbuf+FX_STATUS_OFF], 4
        jne     .none
.print:
        mov     dx, s_halt0
        call    print_z
        mov     ax, [fxbuf+HD_REASON_OFF]
        call    print_hex_word
        cmp     word [fxbuf+HD_REASON_OFF], 7
        jne     .not_full
        mov     dx, s_halt_script_full
        call    print_z
.not_full:
        cmp     word [fxbuf+HD_REASON_OFF], 10
        jne     .reason_done
        mov     dx, s_halt_loop
        call    print_z
.reason_done:
        mov     dx, s_halt_area
        call    print_z
        mov     ax, [fxbuf+HD_AREA_OFF]
        call    print_hex_word
        mov     dx, s_halt_pc
        call    print_z
        mov     ax, [fxbuf+HD_PC_OFF]
        call    print_hex_word
        mov     dx, s_halt_op
        call    print_z
        mov     ax, [fxbuf+HD_OPCODE_OFF]
        call    print_hex_word
        call    print_crlf
.none:
        clc
        ret
.bad:
        stc
        ret

dump_clock:
        cmp     word [version_seen], 9
        jb      .none
        cmp     word [fx_len], CL_SLOTS_OFF + 14
        jb      .bad
        cmp     word [fxbuf+CL_MAGIC_OFF], 'GB'
        jne     .bad
        cmp     word [fxbuf+CL_MAGIC_OFF+2], 'CL'
        jne     .bad

        mov     dx, s_clock0
        call    print_z
        xor     si, si
.loop:
        cmp     si, 14
        jae     .done
        mov     dl, ' '
        call    putc
        mov     ax, [fxbuf+CL_SLOTS_OFF+si]
        call    print_hex_word
        add     si, 2
        jmp     .loop
.done:
        call    print_crlf
.none:
        clc
        ret
.bad:
        stc
        ret

print_event:
        ; event_base = fxbuf + SX_EVENTS_OFF + event_idx * 20
        mov     bx, [event_idx]
        mov     dx, bx
        shl     bx, 4
        shl     dx, 2
        add     bx, dx
        add     bx, fxbuf + SX_EVENTS_OFF
        mov     [event_base], bx

        mov     dl, '#'
        call    putc
        mov     ax, [display_idx]
        call    print_hex_byte

        mov     dx, s_op
        call    print_z
        mov     bx, [event_base]
        mov     ax, [bx]
        mov     [op_word], ax
        call    print_hex_byte
        mov     dx, s_space
        call    print_z
        mov     al, [op_word]
        call    print_opcode_name

        mov     dx, s_argc
        call    print_z
        mov     bx, [event_base]
        mov     ax, [bx+2]
        mov     [argc_word], ax
        call    print_hex_byte

        mov     al, [argc_word]
        or      al, al
        jz      .maybe_text
        cmp     al, SCRIPT_ARGS
        jbe     .argc_ok
        mov     al, SCRIPT_ARGS
.argc_ok:
        mov     [arg_left], al
        mov     dx, s_args
        call    print_z
        mov     si, [event_base]
        add     si, 4
.arg_loop:
        cmp     byte [arg_left], 0
        je      .maybe_text
        mov     dl, ' '
        call    putc
        lodsw
        call    print_hex_word
        dec     byte [arg_left]
        jmp     .arg_loop

.maybe_text:
        call    print_event_detail
        cmp     word [version_seen], 6
        jb      .finish
        ; text_base = fxbuf + SX_TEXT_OFF + event_idx * 34
        mov     bx, [event_idx]
        mov     dx, bx
        shl     bx, 5
        shl     dx, 1
        add     bx, dx
        add     bx, fxbuf + SX_TEXT_OFF
        mov     ax, [bx]
        or      ax, ax
        jz      .finish
        cmp     ax, 0ffffh
        jne     .inline_text
        cmp     word [side_version], 2
        jne     .bad_text
        mov     dx, s_text
        call    print_z
        call    print_v2_text
        jc      .v2_bad
        jmp     .finish
.inline_text:
        cmp     ax, SCRIPT_TEXT_BYTES
        ja      .bad_text
        mov     dx, s_text
        call    print_z
        mov     si, bx
        add     si, 2
        mov     cx, ax
        call    print_bytes
        jmp     .finish

.bad_text:
        mov     dx, s_badtext
        call    print_z
.finish:
        call    print_crlf
        clc
        ret
.v2_bad:
        stc
        ret

; The v2 sidecar was checked as a whole before any transcript line was
; printed.  Resolve one GBPX row and stream all decoded characters.
print_v2_text:
        mov     ax, [sidebuf+20+6]
        shl     ax, 3
        add     ax, [v2_dir_base]
        jc      .bad
        mov     dx, ax
        mov     cx, 8
        mov     di, v2_dir
        call    v2_read_at
        jc      .bad
        mov     dx, [v2_payload_base]
        add     dx, [v2_dir+2]
        jc      .bad
        mov     cx, [v2_dir+4]
        mov     di, v2_packed
        call    v2_read_at
        jc      .bad
        mov     si, v2_packed
        mov     cx, [v2_dir+4]
        xor     bp, bp
        xor     dx, dx
.char:
        xor     al, al
        mov     ah, 6
.bits:
        cmp     dh, 0
        jne     .source
        jcxz    .done
        mov     dl, [si]
        inc     si
        dec     cx
        mov     dh, 8
.source:
        shl     dl, 1
        rcl     al, 1
        dec     dh
        dec     ah
        jnz     .bits
        or      al, al
        jnz     .nonzero
        cmp     word [v2_ext+4], 2
        je      .char
        jmp     .done
.nonzero:
        cmp     word [v2_ext+4], 2
        jne     .mapped
        cmp     bp, 255
        jae     .char
.mapped:
        cmp     al, 31
        ja      .emit
        add     al, 64
.emit:
        push    dx
        mov     dl, al
        call    putc
        pop     dx
        inc     bp
        jmp     .char
.done:
        cmp     bp, [v2_dir+6]
        jne     .bad
        clc
        ret
.bad:   stc
        ret

print_event_detail:
        mov     ax, [op_word]
        cmp     al, 1dh
        je      .partystrength
        cmp     al, 22h
        je      .party_surprise
        cmp     al, 23h
        je      .surprise
        cmp     al, 27h
        je      .treasure
        cmp     al, 28h
        je      .rob
        cmp     al, 2dh
        je      .call
        cmp     al, 2eh
        je      .damage
        cmp     al, 34h
        je      .ecl_clock
        cmp     al, 38h
        je      .program
        ret
.partystrength:
        cmp     word [argc_word], 2
        jb      .ret
        mov     dx, s_detail_partystrength
        call    print_z
        mov     bx, [event_base]
        mov     ax, [bx+4]
        call    print_hex_word
        mov     dx, s_partystrength_threshold
        call    print_z
        mov     bx, [event_base]
        mov     ax, [bx+6]
        call    print_hex_word
        ret
.party_surprise:
        cmp     word [argc_word], 3
        jb      .ret
        mov     dx, s_detail_party_surprise
        call    print_z
        mov     bx, [event_base]
        mov     ax, [bx+4]
        call    print_hex_word
        mov     dx, s_party_surprise_dest1
        call    print_z
        mov     bx, [event_base]
        mov     ax, [bx+6]
        call    print_hex_word
        mov     dx, s_party_surprise_ranger
        call    print_z
        mov     bx, [event_base]
        mov     ax, [bx+8]
        call    print_hex_word
        ret
.surprise:
        cmp     word [argc_word], 5
        jb      .ret
        mov     dx, s_detail_surprise
        call    print_z
        mov     bx, [event_base]
        mov     ax, [bx+4]
        call    print_hex_word
        mov     dx, s_surprise_b
        call    print_z
        mov     bx, [event_base]
        mov     ax, [bx+6]
        call    print_hex_word
        mov     dx, s_surprise_c
        call    print_z
        mov     bx, [event_base]
        mov     ax, [bx+8]
        call    print_hex_word
        mov     dx, s_surprise_d
        call    print_z
        mov     bx, [event_base]
        mov     ax, [bx+10]
        call    print_hex_word
        mov     dx, s_surprise_result
        call    print_z
        mov     bx, [event_base]
        mov     ax, [bx+12]
        call    print_hex_word
        ret
.treasure:
        cmp     word [argc_word], 8
        jb      .ret
        mov     dx, s_detail_treasure
        call    print_z
        mov     bx, [event_base]
        mov     ax, [bx+4]
        call    print_hex_word
        mov     dx, s_treasure_electrum
        call    print_z
        mov     ax, [bx+6]
        call    print_hex_word
        mov     dx, s_treasure_silver
        call    print_z
        mov     ax, [bx+8]
        call    print_hex_word
        mov     dx, s_treasure_gold
        call    print_z
        mov     ax, [bx+10]
        call    print_hex_word
        mov     dx, s_treasure_platinum
        call    print_z
        mov     ax, [bx+12]
        call    print_hex_word
        mov     dx, s_treasure_gems
        call    print_z
        mov     ax, [bx+14]
        call    print_hex_word
        mov     dx, s_treasure_jewelry
        call    print_z
        mov     ax, [bx+16]
        call    print_hex_word
        mov     dx, s_treasure_item
        call    print_z
        mov     ax, [bx+18]
        call    print_hex_word
        mov     al, [bx+18]
        cmp     al, 80h
        jb      .treasure_item_block
        cmp     al, 0ffh
        je      .treasure_none
        sub     al, 80h
        mov     ah, 0
        mov     [detail_tmp], ax
        mov     dx, s_treasure_random
        call    print_z
        mov     ax, [detail_tmp]
        call    print_hex_word
        ret
.treasure_item_block:
        mov     dx, s_treasure_item_block
        jmp     print_z
.treasure_none:
        mov     dx, s_treasure_none
        jmp     print_z
.rob:
        cmp     word [argc_word], 3
        jb      .ret
        mov     dx, s_detail_rob
        call    print_z
        mov     bx, [event_base]
        mov     ax, [bx+4]
        or      al, al
        jz      .rob_selected
        mov     dx, s_scope_party
        call    print_z
        jmp     .rob_after_scope
.rob_selected:
        mov     dx, s_scope_selected
        call    print_z
.rob_after_scope:
        mov     dx, s_rob_loss
        call    print_z
        mov     bx, [event_base]
        mov     ax, [bx+6]
        call    print_hex_word
        mov     dx, s_rob_keep
        call    print_z
        mov     bx, [event_base]
        mov     ax, [bx+6]
        cmp     ax, 100
        jae     .rob_keep_zero
        mov     bx, 100
        sub     bx, ax
        mov     ax, bx
        jmp     .rob_keep_print
.rob_keep_zero:
        xor     ax, ax
.rob_keep_print:
        call    print_hex_word
        mov     dx, s_rob_item
        call    print_z
        mov     bx, [event_base]
        mov     ax, [bx+8]
        call    print_hex_word
        ret
.call:
        cmp     word [argc_word], 1
        jb      .ret
        mov     dx, s_detail_call
        call    print_z
        mov     bx, [event_base]
        mov     ax, [bx+4]
        call    print_hex_word
        cmp     word [argc_word], 2
        jb      .ret
        mov     dx, s_call_routine
        call    print_z
        mov     bx, [event_base]
        mov     ax, [bx+6]
        call    print_hex_word
        ret
.ecl_clock:
        cmp     word [argc_word], 2
        jb      .ret
        mov     dx, s_detail_ecl_clock
        call    print_z
        mov     bx, [event_base]
        mov     ax, [bx+4]
        call    print_hex_word
        mov     dx, s_ecl_clock_slot
        call    print_z
        mov     bx, [event_base]
        mov     ax, [bx+6]
        call    print_hex_word
        ret
.program:
        cmp     word [argc_word], 1
        jb      .ret
        mov     dx, s_detail_program
        call    print_z
        mov     bx, [event_base]
        mov     ax, [bx+4]
        call    print_hex_word
        ret
.damage:
        cmp     word [argc_word], 5
        jb      .ret
        mov     dx, s_detail_damage
        call    print_z
        mov     bx, [event_base]
        mov     ax, [bx+6]             ; dice count
        call    print_hex_word
        mov     dl, 'D'
        call    putc
        mov     bx, [event_base]
        mov     ax, [bx+8]             ; dice sides
        call    print_hex_word
        mov     dl, '+'
        call    putc
        mov     bx, [event_base]
        mov     ax, [bx+10]            ; dice bonus
        call    print_hex_word
        mov     dx, s_damage_control
        call    print_z
        mov     bx, [event_base]
        mov     ax, [bx+4]
        call    print_hex_word
        mov     dx, s_damage_target
        call    print_z
        mov     bx, [event_base]
        mov     ax, [bx+12]
        call    print_hex_word
        mov     bx, [event_base]
        mov     al, [bx+4]             ; control byte
        mov     ah, al
        and     ah, 0E0h
        cmp     ah, 0E0h
        je      .damage_auto_party
        test    al, 80h
        jz      .damage_attack
        test    al, 40h
        jnz     .damage_party
        mov     al, [bx+12]            ; target byte
        test    al, 80h
        jnz     .damage_selected
        mov     dx, s_damage_save_random
        jmp     print_z
.damage_attack:
        mov     dx, s_damage_attack_random
        jmp     print_z
.damage_party:
        mov     dx, s_damage_save_party
        jmp     print_z
.damage_selected:
        test    al, 07h
        jz      .damage_selected_no_save
        mov     dx, s_damage_save_selected
        jmp     print_z
.damage_auto_party:
        mov     dx, s_damage_auto_party
        jmp     print_z
.damage_selected_no_save:
        mov     dx, s_damage_selected_no_save
        jmp     print_z
.ret:
        ret

; ============================================================================
;  Opcode labels for the structured effects CCECL currently preserves.
; ============================================================================
print_opcode_name:
        cmp     al, 0x0A
        je      .load_character
        cmp     al, 0x0C
        je      .setup_monster
        cmp     al, 0x0D
        je      .approach
        cmp     al, 0x0E
        je      .picture
        cmp     al, 0x0F
        je      .input_number
        cmp     al, 0x10
        je      .input_string
        cmp     al, 0x11
        je      .print
        cmp     al, 0x12
        je      .printclear
        cmp     al, 0x15
        je      .vertical_menu
        cmp     al, 0x1D
        je      .partystrength
        cmp     al, 0x1E
        je      .checkparty
        cmp     al, 0x1F
        je      .unknown_1f
        cmp     al, 0x22
        je      .party_surprise
        cmp     al, 0x23
        je      .surprise
        cmp     al, 0x27
        je      .treasure
        cmp     al, 0x28
        je      .rob
        cmp     al, 0x29
        je      .encounter_menu
        cmp     al, 0x2A
        je      .gettable
        cmp     al, 0x2B
        je      .horizontal_menu
        cmp     al, 0x2C
        je      .parlay
        cmp     al, 0x2D
        je      .call
        cmp     al, 0x2E
        je      .damage
        cmp     al, 0x31
        je      .sprite_off
        cmp     al, 0x32
        je      .find_item
        cmp     al, 0x33
        je      .print_return
        cmp     al, 0x34
        je      .ecl_clock
        cmp     al, 0x35
        je      .save_table
        cmp     al, 0x38
        je      .program
        cmp     al, 0x39
        je      .who
        cmp     al, 0x3A
        je      .delay
        cmp     al, 0x3B
        je      .spell
        cmp     al, 0x3C
        je      .protection
        cmp     al, 0x3D
        je      .clear_box
        cmp     al, 0x3E
        je      .dump
        cmp     al, 0x3F
        je      .find_special
        cmp     al, 0x40
        je      .destroy_items
        mov     dx, s_unknown
        jmp     print_z
.load_character:
        mov     dx, s_load_character
        jmp     print_z
.setup_monster:
        mov     dx, s_setup_monster
        jmp     print_z
.approach:
        mov     dx, s_approach
        jmp     print_z
.picture:
        mov     dx, s_picture
        jmp     print_z
.input_number:
        mov     dx, s_input_number
        jmp     print_z
.input_string:
        mov     dx, s_input_string
        jmp     print_z
.print:
        mov     dx, s_print
        jmp     print_z
.printclear:
        mov     dx, s_printclear
        jmp     print_z
.vertical_menu:
        mov     dx, s_vertical_menu
        jmp     print_z
.partystrength:
        mov     dx, s_partystrength
        jmp     print_z
.checkparty:
        mov     dx, s_checkparty
        jmp     print_z
.unknown_1f:
        mov     dx, s_unknown_1f
        jmp     print_z
.party_surprise:
        mov     dx, s_party_surprise
        jmp     print_z
.surprise:
        mov     dx, s_surprise
        jmp     print_z
.treasure:
        mov     dx, s_treasure
        jmp     print_z
.rob:
        mov     dx, s_rob
        jmp     print_z
.encounter_menu:
        mov     dx, s_encounter_menu
        jmp     print_z
.gettable:
        mov     dx, s_gettable
        jmp     print_z
.horizontal_menu:
        mov     dx, s_horizontal_menu
        jmp     print_z
.parlay:
        mov     dx, s_parlay
        jmp     print_z
.call:
        mov     dx, s_call
        jmp     print_z
.damage:
        mov     dx, s_damage
        jmp     print_z
.sprite_off:
        mov     dx, s_sprite_off
        jmp     print_z
.find_item:
        mov     dx, s_find_item
        jmp     print_z
.print_return:
        mov     dx, s_print_return
        jmp     print_z
.ecl_clock:
        mov     dx, s_ecl_clock
        jmp     print_z
.save_table:
        mov     dx, s_save_table
        jmp     print_z
.program:
        mov     dx, s_program
        jmp     print_z
.who:
        mov     dx, s_who
        jmp     print_z
.delay:
        mov     dx, s_delay
        jmp     print_z
.spell:
        mov     dx, s_spell
        jmp     print_z
.protection:
        mov     dx, s_protection
        jmp     print_z
.clear_box:
        mov     dx, s_clear_box
        jmp     print_z
.dump:
        mov     dx, s_dump
        jmp     print_z
.find_special:
        mov     dx, s_find_special
        jmp     print_z
.destroy_items:
        mov     dx, s_destroy_items
        jmp     print_z

; ============================================================================
;  PSP argument parser: input filename plus optional output filename.
; ============================================================================
parse_args:
        xor     ch, ch
        mov     cl, [80h]
        mov     si, 81h
        mov     di, fname
        call    parse_one_arg
        mov     di, outname
        call    parse_one_arg
        ret

parse_one_arg:
.skip:
        jcxz    .empty
        lodsb
        dec     cx
        cmp     al, ' '
        je      .skip
        cmp     al, 9
        je      .skip
        cmp     al, 13
        je      .empty
        cmp     al, '"'
        je      .quoted
        jmp     .copy_first
.copy:
        jcxz    .done
        lodsb
        dec     cx
.copy_first:
        cmp     al, ' '
        je      .done
        cmp     al, 9
        je      .done
        cmp     al, 13
        je      .done
        stosb
        jmp     .copy
.quoted:
        jcxz    .done
        lodsb
        dec     cx
        cmp     al, '"'
        je      .done
        cmp     al, 13
        je      .done
        stosb
        jmp     .quoted
.empty:
.done:
        mov     byte [di], 0
        ret

; ============================================================================
;  Printing helpers
; ============================================================================
print_z:
        push    ax
        push    dx
        push    si
        mov     si, dx
.next:
        lodsb
        or      al, al
        jz      .done
        mov     dl, al
        call    putc
        jmp     .next
.done:
        pop     si
        pop     dx
        pop     ax
        ret

print_bytes:
        push    ax
        push    cx
        push    dx
        push    si
.next:
        jcxz    .done
        lodsb
        mov     dl, al
        call    putc
        loop    .next
.done:
        pop     si
        pop     dx
        pop     cx
        pop     ax
        ret

print_crlf:
        mov     dl, 13
        call    putc
        mov     dl, 10
        jmp     putc

putc:
        push    ax
        push    bx
        push    cx
        push    dx
        cmp     word [outfh], 0
        jne     .file
        pop     dx
        mov     ah, 02h
        int     21h
        pop     cx
        pop     bx
        pop     ax
        ret
.file:
        mov     [charbuf], dl
        mov     bx, [outfh]
        mov     dx, charbuf
        mov     cx, 1
        mov     ah, 40h
        int     21h
        pop     dx
        pop     cx
        pop     bx
        pop     ax
        ret

print_hex_word:
        push    ax
        mov     al, ah
        call    print_hex_byte
        pop     ax
        call    print_hex_byte
        ret

print_hex_byte:
        push    ax
        mov     ah, al
        shr     al, 4
        call    print_nibble
        mov     al, ah
        and     al, 0Fh
        call    print_nibble
        pop     ax
        ret

print_nibble:
        push    ax
        push    dx
        cmp     al, 10
        jb      .digit
        add     al, 'A' - 10
        jmp     .emit
.digit:
        add     al, '0'
.emit:
        mov     dl, al
        call    putc
        pop     dx
        pop     ax
        ret

; ============================================================================
;  Strings and storage
; ============================================================================
s_usage       db 'CCEFX <effect.gbef> [out.txt] | CCEFX /H',13,10,0
s_host_state  db '_GBHOST.BIN',0
s_effect_input db '_GBECL.BIN',0
s_effect_output db '_GBECL.TXT',0
s_resume_input db '_GBRES.BIN',0
s_resume_output db '_GBRES.TXT',0
s_openerr     db 'CCEFX: cannot open/read effect file',13,10,0
s_outerr      db 'CCEFX: cannot create output file',13,10,0
s_bad         db 'CCEFX: bad or truncated GBEF/GBSX record',13,10,0
s_unsupported db 'CCEFX: unsupported future GBEF version',13,10,0
s_hdr0        db 'GBEF v',0
s_hdr_flags   db ' flags=',0
s_hdr_status  db ' status=',0
s_hdr_geo     db ' geo=',0
s_hdr_chain   db ' chain=',0
s_gblf0       db 'GBLF operands=',0
s_gblp0       db 'GBLP raw=',0
s_gblp_sets   db ' sets=',0
s_gbec_count  db 'GBEC groups=',0
s_gbec_monster db ' MONSTER id=',0
s_gbec_count_field db ' count=',0
s_gbec_pic    db ' pic=',0
s_gbnj_count  db 'GBNJ joins=',0
s_gbnj_npc    db ' NPC id=',0
s_gbnj_morale db ' morale=',0
s_gbrs0       db 'GBRS flags=',0
s_gbrs_area   db ' area=',0
s_gbrs_pc     db ' pc=',0
s_gbrs_rng    db ' rng=',0
s_gbrs_callsp db ' callsp=',0
s_gbrs_mem    db ' mem=',0
s_gbrs_stack  db 'GBRS stack=',0
s_gbrs_memdump db 'GBRS memdump=',0
s_gbrs_memkey db ' MEM key=',0
s_gbrs_memvalue db ' value=',0
s_gbsx_none   db 'GBSX none',13,10,0
s_gbsx_count  db 'GBSX count=',0
s_gbsl_count  db 'GBSL count=',0
s_setup0      db 'GBES setup sprite=',0
s_setup_max   db ' max=',0
s_setup_pic   db ' pic=',0
s_setup_dist  db ' distance=',0
s_halt0       db 'GBHD reason=',0
s_halt_script_full db ' script-effect-capacity',0
s_halt_loop   db ' loop-detected',0
s_halt_area   db ' area=',0
s_halt_pc     db ' pc=',0
s_halt_op     db ' op=',0
s_clock0      db 'GBCL clock=',0
s_op          db ' OP=',0
s_space       db ' ',0
s_argc        db ' ARGC=',0
s_args        db ' ARGS=',0
s_text        db ' TEXT=',0
s_badtext     db ' TEXT=<bad-text-len>',0
s_unknown     db 'UNKNOWN',0
s_load_character db 'LOAD_CHARACTER',0
s_setup_monster db 'SETUP_MONSTER',0
s_approach    db 'APPROACH',0
s_picture     db 'PICTURE',0
s_input_number db 'INPUT_NUMBER',0
s_input_string db 'INPUT_STRING',0
s_print       db 'PRINT',0
s_printclear  db 'PRINTCLEAR',0
s_vertical_menu db 'VERTICAL_MENU',0
s_partystrength db 'PARTYSTRENGTH',0
s_checkparty  db 'CHECKPARTY',0
s_unknown_1f  db 'UNKNOWN_1F',0
s_party_surprise db 'PARTY_SURPRISE',0
s_surprise    db 'SURPRISE',0
s_treasure    db 'TREASURE',0
s_rob         db 'ROB',0
s_encounter_menu db 'ENCOUNTER_MENU',0
s_gettable    db 'GETTABLE',0
s_horizontal_menu db 'HORIZONTAL_MENU',0
s_parlay      db 'PARLAY',0
s_call        db 'CALL',0
s_damage      db 'DAMAGE',0
s_sprite_off  db 'SPRITE_OFF',0
s_find_item   db 'FIND_ITEM',0
s_print_return db 'PRINT_RETURN',0
s_ecl_clock   db 'ECL_CLOCK',0
s_save_table  db 'SAVE_TABLE',0
s_program     db 'PROGRAM',0
s_who         db 'WHO',0
s_delay       db 'DELAY',0
s_spell       db 'SPELL',0
s_protection  db 'PROTECTION',0
s_clear_box   db 'CLEAR_BOX',0
s_dump         db 'DUMP',0
s_find_special db 'FIND_SPECIAL',0
s_destroy_items db 'DESTROY_ITEMS',0
s_detail_treasure db ' TREASURE=copper:',0
s_treasure_electrum db ' electrum:',0
s_treasure_silver db ' silver:',0
s_treasure_gold db ' gold:',0
s_treasure_platinum db ' platinum:',0
s_treasure_gems db ' gems:',0
s_treasure_jewelry db ' jewelry:',0
s_treasure_item db ' item:',0
s_treasure_item_block db ' source:itemBlock',0
s_treasure_none db ' source:none',0
s_treasure_random db ' source:random count:',0
s_detail_rob db ' ROB=scope:',0
s_scope_party db 'party',0
s_scope_selected db 'selected',0
s_rob_loss db ' loss:',0
s_rob_keep db ' keep:',0
s_rob_item db ' itemChance:',0
s_detail_call db ' CALL=operand:',0
s_call_routine db ' routine:',0
s_detail_ecl_clock db ' ECL_CLOCK=timeStep:',0
s_ecl_clock_slot db ' timeSlot:',0
s_detail_program db ' PROGRAM=id:',0
s_detail_partystrength db ' PARTYSTRENGTH=metric:',0
s_partystrength_threshold db ' threshold:',0
s_detail_party_surprise db ' PARTY_SURPRISE=dest0:',0
s_party_surprise_dest1 db ' dest1:',0
s_party_surprise_ranger db ' ranger:',0
s_detail_surprise db ' SURPRISE=a:',0
s_surprise_b db ' b:',0
s_surprise_c db ' c:',0
s_surprise_d db ' d:',0
s_surprise_result db ' result:',0
s_detail_damage db ' DAMAGE=dice:',0
s_damage_control db ' control:',0
s_damage_target db ' target:',0
s_damage_attack_random db ' policy:attack-random',0
s_damage_auto_party db ' policy:automatic-party',0
s_damage_selected_no_save db ' policy:selected-no-save',0
s_damage_save_party db ' policy:save-party',0
s_damage_save_selected db ' policy:save-selected',0
s_damage_save_random db ' policy:save-random',0

%define CCEFX_SECRET_TEXT 1
%include "cchost_gbsl_v2.inc"


validate_v16_dump:
        cmp word [fx_len],5948
        jne .bad
        cmp word [fx_physical_lo],5948
        jne .bad
        cmp word [fx_physical_hi],0
        jne .bad
        cmp dword [fxbuf+116],'GBRS'
        jne .bad
        mov ax,[fxbuf+120]
        and ax,0fffeh
        cmp ax,12
        jne .bad
        cmp dword [fxbuf+5774],'GBMS'
        jne .bad
        cmp dword [fxbuf+5920],'GBRF'
        jne .bad
        cmp word [fxbuf+5930],0
        jne .bad
        mov si,fxbuf+5924
        mov cx,6
.raw:
        cmp byte [si],1
        ja .bad
        inc si
        loop .raw
        cmp dword [fxbuf+5932],'GBSI'
        jne .bad
        cmp dword [fxbuf+5936],00100001h
        jne .bad
        cmp word [fxbuf+5946],0
        jne .bad
        mov ax,[fxbuf+5940]
        cmp ax,2
        ja .bad
        cmp ax,[fxbuf+5784]
        jne .bad
        mov dx,[fxbuf+5942]
        cmp dx,[fxbuf+5782]
        jne .bad
        mov cx,[fxbuf+5944]
        cmp cx,6
        ja .bad
        cmp ax,1
        jne .null
        cmp dx,1
        jb .bad
        cmp dx,cx
        ja .bad
        jmp .status
.null: test dx,dx
        jnz .bad
.status:
        mov ax,[fxbuf+8]
        cmp ax,4
        ja .bad
        cmp ax,2
        je .resume
        cmp ax,3
        jne .ok
.resume:
        test word [fxbuf+120],1
        jz .bad
.ok: clc
        ret
.bad: stc
        ret

dump_selected_actor:
        cmp word [version_seen],16
        jne .ok
        mov dx,s_selected_actor
        call print_z
        mov ax,[fxbuf+5940]
        call print_hex_word
        mov dx,s_space
        call print_z
        mov ax,[fxbuf+5942]
        call print_hex_word
        mov dx,s_space
        call print_z
        mov ax,[fxbuf+5944]
        call print_hex_word
        call print_crlf
.ok: clc
        ret
s_selected_actor db 'SELECTED flags actor count: ',0

section .bss
alignb 2
fh              resw 1
outfh           resw 1
fx_len          resw 1
fx_physical_lo  resw 1
fx_physical_hi  resw 1
version_seen    resw 1
enc_count       resw 1
npc_count       resw 1
handoff_base    resw 1
resume_callsp   resw 1
resume_memcount resw 1
resume_dump_count resw 1
resume_idx      resw 1
script_count    resw 1
side_index      resw 1
display_idx     resw 1
sidefh          resw 1
side_len_lo    resw 1
side_len_hi    resw 1
side_version   resw 1
event_idx       resw 1
event_base      resw 1
op_word         resw 1
argc_word       resw 1
detail_tmp      resw 1
arg_left        resb 1
fname           resb 128
outname         resb 128
side_name       resb 128
sidebuf         resb 54
v2_fh           resw 1
v2_base         resw 1
v2_extent       resw 1
v2_count        resw 1
v2_records_end  resw 1
v2_dir_base     resw 1
v2_payload_base resw 1
v2_payload_len  resw 1
v2_tag_count    resw 1
v2_seen_tags    resw 1
v2_seen_payload resw 1
v2_index        resw 1
v2_read_len     resw 1
v2_header       resb 8
v2_ext          resb 12
v2_record       resb 54
v2_dir          resb 8
v2_packed       resb 255
charbuf         resb 1
hostbuf         resb 13
hoststate_name  resb 128
fxbuf           resb FXMAX
stack           resb 512
stacktop:
