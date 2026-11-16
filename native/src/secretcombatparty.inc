; Explicit Secret owned roster. Project source records and owned main items
; before GS is reused for monster companions. FS MONCHA remains untouched.
; GBCR3 appends this exact precombat image; host persistence changes only HP.
se_roster_catalog:
        mov si, [sr_catalog]
        mov di, se_catalog
        mov cx, 2048
.copy:
        mov al, [gs:si]
        inc si
        stosb
        loop .copy
        ret

se_load_secret_party:
        mov dx, partyname
        call sr_read
        jc .bad
        ; Keep the complete precombat image for the Secret result receipt.
        ; GS is reused by monster auxiliary loading after this projection.
        mov ax, [sr_length]
        mov [se_preimage_length], ax
        mov bx, 2048
        mov ah, 48h
        int 21h
        jc .bad
        mov [se_preimage_seg], ax
        push es
        mov es, ax
        xor si, si
        xor di, di
        mov cx, [sr_length]
        gs rep movsb
        pop es
        call se_roster_catalog
        mov word [ncomb], 0
.row:
        mov ax, [ncomb]
        cmp ax, [sr_count]
        jae .done
        imul ax, ax, SR_ROW
        add ax, SR_HEADER
        mov si, ax
        mov bx, [ncomb]
        mov al, [gs:si]
        mov [party_slots+bx], al
        inc si
        mov di, monraw
        mov cx, 439
.copy:
        mov al, [gs:si]
        inc si
        stosb
        loop .copy
        mov byte [di], 0
        mov bx, [ncomb]
        shl bx, 1
        mov cx, [sr_stf_len+bx]
        mov bx, [sr_stf+bx]
        mov si, monraw
        mov di, se_catalog
        call sp_calculate
        jc .bad
        mov ax, [ncomb]
        imul ax, ax, C_REC
        add ax, comb
        mov di, ax
        push di
        xor ax, ax
        mov cx, C_REC/2
        rep stosw
        pop di
        mov ax, [ncomb]
        mov [di+C_ORD], al
        mov word [di+C_MOVE], DEFAULT_MOVE_CELLS
        mov word [di+C_INIT], 0FFFFh
        mov word [di+C_COL], 3
        add ax, 2
        mov [di+C_ROW], ax
        mov word [di+C_SIZE], 1
        movzx ax, byte [sp_body+437]
        mov [di+C_HP], ax
        movzx ax, byte [sp_body+112]
        mov [di+C_MAXHP], ax
        cmp [di+C_HP], ax
        ja .bad
        cmp word [di+C_HP], 0
        jne .normal
        mov word [di+C_FLAGS], CF_UNCON
.normal:
        mov ax, 60
        movzx bx, byte [ss_body+396]
        sub ax, bx
        mov [di+C_THAC0], ax
        mov ax, 60
        movzx bx, byte [ss_body+397]
        sub ax, bx
        mov [di+C_AC], ax
        movzx ax, byte [ss_body+401]
        mov [di+C_DCOUNT], ax
        movzx ax, byte [ss_body+403]
        mov [di+C_DSIDES], ax
        mov al, [ss_body+405]
        cbw
        mov [di+C_DBONUS], ax
        movzx ax, byte [sp_body+289]
        mov [di+C_HALFATT], ax
        mov al, [sp_body+290]
        mov ah, 80h
        mov [di+C_ATTACKS], ax
        mov bx, [ncomb]
        shl bx, 1
        movzx ax, byte [ss_body+402]
        mov [sec_dcount+bx], ax
        movzx ax, byte [ss_body+404]
        mov [sec_dsides+bx], ax
        mov al, [ss_body+406]
        cbw
        mov [sec_dbonus+bx], ax
        inc word [ncomb]
        jmp .row
.done:
        mov byte [secret_party_loaded], 1
        clc
        ret
.bad:
        stc
        ret

se_preimage_seg dw 0
se_preimage_length dw 0
