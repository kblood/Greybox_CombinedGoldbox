; Public /R narrow durable-final boundary. A successful private transaction
; is NOT READY: kn_resume must freshly admit GSK3 and emit the ordinary GBNR.
kn_final_recover:
        mov si, kn_authority
        mov di, kn_descriptor
        call kn_copy_path
        mov si, kn_descriptor
        call kn_extension
        jc .bad
        mov dword [di], 'GRJ'
        mov dx, kn_descriptor
        call kc_probe
        jc .bad
        test ax, ax
        jz .legacy             ; legacy KR rejects present GSK4, never absence
        cmp byte [kn_mode], 'R'
        jne .bad               ; all other resume modes preserve pending J
        mov dx, kn_descriptor
        call rr_index
        jc .bad
        cmp word [rr_header+6], 2
        jne .close_bad
        cmp word [rr_header+28], 19
        jne .close_bad         ; no ordinary/ENTRY/AWARD public grant here
        call kc_close
        jc .bad
        ; Independently derive ITEM from the parsed canonical source directory.
        mov si, kn_expected_source
        mov di, kn_alias_path
        call kn_copy_path
        mov si, kn_alias_path
        mov di, si
.directory:
        lodsb
        test al, al
        jz .item
        cmp al, 05ch
        jne .directory
        mov di, si
        jmp .directory
.item:
        mov ax, kn_alias_path+112
        sub ax, di
        cmp ax, 9
        jb .bad
        mov cx, ax
        push di
        xor ax, ax
        rep stosb
        pop di
        mov dword [di], 'ITEM'
        mov dword [di+4], '.GLB'
        mov si, kn_authority
        mov di, kn_expected_roster
        mov bx, kn_expected_source
        mov bp, kn_alias_path
        mov dx, stacktop
        call rcommit_recover4
        jc .bad
.legacy:
        clc
        ret
.close_bad:
        call kc_close
.bad:  stc
        ret
