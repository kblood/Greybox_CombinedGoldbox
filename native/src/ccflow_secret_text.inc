; Secret method-zero GLIB PRINT source resolution. Buffers alias the DAX
; resolver's disjoint lifetime; no accepted raw/packed capacity changes.
select_text_codec:
        cmp word [text_codec], 0
        je .first
        cmp ax, [text_codec]
        jne .bad
.first: mov [text_codec], ax
        clc
        ret
.bad: stc
        ret

load_glib_reference:
        mov ax, 3d00h
        mov dx, sourcepath
        int 21h
        jc .bad
        mov [sourcefh], ax
        mov cx, 16
        mov dx, dax_comp
        call source_read_exact
        jc .close_bad
        cmp dword [dax_comp], 'GLIB'
        jne .close_bad
        cmp word [dax_comp+10], 0100h ; method0, kind1
        jne .close_bad
        cmp dword [dax_comp+12], 'DATA'
        jne .close_bad
        mov eax, [dax_comp+4]
        call text_be32
        mov [text_extent], eax
        mov bx, [sourcefh]
        mov ax, 4202h
        xor cx, cx
        xor dx, dx
        int 21h
        jc .close_bad
        cmp ax, [text_extent]
        jne .close_bad
        cmp dx, [text_extent+2]
        jne .close_bad
        mov ax, [dax_comp+8]
        xchg al, ah
        cmp ax, 2
        jb .close_bad
        cmp ax, 255            ; at most256 POINTERS includingEOF
        ja .close_bad
        mov [text_members], ax
        inc ax
        mov [text_pointers], ax
        shl ax, 2
        mov [text_pointer_bytes], ax
        mov eax, 16
        call text_seek
        jc .close_bad
        mov cx, [text_pointer_bytes]
        mov dx, dax_toc
        call source_read_exact
        jc .close_bad
        mov si, dax_toc
        mov cx, [text_pointers]
        xor edx, edx
.pointers:
        mov eax, [si]
        call text_be32
        cmp eax, edx
        jb .close_bad
        cmp eax, [text_extent]
        ja .close_bad
        mov [si], eax
        mov edx, eax
        add si, 4
        loop .pointers
        cmp eax, [text_extent]
        jne .close_bad
        movzx eax, word [text_pointer_bytes]
        add eax, 16
        cmp [dax_toc], eax
        jb .close_bad
        mov eax, [dax_toc+4]
        sub eax, [dax_toc]
        cmp eax, 2
        jb .close_bad
        cmp eax, 512           ; nativeIDCAP is BYTES
        ja .close_bad
        mov [text_id_bytes], ax
        mov eax, [dax_toc]
        call text_seek
        jc .close_bad
        mov cx, [text_id_bytes]
        mov dx, text_ids
        call source_read_exact
        jc .close_bad
        mov ax, [text_ids]
        xchg al, ah
        cmp ax, 127
        ja .close_bad
        mov [text_id_count], ax
        shl ax, 2
        jc .close_bad
        add ax, 2
        jc .close_bad
        cmp ax, [text_id_bytes]
        jne .close_bad
        mov word [text_match], 0
        mov si, text_ids+2
        mov cx, [text_id_count]
.ids:
        jcxz .found
        mov ax, [si]
        xchg al, ah
        mov dx, [si+2]
        xchg dl, dh
        test dx, dx
        jz .close_bad
        cmp dx, [text_members]
        jae .close_bad
        ; Check ALL area keys, including unrelated rows, for ambiguity.
        mov di, text_ids+2
.unique:
        cmp di, si
        jae .unique_ok
        mov bx, [di]
        xchg bl, bh
        cmp ax, bx
        je .close_bad
        add di, 4
        jmp .unique
.unique_ok:
        cmp ax, [ref_area]
        jne .next_id
        mov [text_match], dx
.next_id:
        add si, 4
        dec cx
        jmp .ids
.found:
        mov bx, [text_match]
        test bx, bx
        jz .close_bad
        shl bx, 2
        mov eax, [dax_toc+bx+4]
        sub eax, [dax_toc+bx]
        cmp eax, 20
        jb .close_bad
        cmp eax, DAX_BLOCK_CAP
        ja .close_bad
        cmp ax, [ref_raw]
        jne .close_bad
        mov [dax_raw_len], ax
        mov eax, [dax_toc+bx]
        call text_seek
        jc .close_bad
        mov cx, [dax_raw_len]
        mov dx, daxbuf
        call source_read_exact
        jc .close_bad
        mov bx, [sourcefh]
        mov ah, 3eh
        int 21h
        ret                   ; checked close remains part of admission
.close_bad:
        mov bx, [sourcefh]
        mov ah, 3eh
        int 21h
.bad: stc
        ret

text_seek:                    ; EAX exactu32 source offset, DOSCX:DX
        mov [text_seek_target], eax
        mov edx, eax
        shr eax, 16
        mov cx, ax
        mov bx, [sourcefh]
        mov ax, 4200h
        int 21h
        jc .bad
        cmp ax, [text_seek_target]
        jne .bad
        cmp dx, [text_seek_target+2]
        jne .bad
        clc
        ret
.bad: stc
        ret

text_be32:
        xchg al, ah
        rol eax, 16
        xchg al, ah
        ret

text_codec dw 0
text_extent dd 0
text_seek_target dd 0
text_members dw 0
text_pointers dw 0
text_pointer_bytes dw 0
text_id_bytes dw 0
text_id_count dw 0
text_match dw 0
text_ids equ dax_toc+1024
