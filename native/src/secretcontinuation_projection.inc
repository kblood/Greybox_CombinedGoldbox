; Shared pure admission helpers, source-matched to the existing HP host.
sh_project:
        cmp dword [fs:0], 'GBCR'
        jne sh_bad
        cmp word [fs:4], 3
        jne sh_bad
        cmp word [fs:6], 3
        ja sh_bad
        cmp word [fs:8], 0
        jne sh_bad
        cmp word [fs:14], 0
        jne sh_bad
        mov cx, [fs:10]
        cmp cx, 1
        jb sh_bad
        cmp cx, 6
        ja sh_bad
        mov ax, cx
        imul ax, ax, 6
        add ax, 16
        mov [sh_pre_offset], ax
        mov cx, [fs:12]
        cmp cx, 16
        jb sh_bad
        cmp cx, SR_MAX
        ja sh_bad
        add ax, cx
        jc sh_bad
        cmp ax, [sh_result_length]
        jne sh_bad
        mov [sr_length], cx
        push es
        push gs
        pop es
        mov si, [sh_pre_offset]
        xor di, di
        fs rep movsb
        pop es
        call sr_validate
        jc sh_bad
        mov ax, [sr_count]
        cmp ax, [fs:10]
        jne sh_bad
        xor bx, bx
        mov si, 16
        mov di, SR_HEADER+1
.row:
        cmp [fs:si], bl
        jne sh_bad
        cmp byte [fs:si+1], 3
        ja sh_bad
        movzx ax, byte [gs:di+112]
        cmp [gs:di+437], al
        ja sh_bad
        cmp ax, [fs:si+4]
        jne sh_bad
        mov dx, [fs:si+2]
        cmp dx, ax
        ja sh_bad
        mov [gs:di+437], dl
        inc bx
        add si, 6
        add di, SR_ROW
        cmp bx, [sr_count]
        jb .row
        clc
        ret

sc_validate_hp:
        mov cx, [sr_count]
        mov si, SR_HEADER+1
.row:
        mov al, [gs:si+437]
        cmp al, [gs:si+112]
        ja sh_bad
        add si, SR_ROW
        loop .row
        clc
        ret

v2_count_packed:
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
        jne     .count
        cmp     bp, 255
        jae     .char
.count:
        inc     bp
        jmp     .char
.done:  ret
