; ============================================================================
;  CCFLOW.COM -- lossless host-effect transport for CCECL.
;
;  CCFLOW receives an ordinary CCECL command tail, runs CCECL, and passes its
;  result through unchanged unless CCECL stopped before a recordable 65th host
;  effect.  For that exact v9 GBHD reason=7 record it appends all 64 GBSX
;  records to a versioned sibling .GBS stream, writes a private replay copy,
;  and resumes CCECL at the unconsumed opcode.  The terminal result appends its
;  tail too and receives FX_HAVE_SIDECAR (0100h), so consumers must either read
;  the complete GBSL stream or reject it.  No partial stream is published.
;
;  GBSL v1: "GBSL", u16 version=1, u16 record_count, then count records in
;  source order.  Every record is CCECL's fixed {GBSX event[20], text[34]}.
; ============================================================================
        cpu     386
        bits    16
        org     100h

SCRIPTCAP       equ 64
SCRIPT_EVENT_BYTES equ 20
SCRIPT_TEXT_BYTES equ 34
SCRIPT_RECORD_BYTES equ SCRIPT_EVENT_BYTES + SCRIPT_TEXT_BYTES
FX_HAVE_SIDECAR equ 0100h
HALT_SCRIPT_FULL equ 7
HALT_LOOP_DETECTED equ 10     ; CCFLOW-only GBHD reason: repeated CCECL state (never CCECL's own)
FLOW_STACK_BYTES equ 512
DAX_BLOCK_CAP   equ 16000
DAX_TOC_CAP     equ 2304     ; 256 nine-byte entries cover every byte-sized area id
SIDE_MAX_RECORDS equ 1213
; Loop guard: one 32-bit hash of CCECL's resumable state per capacity chunk.
; Legitimate routes finish in a few dozen chunks (v2 cap 1213 records = 19);
; the ring only has to remember enough chunks to see a state recur.  The
; hard backstop for a loop whose state never repeats exactly is the u16
; side_count overflow (~1023 chunks), which fails append and cleans up too.
LOOP_RING       equ 128      ; power of two
FLOW_BSS_BYTES  equ FXMAX+FLOW_STACK_BYTES+SCRIPT_RECORD_BYTES+SIDE_MAX_RECORDS*8+DAX_TOC_CAP+2*DAX_BLOCK_CAP+LOOP_RING*4

FX_PREFIX_LEN   equ 116
RS_MAGIC_OFF    equ FX_PREFIX_LEN
RS_FLAGS_OFF    equ RS_MAGIC_OFF + 4
RS_AREA_OFF     equ RS_FLAGS_OFF + 2
RS_PC_OFF       equ RS_AREA_OFF + 2
RS_RNG_OFF      equ RS_PC_OFF + 2
RS_CALLSP_OFF   equ RS_RNG_OFF + 4
RS_STACK_OFF    equ RS_CALLSP_OFF + 2
RS_MEMCOUNT_OFF equ RS_STACK_OFF + 64
RS_KEYS_OFF     equ RS_MEMCOUNT_OFF + 2
RS_VALS_OFF     equ RS_KEYS_OFF + 1024
FX_V3_LEN       equ RS_VALS_OFF + 1024
SX_MAGIC_OFF    equ FX_V3_LEN
SX_COUNT_OFF    equ SX_MAGIC_OFF + 4
SX_EVENTS_OFF   equ SX_COUNT_OFF + 2
SX_TEXT_OFF     equ SX_EVENTS_OFF + (SCRIPTCAP * SCRIPT_EVENT_BYTES)
FX_V6_LEN       equ SX_TEXT_OFF + (SCRIPTCAP * SCRIPT_TEXT_BYTES)
ES_MAGIC_OFF    equ FX_V6_LEN
ES_DIST_OFF     equ ES_MAGIC_OFF + 10
FX_V7_LEN       equ ES_DIST_OFF + 2
HD_MAGIC_OFF    equ FX_V7_LEN
HD_REASON_OFF   equ HD_MAGIC_OFF + 4
HD_PC_OFF       equ HD_REASON_OFF + 2
HD_OPCODE_OFF   equ HD_PC_OFF + 2
HD_AREA_OFF     equ HD_OPCODE_OFF + 2
FX_V8_LEN       equ HD_AREA_OFF + 2
CL_MAGIC_OFF    equ FX_V8_LEN
CL_SLOTS_OFF    equ CL_MAGIC_OFF + 4
FXLEN           equ CL_SLOTS_OFF + 14
MN_MAGIC_OFF    equ FXLEN
MN_FLAGS_OFF    equ MN_MAGIC_OFF + 4
MN_DEST_OFF     equ MN_FLAGS_OFF + 2
MN_COUNT_OFF    equ MN_DEST_OFF + 2
MN_OPCODE_OFF   equ MN_COUNT_OFF + 2
MN_EVENT_OFF    equ MN_OPCODE_OFF + 2
MN_RESERVED_OFF equ MN_EVENT_OFF + 2
MN_ID_PC_OFF    equ MN_RESERVED_OFF + 2
MN_ID_AREA_OFF  equ MN_ID_PC_OFF + 2
MN_ID_DEST_OFF  equ MN_ID_AREA_OFF + 2
MN_ID_OPCODE_OFF equ MN_ID_DEST_OFF + 2
FX_V11_LEN      equ MN_ID_OPCODE_OFF + 2
MS_MAGIC_OFF    equ FX_V11_LEN
MS_SELECTED_OFF equ MS_MAGIC_OFF + 8
MS_FLAGS_OFF    equ MS_MAGIC_OFF + 10
FX_V12_LEN      equ MS_FLAGS_OFF + 2
MT_MAGIC_OFF    equ FX_V12_LEN
MT_COUNT_OFF    equ MT_MAGIC_OFF + 4
MT_DATA_OFF     equ MT_COUNT_OFF + 2
FX_V14_LEN      equ MT_DATA_OFF + 128
GBRF_MAGIC_OFF  equ FX_V14_LEN
GBRF_FLAGS_OFF  equ GBRF_MAGIC_OFF + 4
GBRF_RESERVED_OFF equ GBRF_FLAGS_OFF + 6
FX_V15_LEN      equ GBRF_RESERVED_OFF + 2
FX_V16_LEN      equ FX_V15_LEN + 16
FXMAX           equ FX_V16_LEN + 1

start:
        cld
        ; CCFLOW releases most of its inherited DOS allocation before it EXECs
        ; the near-64 KiB CCECL child.  Never leave the inherited COM stack at
        ; FFFEh after that release: it aliases memory DOS may give the child.
        mov     sp, flow_stack_top
        mov     ax, cs
        mov     [our_seg], ax
        call    copy_original_tail
        jc      usage
        call    parse_effect_path
        jc      usage
        call    build_ccecl_path
        jc      usage
        cmp     byte [inspect_effect], 0
        je      .shrink
        call    make_side_path
        jc      usage
        mov     dx, sidepath
        mov     ah, 41h
        int     21h                    ; stale incomplete stream is never reused
        mov     dx, stagepath
        mov     ah, 41h
        int     21h
        mov     dx, payloadpath
        mov     ah, 41h
        int     21h
.shrink:
        call    shrink_mem
        jc      fail_exec
        mov     byte [side_active], 0
        mov     word [side_count], 0
        mov     byte [has_reference], 0
        mov     word [text_codec], 0
        call    use_original_tail

.run:
        call    run_ccecl
        jc      fail_exec
        cmp     byte [inspect_effect], 0
        je      success
        call    read_effect
        jc      fail_read
        call    is_script_full
        jnc     .terminal
        call    check_state_repeat
        jc      loop_publish
        call    append_current_chunk
        jc      fail_append
        call    write_replay
        jc      fail_replay
        call    use_resume_tail
        jc      fail_replay
        jmp     .run
.terminal:
        cmp     word [fxbuf+4], 16
        je      .check_menu_terminal
        cmp     word [fxbuf+4], 15
        jne     .check_v14_terminal
.check_menu_terminal:
        cmp     word [fxbuf+8], 2
        jne     .check_v14_terminal
        cmp     word [fxbuf+MN_OPCODE_OFF], 001dh
        je      .publish                ; DoK acknowledgement publishes its full GBSL
        cmp     byte [side_active], 0
        jne     .publish
        call    chunk_has_reference
        jc      .publish
        jmp     success                 ; plain pending menu needs no sidecar
.check_v14_terminal:
        cmp     word [fxbuf+4], 14
        jne     .v9_terminal
        cmp     byte [side_active], 0
        jne     .v14_saturated
        call    chunk_has_reference
        jnc     success
        call    restore_v14_inline_text
        jc      fail_append
        jmp     success
.v14_saturated:
        cmp     byte [has_reference], 0
        jne     fail_append
        call    chunk_has_reference
        jc      fail_append
.v9_terminal:
        cmp     byte [side_active], 0
        jne     .publish
        call    chunk_has_reference
        jnc     success
.publish:
        call    append_current_chunk
        jc      fail_append
        cmp     word [fxbuf+8], 2
        jne     .publish_sidecar
        cmp     word [fxbuf+4], 16
        je      .bind_menu_sidecar
        cmp     word [fxbuf+4], 15
        jne     .publish_sidecar
.bind_menu_sidecar:
        call    validate_v15_final_sidecar
        jc      fail_append
.publish_sidecar:
        call    finalize_sidecar
        jc      fail_append
        call    mark_effect_sidecar
        jc      fail_append
success:
        mov     ax, 4c00h
        int     21h
usage:
        mov     dx, s_usage
        jmp     die
fail:
        mov     dx, s_fail
        jmp     die
fail_exec:
        call    cleanup_sidecars        ; a child failure after chunk N leaves no private spool
        cmp     byte [launch_kind], 1
        jne     .child
        mov     dx, s_exec_fail
        jmp     die
.child:
        mov     dx, s_child_fail
        jmp     die
fail_read:
        call    cleanup_sidecars
        mov     dx, s_read_fail
        jmp     die
fail_append:
        call    cleanup_sidecars
        mov     dx, s_append_fail
        jmp     die
fail_replay:
        call    cleanup_sidecars
        mov     dx, s_replay_fail
        jmp     die
; A repeated CCECL state is a deterministic loop (e.g. DQK area 2's INPUT_NUMBER
; editor).  Direct CCECL shows the same thing as a saturated non-terminal v15
; status-4 view, so publish exactly that: the validated status-4 record with
; GBHD reason rewritten 7 -> HALT_LOOP_DETECTED (the loop marker), the events
; actually seen as a GBSL, and FX_HAVE_SIDECAR.  Exit 0.  The private replay
; file is deleted: a published loop record is never a resumable state, and
; read_effect/is_script_full reject it (reason != 7, sidecar flag set).
loop_publish:
        call    append_current_chunk
        jc      fail_append
        mov     word [fxbuf+HD_REASON_OFF], HALT_LOOP_DETECTED
        call    patch_loop_reason
        jc      fail_append
        call    finalize_sidecar
        jc      fail_append
        call    mark_effect_sidecar
        jc      fail_append
        mov     dx, replaypath
        mov     ah, 41h
        int     21h
        mov     dx, s_loop_note
        mov     ah, 09h
        int     21h
        jmp     success
die:
        mov     ah, 09h
        int     21h
        mov     ax, 4c01h
        int     21h

; Copy the whole inherited tail verbatim.  CCECL's own parser remains the
; syntax authority; this wrapper only recognizes /E and /! to find its output.
copy_original_tail:
        xor     cx, cx
        mov     cl, [80h]
        or      cx, cx
        jz      .bad
        cmp     cx, 126
        ja      .bad
        mov     [orig_tail], cl
        mov     si, 81h
        mov     di, orig_tail+1
        rep     movsb
        mov     byte [di], 0dh
        clc
        ret
.bad:   stc
        ret

; Release the inherited DOS allocation before EXEC.  Without this, a tiny COM
; parent still owns the full PSP block and CCECL cannot obtain its near-64-KiB
; segment.
shrink_mem:
        ; Keep every live byte: code/data, the effect/replay buffers in .bss,
        ; and CCFLOW's private stack.  prog_end deliberately precedes .bss,
        ; so it is not a valid DOS allocation boundary here.
        mov     bx, (prog_end-$$+100h+FLOW_BSS_BYTES+15)/16
        mov     ah, 4ah
        push    ds
        pop     es
        int     21h
        ret

; Recognize the unquoted one-token /E path CCECL itself accepts.  /! causes
; CCECL to emit its documented default effect name even without /E.
parse_effect_path:
        mov     byte [inspect_effect], 0
        mov     byte [effectpath], 0
        mov     si, orig_tail+1
        xor     cx, cx
        mov     cl, [orig_tail]
.scan:
        jcxz    .done
        lodsb
        dec     cx
        cmp     al, '/'
        jne     .scan
        jcxz    .done
        lodsb
        dec     cx
        cmp     al, '!'
        jne     .not_bang
        mov     byte [inspect_effect], 1
        jmp     .scan
.not_bang:
        and     al, 0dfh
        cmp     al, 'E'
        jne     .scan
        mov     byte [inspect_effect], 1
.spaces:
        jcxz    .bad
        cmp     byte [si], ' '
        jne     .path
        inc     si
        dec     cx
        jmp     .spaces
.path:
        cmp     byte [si], '/'
        je      .bad
        mov     di, effectpath
.copy:
        jcxz    .term
        lodsb
        dec     cx
        cmp     al, ' '
        je      .term
        mov     [di], al
        inc     di
        jmp     .copy
.term:
        mov     byte [di], 0
.done:
        cmp     byte [inspect_effect], 0
        je      .ok
        cmp     byte [effectpath], 0
        jne     .ok
        mov     si, s_defeffect
        mov     di, effectpath
.defcopy:
        lodsb
        mov     [di], al
        inc     di
        or      al, al
        jne     .defcopy
.ok:    clc
        ret
.bad:   stc
        ret

; Build a GBSL sibling by replacing the final extension with GBS.  The effect
; path is CCECL's bounded token, so an extensionless path is rejected rather
; than selecting an ambiguous global sidecar.
make_side_path:
        mov     si, effectpath
        mov     di, sidepath
        xor     bx, bx
.copy:
        lodsb
        mov     [di], al
        or      al, al
        je      .end
        cmp     al, '.'
        jne     .next
        mov     bx, di
.next:  inc     di
        jmp     .copy
.end:
        or      bx, bx
        jz      .bad
        mov     byte [bx+1], 'G'
        mov     byte [bx+2], 'B'
        mov     byte [bx+3], 'S'
        mov     byte [bx+4], 0
        mov     si, sidepath
        mov     di, stagepath
        mov     cx, 112
        rep     movsb
        mov     si, sidepath
        mov     di, payloadpath
        mov     cx, 112
        rep     movsb
        ; Reuse only the last extension character for private sibling names.
        mov     byte [bx+3], 'S'
        mov     si, stagepath
        call    replace_side_extension
        mov     si, payloadpath
        call    replace_payload_extension
        clc
        ret
.bad:   stc
        ret

replace_side_extension:
        push    si
.scan:  lodsb
        or      al, al
        jz      .found
        cmp     al, '.'
        jne     .scan
        mov     bx, si
        jmp     .scan
.found:
        mov     byte [bx+2], 'T'       ; .GBT private record spool
        pop     si
        ret

replace_payload_extension:
        push    si
.scan:  lodsb
        or      al, al
        jz      .found
        cmp     al, '.'
        jne     .scan
        mov     bx, si
        jmp     .scan
.found:
        mov     byte [bx+2], 'P'       ; .GBP private packed payload
        pop     si
        ret

use_original_tail:
        mov     si, orig_tail
        mov     di, run_tail
        xor     cx, cx
        mov     cl, [si]
        inc     si
        mov     [di], cl
        inc     di
        rep     movsb
        mov     byte [di], 0dh
        ret

; Append only the private state path: /R state with no outcome is accepted
; exclusively by CCECL's exact script-capacity resume kind.
use_resume_tail:
        xor     cx, cx
        mov     cl, [orig_tail]
        cmp     cx, 114                 ; +12 bytes for " /R GBR.EFX"
        ja      .bad
        mov     si, orig_tail+1
        mov     di, run_tail+1
        push    cx
        rep     movsb
        pop     cx
        mov si,s_resume_intro
        call .append
        jc .bad
        mov si,replaypath
        call .append
        jc .bad
        jmp .finish
.append:
        lodsb
        test al,al
        jz .appended
        cmp cx,126
        jae .append_bad
        mov [di],al
        inc di
        inc cx
        jmp .append
.appended: clc
        ret
.append_bad: stc
        ret
.finish:
        mov     [run_tail], cl
        mov     byte [di], 0dh
        clc
        ret
.bad:   stc
        ret

; Resolve CCECL beside the wrapper, not under the caller's current game drive.
; DOS records this COM's full pathname after the PSP environment strings.
build_ccecl_path:
        mov     byte [cceclpath], 0
        push    es
        mov     es, [2ch]
        xor     di, di
.scan:
        cmp     byte [es:di], 0
        jne     .advance
        cmp     byte [es:di+1], 0
        je      .after_env
.advance:
        inc     di
        jmp     .scan
.after_env:
        add     di, 4
        mov     bx, cceclpath
        xor     dx, dx
        mov     cx, 100
.copy:
        mov     al, [es:di]
        or      al, al
        jz      .copied
        mov     [bx], al
        cmp     al, '\'
        je      .separator
        cmp     al, ':'
        jne     .next
.separator:
        lea     dx, [bx+1]
        sub     dx, cceclpath
.next:
        inc     bx
        inc     di
        loop    .copy
        pop     es
        stc
        ret
.copied:
        pop     es
        or      dx, dx
        jz      .bad
        mov     di, cceclpath
        add     di, dx
        mov     si, s_ccecl
.suffix:
        lodsb
        mov     [di], al
        inc     di
        or      al, al
        jne     .suffix
        clc
        ret
.bad:
        stc
        ret

run_ccecl:
        ; DOS EXEC copies FCB1 into the child PSP.  Only an inspected effect
        ; has a CCFLOW resolver, so only that child may emit DREF text slots.
        mov     byte [5ch], 0
        cmp     byte [inspect_effect], 0
        je      .fcb_ready
        mov     dword [5ch], 'GBLR'
.fcb_ready:
        mov     ax, ds
        mov     word [execpb+0], 0
        mov     word [execpb+2], run_tail
        mov     [execpb+4], ax
        mov     word [execpb+6], 5ch
        mov     [execpb+8], ax
        mov     word [execpb+10], 6ch
        mov     [execpb+12], ax
        mov     [save_sp], sp
        mov     [save_ss], ss
        push    ds
        pop     es
        mov     dx, cceclpath
        mov     bx, execpb
        mov     ax, 4b00h
        int     21h
        cli
        mov     ss, [cs:save_ss]
        mov     sp, [cs:save_sp]
        sti
        push    cs
        pop     ds
        push    cs
        pop     es
        jc      .exec_bad
        mov     ah, 4dh
        int     21h
        or      al, al
        jnz     .child_bad
        clc
        ret

.exec_bad:
        mov     byte [launch_kind], 1
        stc
        ret
.child_bad:
        mov     byte [launch_kind], 2
        stc
        ret

read_effect:
        mov     ax, 3d00h
        mov     dx, effectpath
        int     21h
        jc      .bad
        mov     [fxfh], ax
        mov     bx, ax
        xor cx,cx
        xor dx,dx
        mov ax,4202h
        int 21h
        jc .close_bad
        test dx,dx
        jnz .close_bad
        cmp ax,FX_V16_LEN
        ja .close_bad
        mov [fxextent],ax
        mov bx,[fxfh]
        xor cx,cx
        xor dx,dx
        mov ax,4200h
        int 21h
        jc .close_bad
        mov bx,[fxfh]
        mov ah,3fh
        mov cx,[fxextent]
        mov dx,fxbuf
        int     21h
        jc      .close_bad
        cmp ax,[fxextent]
        jne .close_bad
        mov     [fxlen], ax
        mov     bx, [fxfh]
        mov     ah, 3eh
        int     21h
        jc .bad
        cmp     word [fxbuf], 'GB'
        jne     .bad
        cmp     word [fxbuf+2], 'EF'
        jne     .bad
        mov     ax, [fxbuf+4]
        cmp     ax, 9
        je      .v9
        cmp     ax, 14
        je      .v14
        cmp ax,16
        je .v16
        cmp     ax, 15
        jne     .bad
        cmp     word [fxlen], FX_V15_LEN
        jne     .bad
.raw_flags:
        cmp     dword [fxbuf+GBRF_MAGIC_OFF], 'GBRF'
        jne     .bad
        cmp     word [fxbuf+GBRF_RESERVED_OFF], 0
        jne     .bad
        mov     si, fxbuf+GBRF_FLAGS_OFF
        mov     cx, 6
.flag:
        cmp     byte [si], 1
        ja      .bad
        inc     si
        loop    .flag
        cmp word [fxbuf+4],16
        jne .old_status
        mov ax,[fxbuf+8]
        cmp ax,4
        je .capacity
        cmp ax,2
        je .new_menu
        cmp ax,3
        je .new_nonmenu
        cmp ax,1
        ja .bad
.new_nonmenu:
        call validate_v16_nonmenu
        jc .bad
        jmp .common
.new_menu:
        call validate_v15_menu
        jc .bad
        call validate_v16_menu
        jc .bad
        jmp .common
.old_status:
        mov     ax, [fxbuf+8]
        cmp     ax, 4                  ; internal CCFLOW capacity checkpoint
        je      .capacity
        cmp     ax, 2                  ; player menu or acknowledgement terminal
        jne     .bad
        cmp     word [fxbuf+MN_OPCODE_OFF], 001dh
        je      .ack_terminal
        call    validate_v15_menu
        jc      .bad
        jmp     .common
.ack_terminal:
        call    validate_v15_ack
        jc      .bad
        jmp     .common
.capacity:
        cmp word [fxbuf+4],16
        jne .capacity_shape
        cmp dword [fxbuf+HD_MAGIC_OFF],'GBHD'
        jne .bad
        cmp word [fxbuf+HD_REASON_OFF],HALT_SCRIPT_FULL
        jne .bad
.capacity_shape:
        call    validate_v15_capacity
        jc      .bad
        jmp     .common
.v16:
        cmp word [fxlen],FX_V16_LEN
        jne .bad
        call validate_v16_identity
        jc .bad
        jmp .raw_flags
.v14:   cmp     word [fxlen], FX_V14_LEN
        jne     .bad
        jmp     .common
.v9:    cmp     word [fxlen], FXLEN
        jne     .bad
.common:
        ; Legacy schemas admit only generic0/1 or the closed Secret pair.
        ; A stripped pair cannot establish title ownership; CCECL checks that.
        mov     ax,[fxbuf+RS_FLAGS_OFF]
        and     ax,0fffeh
        jz      .semantics_ok          ; closed generic0/1 only
        cmp     ax,12
        jne     .bad
        mov     ax,[fxbuf+8]
        cmp     ax,2
        je      .secret_pending
        cmp     ax,3
        jne     .semantics_ok
.secret_pending:
        test    word [fxbuf+RS_FLAGS_OFF],1
        jz      .bad
.semantics_ok:
        cmp     dword [fxbuf+SX_MAGIC_OFF], 'GBSX'
        jne     .bad
        mov     ax, [fxbuf+SX_COUNT_OFF]
        cmp     ax, SCRIPTCAP
        ja      .bad
        mov     [chunk_count], ax
        ; Latch the semantic class on the FIRST validated chunk, even if
        ; it contains only inline rows. Legacy9/14/15 transitions remain1;
        ; Secret16 remains2 across status/GBRS state-present changes.
        mov     ax, 1
        cmp     word [fxbuf+4], 16
        jne     .latch
        inc     ax
.latch:
        call    select_text_codec
        ret
.close_bad:
        mov     bx, [fxfh]
        mov     ah, 3eh
        int     21h
.bad:   stc
        ret

; A v15 status-4 record is private replay state, never a published sidecar.
validate_v15_capacity:
        test    word [fxbuf+6], FX_HAVE_SIDECAR
        jnz     .bad
        cmp     dword [fxbuf+MS_MAGIC_OFF], 'GBMS'
        jne     .bad
        mov     ax, [fxbuf+MS_FLAGS_OFF]
        test    ax, 0fffch
        jnz     .bad
        mov     si, fxbuf+MN_MAGIC_OFF
        mov     cx, (MS_MAGIC_OFF-MN_MAGIC_OFF)/2
.menu_zero:
        lodsw
        or      ax, ax
        jnz     .bad
        loop    .menu_zero
        mov     si, fxbuf+MT_MAGIC_OFF
        mov     cx, (FX_V14_LEN-MT_MAGIC_OFF)/2
.text_zero:
        lodsw
        or      ax, ax
        jnz     .bad
        loop    .text_zero
        clc
        ret
.bad:   stc
        ret

validate_v15_ack:
        cmp     word [fxbuf+MS_MAGIC_OFF], 'GB'
        jne     .bad
        cmp     word [fxbuf+MS_MAGIC_OFF+2], 'MS'
        jne     .bad
        mov     ax, [fxbuf+MS_FLAGS_OFF]
        test    ax, 0fffch
        jnz     .bad
        cmp     word [fxbuf+MN_MAGIC_OFF], 'GB'
        jne     .bad
        cmp     word [fxbuf+MN_MAGIC_OFF+2], 'MN'
        jne     .bad
        cmp     word [fxbuf+MN_FLAGS_OFF], 2
        jne     .bad
        cmp     word [fxbuf+MN_DEST_OFF], 0ffffh
        jne     .bad
        cmp     word [fxbuf+MN_COUNT_OFF], 1
        jne     .bad
        cmp     word [fxbuf+MN_OPCODE_OFF], 001dh
        jne     .bad
        cmp     word [fxbuf+MN_RESERVED_OFF], 0
        jne     .bad
        ; A pending ACK must identify this continuation, not a fixed block PC.
        mov     ax, [fxbuf+RS_PC_OFF]
        cmp     ax, [fxbuf+MN_ID_PC_OFF]
        jne     .bad
        mov     ax, [fxbuf+RS_AREA_OFF]
        cmp     ax, [fxbuf+MN_ID_AREA_OFF]
        jne     .bad
        cmp     word [fxbuf+MN_ID_DEST_OFF], 0ffffh
        jne     .bad
        cmp     word [fxbuf+MN_ID_OPCODE_OFF], 001dh
        jne     .bad
        mov     ax, [fxbuf+SX_COUNT_OFF]
        or      ax, ax
        jz      .bad
        cmp     ax, SCRIPTCAP
        ja      .bad
        dec     ax
        cmp     ax, [fxbuf+MN_EVENT_OFF]
        jne     .bad
        imul    bx, ax, SCRIPT_EVENT_BYTES
        add     bx, SX_EVENTS_OFF
        cmp     word [fxbuf+bx], 001dh
        jne     .bad
        cmp     word [fxbuf+bx+2], 0
        jne     .bad
        clc
        ret
.bad:   stc
        ret

; Validate a Gen2 pending menu carried in v15. The event must be the final
; GBSX row in this terminal chunk; the post-append validator below binds that
; exact 20-byte event to the final accumulated GBSL row before publication.
validate_v15_menu:
        cmp     word [fxbuf+8], 2
        jne     .bad
        test    word [fxbuf+6], FX_HAVE_SIDECAR
        jnz     .bad
        cmp     dword [fxbuf+MS_MAGIC_OFF], 'GBMS'
        jne     .bad
        mov     ax, [fxbuf+MS_FLAGS_OFF]
        test    ax, 0fffch
        jnz     .bad
        cmp     dword [fxbuf+MN_MAGIC_OFF], 'GBMN'
        jne     .bad
        mov     ax, [fxbuf+MN_FLAGS_OFF]
        cmp     ax, 1
        je      .ordinary_menu
        cmp     ax, 3
        jne     .bad
        cmp     word [fxbuf+MN_OPCODE_OFF], 0022h
        jne     .bad
        cmp     word [fxbuf+MN_DEST_OFF], 0ffffh
        jne     .bad
        cmp     word [fxbuf+MN_COUNT_OFF], 2
        jne     .bad
        mov     ax, [fxbuf+MN_RESERVED_OFF]
        test    ax, 0fffch
        jnz     .bad
        jmp     .identity
.ordinary_menu:
        cmp     word [fxbuf+MN_OPCODE_OFF], 0015h
        je      .ordinary_opcode
        cmp     word [fxbuf+MN_OPCODE_OFF], 002bh
        je      .ordinary_opcode
        cmp     word [fxbuf+MN_OPCODE_OFF], 0031h
        je      .ordinary_opcode
        cmp     word [fxbuf+MN_OPCODE_OFF], 002ch
        je      .ordinary_opcode
        cmp     word [fxbuf+MN_OPCODE_OFF], 0039h
        je      .ordinary_opcode
        cmp     word [fxbuf+MN_OPCODE_OFF], 000fh
        je      .ordinary_opcode
        cmp     word [fxbuf+MN_OPCODE_OFF], 0010h
        jne     .bad
.ordinary_opcode:
        cmp     word [fxbuf+MN_RESERVED_OFF], 0
        jne     .bad
        cmp     word [fxbuf+MN_OPCODE_OFF], 0039h
        jne     .identity
        cmp     word [fxbuf+MN_DEST_OFF], 0ffffh
        jne     .bad
        cmp     word [fxbuf+MN_COUNT_OFF], 1
        jb      .bad
        cmp     word [fxbuf+MN_COUNT_OFF], 6
        ja      .bad
.identity:
        mov     ax, [fxbuf+RS_PC_OFF]
        cmp     ax, [fxbuf+MN_ID_PC_OFF]
        jne     .bad
        mov     ax, [fxbuf+RS_AREA_OFF]
        cmp     ax, [fxbuf+MN_ID_AREA_OFF]
        jne     .bad
        mov     ax, [fxbuf+MN_DEST_OFF]
        cmp     ax, [fxbuf+MN_ID_DEST_OFF]
        jne     .bad
        mov     ax, [fxbuf+MN_OPCODE_OFF]
        cmp     ax, [fxbuf+MN_ID_OPCODE_OFF]
        jne     .bad
        mov     ax, [fxbuf+SX_COUNT_OFF]
        or      ax, ax
        jz      .bad
        cmp     ax, SCRIPTCAP
        ja      .bad
        dec     ax
        cmp     ax, [fxbuf+MN_EVENT_OFF]
        jne     .bad
        imul    bx, ax, SCRIPT_EVENT_BYTES
        add     bx, SX_EVENTS_OFF
        mov     ax, [fxbuf+MN_OPCODE_OFF]
        cmp     word [fxbuf+bx], ax
        jne     .bad
        cmp     word [fxbuf+MN_OPCODE_OFF], 0039h
        jne     .valid
        cmp     word [fxbuf+bx+2], 1
        jne     .bad
        mov     ax, [fxbuf+bx+4]
        or      ax, ax
        jz      .bad
.valid:
        clc
        ret
.bad:   stc
        ret

; The full terminal acknowledgement or pending-menu event must match the
; final accumulated GBSL event after this chunk has been appended.
validate_v15_final_sidecar:
        cmp     word [side_count], 0
        je      .bad
        mov     ax, [side_count]
        dec     ax
        mov     bx, SCRIPT_RECORD_BYTES
        mul     bx
        add     ax, 8
        adc     dx, 0
        jc      .bad
        mov     [side_seek_lo], ax
        mov     [side_seek_hi], dx
        mov     ax, 3d00h
        mov     dx, stagepath
        int     21h
        jc      .bad
        mov     [sidefh], ax
        mov     bx, ax
        mov     ax, 4200h
        mov     cx, [side_seek_hi]
        mov     dx, [side_seek_lo]
        int     21h
        jc      .close_bad
        mov     bx, [sidefh]
        mov     ah, 3fh
        mov     cx, SCRIPT_EVENT_BYTES
        mov     dx, side_record
        int     21h
        jc      .close_bad
        cmp     ax, SCRIPT_EVENT_BYTES
        jne     .close_bad
        mov     ax, [fxbuf+MN_EVENT_OFF]
        imul    si, ax, SCRIPT_EVENT_BYTES
        add     si, fxbuf+SX_EVENTS_OFF
        mov     di, side_record
        mov     cx, SCRIPT_EVENT_BYTES/2
.compare_event:
        mov     ax, [si]
        cmp     ax, [di]
        jne     .close_bad
        add     si, 2
        add     di, 2
        loop    .compare_event
.matched:
        mov     bx, [sidefh]
        mov     ah, 3eh
        int     21h
        jc .bad
        clc
        ret
.close_bad:
        mov     bx, [sidefh]
        mov     ah, 3eh
        int     21h
.bad:   stc
        ret

; CF=1 only for the one recoverable, exactly-shaped capacity halt.
is_script_full:
        cmp     word [fxbuf+8], 4
        jne     .no
        cmp     word [fxbuf+4], 9
        je      .legacy_v9
        cmp word [fxbuf+4],16
        je .new_capacity
        cmp     word [fxbuf+4], 15
        jne     .no
        cmp     word [fxlen], FX_V15_LEN
        jne .no
        jmp .capacity_suffix
.new_capacity:
        cmp word [fxlen],FX_V16_LEN
.capacity_suffix:
        jne     .no
        cmp     dword [fxbuf+MS_MAGIC_OFF], 'GBMS'
        jne     .no
        test    word [fxbuf+6], FX_HAVE_SIDECAR
        jnz     .no
        mov     ax, [fxbuf+MS_FLAGS_OFF]
        test    ax, 0fffch
        jnz     .no
        mov     si, fxbuf+MN_MAGIC_OFF
        mov     cx, (MS_MAGIC_OFF-MN_MAGIC_OFF)/2
.menu_zero:
        lodsw
        or      ax, ax
        jnz     .no
        loop    .menu_zero
        mov     si, fxbuf+MT_MAGIC_OFF
        mov     cx, (FX_V14_LEN-MT_MAGIC_OFF)/2
.text_zero:
        lodsw
        or      ax, ax
        jnz     .no
        loop    .text_zero
        jmp     .capacity_header
.legacy_v9:
.capacity_header:
        cmp     dword [fxbuf+HD_MAGIC_OFF], 'GBHD'
        jne     .no
        cmp     word [fxbuf+HD_REASON_OFF], HALT_SCRIPT_FULL
        jne     .no
        stc
        ret
.no:    clc
        ret

append_current_chunk:
        call    chunk_has_reference
        jnc     .no_reference
        mov     byte [has_reference], 1
.no_reference:
        cmp     byte [side_active], 0
        jne     .open
        call    make_side_path
        jc      .bad
        mov     ah, 3ch
        xor     cx, cx
        mov     dx, stagepath
        int     21h
        jc      .bad
        mov     [sidefh], ax
        mov     bx, ax
        mov     ah, 40h
        mov     cx, 8
        mov     dx, side_header
        int     21h
        jc      .close_bad
        cmp     ax, 8
        jne     .close_bad
        mov     bx, [sidefh]
        mov     ah, 3eh
        int     21h
        mov     byte [side_active], 1
.open:
        mov     ax, 3d02h
        mov     dx, stagepath
        int     21h
        jc      .bad
        mov     [sidefh], ax
        mov     bx, ax
        mov     ax, 4202h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_bad
        xor     di, di
.record:
        cmp     di, [chunk_count]
        jae     .count
        mov     ax, di
        imul    ax, SCRIPT_EVENT_BYTES
        add     ax, SX_EVENTS_OFF
        mov     dx, fxbuf
        add     dx, ax
        mov     cx, SCRIPT_EVENT_BYTES
        call    write_side
        jc      .close_bad
        mov     ax, di
        imul    ax, SCRIPT_TEXT_BYTES
        add     ax, SX_TEXT_OFF
        mov     dx, fxbuf
        add     dx, ax
        mov     cx, SCRIPT_TEXT_BYTES
        call    write_side
        jc      .close_bad
        inc     di
        jmp     .record
.count:
        mov     ax, [chunk_count]
        add     [side_count], ax
        jc      .close_bad
        mov     bx, [sidefh]
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, 6
        int     21h
        jc      .close_bad
        mov     dx, side_count
        mov     cx, 2
        call    write_side
        jc      .close_bad
        mov     bx, [sidefh]
        mov     ah, 3eh
        int     21h
        clc
        ret
.close_bad:
        mov     bx, [sidefh]
        mov     ah, 3eh
        int     21h
        mov     dx, stagepath
        mov     ah, 41h
        int     21h
        mov     byte [side_active], 0
.bad:   stc
        ret

; A terminal chunk with a long Gen1 DAX literal needs a sidecar even if no
; 64-event capacity halt occurred.  Any reserved sentinel is sent through the
; strict finalizer so a malformed reference cannot silently render inline.
chunk_has_reference:
        xor     si, si
.next:
        cmp     si, [chunk_count]
        jae     .no
        imul    bx, si, SCRIPT_TEXT_BYTES
        cmp     word [fxbuf+SX_TEXT_OFF+bx], 0ffffh
        je      .yes
        inc     si
        jmp     .next
.yes:   stc
        ret
.no:    clc
        ret

; Hash the resumable CCECL state (area, pc, RNG, call stack, memory cells -- not
; the replay flag word and not the events) and compare against the last
; LOOP_RING chunk hashes.  CCECL is deterministic over (state, files), so an
; exact recurrence means every later chunk repeats: CF=1 = infinite loop.
check_state_repeat:
        mov     si, fxbuf+RS_AREA_OFF
        mov     cx, (FX_V3_LEN-RS_AREA_OFF)/2
        mov     eax, 811c9dc5h
.hash:
        movzx   edx, word [si]
        add     si, 2
        xor     eax, edx
        imul    eax, eax, 01000193h
        loop    .hash
        mov     cx, [ring_fill]
        xor     bx, bx
.scan:
        jcxz    .store
        cmp     eax, [ring_hash+bx]
        je      .repeat
        add     bx, 4
        dec     cx
        jmp     .scan
.store:
        mov     bx, [ring_idx]
        shl     bx, 2
        mov     [ring_hash+bx], eax
        inc     word [ring_idx]
        and     word [ring_idx], LOOP_RING-1
        cmp     word [ring_fill], LOOP_RING
        jae     .fresh
        inc     word [ring_fill]
.fresh: clc
        ret
.repeat:
        stc
        ret

cleanup_sidecars:
        mov     dx, replaypath
        mov     ah, 41h
        int     21h
        mov     dx, stagepath
        mov     ah, 41h
        int     21h
        mov     dx, payloadpath
        mov     ah, 41h
        int     21h
        mov     dx, sidepath
        mov     ah, 41h
        int     21h
        ret

; The private .GBT holds only the 8-byte header and fixed 54-byte records
; until the terminal chunk has arrived.  Resolve every DREF before exposing
; .GBS, then append the v2 extension and rename the complete file.
finalize_sidecar:
        mov     ax, 3d02h
        mov     dx, stagepath
        int     21h
        jc      .bad
        mov     [sidefh], ax
        ; A v1 stream is already complete and sequential. Keep its historical
        ; arbitrary u16 record-count contract, including >64 KiB file extents.
        cmp     byte [has_reference], 0
        je      .close_publish
        cmp     word [side_count], SIDE_MAX_RECORDS
        ja      .close_bad
        mov     word [record_index], 0
        mov     word [tag_count], 0
        mov     word [payload_len], 0
        mov     word [payloadfh], 0
.scan:
        mov     ax, [record_index]
        cmp     ax, [side_count]
        jae     .append
        call    side_read_record
        jc      .close_bad
        mov     ax, [side_record+SCRIPT_EVENT_BYTES]
        cmp     ax, 0ffffh
        je      .reference
        cmp     ax, 32
        ja      .close_bad
        jmp     .next
.reference:
        call    resolve_reference
        jc      .close_bad
        cmp     word [tag_count], SIDE_MAX_RECORDS
        jae     .close_bad
        mov     ax, [payload_len]
        add     ax, [ref_len]
        jc      .close_bad
        mov     [new_payload_len], ax
        cmp     word [payloadfh], 0
        jne     .payload_open
        mov     ah, 3ch
        xor     cx, cx
        mov     dx, payloadpath
        int     21h
        jc      .close_bad
        mov     [payloadfh], ax
.payload_open:
        mov     bx, [payloadfh]
        mov     ah, 40h
        mov     cx, [ref_len]
        mov     dx, daxbuf
        add     dx, [ref_off]
        int     21h
        jc      .close_bad
        cmp     ax, [ref_len]
        jne     .close_bad
        imul    bx, word [tag_count], 8
        mov     ax, [record_index]
        mov     [directory+bx], ax
        mov     ax, [payload_len]
        mov     [directory+bx+2], ax
        mov     ax, [ref_len]
        mov     [directory+bx+4], ax
        mov     ax, [ref_decoded]
        mov     [directory+bx+6], ax
        mov     ax, [new_payload_len]
        mov     [payload_len], ax
        mov     di, side_record+SCRIPT_EVENT_BYTES
        mov     ax, 0ffffh
        stosw
        mov     ax, 'GB'
        stosw
        mov     ax, 'PX'
        stosw
        mov     ax, [tag_count]
        stosw
        xor     ax, ax
        mov     cx, 13
        rep     stosw
        call    side_write_record
        jc      .close_bad
        inc     word [tag_count]
.next:
        inc     word [record_index]
        jmp     .scan
.append:
        cmp     word [tag_count], 0
        je      .close_publish
        mov     ax, [side_count]
        mov     bx, SCRIPT_RECORD_BYTES
        mul     bx
        or      dx, dx
        jnz     .close_bad
        add     ax, 8+12
        jc      .close_bad
        mov     bx, [tag_count]
        shl     bx, 3
        add     ax, bx
        jc      .close_bad
        add     ax, [payload_len]
        jc      .close_bad
        mov     [side_total_len], ax
        ; The v2 tail starts exactly after all fixed records.
        mov     bx, [sidefh]
        mov     ax, 4202h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_bad
        cmp     dx, 0
        jne     .close_bad
        mov     bx, [side_count]
        imul    bx, SCRIPT_RECORD_BYTES
        add     bx, 8
        cmp     ax, bx
        jne     .close_bad
        mov     word [extension_header], 'GB'
        mov     word [extension_header+2], 'PX'
        mov     ax, [text_codec]
        mov     [extension_header+4], ax ; one codec governs every staged row
        mov     ax, [tag_count]
        mov     [extension_header+6], ax
        mov     ax, [payload_len]
        mov     [extension_header+8], ax
        mov     word [extension_header+10], 0
        mov     dx, extension_header
        mov     cx, 12
        call    write_side
        jc      .close_bad
        mov     dx, directory
        mov     cx, [tag_count]
        shl     cx, 3
        call    write_side
        jc      .close_bad
        mov     bx, [payloadfh]
        mov     ah, 3eh
        int     21h
        jc      .close_bad
        mov     word [payloadfh], 0
        mov     ax, 3d00h
        mov     dx, payloadpath
        int     21h
        jc      .close_bad
        mov     [payloadfh], ax
        mov     word [payload_copied], 0
.copy_payload:
        mov     ax, [payload_copied]
        cmp     ax, [payload_len]
        jae     .payload_done
        mov     cx, [payload_len]
        sub     cx, ax
        cmp     cx, 54
        jbe     .read_payload
        mov     cx, 54
.read_payload:
        mov     [copy_len], cx
        mov     bx, [payloadfh]
        mov     dx, side_record
        mov     ah, 3fh
        int     21h
        jc      .close_bad
        cmp     ax, [copy_len]
        jne     .close_bad
        mov     dx, side_record
        mov     cx, [copy_len]
        call    write_side
        jc      .close_bad
        add     [payload_copied], cx
        jmp     .copy_payload
.payload_done:
        mov     bx, [sidefh]
        mov     ax, 4202h
        xor     cx, cx
        xor     dx, dx
        int     21h
        jc      .close_bad
        or      dx, dx
        jnz     .close_bad
        cmp     ax, [side_total_len]
        jne     .close_bad
        mov     bx, [sidefh]
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, 4
        int     21h
        jc      .close_bad
        mov     word [extension_version], 2
        mov     dx, extension_version
        mov     cx, 2
        call    write_side
        jc      .close_bad
.close_publish:
        mov     bx, [sidefh]
        mov     ah, 3eh
        int     21h
        jc      .bad
        mov     bx, [payloadfh]
        or      bx, bx
        jz      .rename
        mov     ah, 3eh
        int     21h
        jc      .bad
.rename:
        mov     dx, payloadpath
        mov     ah, 41h
        int     21h
        push    ds
        pop     es
        mov     dx, stagepath
        mov     di, sidepath
        mov     ah, 56h
        int     21h
        ret
.close_bad:
        mov     bx, [sidefh]
        mov     ah, 3eh
        int     21h
        mov     bx, [payloadfh]
        or      bx, bx
        jz      .bad
        mov     ah, 3eh
        int     21h
.bad:   stc
        ret

side_seek_record:
        mov     ax, [record_index]
        mov     bx, SCRIPT_RECORD_BYTES
        mul     bx
        or      dx, dx
        jnz     .bad
        add     ax, 8
        jc      .bad
        mov     dx, ax
        mov     bx, [sidefh]
        mov     ax, 4200h
        xor     cx, cx
        int     21h
        ret
.bad:   stc
        ret

side_read_record:
        call    side_seek_record
        jc      .bad
        mov     bx, [sidefh]
        mov     ah, 3fh
        mov     cx, SCRIPT_RECORD_BYTES
        mov     dx, side_record
        int     21h
        jc      .bad
        cmp     ax, SCRIPT_RECORD_BYTES
        jne     .bad
        clc
        ret
.bad:   stc
        ret

side_write_record:
        call    side_seek_record
        jc      .bad
        mov     dx, side_record
        mov     cx, SCRIPT_RECORD_BYTES
        jmp     write_side
.bad:   stc
        ret

; Validate the unresolved CCECL tag and resolve it against the same Gen1
; archive named in the original command tail.  The entire packed operand is
; copied to .GBP before any v2 sidecar can be published.
resolve_reference:
        cmp     word [side_record], 11h
        je      .opcode_ok
        cmp     word [side_record], 12h
        jne     .bad
.opcode_ok:
        cmp     dword [side_record+SCRIPT_EVENT_BYTES+2], 'DREF'
        jne     .bad
        mov     ax, [side_record+SCRIPT_EVENT_BYTES+6]
        cmp     ax, 255
        ja      .bad
        mov     [ref_area], ax
        mov     ax, [side_record+SCRIPT_EVENT_BYTES+8]
        mov     [ref_off], ax
        mov     ax, [side_record+SCRIPT_EVENT_BYTES+10]
        or      ax, ax
        jz      .bad
        cmp     ax, 255
        ja      .bad
        mov     [ref_len], ax
        mov     ax, [side_record+SCRIPT_EVENT_BYTES+12]
        mov     [ref_raw], ax
        mov     si, side_record+SCRIPT_EVENT_BYTES+14
        mov     cx, 20
.reserved:
        cmp     byte [si], 0
        jne     .bad
        inc     si
        loop    .reserved
        call    parse_source_path
        jc      .bad
        cmp     word [fxbuf+4], 16
        jne     .dax
        cmp     dword [fxbuf+RS_MAGIC_OFF], 'GBRS'
        jne     .bad
        cmp     word [fxbuf+8], 4
        ja      .bad
        call    validate_v16_identity
        jc      .bad
        mov     ax, 2
        call    select_text_codec
        jc      .bad
        call    load_glib_reference
        jmp     .loaded
.dax:
        mov     ax, 1
        call    select_text_codec
        jc      .bad
        call    load_dax_reference
.loaded:
        jc      .bad
        mov     ax, [ref_off]
        add     ax, [ref_len]
        jc      .bad
        cmp     ax, [dax_raw_len]
        ja      .bad
        call    count_reference_chars
        jc      .bad
        clc
        ret
.bad:   stc
        ret

parse_source_path:
        cmp     byte [sourcepath], 0
        jne     .ok
        mov     si, orig_tail+1
.spaces:
        cmp     byte [si], ' '
        jne     .copy_start
        inc     si
        jmp     .spaces
.copy_start:
        cmp     byte [si], '/'
        je      .bad
        cmp     byte [si], 0dh
        je      .bad
        mov     di, sourcepath
.copy:
        lodsb
        cmp     al, ' '
        je      .end
        cmp     al, 0dh
        je      .end
        cmp     di, sourcepath+110
        jae     .bad
        stosb
        jmp     .copy
.end:   mov     byte [di], 0
.ok:    clc
        ret
.bad:   stc
        ret

load_dax_reference:
        mov     ax, 3d00h
        mov     dx, sourcepath
        int     21h
        jc      .bad
        mov     [sourcefh], ax
        mov     cx, 2
        mov     dx, dax_toc
        call    source_read_exact
        jc      .close_bad
        mov     ax, [dax_toc]
        or      ax, ax
        jz      .close_bad
        cmp     ax, DAX_TOC_CAP
        ja      .close_bad
        mov     [dax_toc_len], ax
        xor     dx, dx
        mov     bx, 9
        div     bx
        or      dx, dx
        jnz     .close_bad
        mov     [dax_toc_count], ax
        mov     cx, [dax_toc_len]
        mov     dx, dax_toc
        call    source_read_exact
        jc      .close_bad
        mov     si, dax_toc
        mov     cx, [dax_toc_count]
.find:
        jcxz    .close_bad
        mov     al, [ref_area]
        cmp     al, [si]
        je      .found
        add     si, 9
        loop    .find
        jmp     .close_bad
.found:
        mov     ax, [si+5]
        cmp     ax, [ref_raw]
        jne     .close_bad
        or      ax, ax
        jz      .close_bad
        cmp     ax, DAX_BLOCK_CAP
        ja      .close_bad
        mov     [dax_raw_len], ax
        mov     ax, [si+7]
        or      ax, ax
        jz      .close_bad
        cmp     ax, DAX_BLOCK_CAP
        ja      .close_bad
        mov     [dax_comp_len], ax
        mov     dx, [si+1]
        mov     cx, [si+3]
        add     dx, [dax_toc_len]
        adc     cx, 0
        add     dx, 2
        adc     cx, 0
        mov     bx, [sourcefh]
        mov     ax, 4200h
        int     21h
        jc      .close_bad
        mov     cx, [dax_comp_len]
        mov     dx, dax_comp
        call    source_read_exact
        jc      .close_bad
        call    decode_dax_reference
        jc      .close_bad
        mov     bx, [sourcefh]
        mov     ah, 3eh
        int     21h
        clc
        ret
.close_bad:
        mov     bx, [sourcefh]
        mov     ah, 3eh
        int     21h
.bad:   stc
        ret

source_read_exact:
        mov     bx, [sourcefh]
        mov     ah, 3fh
        int     21h
        jc      .bad
        cmp     ax, cx
        jne     .bad
        clc
        ret
.bad:   stc
        ret

; Gen1 DAX signed-byte RLE.  Both compressed and raw extents must be consumed
; exactly; unlike the historical CCECL reader, this bridge rejects overrun.
decode_dax_reference:
        mov     si, dax_comp
        mov     ax, si
        add     ax, [dax_comp_len]
        mov     [dax_comp_end], ax
        mov     di, daxbuf
        mov     ax, di
        add     ax, [dax_raw_len]
        mov     [dax_raw_end], ax
.next:
        cmp     di, [dax_raw_end]
        je      .end
        cmp     si, [dax_comp_end]
        jae     .bad
        lodsb
        cmp     al, 80h
        jae     .repeat
        movzx   cx, al
        inc     cx
        mov     ax, si
        add     ax, cx
        jc      .bad
        cmp     ax, [dax_comp_end]
        ja      .bad
        mov     ax, di
        add     ax, cx
        jc      .bad
        cmp     ax, [dax_raw_end]
        ja      .bad
        rep     movsb
        jmp     .next
.repeat:
        neg     al
        movzx   cx, al
        cmp     si, [dax_comp_end]
        jae     .bad
        lodsb
        mov     bx, di
        add     bx, cx
        jc      .bad
        cmp     bx, [dax_raw_end]
        ja      .bad
        rep     stosb
        jmp     .next
.end:
        cmp     si, [dax_comp_end]
        jne     .bad
        clc
        ret
.bad:   stc
        ret

count_reference_chars:
        mov     si, daxbuf
        add     si, [ref_off]
        mov     cx, [ref_len]
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
        cmp     word [text_codec], 2
        je      .char
        jmp     .done
.nonzero:
        cmp     word [text_codec], 2
        jne     .count
        cmp     bp, 255
        jae     .char
.count:
        inc     bp
        jmp     .char
.done:
        cmp     bp, 32
        jbe     .bad
        mov     [ref_decoded], bp
        clc
        ret
.bad:   stc
        ret

%include "ccflow_secret_text.inc"

; A menu-yield v14 GBEF is intentionally a fixed direct effect: CCHOST's
; journal rejects sidecar-flagged v14.  For an unsaturated long-text yield,
; restore the historical 32-character inline prefix before exposing it.
restore_v14_inline_text:
        mov     word [record_index], 0
.record:
        mov     ax, [record_index]
        cmp     ax, [chunk_count]
        jae     .write_effect
        imul    bx, ax, SCRIPT_TEXT_BYTES
        cmp     word [fxbuf+SX_TEXT_OFF+bx], 0ffffh
        jne     .next
        push    ds
        pop     es
        mov     ax, [record_index]
        imul    bx, ax, SCRIPT_EVENT_BYTES
        mov     si, fxbuf+SX_EVENTS_OFF
        add     si, bx
        mov     di, side_record
        mov     cx, SCRIPT_EVENT_BYTES
        rep     movsb
        mov     ax, [record_index]
        imul    bx, ax, SCRIPT_TEXT_BYTES
        mov     si, fxbuf+SX_TEXT_OFF
        add     si, bx
        mov     cx, SCRIPT_TEXT_BYTES
        rep     movsb
        call    resolve_reference
        jc      .bad
        mov     si, daxbuf
        add     si, [ref_off]
        mov     cx, [ref_len]
        mov     ax, [record_index]
        imul    bx, ax, SCRIPT_TEXT_BYTES
        mov     di, fxbuf+SX_TEXT_OFF+2
        add     di, bx
        xor     bp, bp
        xor     dx, dx
.char:
        cmp     bp, 32
        jae     .done_text
        xor     al, al
        mov     ah, 6
.bits:
        cmp     dh, 0
        jne     .source
        jcxz    .bad
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
        jz      .bad
        cmp     al, 31
        ja      .emit
        add     al, 64
.emit:
        stosb
        inc     bp
        jmp     .char
.done_text:
        mov     word [fxbuf+SX_TEXT_OFF+bx], 32
.next:
        inc     word [record_index]
        jmp     .record
.write_effect:
        mov     ax, 3d02h
        mov     dx, effectpath
        int     21h
        jc      .bad
        mov     [fxfh], ax
        mov     bx, ax
        mov     ah, 40h
        mov     cx, [fxlen]
        mov     dx, fxbuf
        int     21h
        jc      .close_bad
        cmp     ax, [fxlen]
        jne     .close_bad
        mov     bx, [fxfh]
        mov     ah, 3eh
        int     21h
        clc
        ret
.close_bad:
        mov     bx, [fxfh]
        mov     ah, 3eh
        int     21h
.bad:   stc
        ret

write_side:
        mov     bx, [sidefh]
        mov     ah, 40h
        int     21h
        jc      .bad
        cmp     ax, cx
        jne     .bad
        clc
        ret
.bad:   stc
        ret

; CCECL only accepts status=4 when GBRS says state is present.  The source
; effect remains a faithful halt diagnostic; GBR.EFX is disposable replay input.
write_replay:
        call make_secret_host_replay
        jc .bad
        or      word [fxbuf+RS_FLAGS_OFF], 1 ; preserve Secret-long semantic marker
        mov     ah, 3ch
        xor     cx, cx
        mov     dx, replaypath
        int     21h
        jc      .bad
        mov     [replayfh], ax
        mov     bx, ax
        mov     ah, 40h
        mov cx,FXLEN
        cmp word [fxbuf+4],16
        jne .replay_old_length
        mov cx,FX_V16_LEN
        jmp .replay_length_ready
.replay_old_length:
        cmp word [fxbuf+4],15
        jne .replay_length_ready
        mov     cx, FX_V15_LEN
.replay_length_ready:
        mov     dx, fxbuf
        int     21h
        jc      .close_bad
        cmp ax,[fxlen]
        jne .close_bad
.replay_close:
        mov     bx, [replayfh]
        mov     ah, 3eh
        int     21h
        clc
        ret
.close_bad:
        mov     bx, [replayfh]
        mov     ah, 3eh
        int     21h
.bad:   stc
        ret

patch_loop_reason:
        mov     ax, 3d02h
        mov     dx, effectpath
        int     21h
        jc      .bad
        mov     [fxfh], ax
        mov     bx, ax
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, HD_REASON_OFF
        int     21h
        jc      .close_bad
        mov     dx, fxbuf+HD_REASON_OFF
        mov     cx, 2
        mov     ah, 40h
        int     21h
        jc      .close_bad
        cmp     ax, 2
        jne     .close_bad
        mov     bx, [fxfh]
        mov     ah, 3eh
        int     21h
        clc
        ret
.close_bad:
        mov     bx, [fxfh]
        mov     ah, 3eh
        int     21h
.bad:   stc
        ret

mark_effect_sidecar:
        mov     ax, [fxbuf+6]
        or      ax, FX_HAVE_SIDECAR
        mov     [fxbuf+6], ax
        mov     ax, 3d02h
        mov     dx, effectpath
        int     21h
        jc      .bad
        mov     [fxfh], ax
        mov     bx, ax
        mov     ax, 4200h
        xor     cx, cx
        mov     dx, 6
        int     21h
        jc      .close_bad
        mov     dx, fxbuf+6
        mov     cx, 2
        mov     ah, 40h
        int     21h
        jc      .close_bad
        cmp     ax, 2
        jne     .close_bad
        mov     bx, [fxfh]
        mov     ah, 3eh
        int     21h
        clc
        ret
.close_bad:
        mov     bx, [fxfh]
        mov     ah, 3eh
        int     21h
.bad:   stc
        ret

s_usage         db 'CCFLOW: CCECL command tail required.',13,10,'$'
s_fail          db 'CCFLOW: effect replay/sidecar failed.',13,10,'$'
s_exec_fail     db 'CCFLOW: CCECL child failed.',13,10,'$'
s_child_fail    db 'CCFLOW: CCECL returned failure.',13,10,'$'
s_read_fail     db 'CCFLOW: effect record rejected.',13,10,'$'
s_append_fail   db 'CCFLOW: sidecar write failed.',13,10,'$'
s_loop_note     db 'CCFLOW: CCECL script state repeated (infinite loop); published loop-marked saturation record.',13,10,'$'
s_replay_fail   db 'CCFLOW: replay tail/state failed.',13,10,'$'
s_ccecl         db '.\CCECL.COM',0
s_defeffect     db 'CCECL.EFX',0
s_resume_suffix db ' /R GBR.EFX',0
replaypath      db 'GBR.EFX',0
                times 104 db 0
side_header     db 'GBSL',1,0,0,0
extension_header times 12 db 0
extension_version dw 2

our_seg         dw 0
fxfh            dw 0
sidefh          dw 0
replayfh        dw 0
payloadfh       dw 0
sourcefh        dw 0
fxlen           dw 0
fxextent        dw 0
chunk_count     dw 0
side_count      dw 0
ring_fill       dw 0
ring_idx        dw 0
side_seek_lo    dw 0
side_seek_hi    dw 0
record_index    dw 0
tag_count       dw 0
payload_len     dw 0
new_payload_len dw 0
payload_copied  dw 0
copy_len        dw 0
side_total_len  dw 0
ref_area        dw 0
ref_off         dw 0
ref_len         dw 0
ref_raw         dw 0
ref_decoded     dw 0
dax_toc_len     dw 0
dax_toc_count   dw 0
dax_raw_len     dw 0
dax_comp_len    dw 0
dax_comp_end    dw 0
dax_raw_end     dw 0
side_active     db 0
has_reference   db 0
inspect_effect  db 0
launch_kind     db 0
orig_tail       times 128 db 0
run_tail        times 128 db 0
effectpath      times 112 db 0
sidepath        times 112 db 0
stagepath       times 112 db 0
payloadpath     times 112 db 0
cceclpath       times 112 db 0
sourcepath      times 112 db 0
execpb          dw 0,0,0,5ch,0,6ch,0
save_sp         dw 0
save_ss         dw 0
prog_end:

; A .COM segment has offsets 0100h..FFFFh available to program code/data.
; Keep this assertion adjacent to the allocation boundary so a future buffer
; growth cannot silently reintroduce an invalid stack or DOS resize request.
%if prog_end - $$ + 100h + FLOW_BSS_BYTES > 10000h
    %error "CCFLOW image exceeds the DOS .COM segment"
%endif
; Secret v16 is a closed nullable actor context, not a generic new title.
validate_v16_identity:
        mov ax,[fxbuf+RS_FLAGS_OFF]
        and ax,0fffeh
        cmp ax,12
        jne .bad
        cmp dword [fxbuf+MS_MAGIC_OFF],'GBMS'
        jne .bad
        cmp dword [fxbuf+5932],'GBSI'
        jne .bad
        cmp dword [fxbuf+5936],00100001h
        jne .bad
        cmp word [fxbuf+5946],0
        jne .bad
        mov ax,[fxbuf+5940]
        cmp ax,2
        ja .bad
        cmp ax,[fxbuf+MS_FLAGS_OFF]
        jne .bad
        mov dx,[fxbuf+5942]
        cmp dx,[fxbuf+MS_SELECTED_OFF]
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
        jmp .state
.null: test dx,dx
        jnz .bad
.state:
        cmp word [fxbuf+8],2
        je .resume
        cmp word [fxbuf+8],3
        jne .ok
.resume:
        test word [fxbuf+RS_FLAGS_OFF],1
        jz .bad
.ok: clc
        ret
.bad: stc
        ret

validate_v16_nonmenu:
        cmp dword [fxbuf+HD_MAGIC_OFF],'GBHD'
        jne .bad
        cmp word [fxbuf+HD_REASON_OFF],0
        jne .bad
        mov si,fxbuf+MN_MAGIC_OFF
        mov cx,(MS_MAGIC_OFF-MN_MAGIC_OFF)/2
.mn: lodsw
        test ax,ax
        jnz .bad
        loop .mn
        mov si,fxbuf+MT_MAGIC_OFF
        mov cx,(FX_V14_LEN-MT_MAGIC_OFF)/2
.mt: lodsw
        test ax,ax
        jnz .bad
        loop .mt
        clc
        ret
.bad: stc
        ret

validate_v16_menu:
        cmp word [fxbuf+MN_FLAGS_OFF],1
        jne .bad
        mov ax,[fxbuf+MN_OPCODE_OFF]
        cmp ax,0fh
        je .number
        cmp ax,10h
        je .ordinary
        cmp ax,15h
        je .ordinary
        cmp ax,2bh
        je .ordinary
        cmp ax,2ch
        je .ordinary
        cmp ax,39h
        jne .bad
        mov ax,[fxbuf+MN_COUNT_OFF]
        cmp ax,[fxbuf+5944]
        jne .bad
        cmp ax,1
        jb .bad
.ordinary:
        mov ax,[fxbuf+MN_COUNT_OFF]
        test ax,ax
        jz .bad
.number:
        cmp ax,255
        ja .bad
        cmp dword [fxbuf+MT_MAGIC_OFF],'GBMT'
        jne .bad
        mov cx,[fxbuf+MN_COUNT_OFF]
        mov ax,[fxbuf+MN_OPCODE_OFF]
        cmp ax,0fh
        je .zero_text
        cmp ax,10h
        je .zero_text
        cmp ax,15h
        je .prompt_text
        cmp ax,39h
        jne .count_text
.prompt_text: inc cx
        jmp .count_text
.zero_text: xor cx,cx
.count_text:
        cmp cx,[fxbuf+MT_COUNT_OFF]
        jne .bad
        mov si,fxbuf+MT_DATA_OFF
        xor bx,bx
.segment:
        jcxz .padding
        cmp si,fxbuf+FX_V14_LEN
        jae .bad
        movzx dx,byte [si]
        inc si
        mov di,si
        add si,dx
        cmp si,fxbuf+FX_V14_LEN
        ja .bad
        cmp word [fxbuf+MN_OPCODE_OFF],39h
        jne .next
        test bx,bx
        jnz .name
        mov ax,[fxbuf+MN_EVENT_OFF]
        imul ax,ax,20
        push bx
        mov bx,ax
        cmp dx,[fxbuf+SX_EVENTS_OFF+4+bx]
        pop bx
        jne .bad
        jmp .next
.name:
        cmp dx,1
        jb .bad
        cmp dx,15
        ja .bad
.char:
        mov al,[di]
        cmp al,32
        jb .bad
        cmp al,126
        ja .bad
        inc di
        dec dx
        jnz .char
.next: inc bx
        loop .segment
.padding:
        cmp si,fxbuf+FX_V14_LEN
        jae .ok
        cmp byte [si],0
        jne .bad
        inc si
        jmp .padding
.ok: clc
        ret
.bad: stc
        ret


; A Secret source-directory child may never put replay in the retail CWD.
; Qualified root output + independently verified per-drive root CWD provides
; a short host replay endpoint; all original pathname tokens are disjoint.
make_secret_host_replay:
        cmp word [fxbuf+4],16
        jne .ok
        cmp byte [effectpath+1],':'
        jne .ok                    ; CCNEXT already owns its private CWD.
        mov si,effectpath
        mov di,host_replay_canon
        call host_replay_canonical
        jc .bad
        mov si,host_replay_canon+3
        mov di,si
.find:
        lodsb
        test al,al
        jz .found
        cmp al,05ch
        jne .find
        mov di,si
        jmp .find
.found:
        cmp di,host_replay_canon+3  ; output parent must be the proved tool root
        jne .bad
        mov al,[host_replay_canon]
        sub al,'A'
        inc al
        mov dl,al
        mov si,host_replay_check
        mov byte [si],0
        mov ah,47h
        int 21h
        jc .bad
        cmp byte [host_replay_check],0
        jne .bad
        mov al,[host_replay_canon]
        mov [replaypath],al
        mov byte [replaypath+1],':'
        mov si,host_replay_canon+3
        mov di,replaypath+2
        mov cx,3
.prefix:
        lodsb
        test al,al
        jz .bad
        cmp al,'.'
        je .extension
        stosb
        loop .prefix
.extension:
        cmp di,replaypath+2
        je .bad
        mov word [di],'.R'
        mov byte [di+2],0
        mov si,replaypath
        mov di,host_replay_candidate
        call host_replay_canonical
        jc .bad
        mov si,host_replay_canon
        call host_replay_disjoint
        jc .bad
        movzx bx,byte [orig_tail]
        mov byte [orig_tail+1+bx],0
        mov word [host_replay_cursor],orig_tail+1
.token:
        mov si,[host_replay_cursor]
.space:
        cmp byte [si],' '
        jne .start
        inc si
        jmp .space
.start:
        cmp byte [si],0
        je .ok
        mov di,host_replay_token
        mov cx,111
.copy:
        lodsb
        test al,al
        jz .end
        cmp al,' '
        je .end
        stosb
        loop .copy
        jmp .bad
.end:
        mov byte [di],0
        mov [host_replay_cursor],si
        cmp byte [host_replay_token],'/'
        je .next
        mov si,host_replay_token
        mov di,host_replay_check
        call host_replay_canonical
        jc .bad
        mov si,host_replay_check
        call host_replay_disjoint
        jc .bad
.next:
        cmp al,0                     ; canonicalizer may clobber AL; cursor safe
        mov si,[host_replay_cursor]
        cmp byte [si-1],0
        je .ok
        jmp .token
.ok: clc
        ret
.bad: stc
        ret
host_replay_canonical:
        push di
        push si
        push ds
        pop es
        mov cx,56
        xor ax,ax
        rep stosw
        pop si
        pop di
        mov ax,6000h
        int 21h
        ret
host_replay_disjoint:
        mov di,host_replay_candidate
.byte:
        lodsb
        cmp al,[di]
        jne .different
        inc di
        test al,al
        jnz .byte
        stc
        ret
.different: clc
        ret
s_resume_intro db ' /R ',0
host_replay_cursor dw 0
host_replay_canon times 112 db 0
host_replay_candidate times 112 db 0
host_replay_check times 112 db 0
host_replay_token times 112 db 0

section .bss
fxbuf           resb FXMAX
flow_stack       resb FLOW_STACK_BYTES
flow_stack_top:
side_record     resb SCRIPT_RECORD_BYTES
ring_hash       resd LOOP_RING
directory       resb SIDE_MAX_RECORDS*8
dax_toc         resb DAX_TOC_CAP
dax_comp        resb DAX_BLOCK_CAP
daxbuf          resb DAX_BLOCK_CAP
flow_mem_end:
