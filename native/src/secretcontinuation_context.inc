; Pure GBCX1 admission shared by CCNEXT and GBBOOT.
; SI=32-byte context, AX=expected interactive mode. CF=failure.
; No writes or filesystem authority; SI/ES and BX/CX/DX/DI are preserved.
scx_validate:
        push bx
        push cx
        push dx
        push di
        cmp ax, 1
        ja .bad
        cmp dword [si], 'GBCX'
        jne .bad
        cmp dword [si+4], 00200001h
        jne .bad
        cmp ax, [si+24]
        jne .bad
        cmp word [si+26], 0
        jne .bad
        cmp dword [si+28], 0
        jne .bad
        mov bx, [si+8]
        cmp bx, 007fh
        ja .bad
        mov dx, bx
        and dx, 0044h
        jz .coupled
        cmp dx, 0044h
        jne .bad
.coupled:
        lea di, [si+10]
        mov cx, 6
.field:
        mov ax, [di]
        cmp cx, 4
        ja .presence
        cmp ax, 255
        ja .bad
.presence:
        test bx, 1
        jnz .next
        test ax, ax
        jnz .bad
.next:
        shr bx, 1
        add di, 2
        loop .field
        mov ax, [si+22]
        test word [si+8], 0040h
        jnz .host
        test ax, ax
        jnz .bad
        jmp .ok
.host:
        xor ah, ah
        cmp ax, [si+14]
        jne .bad
.ok:
        clc
        jmp .return
.bad:
        stc
.return:
        pop di
        pop dx
        pop cx
        pop bx
        ret
