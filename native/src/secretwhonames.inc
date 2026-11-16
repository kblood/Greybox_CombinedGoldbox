; CCPARTY /W: names of exact owned P1 rows, never a party-selection policy.
wn_parse:
        mov byte [wn_mode], 0
        mov byte [wn_bad], 0
        mov si, 81h
        movzx cx, byte [80h]
        call .spaces
        cmp cx, 2
        jb .done
        cmp byte [si], '/'
        jne .done
        mov al, [si+1]
        and al, 0DFh
        cmp al, 'W'
        jne .done
        mov byte [wn_mode], 1
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
        mov di, wn_reply
        call .path
        jc .bad
        call .spaces
        or cx, cx
        jnz .bad
.done:  ret
.bad:   mov byte [wn_bad], 1
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

secret_who_names_main:
        call wn_query
        jc .bad
        mov ax, 4C00h
        int 21h
.bad:   mov ax, 4C01h
        int 21h

wn_query:
        cmp byte [wn_bad], 0
        jne .bad
        push ds
        pop es
        mov si, outname
        mov di, sq_canon_in
        xor cx, cx
        mov ax, 6000h
        int 21h
        jc .bad
        mov si, wn_reply
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
        mov di, wn_reply
        call sq_copy_canonical
        jc .bad
        mov si, outname
        mov di, wn_reply
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
        mov si, wn_reply
        mov eax, '.GWN'
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
        call wn_project
        jc .bad
        mov dx, wn_reply
        xor cx, cx
        mov ax, 5B00h             ; Existing reply/foreign file is preserved.
        int 21h
        jc .bad
        mov [wn_fh], ax
        mov bx, ax
        mov dx, wn_response
        mov cx, [wn_response+6]
        mov ah, 40h
        int 21h
        jc .close_bad
        cmp ax, [wn_response+6]
        jne .close_bad
        mov bx, [wn_fh]
        mov ah, 3Eh
        int 21h
        jc .bad
        clc
        ret
.close_bad:
        mov bx, [wn_fh]
        mov ah, 3Eh
        int 21h
.bad:   stc
        ret

; GS=admitted full P1. Names have canonical zero padding irrespective of
; unused source padding. Neither source slots nor actor bytes are rewritten.
wn_project:
        mov ax, [sr_count]
        mov [wn_response+8], ax
        imul ax,ax,30
        add ax,32
        mov [wn_response+6],ax
        mov ax, [sr_length]
        mov [wn_response+12], ax
        mov di, wn_response+16
        xor ax, ax
        mov cx, 196/2
        rep stosw
        mov di, wn_response+16
        mov si, SR_HEADER+1
        mov bx, [sr_count]
.row:
        push si
        push di
        movzx cx, byte [gs:si]
        inc cx                    ; Length byte plus declared name only.
.name:
        mov al, [gs:si]
        inc si
        stosb
        loop .name
        pop di
        pop si
        add di, 16
        add si, SR_ROW
        dec bx
        jnz .row
        mov ax,[sr_count]
        shl ax,4
        add ax,wn_response+16
        mov [wn_fields],ax
        mov di,ax
        mov dword [di],'GBSF'
        mov dword [di+4],2
        mov ax,[sr_count]
        imul ax,ax,14
        add ax,16
        mov [di+6],ax
        mov ax,[sr_count]
        mov [di+8],ax
        mov word [di+10],7
        mov word [di+12],0
        mov word [di+14],0
        add word [wn_fields],16
        mov si,[sr_catalog]
        mov di,spp_catalog
        mov cx,2048
.catalog:
        mov al,[gs:si]
        inc si
        stosb
        loop .catalog
        mov word [wn_index],0
.fields:
        imul si,word [wn_index],440
        add si,17
        mov di,spp_source_body
        mov cx,439
.copy:
        mov al,[gs:si]
        inc si
        stosb
        loop .copy
        mov byte [di],0
        mov al,[spp_source_body+437]
        cmp al,[spp_source_body+112]
        ja .bad
        mov bx,[wn_index]
        shl bx,1
        mov cx,[sr_stf_len+bx]
        mov bx,[sr_stf+bx]
        mov si,spp_source_body
        mov di,spp_catalog
        call sp_calculate
        jc .bad
        mov di,[wn_fields]
        movzx ax,byte [sp_body+19]
        stosw
        movzx ax,byte [sp_body+25]
        stosw
        movzx ax,byte [sp_body+27]
        stosw
        movsx ax,byte [sp_body+107]
        stosw
        movsx ax,byte [sp_body+108]
        stosw
        ; Normal maximum HP is the projected actor112; current HP437 is distinct.
        movzx ax,byte [sp_body+112]
        stosw
        ; Original Secret bank-one getter7CA7 zero-extends actor byte245.
        movzx ax,byte [sp_body+245]
        stosw
        mov [wn_fields],di
        inc word [wn_index]
        mov ax,[wn_index]
        cmp ax,[sr_count]
        jb .fields
        clc
        ret
.bad:   stc
        ret

wn_fields dw 0
wn_index dw 0
wn_mode db 0
wn_bad db 0
wn_reply times 112 db 0
wn_fh dw 0FFFFh
wn_response db 'GBWN'
            dw 3,0,0,4,0,0
            times 196 db 0
