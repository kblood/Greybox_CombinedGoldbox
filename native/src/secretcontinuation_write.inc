; Unpublished GSK snapshot writers. Caller supplies admitted paths/descriptor,
; and indexed/admitted open PREPARED or COMPLETED input for phase advancement.
; CF reports failure. Input handle remains owned by caller; output is closed.
; No writer authorizes publication or replaces/deletes live authority.
kw_prepare:
        cmp word [kc_fh], 0ffffh
        jne kc_bad
        call kw_begin
        jc kw_fail
        mov word [kw_header+6], 0
        push ds
        pop es
        mov di, kw_header+24
        xor ax, ax
        mov cx, 20
        rep stosw
        call kw_prefix
        jc kw_fail
        mov dx, kv_paths+2*112
        xor si, si
        call kw_live
        jc kw_fail
        cmp dword [kw_header+24], 346
        jne kw_fail
        mov dx, kv_paths+112
        mov si, 4
        call kw_live
        jc kw_fail
        cmp dword [kw_header+28], 16
        jb kw_fail
        cmp dword [kw_header+28], 32768
        ja kw_fail
        mov dx, kv_paths+4*112
        mov si, 8
        call kw_live
        jc kw_fail
        mov ax,[kw_live_flags]
        mov [kw_initial_flags],ax
        cmp word [kw_header+20],3
        jne .physical_extent
        cmp dword [kw_header+32],5948
        jne kw_fail
        jmp .seed
.physical_extent:
        mov eax, [kw_header+32]
        call kw_combat_extent
        jc kw_fail
.seed:
        mov dx, kv_paths+5*112
        mov si, 12
        call kw_live
        jc kw_fail
        cmp dword [kw_header+36], 150
        jne kw_fail
        mov si, kv_paths+4*112
        mov di, kw_sibling
        call kw_sibling_path
        jc kw_fail
        mov dword [kw_sibling+bx], 'IDN'
        mov dx, kw_sibling
        mov si, 16
        call kw_live
        jc kw_fail
        cmp dword [kw_header+40], 32
        jb kw_fail
        cmp dword [kw_header+40], KR_SOURCE_MAX
        ja kw_fail
        cmp word [kw_header+20],3
        jne .prepared_done
        test word [kw_initial_flags],100h
        jz .prepared_done
        mov si,kv_paths+4*112
        mov di,kw_sibling
        call kw_sibling_path
        jc kw_fail
        mov dword [kw_sibling+bx],'GBS'
        mov dx,kw_sibling
        mov si,32
        call kw_live
        jc kw_fail
        cmp dword [kw_header+56],8
        jb kw_fail
        cmp dword [kw_header+56],KR_STREAM_MAX
        ja kw_fail
.prepared_done:
        jmp kw_finish

kw_completed:
        cmp word [kr_header+6], 0
        jne kc_bad
        call kw_begin
        jc kw_fail
        mov word [kw_header+6], 1
        call kw_header_prefix
        jc kw_fail
        mov eax, KR_HEADER
        mov edx, [kr_offsets+20]
        sub edx, eax
        call kw_frozen
        jc kw_fail
        mov dx, kv_paths+3*112
        mov si, 20
        call kw_live
        jc kw_fail
        movzx eax, word [kw_header+12]
        imul eax, eax, 6
        add eax, 16
        add eax, [kw_header+28]
        cmp eax, [kw_header+44]
        jne kw_fail
        mov dx, kv_paths+6*112
        mov si, 24
        call kw_live
        jc kw_fail
        cmp dword [kw_header+48], 6
        jb kw_fail
        cmp dword [kw_header+48], 7
        ja kw_fail
        jmp kw_finish

; ACTIVE -> acknowledged menu/empty input, with no HP-result section.
; Caller has bound exact current roster and sanctioned committed menu edits.
; kw_advance_kind=1 copies live canonical successor (CCMENU string commit);
; kind2 freezes the existing immutable successor. The encoded path table and
; original request remain unchanged; outcome is newly closed live input.
kw_advance:
        cmp word [kr_header+6],2
        je .source_ready
        cmp word [kr_header+6],0
        jne kc_bad
        cmp word [kr_header+20],3
        jne kc_bad
.source_ready:
        mov ax, [kw_advance_kind]
        cmp ax, 1
        jb kc_bad
        cmp ax, 2
        ja kc_bad
        call kw_begin
        jc kw_fail
        mov word [kw_header+6], 1
        mov ax, [kw_advance_kind]
        mov [kw_header+20], ax
        mov word [kw_header+22], 0
        mov eax, [kr_offsets+28]
        cmp word [kr_header+20],3
        jne .area_source
        mov eax,[kr_offsets+8]
.area_source:
        add eax, 122
        mov di, kw_area
        mov cx, 2
        call kc_read_at
        jc kw_fail
        mov ax, [kw_area]
        mov [kw_header+14], ax
        mov eax, [kr_header+52]
        cmp word [kr_header+20],3
        jne .fx_extent
        mov eax,[kr_header+32]
.fx_extent:
        mov [kw_header+32], eax
        mov dword [kw_header+44], 0
        mov dword [kw_header+48], 0
        mov dword [kw_header+52], 0
        mov dword [kw_header+56], 0
        mov dword [kw_header+60], 0
        call kw_header_prefix
        jc kw_fail
        mov eax, 64
        mov edx, 1120+KR_CONTEXT       ; exact paths plus immutable context
        call kw_frozen
        jc kw_fail
        mov eax,[kr_offsets]
        mov cx,346
        mov di,kc_buf
        call kc_read_at
        jc kw_fail
        cmp dword [kc_buf],'GBIR'
        jne .request_ready
        mov ax,[kw_advance_kind]
        mov [kc_buf+8],ax
.request_ready:
        mov dx,kc_buf
        mov cx,346
        call kw_write
        jc kw_fail
        mov dx, kv_paths+112
        mov si, 4
        call kw_live
        jc kw_fail
        mov eax, [kw_header+28]
        cmp eax, [kr_header+28]
        jne kw_fail
        cmp word [kw_advance_kind], 1
        jne .empty
        mov dx, kv_paths+7*112
        cmp word [kr_header+20],3
        jne .live_menu
        mov dx,kv_paths+4*112
.live_menu:
        mov si, 8
        call kw_live
        jc kw_fail
        mov eax, [kw_header+32]
        call kw_menu_extent
        jc kw_fail
        jmp .inputs
.empty:
        mov eax, [kw_header+32]
        call kw_combat_extent
        jc kw_fail
        mov eax, [kr_offsets+28]
        cmp word [kr_header+20],3
        jne .frozen_empty
        mov eax,[kr_offsets+8]
.frozen_empty:
        mov edx, [kw_header+32]
        call kw_frozen
        jc kw_fail
.inputs:
        mov eax, [kr_offsets+12]
        mov edx, 150
        add edx, [kr_header+40]
        jc kw_fail
        call kw_frozen
        jc kw_fail
        mov dx, kv_paths+6*112
        mov si, 24
        call kw_live
        jc kw_fail
        jmp kw_finish

kw_active:
        cmp word [kr_header+6], 1
        jne kc_bad
        call kw_begin
        jc kw_fail
        mov word [kw_header+6], 2
        call kw_header_prefix
        jc kw_fail
        mov eax, KR_HEADER
        mov edx, [kr_offsets+28]
        sub edx, eax
        call kw_frozen
        jc kw_fail
        mov dx, kv_paths+7*112
        cmp word [kw_producer_source], 0
        je .producer
        mov dx, [kw_producer_source]
.producer:
        mov si, 28
        call kw_live
        jc kw_fail
        cmp dword [kw_header+52], 5750
        je .effect_ok
        mov eax, [kw_header+52]
        call kw_menu_extent
        jc kw_fail
.effect_ok:
        test word [kw_live_flags], 100h
        jz .receipt
        mov si, kv_paths+7*112
        cmp word [kw_producer_source], 0
        je .stream_source
        mov si, [kw_producer_source]
.stream_source:
        mov di, kw_sibling
        call kw_sibling_path
        jc kw_fail
        mov dword [kw_sibling+bx], 'GBS'
        mov dx, kw_sibling
        mov si, 32
        call kw_live
        jc kw_fail
        cmp dword [kw_header+56], 8
        jb kw_fail
        cmp dword [kw_header+56], KR_STREAM_MAX
        ja kw_fail
.receipt:
        mov dword [kw_receipt], 'GBKO'
        mov dword [kw_receipt+4], 00180001h
        mov eax, [kw_saved_extent]
        mov [kw_receipt+8], eax
        mov edx, [kw_header+52]
        mov [kw_receipt+12], edx
        add eax, edx
        jc kw_fail
        mov edx, [kw_header+56]
        mov [kw_receipt+16], edx
        add eax, edx
        jc kw_fail
        add eax, 24
        jc kw_fail
        mov [kw_header+60], eax
        mov dword [kw_receipt+20], 0
        mov dx, kw_receipt
        mov cx, 24
        call kw_write
        jc kw_fail
        xor eax, eax
        mov edx, [kw_saved_extent]
        call kw_frozen
        jc kw_fail
        ; Duplicate the already staged closed producer bytes, never mutable
        ; live paths. Separate DOS handles keep the output append cursor intact.
        mov eax, [kr_offsets+28]
        mov [kw_duplicate_offset], eax
        mov eax, [kw_header+52]
        add eax, [kw_header+56]
        mov [kw_duplicate_length], eax
        mov word [kc_fh], 0ffffh
        mov dx, kw_stage
        call kc_open
        jc .duplicate_bad
        mov eax, [kw_duplicate_offset]
        mov edx, [kw_duplicate_length]
        mov bx, [kw_out]
        mov byte [kc_mode], 0
        call kc_transfer
        jc .duplicate_close_bad
        call kc_close
        jc .duplicate_bad
        call kw_restore
        jmp kw_finish
.duplicate_close_bad:
        call kc_close
.duplicate_bad:
        mov ax, [kc_fh]
        mov [kw_live_fh], ax
        call kw_restore
        jmp kw_fail

; Save source ownership and private header. Scratch must be truly absent.
kw_begin:
        cld
        mov word [kc_verified], 0
        cmp word [kw_out], 0ffffh
        jne kc_bad
        cmp word [kw_live_fh], 0ffffh
        jne kc_bad
        mov ax, [kc_fh]
        mov [kw_saved_fh], ax
        mov eax, [kc_extent]
        mov [kw_saved_extent], eax
        mov word [kw_out], 0ffffh
        push ds
        pop es
        mov si, kr_header
        mov di, kw_header
        mov cx, 32
        rep movsw
        mov dx, kw_stage
        call kc_probe
        jc kc_bad
        test ax, ax
        jnz kc_bad
        mov dx, kw_stage
        xor cx, cx
        mov ah, 3Ch
        int 21h
        jc kc_bad
        mov [kw_out], ax
        clc
        ret

kw_prefix:
        call kw_header_prefix
        jc kc_bad
        mov dx, kv_paths
        mov cx, 1120
        call kw_write
        jc kc_bad
        mov dx, kv_context
        mov cx, KR_CONTEXT
        jmp kw_write
kw_header_prefix:
        mov dx, kw_header
        mov cx, 64
        jmp kw_write
kw_write:
        mov bx, [kw_out]
        mov [kw_write_len], cx
        mov ah, 40h
        int 21h
        jc kc_bad
        cmp ax, [kw_write_len]
        jne kc_bad
        clc
        ret
kw_frozen:
        cmp word [kw_saved_fh], 0ffffh
        je kc_bad
        mov bx, [kw_out]
        mov byte [kc_mode], 0
        jmp kc_transfer

; DX live input; SI section-length offset.
kw_live:
        mov [kw_section], si
        mov word [kc_fh], 0ffffh
        call kc_open
        jc .restore_bad
        mov eax, [kc_extent]
        cmp eax, KR_SOURCE_MAX
        ja .close_bad
        mov [kw_last_extent], eax
        mov si, [kw_section]
        mov [kw_header+24+si], eax
.flags:
        cmp si,8
        je .read_flags
        cmp si, 28
        jne .copy
.read_flags:
        mov eax, 6
        mov cx, 2
        mov di, kw_live_flags
        call kc_read_at
        jc .close_bad
.copy:
        xor eax, eax
        mov edx, [kc_extent]
        mov bx, [kw_out]
        mov byte [kc_mode], 0
        call kc_transfer
        jc .close_bad
        call kc_close
        jc .restore_bad
        call kw_restore
        clc
        ret
.close_bad:
        call kc_close
.restore_bad:
        ; Preserve an unclosed live handle for teardown rather than losing it.
        mov ax, [kc_fh]
        mov [kw_live_fh], ax
        call kw_restore
        stc
        ret
kw_restore:
        mov ax, [kw_saved_fh]
        mov [kc_fh], ax
        mov eax, [kw_saved_extent]
        mov [kc_extent], eax
        ret
; Retry writer-owned failed closes, without touching caller's snapshot handle.
kw_teardown:
        mov bx, [kw_live_fh]
        cmp bx, 0ffffh
        je .output
        mov ah, 3Eh
        int 21h
        jc kc_bad
        mov word [kw_live_fh], 0ffffh
.output:
        mov bx, [kw_out]
        cmp bx, 0ffffh
        je .done
        mov ah, 3Eh
        int 21h
        jc kc_bad
        mov word [kw_out], 0ffffh
.done: clc
        ret
kw_finish:
        mov bx, [kw_out]
        mov ax, 4200h
        xor cx, cx
        xor dx, dx
        int 21h
        jc kw_fail
        mov dx, kw_header
        mov cx, 64
        call kw_write
        jc kw_fail
        mov bx, [kw_out]
        mov ah, 3Eh
        int 21h
        jc kw_fail
        mov word [kw_out], 0ffffh
        clc
        ret
kw_fail:
        mov word [kc_verified], 0
        mov bx, [kw_out]
        cmp bx, 0ffffh
        je .done
        mov ah, 3Eh
        int 21h
        jc .done
        mov word [kw_out], 0ffffh
.done: stc
        ret

; Canonical admitted path -> bounded same-stem scratch path. BX extension start.
kw_sibling_path:
        xor bx, bx
        mov cx, 112
.byte:
        lodsb
        stosb
        cmp al, '.'
        jne .zero
        mov bx, di
        sub bx, kw_sibling
.zero: test al, al
        jz .end
        loop .byte
        jmp kc_bad
.end:  test bx, bx
        jz kc_bad
        cmp bx, 108
        ja kc_bad
        clc
        ret

kw_stage times 112 db 0
kw_sibling times 112 db 0
kw_header times 64 db 0
kw_receipt times 24 db 0
kw_saved_fh dw 0ffffh
kw_live_fh dw 0ffffh
kw_out dw 0ffffh
kw_saved_extent dd 0
kw_last_extent dd 0
kw_live_flags dw 0
kw_section dw 0
kw_write_len dw 0
kw_duplicate_offset dd 0
kw_duplicate_length dd 0
; Optional admitted isolated producer path; encoded paths remain kv_paths.
kw_producer_source dw 0
kw_advance_kind dw 0
kw_area dw 0

kw_combat_extent:
        cmp eax, 5750
        je .ok
        cmp eax, 5948
        jne .bad
.ok: clc
        ret
.bad: stc
        ret
kw_menu_extent:
        cmp eax, 5932
        je .ok
        cmp eax, 5948
        jne .bad
.ok: clc
        ret
.bad: stc
        ret

kw_initial_flags dw 0
