; Prelaunch GSC1 intent: header8(version1, rosterLength), exact GBHR346,
; then full GBPR3 preimage. Publish GSD->GSC before allowing combat EXEC.
; /P prepares; /C settles a bound result or cancels a missing-result launch.
sc_prepare:
        mov dx, sh_j
        call sh_exists
        jc sh_bad
        jnz sh_bad
        mov dx, sh_b
        call sh_exists
        jc sh_bad
        jnz sh_bad
        mov dx, sc_c
        call sh_exists
        jc sh_bad
        jnz sh_bad
        call sh_load_result
        jnc .old_result
        cmp byte [sh_result_missing], 1
        jne sh_bad
        jmp .roster
.old_result:
        cmp word [fs:14], 1
        jne sh_bad
        mov word [fs:14], 0
        call sh_project
        jc sh_bad
        mov dx, rosterpath
        call sh_compare_post
        jc sh_bad
        or ax, ax
        jnz sh_bad
        mov dx, combatresultpath
        call sh_delete
        jc sh_bad
.roster:
        mov dx, rosterpath
        call sr_read
        jc sh_bad
        call sc_validate_hp
        jc sh_bad
        mov ax, [sr_length]
        mov [sc_header+6], ax
        mov dx, sc_d
        xor cx, cx
        mov ah, 3Ch
        int 21h
        jc sh_bad
        mov [sh_fh], ax
        mov dx, sc_header
        mov cx, 8
        call sh_write
        jc sh_close_bad
        mov dx, request
        mov cx, GBHR_LEN
        call sh_write
        jc sh_close_bad
        mov bx, [sh_fh]
        mov cx, [sr_length]
        xor dx, dx
        push ds
        push gs
        pop ds
        mov ah, 40h
        int 21h
        pop ds
        jc sh_close_bad
        cmp ax, [sr_length]
        jne sh_close_bad
        call sh_flush_close
        jc sh_bad
        mov dx, sc_d
        call sc_load
        jc sh_bad
        ; Closed scratch must still represent the exact authoritative roster.
        mov dx, rosterpath
        call sh_compare_post
        jc sh_bad
        or ax, ax
        jnz sh_bad
        mov dx, sc_d
        mov di, sc_c
        call sh_rename
        jc sh_bad
        mov dx, sc_c
        call sc_load
        ret

sc_complete:
        mov dx, sc_c
        call sc_load
        jc sh_bad
        mov dx, sh_j
        call sh_exists
        jc sh_bad
        jz .no_journal
        ; GSC preimage/request must bind the journal before any recovery write.
        call sh_load_receipt
        jc sh_bad
        call sc_bind_result
        jc sh_bad
        jmp sh_apply.recover
.no_journal:
        mov dx, sh_b
        call sh_exists
        jc sh_bad
        jnz sh_bad
        call sh_load_result
        jnc .result
        cmp byte [sh_result_missing], 1
        jne sh_bad
        ; Nothing was completed. Restart only if the full preimage is intact.
        mov dx, rosterpath
        call sh_compare_post
        jc sh_bad
        or ax, ax
        jnz sh_bad
        jmp sc_retire
.result:
        call sc_bind_result
        jc sh_bad
        cmp word [fs:14], 0
        je sh_apply.fresh_loaded
        cmp word [fs:14], 1
        jne sh_bad
        ; Publication finished but intent cleanup was interrupted.
        mov word [fs:14], 0
        call sh_project
        jc sh_bad
        mov dx, rosterpath
        call sh_compare_post
        jc sh_bad
        or ax, ax
        jnz sh_bad
sc_retire:
        mov dx, sc_d
        call sh_delete
        jc sh_bad
        mov dx, sc_c
        jmp sh_delete

; DX=GSC/GSD path. Exact request and complete validated preimage -> GS.
sc_load:
        mov ax, 3D00h
        int 21h
        jc sh_bad
        mov [sh_fh], ax
        mov dx, sc_header
        mov cx, 8
        call sh_read
        jc sh_close_bad
        cmp dword [sc_header], 'GSC1'
        jne sh_close_bad
        cmp word [sc_header+4], 1
        jne sh_close_bad
        mov ax, [sc_header+6]
        cmp ax, 16
        jb sh_close_bad
        cmp ax, SR_MAX
        ja sh_close_bad
        mov [sr_length], ax
        mov dx, sh_io
        mov cx, GBHR_LEN
        call sh_read
        jc sh_close_bad
        push ds
        pop es
        mov si, sh_io
        mov di, request
        mov cx, GBHR_LEN
        repe cmpsb
        jne sh_close_bad
        mov bx, [sh_fh]
        mov cx, [sr_length]
        xor dx, dx
        push ds
        push gs
        pop ds
        mov ah, 3Fh
        int 21h
        pop ds
        jc sh_close_bad
        cmp ax, [sr_length]
        jne sh_close_bad
        mov dx, sh_io
        mov cx, 1
        call sh_read_eof
        jc sh_close_bad
        call sh_close
        jc sh_bad
        call sr_validate
        jc sh_bad
        call sc_validate_hp
        jc sh_bad
        mov ax, [sr_length]
        mov [sc_length], ax
        mov ax, [sr_count]
        mov [sc_count], ax
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

; Compare before sh_project overwrites GS with the postimage. The normal
; result projector still validates every actual result row/max/HP afterward.
sc_bind_result:
        cmp dword [fs:0], 'GBCR'
        jne sh_bad
        cmp word [fs:4], 3
        jne sh_bad
        mov ax, [sc_count]
        cmp [fs:10], ax
        jne sh_bad
        imul ax, ax, 6
        add ax, 16
        mov si, ax
        mov dx, [sc_length]
        cmp [fs:12], dx
        jne sh_bad
        add ax, dx
        cmp ax, [sh_result_length]
        jne sh_bad
        push gs
        pop es
        xor di, di
        mov cx, dx
        fs repe cmpsb
        push ds
        pop es
        jne sh_bad
        clc
        ret

sc_header db 'GSC1'
        dw 1, 0
sc_length dw 0
sc_count dw 0
