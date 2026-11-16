; ============================================================================
;  CCMENU.COM -- native DOS menu-yield helper.
;
;  Reads the v14/v15 GBEF/GBMN/GBMS/GBMT contract described in
;  docs/engine/research/native-menu-yield-bridge.md, validates it before doing
;  any mutation, then writes one versioned GBMO answer.  /S n is the zero-based
;  deterministic selection used by the headless smoke; without it a player
;  enters a one-based decimal choice at the DOS prompt.
;
;  Usage: CCMENU <pending.gbef> <out.gbmo> [/S zeroBasedChoice]
; ============================================================================
        cpu     386
        bits    16
        org     100h

SCRIPTCAP       equ 64
SCRIPT_REC_BYTES equ 20
SCRIPT_TEXT_BYTES equ 32
SCRIPT_TEXT_REC_BYTES equ 34
PRIOR_TEXT_CAP equ SCRIPTCAP * (SCRIPT_TEXT_BYTES + 2)
FX_V12_LEN       equ 5786
MT_MAGIC_OFF     equ FX_V12_LEN
MT_COUNT_OFF     equ MT_MAGIC_OFF + 4
MT_DATA_OFF      equ MT_COUNT_OFF + 2
MENU_TEXT_CAP    equ 128
FXLEN            equ MT_DATA_OFF + MENU_TEXT_CAP
FX_V15_LEN       equ 5932
FX_V16_LEN       equ 5948
SI_MAGIC_OFF     equ FX_V15_LEN
SI_FLAGS_OFF     equ SI_MAGIC_OFF+8
SI_SELECTED_OFF  equ SI_MAGIC_OFF+10
SI_COUNT_OFF     equ SI_MAGIC_OFF+12
GBRF_OFF         equ FXLEN
RS_MAGIC_OFF     equ 116
RS_FLAGS_OFF     equ 120
RS_AREA_OFF      equ RS_FLAGS_OFF + 2
RS_PC_OFF        equ RS_AREA_OFF + 2
RS_MEMCOUNT_OFF  equ 196
RS_KEYS_OFF      equ 198
RS_VALS_OFF      equ 1222
MAXMEM           equ 512
SX_MAGIC_OFF     equ 2246
SX_COUNT_OFF     equ 2250
SX_EVENTS_OFF    equ 2252
SX_TEXT_OFF      equ SX_EVENTS_OFF + (SCRIPTCAP * SCRIPT_REC_BYTES)
MN_MAGIC_OFF     equ 5750
MN_FLAGS_OFF     equ MN_MAGIC_OFF + 4
MN_DEST_OFF      equ MN_FLAGS_OFF + 2
MN_COUNT_OFF     equ MN_DEST_OFF + 2
MN_OPCODE_OFF    equ MN_COUNT_OFF + 2
MN_EVENT_OFF     equ MN_OPCODE_OFF + 2
MN_RESERVED_OFF  equ MN_EVENT_OFF + 2
MN_ID_PC_OFF     equ MN_RESERVED_OFF + 2
MN_ID_AREA_OFF   equ MN_ID_PC_OFF + 2
MN_ID_DEST_OFF   equ MN_ID_AREA_OFF + 2
MN_ID_OPCODE_OFF equ MN_ID_DEST_OFF + 2
MS_MAGIC_OFF     equ MN_ID_OPCODE_OFF + 2
MS_CMP_L_OFF     equ MS_MAGIC_OFF + 4
MS_CMP_R_OFF     equ MS_CMP_L_OFF + 2
MS_SELECTED_OFF  equ MS_CMP_R_OFF + 2
MS_FLAGS_OFF     equ MS_SELECTED_OFF + 2
GBMO_LEN         equ 18

start:
        cld
        push    cs
        pop     ds
        mov     sp, stacktop
        call    parse_args
        jc      .usage
        call    read_effect
        jc      .bad
        call    validate_effect
        jc      .bad
        call    show_menu
        jc      .bad
        cmp     word [menu_opcode], 10h
        jne     .selection
        cmp     byte [text_valid], 0
        jne     .text_auto
        jmp     .ask
.selection:
        cmp     byte [auto_valid], 0
        jne     .auto
.ask:
        call    read_player_choice
        jc      .choice_bad
        jmp     .write
.auto:
        mov     ax, [auto_choice]
        cmp     word [menu_opcode], 0Fh
        jne     .bounded_auto
        cmp     word [menu_count], 0
        je      .write
.bounded_auto:
        cmp     ax, [menu_count]
        jae     .choice_bad
.write:
        mov     [selected], ax
        call    write_outcome
        jc      .write_bad
        mov     dx, s_saved
        call    puts
        mov     ax, 4C00h
        int     21h
.text_auto:
        call    normalize_input
        movzx   ax, byte [inputbuf+1]
        jmp     .write
.usage:
        mov     dx, s_usage
        jmp     .fail
.bad:
        mov     dx, s_bad
        jmp     .fail
.choice_bad:
        cmp     byte [input_failed], 0
        jne     .bad_choice
        cmp     byte [auto_valid], 0
        jne     .bad_choice
        mov     dx, s_choice_bad
        call    puts
        jmp     .ask
.bad_choice:
        mov     dx, s_choice_bad
        jmp     .fail
.write_bad:
        mov     dx, s_write_bad
.fail:
        call    puts
        mov     ax, 4C01h
        int     21h

; ---------------------------------------------------------------------------
; Command tail: exactly two paths and optional /S n.  DOS paths may contain
; backslashes; only a leading slash begins an option.
; ---------------------------------------------------------------------------
parse_args:
        mov     byte [arg_count], 0
        mov     byte [auto_valid], 0
        mov     si, 81h
.scan:
        call    skip_space
        mov     al, [si]
        or      al, al
        jz      .done
        cmp     al, 13
        je      .done
        cmp     al, '/'
        je      .option
        mov     al, [arg_count]
        cmp     al, 0
        je      .input
        cmp     al, 1
        je      .output
        stc
        ret
.input:
        mov     di, inname
        call    copy_token
        jc      .bad
        inc     byte [arg_count]
        jmp     .scan
.output:
        mov     di, outname
        call    copy_token
        jc      .bad
        inc     byte [arg_count]
        jmp     .scan
.option:
        inc     si
        mov     al, [si]
        and     al, 0DFh
        cmp     al, 'S'
        je      .selection
        cmp     al, 'T'
        jne     .bad
        inc     si
        call    skip_space
        mov     di, inputbuf+2
        call    copy_token
        jc      .bad
        or      cx, cx
        jz      .bad
        mov     [inputbuf+1], cl
        mov     byte [text_valid], 1
        jmp     .scan
.selection:
        inc     si
        call    skip_space
        call    parse_number
        jc      .bad
        mov     [auto_choice], ax
        mov     byte [auto_valid], 1
        jmp     .scan
.done:
        cmp     byte [arg_count], 2
        jne     .bad
        cmp     byte [inname], 0
        je      .bad
        cmp     byte [outname], 0
        je      .bad
        clc
        ret
.bad:
        stc
        ret

skip_space:
        cmp     byte [si], ' '
        jne     .ret
        inc     si
        jmp     skip_space
.ret:
        ret

copy_token:
        xor     cx, cx
.copy:
        mov     al, [si]
        or      al, al
        jz      .done
        cmp     al, 13
        je      .done
        cmp     al, ' '
        je      .done
        cmp     cx, 127
        jae     .bad
        stosb
        inc     si
        inc     cx
        jmp     .copy
.done:
        mov     al, 0
        stosb
        clc
        ret
.bad:
        stc
        ret

; Parse a decimal argument at SI.  It leaves SI at the first delimiter.
parse_number:
        xor     bx, bx
        xor     di, di
.digit:
        mov     al, [si]
        cmp     al, '0'
        jb      .end
        cmp     al, '9'
        ja      .end
        mov     ax, bx
        mov     cx, 10
        mul     cx
        or      dx, dx
        jnz     .bad
        movzx   cx, byte [si]
        sub     cx, '0'
        add     ax, cx
        jc      .bad
        mov     bx, ax
        inc     di
        inc     si
        jmp     .digit
.end:
        or      di, di
        jz      .bad
        cmp     al, 0
        je      .ok
        cmp     al, 13
        je      .ok
        cmp     al, ' '
        jne     .bad
.ok:
        mov     ax, bx
        clc
        ret
.bad:
        stc
        ret

; ---------------------------------------------------------------------------
; Read exactly one v14 record, then verify every relation the helper needs.
; ---------------------------------------------------------------------------
read_effect:
        mov ax, 3D00h
        mov dx, inname
        int 21h
        jc .bad
        mov [fh], ax
        mov bx, ax
        xor cx, cx
        xor dx, dx
        mov ax, 4202h
        int 21h
        jc .close_bad
        or dx, dx
        jnz .close_bad
        mov byte [effect_v15], 0
        cmp ax, FXLEN
        je .size
        mov byte [effect_v15], 1
        cmp ax, FX_V15_LEN
        je .size
        mov byte [effect_v15], 2
        cmp ax, FX_V16_LEN
        jne .close_bad
.size:
        mov [output_len], ax
        mov bx, [fh]
        xor cx, cx
        xor dx, dx
        mov ax, 4200h
        int 21h
        jc .close_bad
        mov bx, [fh]
        mov cx, [output_len]
        mov dx, fxbuf
        mov ah, 3Fh
        int 21h
        jc .close_bad
        cmp ax, [output_len]
        jne .close_bad
        mov bx, [fh]
        mov ah, 3Eh
        int 21h
        jc .bad
        clc
        ret
.close_bad:
        mov bx, [fh]
        mov ah, 3Eh
        int 21h
.bad:   stc
        ret

validate_effect:
        ; Bind the published identity to the state that CCECL will resume.
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
        cmp     word [fxbuf], 'GB'
        jne     .bad
        cmp     word [fxbuf+2], 'EF'
        jne     .bad
        cmp     word [fxbuf+4], 14
        je      .version_v14
        cmp     word [fxbuf+4], 16
        je      .version_v16
        cmp     word [fxbuf+4], 15
        jne     .bad
        cmp     byte [effect_v15], 1
        jne     .bad
        call    validate_v15_menu_state
        jc      .bad
        jmp     .version_ok
.version_v16:
        cmp byte [effect_v15], 2
        jne .bad
        call validate_v15_menu_state
        jc .bad
        call who_validate_state
        jc .bad
        jmp .version_ok
.version_v14:
        cmp     byte [effect_v15], 0
        jne     .bad
.version_ok:
        cmp     word [fxbuf+8], 2
        jne     .bad
        cmp     word [fxbuf+RS_MAGIC_OFF], 'GB'
        jne     .bad
        cmp     word [fxbuf+RS_MAGIC_OFF+2], 'RS'
        jne     .bad
        test    word [fxbuf+RS_FLAGS_OFF], 1
        jz      .bad
        ; Preserve generic legacy menus, but never relabel old/unpaired Secret.
        mov     ax,[fxbuf+RS_FLAGS_OFF]
        and     ax,0fffeh
        jz      .semantics_ok
        cmp     ax,12
        jne     .bad
.semantics_ok:
        cmp     word [fxbuf+SX_MAGIC_OFF], 'GB'
        jne     .bad
        cmp     word [fxbuf+SX_MAGIC_OFF+2], 'SX'
        jne     .bad
        mov     ax, [fxbuf+SX_COUNT_OFF]
        cmp     ax, 1
        jb      .bad
        cmp     ax, SCRIPTCAP
        ja      .bad
        mov     [script_count], ax
        cmp     word [fxbuf+MN_MAGIC_OFF], 'GB'
        jne     .bad
        cmp     word [fxbuf+MN_MAGIC_OFF+2], 'MN'
        jne     .bad
        cmp     word [fxbuf+MS_MAGIC_OFF], 'GB'
        jne     .bad
        cmp     word [fxbuf+MS_MAGIC_OFF+2], 'MS'
        jne     .bad
        mov     ax, [fxbuf+MS_FLAGS_OFF]
        test    ax, 0fffch
        jnz     .bad
        mov     ax, [fxbuf+MN_FLAGS_OFF]
        cmp     ax, 1
        je      .menu_flags_ok
        cmp     ax, 3                  ; opcode 22: yes/no flags-only choice
        jne     .bad
.menu_flags_ok:
        mov     ax, [fxbuf+MN_COUNT_OFF]
        cmp     ax, 255
        ja      .bad
        mov     [menu_count], ax
        mov     ax, [fxbuf+MN_OPCODE_OFF]
        cmp     ax, 15h
        je      .opcode_ok
        cmp     ax, 22h
        je      .opcode_ok
        cmp     ax, 2Bh
        je      .opcode_ok
        cmp     ax, 31h
        je      .opcode_ok
        cmp     ax, 2Ch
        je      .opcode_ok
        cmp     ax, 39h
        je      .opcode_ok
        cmp     ax, 0Fh
        je      .opcode_ok
        cmp     ax, 10h
        jne     .bad
.opcode_ok:
        mov     [menu_opcode], ax
        cmp     ax, 22h
        jne     .ordinary_menu_flags
        cmp     word [fxbuf+MN_FLAGS_OFF], 3
        jne     .bad
        cmp     word [fxbuf+MN_DEST_OFF], 0ffffh
        jne     .bad
        cmp     word [menu_count], 2
        jne     .bad
        mov     ax, [fxbuf+MN_RESERVED_OFF]
        test    ax, 0fffch
        jnz     .bad
        jmp     .menu_flag_shape_ok
.ordinary_menu_flags:
        cmp     word [fxbuf+MN_FLAGS_OFF], 1
        jne     .bad
        cmp     word [fxbuf+MN_RESERVED_OFF], 0
        jne     .bad
.menu_flag_shape_ok:
        cmp     word [menu_count], 0
        jne     .count_shape_ok
        cmp     word [menu_opcode], 0Fh
        jne     .bad
.count_shape_ok:
        mov     ax, [fxbuf+MN_EVENT_OFF]
        cmp     ax, [script_count]
        jae     .bad
        mov     [menu_event], ax
        mov     bx, 20
        mul     bx
        add     ax, SX_EVENTS_OFF
        mov     si, fxbuf
        add     si, ax
        mov     ax, [si]
        cmp     ax, [menu_opcode]
        jne     .bad
        cmp     word [menu_opcode], 22h
        je      .party_prompt
        cmp     word [menu_opcode], 15h
        jne     .horizontal
        cmp     word [si+2], 3
        jb      .bad
        mov     ax, [si+8]
        jmp     .count
.horizontal:
        cmp     word [menu_opcode], 2Ch
        je      .parlay
        cmp     word [menu_opcode], 39h
        je      .who
        cmp     word [menu_opcode], 0Fh
        je      .number
        cmp     word [menu_opcode], 10h
        je      .string
        cmp     word [si+2], 2
        jb      .bad
        mov     ax, [si+6]
        jmp     .count
.who:
        cmp byte [effect_v15], 2
        jne .who_event
        cmp word [fxbuf+MN_DEST_OFF], 0FFFFh
        jne .bad
        mov ax, [fxbuf+SI_COUNT_OFF]
        cmp ax, 1
        jb .bad
        cmp ax, [menu_count]
        jne .bad
.who_event:
        cmp byte [effect_v15], 2
        jne .who_frame
        mov ax, [script_count]
        dec ax
        cmp ax, [menu_event]
        jne .bad
.who_frame:
        cmp     word [si+2], 1
        jne     .bad
        mov     ax, [si+4]
        cmp     word [fxbuf+MN_DEST_OFF], 0ffffh
        jne     .who_legacy_destination
        mov     dx, ax
        movzx   ax, byte [fxbuf+MT_DATA_OFF]
        or      ax, ax
        jz      .bad
        cmp     ax, dx
        jne     .bad
        mov     ax, [menu_count]
        jmp     .count
.who_legacy_destination:
        cmp     ax, [fxbuf+MN_DEST_OFF]
        jne     .bad
        mov     ax, [menu_count]
        jmp     .count
.number:
        cmp     word [si+2], 2
        jne     .bad
        cmp     word [menu_count], 0
        jne     .bad
        ; INPUT_NUMBER's first operand is metadata; the second is destination.
        mov     ax, [si+6]
        cmp     ax, [fxbuf+MN_DEST_OFF]
        jne     .bad
        call    validate_menu_text
        jc      .bad
        clc
        ret
.string:
        cmp     word [si+2], 2
        jne     .bad
        mov     ax, [si+4]
        cmp     ax, [menu_count]
        jne     .bad
        mov     ax, [si+6]
        cmp     ax, [fxbuf+MN_DEST_OFF]
        jne     .bad
        call    validate_menu_text
        jc      .bad
        clc
        ret
.parlay:
        cmp     word [si+2], 6
        jb      .bad
        mov     ax, [si+14]
        cmp     ax, [fxbuf+MN_DEST_OFF]
        jne     .bad
        mov     ax, 5
        cmp     ax, [menu_count]
        jne     .bad
        call    validate_menu_text
        jc      .bad
        clc
        ret
.count:
        cmp     ax, [menu_count]
        jne     .bad
        cmp     word [menu_opcode], 39h
        jne     .destination_identity
        cmp     word [fxbuf+MN_DEST_OFF], 0ffffh
        je      .validate_text
.destination_identity:
        mov     ax, [si+4]
        cmp     ax, [fxbuf+MN_DEST_OFF]
        jne     .bad
.validate_text:
        call    validate_menu_text
        jc      .bad
        clc
        ret
.party_prompt:
        cmp     word [si+2], 0
        jne     .bad
        call    validate_menu_text
        jc      .bad
        clc
        ret
.bad:
        stc
        ret

; Direct v15 menu rendering consumes only exact, non-sidecar Gen2 menus.
; Sidecar-backed menus belong to CCFP's ordered narration path.
validate_v15_menu_state:
        test    word [fxbuf+6], 0100h
        jnz     .bad
        cmp     dword [fxbuf+GBRF_OFF], 'GBRF'
        jne     .bad
        cmp     word [fxbuf+GBRF_OFF+10], 0
        jne     .bad
        mov     si, fxbuf+GBRF_OFF+4
        mov     cx, 6
.flag:
        cmp     byte [si], 1
        ja      .bad
        inc     si
        loop    .flag
        clc
        ret
.bad:   stc
        ret

; GBMT is a fixed 128-byte length-prefixed raw packed-ECL string store.
; It includes the vertical prompt, then every selectable label. The unused
; suffix must remain zero so a malformed record cannot smuggle a second shape.
validate_menu_text:
        cmp     word [fxbuf+MT_MAGIC_OFF], 'GB'
        jne     .bad
        cmp     word [fxbuf+MT_MAGIC_OFF+2], 'MT'
        jne     .bad
        mov     ax, [menu_count]
        cmp     word [menu_opcode], 0Fh
        je      .text_zero
        cmp     word [menu_opcode], 10h
        je      .text_zero
        cmp     word [menu_opcode], 15h
        je      .text_prompt_count
        cmp     word [menu_opcode], 22h
        je      .text_prompt_count
        cmp     word [menu_opcode], 39h
        jne     .count_ready
        cmp     word [fxbuf+MN_DEST_OFF], 0ffffh
        jne     .count_ready
.text_prompt_count:
        inc     ax
        jmp     .count_ready
.text_zero:
        xor     ax, ax
.count_ready:
        cmp     ax, [fxbuf+MT_COUNT_OFF]
        jne     .bad
        mov     [menu_text_count], ax
        mov     cx, ax
        mov     si, MT_DATA_OFF
.segment:
        jcxz   .padding
        movzx   ax, byte [fxbuf+si]
        inc     si
        add     si, ax
        cmp     si, MT_DATA_OFF+MENU_TEXT_CAP
        ja      .bad
        loop    .segment
.padding:
        cmp     si, MT_DATA_OFF+MENU_TEXT_CAP
        jae     .ok
        cmp     byte [fxbuf+si], 0
        jne     .bad
        inc     si
        jmp     .padding
.ok:
        cmp     word [menu_opcode], 22h
        jne     .party_labels_ok
        mov     si, MT_DATA_OFF
        movzx   ax, byte [fxbuf+si]
        inc     si
        add     si, ax                  ; skip the captured PRINTCLEAR prompt
        cmp     byte [fxbuf+si], 3
        jne     .bad
        inc     si
        cmp     word [fxbuf+si], 05464h  ; packed "YE"
        jne     .bad
        cmp     byte [fxbuf+si+2], 0c0h  ; packed "S\0"
        jne     .bad
        add     si, 3
        cmp     byte [fxbuf+si], 3
        jne     .bad
        inc     si
        cmp     word [fxbuf+si], 0f038h  ; packed "NO"
        jne     .bad
        cmp     byte [fxbuf+si+2], 0
        jne     .bad
.party_labels_ok:
        cmp byte [effect_v15], 2
        jne .done
        cmp word [menu_opcode], 39h
        jne .done
        call who_validate_labels
        ret
.done:
        clc
        ret
.bad:
        stc
        ret

show_menu:
        call    build_prior_narration
        jc      .invalid
        call    write_prior_narration
        jc      .invalid
        mov     dx, s_menu
        call    puts
        cmp     word [menu_opcode], 2Ch
        jne     .source_labels
        mov     dx, s_parlay_labels
        call    puts
        jmp     .done
.source_labels:
        cmp     word [menu_opcode], 10h
        je      .string
        cmp     word [menu_opcode], 0Fh
        jne     .text_labels
        mov     dx, s_number
        call    puts
        mov     ax, [menu_count]
        or      ax, ax
        jnz     .number_bounded
        mov     ax, 0ffffh
        jmp     .number_limit
.number_bounded:
        dec     ax
.number_limit:
        call    print_u16
        mov     dx, s_crlf
        call    puts
        ret
.string:
        mov     dx, s_string
        call    puts
        mov     ax, [menu_count]
        call    print_u16
        mov     dx, s_crlf
        call    puts
        jmp     .done
.text_labels:
        mov     si, MT_DATA_OFF
        cmp     word [menu_opcode], 15h
        je      .source_prompt
        cmp     word [menu_opcode], 22h
        je      .source_prompt
        cmp     word [menu_opcode], 39h
        jne     .labels
        cmp     word [fxbuf+MN_DEST_OFF], 0ffffh
        jne     .labels
.source_prompt:
        call    print_packed_segment
        mov     dx, s_crlf
        call    puts
.labels:
        mov     word [menu_label], 1
        mov     cx, [menu_count]
.label_loop:
        jcxz   .done
        push    cx
        mov     ax, [menu_label]
        call    print_u16
        mov     dx, s_dot
        call    puts
        cmp     word [menu_opcode], 39h
        je      .plain_label
        call    print_packed_segment
        jmp     .label_done
.plain_label:
        call    print_plain_segment
.label_done:
        mov     dx, s_crlf
        call    puts
        inc     word [menu_label]
        pop     cx
        loop    .label_loop
.done:
        mov     dx, s_count
        call    puts
        mov     ax, [menu_count]
        call    print_u16
        mov     dx, s_crlf
        call    puts
        clc
        ret
.invalid:
        stc
        ret

; Horizontal prompts do not have a GBMT caption field. Reconstruct the
; bounded visible text before that menu from its fixed GBSX text records.
; Keep the pending menu event itself for show_menu, and leave other menu
; forms on their existing prompt/label path (notably PARTY_SURPRISE).
build_prior_narration:
        mov     word [prior_text_len], 0
        cmp     word [menu_opcode], 002bh
        je      .begin
        cmp     word [menu_opcode], 0031h
        jne     .done
.begin:
        push    es
        push    ds
        pop     es
        mov     word [prior_text_index], 0
.event:
        mov     ax, [prior_text_index]
        cmp     ax, [menu_event]
        jae     .ok
        imul    bx, ax, SCRIPT_REC_BYTES
        mov     ax, [fxbuf+SX_EVENTS_OFF+bx]
        cmp     ax, 0012h              ; PRINTCLEAR resets, then prints
        je      .clear_and_append
        cmp     ax, 0011h              ; PRINT appends
        je      .append
        cmp     ax, 0033h              ; PRINT_RETURN adds a line break
        je      .newline
        cmp     ax, 003dh              ; CLEAR_BOX discards prior text
        je      .clear
        jmp     .next
.clear_and_append:
        mov     word [prior_text_len], 0
        jmp     .append
.clear:
        mov     word [prior_text_len], 0
        jmp     .next
.newline:
        mov     ax, [prior_text_len]
        add     ax, 2
        cmp     ax, PRIOR_TEXT_CAP
        ja      .bad
        mov     di, prior_text
        add     di, [prior_text_len]
        mov     byte [di], 13
        mov     byte [di+1], 10
        mov     [prior_text_len], ax
        jmp     .next
.append:
        mov     ax, [prior_text_index]
        imul    bx, ax, SCRIPT_TEXT_REC_BYTES
        mov     cx, [fxbuf+SX_TEXT_OFF+bx]
        cmp     cx, SCRIPT_TEXT_BYTES
        ja      .bad
        mov     [prior_copy_len], cx
        mov     ax, [prior_text_len]
        add     ax, cx
        cmp     ax, PRIOR_TEXT_CAP
        ja      .bad
        mov     di, prior_text
        add     di, [prior_text_len]
        lea     si, [fxbuf+SX_TEXT_OFF+bx+2]
        rep     movsb
        mov     ax, [prior_text_len]
        add     ax, [prior_copy_len]
        mov     [prior_text_len], ax
.next:
        inc     word [prior_text_index]
        jmp     .event
.ok:
        pop     es
.done:
        clc
        ret
.bad:
        pop     es
        stc
        ret

write_prior_narration:
        mov     cx, [prior_text_len]
        jcxz    .ok
        mov     bx, 1
        mov     dx, prior_text
        mov     ah, 40h
        int     21h
        jc      .bad
        cmp     ax, [prior_text_len]
        jne     .bad
.ok:
        clc
        ret
.bad:
        stc
        ret

; Print and consume one GBMT {u8 byteLength, ASCII bytes} segment. WHO is
; constructed from the validated GBPR roster names, not packed ECL text.
print_plain_segment:
        push    ax
        push    cx
        push    dx
        movzx   cx, byte [fxbuf+si]
        inc     si
.char:
        jcxz   .done
        mov     dl, [fxbuf+si]
        inc     si
        mov     ah, 02h
        int     21h
        loop    .char
.done:
        pop     dx
        pop     cx
        pop     ax
        ret

; Print and consume one GBMT {u8 byteLength, packed six-bit ECL chars}.
; The record was fully bounded by validate_menu_text before this code runs.
print_packed_segment:
        push    ax
        push    bx
        push    cx
        push    dx
        movzx   cx, byte [fxbuf+si]
        inc     si
        xor     dh, dh
.char:
        xor     al, al
        mov     bl, 6
.bits:
        cmp     bl, 0
        je      .have_char
        cmp     dh, 0
        jne     .have_source
        cmp     cx, 0
        je      .done
        mov     dl, [fxbuf+si]
        inc     si
        dec     cx
        mov     dh, 8
.have_source:
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
        push    dx
        mov     dl, al
        push    ax
        mov     ah, 02h
        int     21h
        pop     ax
        pop     dx
        jmp     .char
.done:
        ; Consume a remaining partial source payload that held the zero
        ; terminator or padding, leaving SI at the next length prefix.
        add     si, cx
        pop     dx
        pop     cx
        pop     bx
        pop     ax
        ret

read_player_choice:
        cmp byte [effect_v15], 2
        jne .ordinary
        cmp word [menu_opcode], 39h
        je who_manual_choice
.ordinary:
        cmp     word [menu_opcode], 10h
        je      read_player_text
        mov     dx, s_prompt
        call    puts
        mov     byte [inputbuf], 6       ; five unsigned-16 digits plus CR
        mov     byte [inputbuf+1], 0
        mov     dx, inputbuf
        call    read_input_line
        jc      .bad
        movzx   cx, byte [inputbuf+1]
        jcxz    .bad
        mov     si, inputbuf+2
        cmp     word [menu_opcode], 22h
        jne     .parse_digits
        cmp     cx, 1
        jne     .parse_digits
        mov     al, [si]
        and     al, 0dfh
        cmp     al, 'Y'
        je      .yes
        cmp     al, 'N'
        je      .no
.parse_digits:
        xor     bx, bx
.digit:
        jcxz    .done
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
        movzx   dx, byte [si]
        sub     dx, '0'
        add     ax, dx
        jc      .bad
        mov     bx, ax
        inc     si
        loop    .digit
.done:
        cmp     word [menu_opcode], 0Fh
        je      .number
        or      bx, bx
        jz      .bad
        dec     bx
        cmp     bx, [menu_count]
        jae     .bad
        mov     ax, bx
        clc
        ret
.number:
        cmp     word [menu_count], 0
        je      .number_free
        cmp     bx, [menu_count]
        jae     .bad
.number_free:
        mov     ax, bx
        clc
        ret
.yes:
        xor     ax, ax
        clc
        ret
.no:
        mov     ax, 1
        clc
        ret
.bad:
        stc
        ret

read_player_text:
        mov     dx, s_text_prompt
        call    puts
        mov     ax, [menu_count]
        mov     [inputbuf], al
        mov     byte [inputbuf+1], 0
        mov     dx, inputbuf
        call    read_input_line
        jc      .eof
        call    normalize_input
        movzx   ax, byte [inputbuf+1]
        clc
.eof:
        ret

; DX -> DOS capacity/count/data buffer.  Console keeps AH=0Ah editing;
; redirected stdin is read byte-wise through CR (CRLF ok).  EOF/read error
; sets input_failed and CF so callers cannot spin.
read_input_line:
        push    bx
        push    cx
        push    dx
        push    si
        push    di
        push    bp
        mov     si, dx
        mov     ax, 4400h
        xor     bx, bx
        int     21h
        jc      .err
        test    dl, 80h
        jz      .file
        mov     dx, si
        mov     ah, 0Ah
        int     21h
        clc
        jmp     .done
.file:
        xor     di, di
        movzx   bp, byte [si]
        dec     bp
        mov     byte [input_overflow], 0
.next:
        xor     bx, bx
        mov     cx, 1
        mov     dx, input_byte
        mov     ah, 3Fh
        int     21h
        jc      .err
        cmp     ax, 1
        jne     .err
        mov     al, [input_byte]
        cmp     byte [input_skip_lf], 0
        je      .character
        mov     byte [input_skip_lf], 0
        cmp     al, 10
        je      .next
.character:
        cmp     al, 13
        je      .eol
        cmp     di, bp
        jae     .overflow
        mov     bx, si
        mov     [bx+di+2], al
        inc     di
        jmp     .next
.overflow:
        mov     byte [input_overflow], 1
        jmp     .next
.eol:
        mov     byte [input_skip_lf], 1
        mov     bx, si
        mov     [bx+di+2], al
        mov     ax, di
        cmp     byte [input_overflow], 0
        je      .count
        inc     ax
.count:
        mov     [si+1], al
        clc
        jmp     .done
.err:
        mov     byte [input_failed], 1
        stc
.done:
        pop     bp
        pop     di
        pop     si
        pop     dx
        pop     cx
        pop     bx
        ret

normalize_input:
        push    ax
        push    cx
        push    si
        movzx   cx, byte [inputbuf+1]
        mov     si, inputbuf+2
.next:
        jcxz   .done
        mov     al, [si]
        cmp     al, 'a'
        jb      .keep
        cmp     al, 'z'
        ja      .keep
        sub     al, 32
        mov     [si], al
.keep:
        inc     si
        loop    .next
.done:
        pop     si
        pop     cx
        pop     ax
        ret

write_outcome:
        mov     word [outbuf+6], 1
        mov     ax, [selected]
        mov     [outbuf+6], ax
        mov     ax, [menu_count]
        mov     [outbuf+8], ax
        mov     ax, [fxbuf+MN_ID_PC_OFF]
        mov     [outbuf+10], ax
        mov     ax, [fxbuf+MN_ID_AREA_OFF]
        mov     [outbuf+12], ax
        mov     ax, [fxbuf+MN_ID_DEST_OFF]
        mov     [outbuf+14], ax
        mov     ax, [fxbuf+MN_ID_OPCODE_OFF]
        mov     [outbuf+16], ax
        cmp byte [effect_v15], 2
        jne .string_check
        cmp word [menu_opcode], 39h
        jne .string_check
        call who_commit_choice
        jc .bad
.string_check:
        cmp     word [menu_opcode], 10h
        jne     .open
        call    commit_string
        jc      .bad
        call    write_effect
        jc      .bad
        mov     word [outbuf+6], 0
.open:
        mov     dx, outname
        xor     cx, cx
        mov     ah, 3Ch
        int     21h
        jc      .bad
        mov     [outfh], ax
        mov     bx, ax
        mov     cx, GBMO_LEN
        mov     dx, outbuf
        mov     ah, 40h
        int     21h
        jc      .close_bad
        push    ax
        mov     bx, [outfh]
        mov     ah, 3Eh
        int     21h
        pop     ax
        jc      .bad
        cmp     ax, GBMO_LEN
        jne     .bad
        clc
        ret
.close_bad:
        mov bx, [outfh]
        mov ah, 3Eh
        int 21h
.bad:
        stc
        ret

; Commit the normalized text, plus a NUL terminator, into GBRS before the
; one-shot GBMO token is published. Empty input is the retail single space.
commit_string:
        mov     ax, [selected]
        cmp     ax, [menu_count]
        ja      .bad
        or      ax, ax
        jnz     .nonempty
        mov     byte [inputbuf+2], ' '
        mov     byte [inputbuf+1], 1
        mov     ax, 1
        mov     [selected], ax
.nonempty:
        mov     word [string_needed], 0
        mov     di, [fxbuf+MN_DEST_OFF]
        mov     cx, [selected]
        inc     cx
.preflight:
        mov     bx, di
        call    find_string_mem
        jnc     .have
        inc     word [string_needed]
.have:
        inc     di
        loop    .preflight
        mov     ax, [fxbuf+RS_MEMCOUNT_OFF]
        add     ax, [string_needed]
        cmp     ax, MAXMEM
        ja      .bad
        mov     di, [fxbuf+MN_DEST_OFF]
        mov     si, inputbuf+2
        mov     cx, [selected]
.store:
        lodsb
        xor     ah, ah
        mov     bx, di
        push    si
        call    set_string_mem
        pop     si
        inc     di
        loop    .store
        xor     ax, ax
        mov     bx, di
        call    set_string_mem
        clc
        ret
.bad:
        stc
        ret

; BX is a key. CF clear returns SI at the key word; CF set means absent.
find_string_mem:
        push    cx
        mov     cx, [fxbuf+RS_MEMCOUNT_OFF]
        mov     si, fxbuf+RS_KEYS_OFF
.scan:
        jcxz   .missing
        cmp     [si], bx
        je      .found
        add     si, 2
        loop    .scan
.missing:
        pop     cx
        stc
        ret
.found:
        pop     cx
        clc
        ret

set_string_mem:
        call    find_string_mem
        jc      .append
        sub     si, fxbuf+RS_KEYS_OFF
        mov     [fxbuf+RS_VALS_OFF+si], ax
        ret
.append:
        mov     si, [fxbuf+RS_MEMCOUNT_OFF]
        shl     si, 1
        mov     [fxbuf+RS_KEYS_OFF+si], bx
        mov     [fxbuf+RS_VALS_OFF+si], ax
        inc     word [fxbuf+RS_MEMCOUNT_OFF]
        ret

write_effect:
        mov     dx, inname
        mov     ah, 3Ch
        xor     cx, cx
        int     21h
        jc      .bad
        mov     [outfh], ax
        mov     bx, ax
        mov     cx, FXLEN
        cmp     byte [effect_v15], 1
        jne     .length_ready
        mov     cx, FX_V15_LEN
.length_ready:
        cmp byte [effect_v15], 2
        jne .extent_ready
        mov cx, FX_V16_LEN
.extent_ready:
        mov     [output_len], cx
        mov     dx, fxbuf
        mov     ah, 40h
        int     21h
        jc      .close_bad
        push    ax
        mov     bx, [outfh]
        mov     ah, 3Eh
        int     21h
        pop     ax
        jc      .bad
        cmp     ax, [output_len]
        jne     .bad
        clc
        ret
.close_bad:
        mov bx, [outfh]
        mov ah, 3Eh
        int 21h
.bad:
        stc
        ret

puts:
        push    ax
        push    dx
        push    si
        mov     si, dx
.next:
        mov     dl, [si]
        inc     si
        or      dl, dl
        jz      .done
        mov     ah, 02h
        int     21h
        jmp     .next
.done:
        pop     si
        pop     dx
        pop     ax
        ret

print_u16:
        push    ax
        push    bx
        push    cx
        push    dx
        xor     cx, cx
        mov     bx, 10
.divide:
        xor     dx, dx
        div     bx
        push    dx
        inc     cx
        or      ax, ax
        jnz     .divide
.emit:
        pop     dx
        add     dl, '0'
        mov     ah, 02h
        int     21h
        loop    .emit
        pop     dx
        pop     cx
        pop     bx
        pop     ax
        ret


; Secret v16 selected identity, kept distinct from other-title WHO.
who_validate_state:
        cmp word [fxbuf+120], 13
        jne .bad
        cmp dword [fxbuf+SI_MAGIC_OFF], 'GBSI'
        jne .bad
        cmp dword [fxbuf+SI_MAGIC_OFF+4], 00100001h
        jne .bad
        cmp word [fxbuf+SI_MAGIC_OFF+14], 0
        jne .bad
        cmp dword [fxbuf+MS_MAGIC_OFF], 'GBMS'
        jne .bad
        mov ax, [fxbuf+SI_COUNT_OFF]
        cmp ax, 6
        ja .bad
        mov dx, [fxbuf+SI_FLAGS_OFF]
        cmp dx, 2
        ja .bad
        cmp dx, [fxbuf+MS_FLAGS_OFF]
        jne .bad
        mov bx, [fxbuf+SI_SELECTED_OFF]
        cmp bx, [fxbuf+MS_SELECTED_OFF]
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

who_manual_choice:
        mov word [who_cursor], 0FFFFh
        cmp word [fxbuf+SI_FLAGS_OFF], 1
        jne .ready
        mov ax, [fxbuf+SI_SELECTED_OFF]
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
.drain:
        mov ah, 1
        int 16h
        jz .key_ready
        xor ax, ax
        int 16h
        jmp .drain
.key_ready:
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
        mov ax, [fxbuf+SI_COUNT_OFF]
        dec ax
        jmp .store
.down:
        mov ax, [who_cursor]
        inc ax                    ; FFFFh (null) wraps to first ordinal0.
        cmp ax, [fxbuf+SI_COUNT_OFF]
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
        mov ax, [selected]
        cmp ax, 0FFFFh
        je .null
        cmp ax, [fxbuf+SI_COUNT_OFF]
        jae .bad
        inc ax
        mov [fxbuf+MS_SELECTED_OFF], ax
        mov [fxbuf+SI_SELECTED_OFF], ax
        mov word [fxbuf+MS_FLAGS_OFF], 1
        mov word [fxbuf+SI_FLAGS_OFF], 1
        jmp .open
.null:
        cmp word [fxbuf+SI_FLAGS_OFF], 1
        je .bad
.open:
        mov ax, 3D02h
        mov dx, inname
        int 21h
        jc .bad
        mov [outfh], ax
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
        mov bx, [outfh]
        mov ah, 3Eh
        int 21h
        jc .bad
        clc
        ret
.write4:
        push dx
        xor cx, cx
        mov bx, [outfh]
        mov ax, 4200h
        int 21h
        pop dx
        jc .write_bad
        add dx, fxbuf
        mov bx, [outfh]
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
        mov bx, [outfh]
        mov ah, 3Eh
        int 21h
.bad:   stc
        ret

who_validate_labels:
        mov ax, [fxbuf+MN_COUNT_OFF]
        inc ax
        cmp ax, [fxbuf+MT_COUNT_OFF]
        jne .bad
        mov si, fxbuf+MT_DATA_OFF
        movzx ax, byte [si]
        inc si
        add si, ax                 ; Source-shaped packed prompt.
        mov cx, [fxbuf+MN_COUNT_OFF]
.name:
        movzx dx, byte [si]
        inc si
        cmp dx, 1
        jb .bad
        cmp dx, 15
        ja .bad
.char:
        cmp si, fxbuf+MT_DATA_OFF+MENU_TEXT_CAP
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
        cmp si, fxbuf+MT_DATA_OFF+MENU_TEXT_CAP
        jae .ok
        cmp byte [si], 0
        jne .bad
        inc si
        jmp .padding
.ok:    clc
        ret
.bad:   stc
        ret


; A WHO answer cannot truncate its own effect through a DOS path alias.
who_distinct_output:
        push es
        push ds
        pop es
        mov si, inname
        mov di, who_canon_in
        xor cx, cx
        mov ax, 6000h
        int 21h
        jc .bad
        mov si, outname
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
        mov si, fxbuf+MT_DATA_OFF
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

s_usage      db 'CCMENU <pending.gbef> <out.gbmo> [/S zeroBasedChoice]',13,10,0
s_bad        db 'CCMENU: invalid pending menu state',13,10,0
s_choice_bad db 'CCMENU: choice is outside this menu',13,10,0
s_write_bad  db 'CCMENU: could not write outcome',13,10,0
s_menu       db 13,10,'MENU: ',0
s_count      db 13,10,'Options: ',0
s_dot        db '. ',0
s_prompt     db 'Choose 1..N: ',0
s_saved      db 'CCMENU: outcome written',13,10,0
s_crlf       db 13,10,0
s_parlay_labels db '1. HAUGHTY',13,10,'2. SLY',13,10,'3. NICE',13,10,'4. MEEK',13,10,'5. ABUSIVE',13,10,0
s_number     db 'NUMBER 0..',0
s_string     db 'TEXT (up to ',0
s_text_prompt db 'Enter text: ',0

arg_count    db 0
effect_v15   db 0
auto_valid   db 0
auto_choice  dw 0
selected     dw 0
menu_count   dw 0
menu_opcode  dw 0
menu_event   dw 0
script_count dw 0
menu_text_count dw 0
menu_label   dw 0
string_needed dw 0
fh           dw 0
outfh        dw 0
output_len   dw 0
inname       times 128 db 0
outname      times 128 db 0
text_valid   db 0
input_byte db 0
input_overflow db 0
input_skip_lf db 0
input_failed db 0
inputbuf     db 0,0,255 dup 0
outbuf       db 'GBMO',2,0,0,0,0,0,0,0,0,0,0,0,0,0
fxbuf        times FX_V16_LEN db 0
prior_text   times PRIOR_TEXT_CAP db 0
prior_text_len dw 0
prior_text_index dw 0
prior_copy_len dw 0
stack        times 256 db 0
stacktop:
