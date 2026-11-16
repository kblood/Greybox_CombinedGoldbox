; Read-only owned Secret normal metric. /V input.GBP reply.GSM.
; No loose-file import or recovery; GS contains the admitted GBPR3 bank.
sq_parse:
        mov byte [sq_mode], 0
        mov byte [sq_bad], 0
        mov si, 81h
        movzx cx, byte [80h]
        call .spaces
        cmp cx, 2
        jb .done
        cmp byte [si], '/'
        jne .done
        mov al, [si+1]
        and al, 0DFh
        cmp al, 'V'
        jne .done
        mov byte [sq_mode], 1
        add si, 2
        sub cx, 2
        jcxz .bad
        cmp byte [si], ' '
        jne .bad
        call .spaces
        mov di, outname
        call .path
        jc .bad
        call .spaces
        mov di, sq_reply
        call .path
        jc .bad
        call .spaces
        or cx, cx
        jnz .bad
.done:  ret
.bad:   mov byte [sq_bad], 1
        ret
.spaces:
        jcxz .space_done
        cmp byte [si], ' '
        jne .space_done
        inc si
        dec cx
        jmp .spaces
.space_done:
        ret
.path:
        xor bx, bx
.path_byte:
        jcxz .path_end
        mov al, [si]
        cmp al, ' '
        je .path_end
        cmp al, 33
        jb .path_bad
        cmp al, '/'
        je .path_bad
        cmp bx, 111
        jae .path_bad
        stosb
        inc bx
        inc si
        dec cx
        jmp .path_byte
.path_end:
        mov byte [di], 0
        or bx, bx
        jz .path_bad
        clc
        ret
.path_bad:
        stc
        ret

secret_strength_main:
        call sq_query
        jc .bad
        mov ax, 4C00h
        int 21h
.bad:   mov ax, 4C01h
        int 21h

; Callable query: performs the same checked lifecycle as /V main.
sq_query:
        cmp byte [sq_bad], 0
        jne .bad
        push ds
        pop es
        mov si, outname
        mov di, sq_canon_in
        xor cx, cx
        mov ax, 6000h
        int 21h
        jc .bad
        mov si, sq_reply
        mov di, sq_canon_out
        mov ax, 6000h
        int 21h
        jc .bad
        mov si, sq_canon_in
        mov di, outname
        call sq_copy_canonical
        jc .bad
        mov [sq_stem_length], bx
        mov si, sq_canon_out
        mov di, sq_reply
        call sq_copy_canonical
        jc .bad
        mov si, outname
        mov di, sq_reply
        mov cx, [sq_stem_length]
        repe cmpsb
        jne .distinct
        cmp byte [di], '.'
        jne .stem_end
        cmp byte [di+4], 0
        je .bad
.stem_end:
        cmp byte [di], 0
        je .bad
.distinct:
        mov si, outname
        mov eax, '.GBP'
        call sq_extension
        jc .bad
        mov si, sq_reply
        mov eax, '.GSM'
        call sq_extension
        jc .bad
        call spp_check_pending
        jc .bad
        push ds
        pop es
        mov bx, 1000h
        mov ah, 4Ah
        int 21h
        jc .bad
        mov bx, SR_MAX/16
        mov ah, 48h
        int 21h
        jc .bad
        mov gs, ax
        push ds
        pop es
        mov dx, outname
        call sr_read
        jc .bad
        call sq_calculate
        jc .bad
        mov ax, [sq_value]
        mov [sq_response+8], ax
        mov ax, [sr_count]
        mov [sq_response+10], ax
        mov ax, [sr_length]
        mov [sq_response+12], ax
        mov dx, sq_reply
        xor cx, cx
        mov ax, 5B00h            ; Existing replies remain untouched.
        int 21h
        jc .bad
        mov [sq_fh], ax
        mov bx, ax
        mov dx, sq_response
        mov cx, 16
        mov ah, 40h
        int 21h
        jc .close_bad
        cmp ax, 16
        jne .close_bad
        mov bx, [sq_fh]
        mov ah, 3Eh
        int 21h
        jc .bad
        clc
        ret
.close_bad:
        mov bx, [sq_fh]
        mov ah, 3Eh
        int 21h
.bad:   stc
        ret

; Uppercase canonical DOS path, bounded to112. BX receives last-dot index.
sq_copy_canonical:
        xor cx, cx
        xor bx, bx
.byte:
        lodsb
        cmp al, 'a'
        jb .case_ok
        cmp al, 'z'
        ja .case_ok
        sub al, 32
.case_ok:
        stosb
        or al, al
        jz .done
        cmp al, '.'
        jne .next
        mov bx, cx
.next:  inc cx
        cmp cx, 112
        jb .byte
        stc
        ret
.done:  clc
        ret
sq_extension:
        push eax
        mov di, si
.scan:  cmp byte [di], 0
        je .end
        inc di
        jmp .scan
.end:   sub di, si
        cmp di, 4
        jb .bad
        add di, si
        sub di, 4
        pop eax
        cmp [di], eax
        jne .fail
        clc
        ret
.bad:   pop eax
.fail:  stc
        ret

sq_calculate:
        push ds
        pop es
        mov word [sq_value], 0
        mov word [sq_index], 0
        mov si, [sr_catalog]
        mov di, spp_catalog
        mov cx, 2048
.catalog:
        mov al, [gs:si]
        inc si
        stosb
        loop .catalog
.row:
        mov ax, [sq_index]
        cmp ax, [sr_count]
        jae .done
        imul ax, ax, SR_ROW
        add ax, SR_HEADER+1
        mov si, ax
        mov di, spp_source_body
        mov cx, 439
.copy:
        mov al, [gs:si]
        inc si
        stosb
        loop .copy
        mov byte [di], 0
        mov al, [spp_source_body+437]
        cmp al, [spp_source_body+112]
        ja .bad
        mov bx, [sq_index]
        shl bx, 1
        mov cx, [sr_stf_len+bx]
        mov bx, [sr_stf+bx]
        mov si, spp_source_body
        mov di, spp_catalog
        call sp_calculate
        jc .bad
        call sq_actor
        add byte [sq_value], al  ; Original party accumulator wraps each byte.
        inc word [sq_index]
        jmp .row
.done:  clc
        ret
.bad:   stc
        ret

; Original signed predicate, byte intermediates and unsigned weighted divide.
; sp_body keeps class/HP fields; normal caches396/397 in mapped ss_body
; correspond to original Secret actor426/427, without archived cache trust.
sq_actor:
        xor bx, bx
        cmp byte [sp_body+107], 6
        jne .predicate
.scan:  cmp bx, 6
        jae .level
        cmp byte [sp_body+273+bx], 0
        jne .level
        inc bx
        jmp .scan
.level: mov al, [sp_body+273+bx]
        jmp .compare
.predicate:
        xor al, al
.compare:
        xor bx, bx
        cmp al, [sp_body+239]
        jle .extra
        inc bx
.extra: movsx ax, byte [sp_body+285]
        imul ax, bx
        movsx dx, byte [sp_body+278]
        add ax, dx
        movzx ax, al
        shl ax, 3
        mov si, ax
        movsx ax, byte [sp_body+280]
        imul ax, bx
        movsx dx, byte [sp_body+273]
        add ax, dx
        movzx ax, al
        shl ax, 2
        add si, ax
        movzx ax, byte [sp_body+437]
        add si, ax
        movzx ax, byte [ss_body+397]
        sub ax, 60
        jbe .ac_done
        imul ax, ax, 5
        add si, ax
.ac_done:
        movzx ax, byte [ss_body+396]
        sub ax, 39
        jbe .thac_done
        imul ax, ax, 5
        add si, ax
.thac_done:
        mov ax, si
        xor dx, dx
        mov bx, 10
        div bx
        ret

sq_mode db 0
sq_bad db 0
sq_reply times 112 db 0
sq_canon_in times 128 db 0
sq_canon_out times 128 db 0
sq_stem_length dw 0
sq_value dw 0
sq_index dw 0
sq_fh dw 0FFFFh
sq_response db 'GBSM'
            dw 1,16,0,0,0,0
