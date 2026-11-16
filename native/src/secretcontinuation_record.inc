; Native GSK3 framing and exact GBKO producer-receipt binding.
; This is a READ-ONLY indexing layer, not semantic admission. The coordinator
; must additionally validate paths, GBPR/GBHR, source/member/PC, paused state,
; seed, result/outcome and full successor stream before authorizing publication.
; kr_index never sets kc_verified. Successful return leaves the source open.
KR_HEADER equ 64
KR_PATHS equ 10*112
KR_CONTEXT equ 32
KR_BODY equ KR_HEADER+KR_PATHS+KR_CONTEXT
KR_SOURCE_MAX equ 16*1024*1024+16
KR_STREAM_MAX equ 8+65535*54

kr_index:
        mov word [kc_verified], 0
        mov word [kr_error], 1
        call kc_open
        jc kr_bad
        mov byte [kr_owns_handle], 1
        cmp dword [kc_extent], KR_HEADER
        jae .header
        cmp dword [kc_extent], 4
        jb .unsupported             ; no complete magic: cannot prove new schema
        xor eax, eax
        mov cx, 4
        mov di, kr_header
        call kc_read_at
        jc kr_close_bad
        cmp dword [kr_header], 'GSK1'
        je .unsupported
        cmp dword [kr_header], 'GSK2'
        je .unsupported
        cmp dword [kr_header], 'GSK3'
        jne .unsupported
        cmp dword [kc_extent], 6
        jb .short_current
        mov eax, 4
        mov cx, 2
        mov di, kr_header+4
        call kc_read_at
        jc kr_close_bad
        cmp word [kr_header+4], 3
        jne .unsupported
.short_current:
        mov word [kr_error], 2
        jmp kr_close_bad
.header:
        xor eax, eax
        mov cx, KR_HEADER
        mov di, kr_header
        call kc_read_at
        jc kr_close_bad
        mov word [kr_error], 2
        cmp dword [kr_header], 'GSK1'
        jne .current_schema
        jmp .unsupported
.current_schema:
        cmp dword [kr_header], 'GSK2'
        je .unsupported
        cmp dword [kr_header], 'GSK3'
        jne .unsupported
        cmp word [kr_header+4], 3
        jne .unsupported
        cmp word [kr_header+6], 2
        ja kr_close_bad
        cmp word [kr_header+8], 4
        jne kr_close_bad
        cmp word [kr_header+10], 1
        jne kr_close_bad
        mov ax, [kr_header+12]
        cmp ax, 1
        jb kr_close_bad
        cmp ax, 6
        ja kr_close_bad
        cmp word [kr_header+16], KR_HEADER
        jne kr_close_bad
        cmp word [kr_header+18], 1
        ja kr_close_bad
        cmp word [kr_header+20], 3
        ja .unsupported
        cmp word [kr_header+22], 0
        jne kr_close_bad
        cmp dword [kr_header+24], 346
        jne kr_close_bad
        cmp dword [kr_header+28], 16
        jb kr_close_bad
        cmp dword [kr_header+28], 32768
        ja kr_close_bad
        cmp word [kr_header+20], 3
        je .initial_extent
        cmp word [kr_header+20], 1
        jne .combat_paused
        mov eax, [kr_header+32]
        cmp eax, 5948
        je .seed
        cmp eax, 5932
        jne kr_close_bad
        jmp .seed
.initial_extent:
        cmp dword [kr_header+32], 5948
        je .seed
        jmp kr_close_bad
.combat_paused:
        mov eax, [kr_header+32]
        cmp eax, 5948
        je .seed
        cmp eax, 5750
        jne kr_close_bad
.seed:
        cmp dword [kr_header+36], 150
        jne kr_close_bad
        cmp dword [kr_header+40], 32
        jb kr_close_bad
        cmp dword [kr_header+40], KR_SOURCE_MAX
        ja kr_close_bad
        xor bx, bx
        mov eax, KR_BODY
.offsets:
        mov [kr_offsets+bx], eax
        add eax, [kr_header+24+bx]
        jc kr_close_bad
        add bx, 4
        cmp bx, 40
        jb .offsets
        cmp eax, [kc_extent]
        jne kr_close_bad
        cmp word [kr_header+6], 0
        jne .completed
        cmp word [kr_header+20], 3
        je .initial
        cmp word [kr_header+20], 0
        jne kr_close_bad
        mov si, kr_header+44
        mov cx, 20
.empty:
        lodsb
        test al, al
        jnz kr_close_bad
        loop .empty
        mov word [kr_error], 0
        clc
        ret
.initial:
        cmp dword [kr_header+44],0
        jne kr_close_bad
        cmp dword [kr_header+48],0
        jne kr_close_bad
        cmp dword [kr_header+52],0
        jne kr_close_bad
        cmp dword [kr_header+60],0
        jne kr_close_bad
        mov eax,[kr_header+56]
        test eax,eax
        jz .initial_ok
        cmp eax,8
        jb kr_close_bad
        cmp eax,KR_STREAM_MAX
        ja kr_close_bad
.initial_ok:
        mov word [kr_error],0
        clc
        ret
.completed:
        cmp word [kr_header+20],3
        je .unsupported
        cmp word [kr_header+20], 0
        jne .noncombat
        movzx eax, word [kr_header+12]
        imul eax, eax, 6
        add eax, 16
        add eax, [kr_header+28]
        cmp eax, [kr_header+44]
        jne kr_close_bad
        cmp dword [kr_header+48], 6
        jb kr_close_bad
        cmp dword [kr_header+48], 7
        ja kr_close_bad
        jmp .output_phase
.noncombat:
        cmp dword [kr_header+44], 0
        jne kr_close_bad
        cmp word [kr_header+20], 2
        jne .answer
        cmp dword [kr_header+48], 9
        jne kr_close_bad
        jmp .output_phase
.answer:
        cmp dword [kr_header+48], 10
        jb kr_close_bad
        cmp dword [kr_header+48], 256
        ja kr_close_bad
.output_phase:
        cmp word [kr_header+6], 1
        jne .active
        mov si, kr_header+52
        mov cx, 12
        jmp .empty
.active:
        mov eax, [kr_header+52]
        cmp eax, 5750
        je .stream
        cmp eax, 5948
        je .stream
        cmp eax, 5932
        jne kr_close_bad
.stream:
        mov eax, [kr_header+56]
        test eax, eax
        jz .receipt
        cmp eax, 8
        jb kr_close_bad
        cmp eax, KR_STREAM_MAX
        ja kr_close_bad
.receipt:
        ; The completed input ends exactly where the successor begins.
        mov eax, [kr_offsets+28]
        mov [kr_input_len], eax
        add eax, 24
        add eax, [kr_header+52]
        jc kr_close_bad
        add eax, [kr_header+56]
        jc kr_close_bad
        cmp eax, [kr_header+60]
        jne kr_close_bad
        mov eax, [kr_offsets+36]
        mov di, kr_receipt
        mov cx, 24
        mov word [kr_error], 1
        call kc_read_at
        jc kr_close_bad
        mov word [kr_error], 3         ; complete framed receipt, never partial cleanup
        cmp dword [kr_receipt], 'GBKO'
        jne kr_close_bad
        cmp word [kr_receipt+4], 1
        jne kr_close_bad
        cmp word [kr_receipt+6], 24
        jne kr_close_bad
        cmp dword [kr_receipt+20], 0
        jne kr_close_bad
        mov eax, [kr_input_len]
        cmp eax, [kr_receipt+8]
        jne kr_close_bad
        mov eax, [kr_header+52]
        cmp eax, [kr_receipt+12]
        jne kr_close_bad
        mov eax, [kr_header+56]
        cmp eax, [kr_receipt+16]
        jne kr_close_bad
        ; The receipt's input header is COMPLETED, with no output sections.
        mov eax, [kr_offsets+36]
        add eax, 24
        mov [kr_receipt_input], eax
        mov cx, KR_HEADER
        mov di, kc_cmp
        mov word [kr_error], 1
        call kc_read_at
        jc kr_close_bad
        mov word [kr_error], 3         ; foreign completed-input binding is evidence
        push ds
        pop es
        mov si, kr_header
        mov di, kc_buf
        mov cx, KR_HEADER/2
        rep movsw
        mov word [kc_buf+6], 1
        mov dword [kc_buf+52], 0
        mov dword [kc_buf+56], 0
        mov dword [kc_buf+60], 0
        mov si, kc_buf
        mov di, kc_cmp
        mov cx, KR_HEADER
        repe cmpsb
        jne kr_close_bad
        ; Compare paths and all seven complete inputs, then exact output+stream.
        mov eax, KR_HEADER
        mov edx, [kr_receipt_input]
        add edx, KR_HEADER
        mov ecx, [kr_input_len]
        sub ecx, KR_HEADER
        mov word [kr_error], 1
        call kc_equal_offsets
        jc kr_compare_bad
        mov eax, [kr_offsets+28]
        mov edx, [kr_receipt_input]
        add edx, [kr_input_len]
        mov ecx, [kr_header+52]
        add ecx, [kr_header+56]
        mov word [kr_error], 1
        call kc_equal_offsets
        jc kr_compare_bad
        mov word [kr_error], 0
        clc
        ret
.unsupported:
        mov word [kr_error], 3         ; foreign/unknown schema cannot be inferred/repaired
        jmp kr_close_bad
kr_compare_bad:
        cmp word [kc_error], 2
        jne kr_close_bad
        mov word [kr_error], 3
kr_close_bad:
        cmp byte [kr_owns_handle], 0
        je kr_bad
        call kc_close
kr_bad:
        stc
        ret

; Source already open with a caller-owned exact nested view. Structural-only
; admission, no publication grant. Failure leaves that source for caller cleanup.
kr_index_open:
        mov word [kc_verified], 0
        mov word [kr_error], 1
        mov byte [kr_owns_handle], 0
        cmp word [kc_fh], 0ffffh
        je kr_bad
        cmp dword [kc_extent], KR_HEADER
        jb kr_bad
        jmp kr_index.header

kr_header times KR_HEADER db 0
kr_offsets times 10 dd 0
kr_receipt times 24 db 0
kr_input_len dd 0
kr_receipt_input dd 0
kr_error dw 0                 ; 1=IO,2=incomplete/current framing,3=unsupported/foreign binding
kr_owns_handle db 0
