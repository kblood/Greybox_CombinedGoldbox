; Explicit /9 1 Secret Amiga normal-melee profile. Legacy profiles are separate.
se_scan_profile:
        mov byte [secret_profile], 0
        movzx cx, byte [80h]
        mov si, 81h
.scan:
        cmp cx, 2
        jb .ok
        cmp byte [si], '/'
        jne .next
        cmp byte [si+1], '9'
        jne .next
        cmp si, 81h
        je .option
        cmp byte [si-1], ' '
        jne .next
.option:
        cmp byte [secret_profile], 0
        jne .bad
        add si, 2
        sub cx, 2
.space:
        jcxz .bad
        cmp byte [si], ' '
        jne .value
        inc si
        dec cx
        jmp .space
.value:
        cmp byte [si], '1'
        jne .bad
        inc si
        dec cx
        jcxz .set
        cmp byte [si], ' '
        jne .bad
.set:
        mov byte [secret_profile], 1
        jmp .scan
.next:
        inc si
        dec cx
        jmp .scan
.ok:
        cmp byte [secret_profile], 0
        je .done
        cmp byte [emode], 1
        jne .bad
        cmp byte [monmode], 1
        jne .bad
.done:
        clc
        ret
.bad:
        stc
        ret

; Original B520 ->10029 clears counter8DC7 before B56F allocates attacks.
; B5EC ->C34C increments it only after turns. Native round1 is source phase0.
; ((byteRate + ((round-1)&1)) &255)/2, including overflow at255.
se_attacks_this_round:
        mov ah, 0
        test byte [round], 1
        jnz .divide
        inc al
.divide:
        shr ax, 1
        ret

; Original Pascal random helper always advances, including bounds0/1.
se_die:
        movzx ecx, ax
        mov eax, [rng_state]
        imul eax, eax, 08088405h
        inc eax
        mov [rng_state], eax
        shr eax, 16
        xor edx, edx
        test ecx, ecx
        jz .zero
        div ecx
.zero:
        mov ax, dx
        inc ax
        ret

se_setup:
        cmp byte [secret_profile], 0
        je .ok
        mov bx, DAXPARAS
        mov ah, 48h
        int 21h
        jc .bad
        mov gs, ax                   ; independent auxiliary bank; FS stays MONCHA
        cmp byte [partyname], 0
        je .retail_catalog
        mov dx, partyname
        call sr_read
        jc .bad
        call se_roster_catalog
        jmp .report
.retail_catalog:
        mov si, se_catalog_name
        call se_path
        jc .bad
        call se_read_catalog
        jnc .report
        cmp byte [se_catalog_missing], 1
        jne .bad
        ; WHDLoad disk layout: MONCHA is DISK2, catalogue is sibling DISK1.
        mov si, se_disk_catalog
        call se_path
        jc .bad
        call se_read_catalog
        jc .bad
.report:
        mov dx, se_profile_message
        mov ah, 9
        int 21h
.ok:
        clc
        ret
.bad:
        stc
        ret

; SI basename -> se_filename, rooted beside the explicit MONCHA path.
se_path:
        push si
        mov si, monname
        mov di, se_filename
        mov bx, di
        mov cx, 63
.copy:
        lodsb
        or al, al
        jz .base
        stosb
        cmp al, '\'
        jne .forward
        mov bx, di
.forward:
        cmp al, '/'
        jne .continue
        mov bx, di
.continue:
        cmp al, ':'
        jne .next
        mov bx, di
.next:
        loop .copy
        pop si
        stc
        ret
.base:
        mov di, bx
        pop si
.append:
        cmp di, se_filename+95
        jae .bad
        lodsb
        stosb
        or al, al
        jnz .append
        clc
        ret
.bad:
        stc
        ret

se_read_catalog:
        mov byte [se_catalog_missing], 0
        mov dx, se_filename
        mov ax, 3D00h
        int 21h
        jnc .opened
        cmp ax, 2
        je .missing
        cmp ax, 3
        jne .bad
.missing:
        mov byte [se_catalog_missing], 1
        jmp .bad
.opened:
        mov bx, ax
        push bx
        mov dx, se_catalog
        mov cx, 2049
        mov ah, 3Fh
        int 21h
        pushf
        push ax
        mov ah, 3Eh
        int 21h
        pop ax
        popf
        pop bx
        jc .bad
        cmp ax, 2048
        jne .bad
        clc
        ret
.bad:
        stc
        ret

; Read whole auxiliary file into GS; do not touch FS or MONCHA metadata.
se_read_aux:
        call se_path
        jc .bad
        mov dx, se_filename
        mov ax, 3D00h
        int 21h
        jc .bad
        mov [se_fh], ax
        mov bx, ax
        mov ax, 4202h
        xor cx, cx
        xor dx, dx
        int 21h
        jc .close_bad
        or dx, dx
        jnz .close_bad
        cmp ax, 16
        jb .close_bad
        cmp ax, DAX_FILEMAX
        ja .close_bad
        mov [se_file_len], ax
        mov bx, [se_fh]
        mov ax, 4200h
        xor cx, cx
        xor dx, dx
        int 21h
        jc .close_bad
        mov bx, [se_fh]
        mov cx, [se_file_len]
        xor dx, dx
        push ds
        push gs
        pop ds
        mov ah, 3Fh
        int 21h
        pop ds
        jc .close_bad
        cmp ax, [se_file_len]
        jne .close_bad
        mov bx, [se_fh]
        mov ah, 3Eh
        int 21h
        jc .bad
        jmp se_find_member
.close_bad:
        mov bx, [se_fh]
        mov ah, 3Eh
        int 21h
.bad:
        stc
        ret

; GS=complete GLIB, se_file_len=actual size, want_mon=logical ID.
; Validate the whole pointer/id table. SI/CX=raw member; CX=0 means absent ID.
; One external alignment byte beyond the final pointer is not member payload.
se_find_member:
        cmp word [gs:0], 'GL'
        jne .bad
        cmp word [gs:2], 'IB'
        jne .bad
        cmp word [gs:12], 'DA'
        jne .bad
        cmp word [gs:14], 'TA'
        jne .bad
        cmp byte [gs:10], 0
        jne .bad
        cmp byte [gs:11], 1
        jne .bad
        cmp word [gs:4], 0
        jne .bad
        mov ax, [gs:6]
        xchg al, ah
        cmp ax, [se_file_len]
        jne .bad
        mov ax, [gs:8]
        xchg al, ah
        inc ax
        cmp ax, 3
        jb .bad
        cmp ax, HLIB_PTRCAP
        ja .bad
        mov [se_ptr_count], ax
        mov cx, ax
        shl ax, 2
        add ax, 16
        cmp ax, [se_file_len]
        ja .bad
        mov dx, ax
        mov bx, 16
.ptr:
        cmp word [gs:bx], 0
        jne .bad
        mov ax, [gs:bx+2]
        xchg al, ah
        cmp ax, dx
        jb .bad
        cmp ax, [se_file_len]
        ja .bad
        mov dx, ax
        add bx, 4
        loop .ptr
        mov ax, [se_file_len]
        sub ax, dx
        cmp ax, 1
        ja .bad
        or ax, ax
        jz .ids
        test dl, 1
        jz .bad
.ids:
        mov si, [gs:18]
        mov ax, si
        xchg al, ah
        mov si, ax
        mov ax, [gs:22]
        xchg al, ah
        mov [se_id_end], ax
        sub ax, si
        cmp ax, 2
        jb .bad
        mov cx, [gs:si]
        xchg cl, ch
        mov dx, [se_ptr_count]
        sub dx, 2
        cmp cx, dx
        ja .bad
        mov dx, cx
        shl dx, 2
        jc .bad
        add dx, 2
        jc .bad
        cmp dx, ax
        jne .bad
        mov word [se_selected], 0
        mov word [se_previous_id], 0
        mov byte [se_seen_id], 0
        add si, 2
.id:
        jcxz .selected
        mov ax, [gs:si]
        xchg al, ah
        cmp byte [se_seen_id], 0
        je .first
        cmp ax, [se_previous_id]
        jbe .bad
.first:
        mov byte [se_seen_id], 1
        mov [se_previous_id], ax
        mov bx, [gs:si+2]
        xchg bl, bh
        or bx, bx
        jz .bad
        mov dx, [se_ptr_count]
        dec dx
        cmp bx, dx
        jae .bad
        cmp ax, [want_mon]
        jne .next_id
        mov [se_selected], bx
.next_id:
        add si, 4
        dec cx
        jmp .id
.selected:
        mov bx, [se_selected]
        xor cx, cx
        or bx, bx
        jz .ok
        shl bx, 2
        add bx, 16
        mov ax, [gs:bx+2]
        xchg al, ah
        mov si, ax
        mov ax, [gs:bx+6]
        xchg al, ah
        sub ax, si
        mov cx, ax
.ok:
        clc
        ret
.bad:
        stc
        ret

; Validate raw, whole-member word padding, stride in BX (63 or 9).
se_aux_stride:
        test cx, 1
        jnz .bad
        mov ax, cx
        xor dx, dx
        div bx
        or dx, dx
        jz .ok
        cmp dx, 1
        jne .bad
        mov di, si
        add di, cx
        cmp byte [gs:di-1], 0
        jne .bad
        dec cx
        test cx, 1
        jz .bad
.ok:
        clc
        ret
.bad:
        stc
        ret

se_fill_enemy:
        mov [se_enemy], di
        cmp byte [mon_glib], 1
        jne .bad
        cmp word [mon_raw_size], 440
        jne .bad
        mov si, monraw
        mov di, se_catalog
        call ss_begin
        jc .bad
        mov si, se_inventory_name
        call se_read_aux
        jc .bad
        mov bx, 63
        call se_aux_stride
        jc .bad
        mov [se_item_cursor], si
        mov [se_item_bytes], cx
        mov dword [se_item_index], 0
.item:
        cmp word [se_item_bytes], 0
        je .finish
        mov si, [se_item_cursor]
        mov di, se_item
        mov cx, 63
.copy:
        mov al, [gs:si]
        inc si
        stosb
        loop .copy
        mov [se_item_cursor], si
        mov si, se_item
        mov eax, [se_item_index]
        call cs_item
        jc .bad
        inc dword [se_item_index]
        sub word [se_item_bytes], 63
        jmp .item
.finish:
        call ss_finish
        jc .bad
        mov si, se_effects_name
        call se_read_aux
        jc .bad
        mov bx, 9
        call se_aux_stride
        jc .bad                      ; effect payloads are required, not applied here
        mov di, [se_enemy]
        movzx ax, byte [monraw+437]
        mov [di+C_HP], ax
        movzx ax, byte [monraw+112]
        mov [di+C_MAXHP], ax
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
        movzx ax, byte [monraw+289]
        mov [di+C_HALFATT], ax
        mov al, [monraw+290]
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
        mov word [di+C_XP], 0          ; XP has no support claim in this profile
        clc
        ret
.bad:
        stc
        ret

; Headerless Secret member. Same packet grammar as HLIB, fixed output440.
se_rle_to_monraw:
        mov word [mon_raw_size], 0
        mov si, [hlib_mem_start]
        mov dx, [hlib_mem_end]
        mov di, monraw
        xor bx, bx
.loop:
        cmp si, dx
        jae .done
        mov al, [fs:si]
        inc si
        cmp al, 80h
        je .loop
        ja .repeat
        movzx cx, al
        inc cx
        mov ax, dx
        sub ax, si
        cmp cx, ax
        ja .bad
        mov ax, 440
        sub ax, bx
        cmp cx, ax
        ja .bad
.literal:
        mov al, [fs:si]
        inc si
        stosb
        inc bx
        loop .literal
        jmp .loop
.repeat:
        movzx cx, al
        neg cx
        add cx, 257
        cmp si, dx
        jae .bad
        mov ax, 440
        sub ax, bx
        cmp cx, ax
        ja .bad
        mov al, [fs:si]
        inc si
        rep stosb
        mov bx, di
        sub bx, monraw
        jmp .loop
.done:
        cmp bx, 440
        jne .bad
        cmp byte [monraw+439], 0
        jne .bad
        mov [mon_raw_size], bx
        clc
        ret
.bad:
        stc
        ret

; Preserve the normalized FS MONCHA archive. Validate an original-endian
; copy in the independent GS bank before selecting any headerless member.
se_mon_member:
        cmp byte [mon_glib], 1
        jne .bad
        mov ax, [dax_len]
        cmp ax, [se_mon_file_len]
        jne .bad
        push es
        push gs
        pop es
        xor si, si
        xor di, di
        mov cx, [dax_len]
        fs rep movsb
        pop es
        mov si, 16
        mov cx, [hlib_ptr_count]
.ptr:
        mov ax, [gs:si]
        mov dx, [gs:si+2]
        xchg al, ah
        xchg dl, dh
        mov [gs:si], dx
        mov [gs:si+2], ax
        add si, 4
        loop .ptr
        mov ax, [dax_len]
        mov [se_file_len], ax
        call se_find_member
        jc .bad
        jcxz .bad
        mov [hlib_mem_start], si
        add si, cx
        mov [hlib_mem_end], si
        jmp se_rle_to_monraw
.bad:
        stc
        ret

; BX=open MONCHA handle. Explicit profiles require actual EOF validation,
; rather than accepting a truncated 32KiB legacy scratch read as a whole file.
se_check_mon_size:
        mov ax, 4202h
        xor cx, cx
        xor dx, dx
        int 21h
        jc .bad
        or dx, dx
        jnz .bad
        cmp ax, 16
        jb .bad
        cmp ax, DAX_FILEMAX
        ja .bad
        mov [se_mon_file_len], ax
        mov ax, 4200h
        xor cx, cx
        xor dx, dx
        int 21h
        ret
.bad:
        stc
        ret

secret_profile db 0
secret_party_loaded db 0
se_mon_file_len dw 0
se_catalog_missing db 0
se_profile_message db 'Combat source: Secret Amiga normal melee (/9 1)',13,10,'$'
se_catalog_name db 'ITEMS.DAT',0
se_disk_catalog db '..\DISK1\ITEMS.DAT',0
se_inventory_name db 'MONITM.GLB',0
se_effects_name db 'MONSPC.GLB',0
se_filename times 96 db 0
se_catalog times 2049 db 0
se_item times 63 db 0
se_fh dw 0
se_file_len dw 0
se_ptr_count dw 0
se_id_end dw 0
se_previous_id dw 0
se_seen_id db 0
se_selected dw 0
se_enemy dw 0
se_item_cursor dw 0
se_item_bytes dw 0
se_item_index dd 0
%include "secretstats.inc"
%include "secretplayerstats.inc"
%include "secretroster.inc"
%include "secretcombatparty.inc"
