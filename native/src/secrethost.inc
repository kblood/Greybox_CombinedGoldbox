; Secret HP-only transaction. GBCR3 carries an exact precombat GBPR3 image.
; Immutable GSJ receipt binds request/result/preimage; GSB retains old roster
; across the two DOS renames. Recovery compares whole images, never source SAVs.
sh_apply:
        call sh_initialize
        jc .bad
        cmp byte [secret_request_only], 3
        je sc_prepare
        cmp byte [secret_request_only], 2
        je sc_complete
        jmp .transaction
.transaction:
        mov dx, sh_j
        call sh_exists
        jc .bad
        jnz .recover
        cmp byte [secret_request_only], 1
        je .bad                     ; /S is recovery only, never fresh mutation
        mov dx, sh_b
        call sh_exists
        jc .bad
        jnz .bad
        call sh_load_result
        jc .bad
.fresh_loaded:
        cmp word [fs:14], 0
        jne .bad
        call sh_project
        jc .bad
        mov dx, rosterpath
        call sh_compare_pre
        jc .bad
        or ax, ax
        jnz .bad
        call sh_write_post
        jc .bad
        call sh_write_receipt
        jc .bad
        mov dx, sh_t
        mov di, sh_j
        call sh_rename
        jc .bad
        jmp .recover
.bad:
        stc
        ret

sh_initialize:
        push cs
        pop es
        mov bx, (stacktop-$$+100h+15)/16
        mov ah, 4Ah
        int 21h
        jc .bad
        mov bx, 4096
        mov ah, 48h
        int 21h
        jc .bad
        mov fs, ax
        mov bx, 2048
        mov ah, 48h
        int 21h
        jc .bad
        mov gs, ax
        call sh_paths
        ret
.bad:
        stc
        ret

sh_apply.recover:
        call sh_load_receipt
        jc .bad
        call sh_project
        jc .bad
        call sh_match_result
        jc .bad
        mov dx, sh_b
        call sh_compare_pre
        jc .bad
        mov [sh_backup_kind], ax
        cmp ax, 1
        je .bad
        mov dx, rosterpath
        call sh_compare_post
        jc .bad
        or ax, ax
        jz .finalize
        cmp word [sh_consumed], 0
        jne .bad
        cmp ax, 2
        je .missing_roster
        mov dx, rosterpath
        call sh_compare_pre
        jc .bad
        or ax, ax
        jnz .bad
        cmp word [sh_backup_kind], 2
        jne .bad
        call sh_write_post
        jc .bad
        mov dx, rosterpath
        mov di, sh_b
        call sh_rename
        jc .bad
        jmp .publish
.missing_roster:
        cmp word [sh_backup_kind], 0
        jne .bad
        call sh_write_post
        jc .bad
.publish:
        mov dx, sh_n
        mov di, rosterpath
        call sh_rename
        jc .bad
        mov dx, rosterpath
        call sh_compare_post
        jc .bad
        or ax, ax
        jnz .bad
.finalize:
        call sh_consume
        jc .bad
        mov dx, sh_b
        call sh_delete
        jc .bad
        mov dx, sh_n
        call sh_delete
        jc .bad
        mov dx, sh_t
        call sh_delete
        jc .bad
        mov dx, sh_j
        call sh_delete
        jc .bad
        cmp byte [secret_request_only], 2
        je sc_retire
        clc
        ret
.bad:
        stc
        ret

; Reserve four same-directory engine siblings; Secret owned rosters use GBP.
sh_paths:
        mov si, rosterpath
        mov di, sh_j
        call sh_path
        jc .bad
        mov dword [di], '.GSJ'
        mov si, rosterpath
        mov di, sh_t
        call sh_path
        jc .bad
        mov dword [di], '.GST'
        mov si, rosterpath
        mov di, sh_n
        call sh_path
        jc .bad
        mov dword [di], '.GSN'
        mov si, rosterpath
        mov di, sh_b
        call sh_path
        jc .bad
        mov dword [di], '.GSB'
        mov si, rosterpath
        mov di, sc_c
        call sh_path
        jc .bad
        mov dword [di], '.GSC'
        mov si, rosterpath
        mov di, sc_d
        call sh_path
        jc .bad
        mov dword [di], '.GSD'
        ; No transaction path may alias the request/result/effect.
        mov bx, sh_j
.sibling:
        mov si, bx
        mov di, request_name
        call sh_path_equal
        je .bad
        mov si, bx
        mov di, combatresultpath
        call sh_path_equal
        je .bad
        mov si, bx
        mov di, effectpath
        call sh_path_equal
        je .bad
        add bx, PATH_MAX
        cmp bx, sc_d+PATH_MAX
        jb .sibling
        clc
        ret
.bad:
        stc
        ret
sh_path:
        mov cx, PATH_MAX
.copy:
        lodsb
        stosb
        or al, al
        jz .end
        loop .copy
        stc
        ret
.end:
        cmp cx, PATH_MAX-4
        ja .bad
        sub di, 5
        cmp byte [di], '.'
        jne .bad
        mov al, [di+1]
        and al, 0DFh
        cmp al, 'G'
        jne .bad
        mov al, [di+2]
        and al, 0DFh
        cmp al, 'B'
        jne .bad
        mov al, [di+3]
        and al, 0DFh
        cmp al, 'P'
        jne .bad
        clc
        ret
.bad:
        stc
        ret
sh_path_equal:
.byte:
        lodsb
        mov ah, [di]
        inc di
        cmp al, 'a'
        jb .left
        cmp al, 'z'
        ja .left
        sub al, 32
.left:
        cmp ah, 'a'
        jb .right
        cmp ah, 'z'
        ja .right
        sub ah, 32
.right:
        cmp al, ah
        jne .done
        or al, al
        jnz .byte
.done:
        ret

sh_exists:
        mov ax, 3D00h
        int 21h
        jnc .present
        cmp ax, 2
        jne .bad
        xor ax, ax
        ret
.present:
        mov bx, ax
        mov ah, 3Eh
        int 21h
        jc .bad
        mov ax, 1
        or ax, ax
        ret
.bad:
        stc
        ret

sh_load_result:
        mov byte [sh_result_missing], 0
        mov dx, combatresultpath
        mov ax, 3D00h
        int 21h
        jnc .opened
        cmp ax, 2
        jne sh_bad
        mov byte [sh_result_missing], 1
        jmp sh_bad
.opened:
        mov [sh_fh], ax
        mov bx, ax
        mov ax, 4202h
        xor cx, cx
        xor dx, dx
        int 21h
        jc sh_close_bad
        or dx, dx
        jnz sh_close_bad
        cmp ax, 16
        jb sh_close_bad
        cmp ax, 16+36+SR_MAX
        ja sh_close_bad
        mov [sh_result_length], ax
        mov bx, [sh_fh]
        mov ax, 4200h
        xor cx, cx
        xor dx, dx
        int 21h
        jc sh_close_bad
        mov bx, [sh_fh]
        mov cx, [sh_result_length]
        xor dx, dx
        push ds
        push fs
        pop ds
        mov ah, 3Fh
        int 21h
        pop ds
        jc sh_close_bad
        cmp ax, [sh_result_length]
        jne sh_close_bad
        jmp sh_close

; FS contains complete GBCR3; GS receives its preimage and then HP-only post.
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

; Exact file comparison: ES:SI/CX expected, AX=0 equal/1 different/2 absent.
sh_compare_pre:
        push fs
        pop es
        mov si, [sh_pre_offset]
        mov cx, [sr_length]
        jmp sh_compare
sh_compare_post:
        push gs
        pop es
        xor si, si
        mov cx, [sr_length]
sh_compare:
        mov [sh_cmp_left], cx
        mov [sh_cmp_offset], si
        mov [sh_cmp_seg], es
        mov ax, 3D00h
        int 21h
        jnc .opened
        cmp ax, 2
        jne sh_bad
        clc
        ret
.opened:
        mov [sh_fh], ax
.chunk:
        mov cx, [sh_cmp_left]
        cmp cx, 512
        jbe .bounded
        mov cx, 512
.bounded:
        mov [sh_chunk], cx
        mov bx, [sh_fh]
        mov dx, sh_io
        mov ah, 3Fh
        int 21h
        jc sh_close_bad
        cmp ax, [sh_chunk]
        jne .different
        mov es, [sh_cmp_seg]
        mov di, [sh_cmp_offset]
        mov si, sh_io
        mov cx, [sh_chunk]
        repe cmpsb
        jne .different
        mov ax, [sh_chunk]
        add [sh_cmp_offset], ax
        sub [sh_cmp_left], ax
        jnz .chunk
        mov bx, [sh_fh]
        mov dx, sh_io
        mov cx, 1
        mov ah, 3Fh
        int 21h
        jc sh_close_bad
        or ax, ax
        jnz .different
        xor ax, ax
        jmp .finish
.different:
        mov ax, 1
.finish:
        push ax
        call sh_close
        pop ax
        ret

sh_write_post:
        push gs
        pop es
        xor si, si
        mov cx, [sr_length]
        mov dx, sh_n
        call sh_write_bank
        jc sh_bad
        mov dx, sh_n
        call sh_compare_post
        jc sh_bad
        or ax, ax
        jnz sh_bad
        clc
        ret

; Only reserved N/T scratch uses CREATE. Authoritative P/B/J never truncate.
sh_write_bank:
        mov [sh_cmp_seg], es
        mov [sh_cmp_offset], si
        mov [sh_chunk], cx
        xor cx, cx
        mov ah, 3Ch
        int 21h
        jc sh_bad
        mov [sh_fh], ax
        mov bx, ax
        mov cx, [sh_chunk]
        mov dx, [sh_cmp_offset]
        push ds
        mov ds, [sh_cmp_seg]
        mov ah, 40h
        int 21h
        pop ds
        jc sh_close_bad
        cmp ax, [sh_chunk]
        jne sh_close_bad
        jmp sh_flush_close

sh_write_receipt:
        mov ax, [sh_result_length]
        mov [sh_header+6], ax
        mov dx, sh_t
        xor cx, cx
        mov ah, 3Ch
        int 21h
        jc sh_bad
        mov [sh_fh], ax
        mov dx, sh_header
        mov cx, 8
        call sh_write
        jc sh_close_bad
        mov dx, request
        mov cx, GBHR_LEN
        call sh_write
        jc sh_close_bad
        mov bx, [sh_fh]
        mov cx, [sh_result_length]
        xor dx, dx
        push ds
        push fs
        pop ds
        mov ah, 40h
        int 21h
        pop ds
        jc sh_close_bad
        cmp ax, [sh_result_length]
        jne sh_close_bad
        jmp sh_flush_close

sh_load_receipt:
        mov dx, sh_j
        mov ax, 3D00h
        int 21h
        jc sh_bad
        mov [sh_fh], ax
        mov dx, sh_header
        mov cx, 8
        call sh_read
        jc sh_close_bad
        cmp dword [sh_header], 'GSJ1'
        jne sh_close_bad
        cmp word [sh_header+4], 1
        jne sh_close_bad
        mov ax, [sh_header+6]
        cmp ax, 16
        jb sh_close_bad
        cmp ax, 16+36+SR_MAX
        ja sh_close_bad
        mov [sh_result_length], ax
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
        mov cx, [sh_result_length]
        xor dx, dx
        push ds
        push fs
        pop ds
        mov ah, 3Fh
        int 21h
        pop ds
        jc sh_close_bad
        cmp ax, [sh_result_length]
        jne sh_close_bad
        mov dx, sh_io
        mov cx, 1
        call sh_read_eof
        jc sh_close_bad
        jmp sh_close

; Compare current result with journal FS bytes, allowing only consumed0/1.
sh_match_result:
        mov dx, combatresultpath
        mov ax, 3D00h
        int 21h
        jc sh_bad
        mov [sh_fh], ax
        mov dx, sh_io
        mov cx, 16
        call sh_read
        jc sh_close_bad
        mov ax, [sh_io+14]
        cmp ax, 1
        ja sh_close_bad
        mov [sh_consumed], ax
        mov word [sh_io+14], 0
        push fs
        pop es
        mov si, sh_io
        xor di, di
        mov cx, 16
        repe cmpsb
        jne sh_close_bad
        mov word [sh_cmp_offset], 16
        mov ax, [sh_result_length]
        sub ax, 16
        mov [sh_cmp_left], ax
.chunk:
        mov cx, [sh_cmp_left]
        cmp cx, 512
        jbe .bounded
        mov cx, 512
.bounded:
        mov [sh_chunk], cx
        mov dx, sh_io
        call sh_read
        jc sh_close_bad
        push fs
        pop es
        mov di, [sh_cmp_offset]
        mov si, sh_io
        mov cx, [sh_chunk]
        repe cmpsb
        jne sh_close_bad
        mov ax, [sh_chunk]
        add [sh_cmp_offset], ax
        sub [sh_cmp_left], ax
        jnz .chunk
        mov dx, sh_io
        mov cx, 1
        call sh_read_eof
        jc sh_close_bad
        jmp sh_close

sh_consume:
        call sh_match_result
        jc sh_bad
        cmp word [sh_consumed], 1
        je .ok
        mov dx, combatresultpath
        mov ax, 3D02h
        int 21h
        jc sh_bad
        mov [sh_fh], ax
        mov bx, ax
        mov ax, 4200h
        xor cx, cx
        mov dx, 14
        int 21h
        jc sh_close_bad
        mov dx, sh_one
        mov cx, 2
        call sh_write
        jc sh_close_bad
        call sh_flush_close
        jc sh_bad
        call sh_match_result
        jc sh_bad
        cmp word [sh_consumed], 1
        jne sh_bad
.ok:
        clc
        ret

sh_read:
        mov bx, [sh_fh]
        mov ah, 3Fh
        int 21h
        jc sh_bad
        cmp ax, cx
        jne sh_bad
        ret
sh_read_eof:
        mov bx, [sh_fh]
        mov ah, 3Fh
        int 21h
        jc sh_bad
        or ax, ax
        jnz sh_bad
        ret
sh_write:
        mov bx, [sh_fh]
        mov ah, 40h
        int 21h
        jc sh_bad
        cmp ax, cx
        jne sh_bad
        ret
sh_flush_close:
        mov bx, [sh_fh]
        mov ah, 68h
        int 21h
        jc sh_close_bad
sh_close:
        mov bx, [sh_fh]
        mov ah, 3Eh
        int 21h
        push ds
        pop es
        ret
sh_close_bad:
        call sh_close
sh_bad:
        stc
        ret
sh_rename:
        push ds
        pop es
        mov ah, 56h
        int 21h
        ret
sh_delete:
        mov ah, 41h
        int 21h
        jnc .ok
        cmp ax, 2
        jne sh_bad
.ok:
        clc
        ret

sh_header db 'GSJ1'
        dw 1, 0
sh_j times PATH_MAX db 0
sh_t times PATH_MAX db 0
sh_n times PATH_MAX db 0
sh_b times PATH_MAX db 0
sc_c times PATH_MAX db 0
sc_d times PATH_MAX db 0
sh_io times 512 db 0
sh_fh dw 0
sh_result_length dw 0
sh_pre_offset dw 0
sh_backup_kind dw 0
sh_consumed dw 0
sh_cmp_seg dw 0
sh_cmp_offset dw 0
sh_cmp_left dw 0
sh_chunk dw 0
sh_one dw 1
sh_result_missing db 0
%include "secretroster.inc"
%include "secretcompletion.inc"
