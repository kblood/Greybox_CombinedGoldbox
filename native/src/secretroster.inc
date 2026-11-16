; GBPRv3/Secret title4/schema1, row440 = source slot + complete SAV439.
; GS holds the full bounded native-owned image. Companion trailer is GBSA1:
; header16(count, catalog2048, totalLength, reserved0), catalog, then count
; blocks(slot,reserved0,STF length,SFX length,reserved0) and exact raw bytes.
; sr_read: DX=filename -> image in GS, sr_length, CF. No source/save writes.
; sr_validate: whole image -> sr_count/catalog/STF/SFX offsets, CF.
SR_MAX equ 32768
SR_ROW equ 440
SR_HEADER equ 16
sr_read:
        mov byte [sr_missing], 0
        mov ax, 3D00h
        int 21h
        jnc .opened
        cmp ax, 2
        jne .bad
        mov byte [sr_missing], 1
        jmp .bad
.opened:
        mov [sr_fh], ax
        mov bx, ax
        mov ax, 4202h
        xor cx, cx
        xor dx, dx
        int 21h
        jc .close_bad
        or dx, dx
        jnz .close_bad
        cmp ax, SR_MAX
        ja .close_bad
        cmp ax, 16
        jb .close_bad
        mov [sr_length], ax
        mov bx, [sr_fh]
        mov ax, 4200h
        xor cx, cx
        xor dx, dx
        int 21h
        jc .close_bad
        mov bx, [sr_fh]
        mov cx, [sr_length]
        xor dx, dx
        push ds
        push gs
        pop ds
        mov ah, 3Fh
        int 21h
        pop ds
        jc .close_bad
        cmp ax, [sr_length]
        jne .close_bad
        mov bx, [sr_fh]
        mov ah, 3Eh
        int 21h
        jc .bad
        jmp sr_validate
.close_bad:
        mov bx, [sr_fh]
        mov ah, 3Eh
        int 21h
.bad:
        stc
        ret

sr_validate:
        cmp dword [gs:0], 'GBPR'
        jne .bad
        cmp word [gs:4], 3
        jne .bad
        cmp word [gs:8], SR_ROW
        jne .bad
        cmp word [gs:10], 2
        jne .bad
        cmp word [gs:12], 4
        jne .bad
        cmp word [gs:14], 1
        jne .bad
        mov cx, [gs:6]
        cmp cx, 1
        jb .bad
        cmp cx, 6
        ja .bad
        mov [sr_count], cx
        mov ax, cx
        imul ax, ax, SR_ROW
        add ax, SR_HEADER
        mov [sr_trailer], ax
        add ax, 16+2048
        jc .bad
        cmp ax, [sr_length]
        ja .bad
        mov si, SR_HEADER
        mov word [sr_seen], 0
.row:
        movzx bx, byte [gs:si]
        cmp bx, 1
        jb .bad
        cmp bx, 6
        ja .bad
        dec bx
        bt word [sr_seen], bx
        jc .bad
        bts word [sr_seen], bx
        movzx dx, byte [gs:si+1]
        cmp dx, 1
        jb .bad
        cmp dx, 15
        ja .bad
        push si
        add si, 2
.name:
        cmp byte [gs:si], 32
        jb .name_bad
        cmp byte [gs:si], 127
        jae .name_bad
        inc si
        dec dx
        jnz .name
        pop si
        cmp byte [gs:si+1+17], 25
        ja .bad
        add si, SR_ROW
        loop .row
        mov si, [sr_trailer]
        cmp dword [gs:si], 'GBSA'
        jne .bad
        cmp word [gs:si+4], 1
        jne .bad
        mov ax, [sr_count]
        cmp [gs:si+6], ax
        jne .bad
        cmp word [gs:si+8], 2048
        jne .bad
        mov ax, [sr_length]
        cmp [gs:si+10], ax
        jne .bad
        cmp dword [gs:si+12], 0
        jne .bad
        add si, 16
        mov [sr_catalog], si
        add si, 2048
        mov word [sr_index], 0
.block:
        mov bx, [sr_index]
        cmp bx, [sr_count]
        jae .done
        mov ax, [sr_length]
        sub ax, si
        cmp ax, 8
        jb .bad
        mov ax, bx
        imul ax, ax, SR_ROW
        add ax, SR_HEADER
        mov di, ax
        mov al, [gs:di]
        cmp [gs:si], al
        jne .bad
        cmp byte [gs:si+1], 0
        jne .bad
        cmp word [gs:si+6], 0
        jne .bad
        shl bx, 1
        mov ax, [gs:si+2]
        mov [sr_stf_len+bx], ax
        mov dx, [gs:si+4]
        mov [sr_sfx_len+bx], dx
        add si, 8
        mov [sr_stf+bx], si
        add si, ax
        jc .bad
        mov [sr_sfx+bx], si
        add si, dx
        jc .bad
        cmp si, [sr_length]
        ja .bad
        push si
        mov ax, [sr_sfx_len+bx]
        xor dx, dx
        mov cx, 9
        div cx
        or dx, dx
        jnz .stride_bad
        mov si, [sr_stf+bx]
        mov dx, [sr_sfx+bx]
.main:
        cmp si, dx
        je .next
        mov ax, dx
        sub ax, si
        cmp ax, 67
        jb .stride_bad
        cmp byte [gs:si+46], 128
        jae .stride_bad
        xor ax, ax
        cmp byte [gs:si+46], 73
        jne .skip
        mov al, [gs:si+57]
.skip:
        inc ax
        imul ax, ax, 67
        add si, ax
        jc .stride_bad
        cmp si, dx
        ja .stride_bad
        jmp .main
.next:
        pop si
        inc word [sr_index]
        jmp .block
.done:
        cmp si, [sr_length]
        jne .bad
        clc
        ret
.name_bad:
        pop si
        jmp .bad
.stride_bad:
        pop si
.bad:
        stc
        ret

sr_fh dw 0
sr_missing db 0
sr_length dw 0
sr_count dw 0
sr_trailer dw 0
sr_catalog dw 0
sr_seen dw 0
sr_index dw 0
sr_stf times 6 dw 0
sr_stf_len times 6 dw 0
sr_sfx times 6 dw 0
sr_sfx_len times 6 dw 0
