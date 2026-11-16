; CCPARTY /S: explicit Secret loose-pregen import or cold native roster load.
; All file staging precedes publication; original SAV/STF/SFX are read-only.
secret_party_main:
        cmp byte [title_id_invalid], 0
        jne .bad
        cmp word [title_id], 0
        jne .bad
        cmp byte [dokmode], 0
        jne .bad
        cmp byte [qsvmode], 0
        jne .bad
        cmp byte [createmode], 0
        jne .bad
        cmp byte [menumode], 0
        jne .bad
        call spp_check_pending
        jc .bad
        mov bx, 1000h
        mov ah, 4Ah
        int 21h
        jc .bad
        mov bx, SR_MAX/16
        mov ah, 48h
        int 21h
        jc .bad
        mov gs, ax
        mov dx, outname
        call sr_read
        jnc .cold                   ; native-owned HP state outranks retail import
        cmp byte [sr_missing], 1
        jne .bad
        push es
        push gs
        pop es
        xor di, di
        xor ax, ax
        mov cx, SR_MAX/2
        rep stosw
        pop es
        mov dword [gs:0], 'GBPR'
        mov word [gs:4], 3
        mov word [gs:6], 6
        mov word [gs:8], SR_ROW
        mov word [gs:10], 2
        mov word [gs:12], 4
        mov word [gs:14], 1
        mov byte [spp_slot], 1
.source:
        mov al, [spp_slot]
        add al, '0'
        mov [spp_source+7], al
        mov ax, 3D00h
        mov dx, spp_source
        int 21h
        jc .bad
        mov bx, ax
        mov [spp_fh], ax
        mov ah, 3Fh
        mov cx, 440
        mov dx, spp_source_body
        int 21h
        pushf
        push ax
        mov ah, 3Eh
        int 21h
        pop ax
        popf
        jc .bad
        cmp ax, 439
        jne .bad
        mov byte [spp_source_body+439], 0
        movzx ax, byte [spp_slot]
        dec ax
        imul ax, ax, SR_ROW
        add ax, SR_HEADER
        mov di, ax
        mov al, [spp_slot]
        mov [gs:di], al
        inc di
        mov si, spp_source_body
        mov cx, 439
.body:
        lodsb
        mov [gs:di], al
        inc di
        loop .body
        inc byte [spp_slot]
        cmp byte [spp_slot], 7
        jb .source
        mov di, SR_HEADER+6*SR_ROW
        mov dword [gs:di], 'GBSA'
        mov word [gs:di+4], 1
        mov word [gs:di+6], 6
        mov word [gs:di+8], 2048
        add di, 16
        mov [spp_cursor], di
        call spp_read_catalog
        jc .bad
        mov si, spp_catalog
        mov di, [spp_cursor]
        mov cx, 2048
.catalog:
        lodsb
        mov [gs:di], al
        inc di
        loop .catalog
        mov [spp_cursor], di
        mov byte [spp_slot], 1
.companions:
        mov di, [spp_cursor]
        mov [spp_block], di
        mov al, [spp_slot]
        mov [gs:di], al
        add di, 8
        mov [spp_cursor], di
        mov al, [spp_slot]
        add al, '0'
        mov [spp_stf_name+7], al
        mov [spp_sfx_name+7], al
        mov dx, spp_stf_name
        call spp_companion
        jc .bad
        mov di, [spp_block]
        mov [gs:di+2], ax
        mov dx, spp_sfx_name
        call spp_companion
        jc .bad
        mov di, [spp_block]
        mov [gs:di+4], ax
        inc byte [spp_slot]
        cmp byte [spp_slot], 7
        jb .companions
        mov ax, [spp_cursor]
        mov [sr_length], ax
        mov [gs:SR_HEADER+6*SR_ROW+10], ax
        call sr_validate
        jc .bad
        call spp_validate_stats
        jc .bad
        call spp_publish
        jc .bad
        jmp .ok
.cold:
        call spp_validate_stats
        jc .bad
.ok:
        mov si, spp_loaded
        call puts
        mov ax, 4C00h
        int 21h
.bad:
        mov si, spp_invalid
        call puts
        mov ax, 4C01h
        int 21h

; DX companion -> AX length; only DOS file-not-found means valid absence.
spp_companion:
        mov ax, 3D00h
        int 21h
        jnc .open
        cmp ax, 2
        jne .bad
        xor ax, ax
        clc
        ret
.open:
        mov [spp_fh], ax
        mov bx, ax
        mov ax, 4202h
        xor cx, cx
        xor dx, dx
        int 21h
        jc .close_bad
        or dx, dx
        jnz .close_bad
        mov [spp_size], ax
        add ax, [spp_cursor]
        jc .close_bad
        cmp ax, SR_MAX
        ja .close_bad
        mov bx, [spp_fh]
        mov ax, 4200h
        xor cx, cx
        xor dx, dx
        int 21h
        jc .close_bad
        mov bx, [spp_fh]
        mov dx, [spp_cursor]
        mov cx, [spp_size]
        push ds
        push gs
        pop ds
        mov ah, 3Fh
        int 21h
        pop ds
        jc .close_bad
        cmp ax, [spp_size]
        jne .close_bad
        mov bx, [spp_fh]
        mov ah, 3Eh
        int 21h
        jc .bad
        mov ax, [spp_size]
        add [spp_cursor], ax
        clc
        ret
.close_bad:
        mov bx, [spp_fh]
        mov ah, 3Eh
        int 21h
.bad:
        stc
        ret

spp_validate_stats:
        mov si, [sr_catalog]
        mov di, spp_catalog
        mov cx, 2048
.catalog:
        mov al, [gs:si]
        inc si
        stosb
        loop .catalog
        mov word [spp_index], 0
.row:
        mov ax, [spp_index]
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
        mov bx, [spp_index]
        shl bx, 1
        mov cx, [sr_stf_len+bx]
        mov bx, [sr_stf+bx]
        mov si, spp_source_body
        mov di, spp_catalog
        call sp_calculate
        jc .bad
        inc word [spp_index]
        jmp .row
.done:
        clc
        ret
.bad:
        stc
        ret

; New roster only. DOS create-new refuses to truncate a concurrent writer.
; Closed staging file is renamed to the absent final path in the same directory.
spp_publish:
        mov si, outname
        mov di, spp_temp
        xor bx, bx
.path:
        lodsb
        cmp di, spp_temp+107
        jae .bad
        stosb
        or al, al
        jz .suffix
        cmp al, '\'
        je .boundary
        cmp al, ':'
        je .boundary
        cmp al, '.'
        jne .path
        mov bx, di
        dec bx
        jmp .path
.boundary:
        xor bx, bx
        jmp .path
.suffix:
        dec di
        or bx, bx
        jz .at_end
        mov di, bx
.at_end:
        mov dword [di], '.TMP'
        mov byte [di+4], 0
        mov dx, spp_temp
        xor cx, cx
        mov ax, 5B00h
        int 21h
        jc .bad
        mov [spp_fh], ax
        mov bx, ax
        mov cx, [sr_length]
        xor dx, dx
        push ds
        push gs
        pop ds
        mov ah, 40h
        int 21h
        pop ds
        jc .close_bad
        cmp ax, [sr_length]
        jne .close_bad
        mov bx, [spp_fh]
        mov ah, 3Eh
        int 21h
        jc .remove_bad
        mov dx, spp_temp
        mov di, outname
        mov ah, 56h
        int 21h
        jc .remove_bad
        clc
        ret
.close_bad:
        mov bx, [spp_fh]
        mov ah, 3Eh
        int 21h
.remove_bad:
        mov dx, spp_temp
        mov ah, 41h
        int 21h
.bad:
        stc
        ret

spp_source db 'CHRDATA1.SAV',0
spp_stf_name db 'CHRDATA1.STF',0
spp_sfx_name db 'CHRDATA1.SFX',0
spp_check_pending:
        mov si, outname
        mov di, spp_pending
        mov cx, 112
.copy:
        lodsb
        stosb
        or al, al
        jz .suffix
        loop .copy
        jmp .bad
.suffix:
        cmp cx, 108
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
        mov dword [di], '.GSJ'
        mov [spp_pending_end], di
        call .probe
        jc .bad
        mov di, [spp_pending_end]
        mov byte [di+3], 'B'
        call .probe
        jc .bad
        mov di, [spp_pending_end]
        mov byte [di+3], 'C'
        call .probe
        ret
.probe:
        mov dx, spp_pending
        mov ax, 3D00h
        int 21h
        jnc .present
        cmp ax, 2
        jne .bad
        clc
        ret
.present:
        mov bx, ax
        mov ah, 3Eh
        int 21h
.bad:
        stc
        ret

spp_read_catalog:
        mov dx, spp_catalog_name
        mov ax, 3D00h
        int 21h
        jnc .opened
        cmp ax, 2
        jne .bad
        mov dx, spp_disk_catalog_name
        mov ax, 3D00h
        int 21h
        jc .bad
.opened:
        mov [spp_fh], ax
        mov bx, ax
        mov ah, 3Fh
        mov cx, 2049
        mov dx, spp_catalog
        int 21h
        jc .close_bad
        cmp ax, 2048
        jne .close_bad
        mov bx, [spp_fh]
        mov ah, 3Eh
        int 21h
        ret
.close_bad:
        mov bx, [spp_fh]
        mov ah, 3Eh
        int 21h
.bad:
        stc
        ret

spp_catalog_name db 'ITEMS.DAT',0
spp_disk_catalog_name db '..\DISK1\ITEMS.DAT',0
spp_loaded db 'CCPARTY: Secret owned roster ready',13,10,0
spp_invalid db 'CCPARTY: invalid Secret roster/import',13,10,0
spp_slot db 0
spp_index dw 0
spp_cursor dw 0
spp_block dw 0
spp_size dw 0
spp_fh dw 0
spp_source_body times 440 db 0
spp_catalog times 2049 db 0
spp_temp times 112 db 0
spp_pending times 112 db 0
spp_pending_end dw 0
%include "secretroster.inc"
%include "secretstats.inc"
%include "secretplayerstats.inc"
