; Native Secret normal player setup, independent of original instructions.
; sp_calculate: DS=ES, SI=440-byte source (SAV439 +zero), DI=catalog2048,
; GS=owned STF bank, BX=start, CX=length. Read-only inputs. CF rejects.
; Result: sp_body retains complete staged439; ss_body has normal fields.
sp_calculate:
        mov [sp_catalog], di
        mov [sp_start], bx
        mov ax, bx
        add ax, cx
        jc sp_bad
        mov [sp_end], ax
        mov di, sp_body
        mov cx, 440
        rep movsb
        mov si, sp_body
        mov di, [sp_catalog]
        call ss_begin
        jc sp_bad
        mov byte [sp_pass], 0
        call sp_items
        jc sp_bad
        call ss_finish
        jc sp_bad
        mov si, cs_slots
        mov di, sp_slots
        mov cx, 13
        rep movsd
        call sp_class
        jc sp_bad
        mov si, sp_body
        mov di, [sp_catalog]
        call ss_begin
        jc sp_bad
        mov byte [sp_pass], 1
        call sp_items
        jc sp_bad
        call ss_finish
        ret
sp_bad:
        stc
        ret

sp_items:
        movzx eax, word [sp_start]
        mov [sp_main_index], eax
        mov [sp_cursor], ax
.next:
        mov si, [sp_cursor]
        cmp si, [sp_end]
        je .done
        mov ax, [sp_end]
        sub ax, si
        cmp ax, 67
        jb sp_bad
        mov di, sp_record
        mov cx, 67
.copy:
        mov al, [gs:si]
        inc si
        stosb
        loop .copy
        mov [sp_cursor], si
        cmp byte [sp_record+46], 128
        jae sp_bad
        cmp byte [sp_record+46], 73
        jne .ready
        movzx ax, byte [sp_record+57]
        imul ax, ax, 67
        add ax, si
        jc sp_bad
        cmp ax, [sp_end]
        ja sp_bad
        mov [sp_cursor], ax          ; flat owned children; never equip them
.ready:
        cmp byte [sp_pass], 0
        je .feed
        movzx eax, si
        sub ax, 67                   ; stable main-node byte offset in GS
        mov di, sp_slots
        mov cx, 13
.slot:
        cmp [di], eax
        je .selected
        add di, 4
        loop .slot
        jmp .feed
.selected:
        movzx bx, byte [sp_record+46]
        shl bx, 4
        add bx, [sp_catalog]
        mov al, [bx+13]
        test al, [sp_body+304]
        jnz .feed
        cmp byte [sp_record+54], 0
        jne .feed
        mov byte [sp_record+52], 0
.feed:
        mov eax, [sp_main_index]
        mov si, sp_record
        call cs_item
        jc sp_bad
        movzx eax, word [sp_cursor]
        mov [sp_main_index], eax
        jmp .next
.done:
        clc
        ret

sp_class:
        mov byte [sp_body+106], 0
        xor bx, bx
.current:
        movzx ax, byte [sp_body+273+bx]
        cmp ax, 18
        ja sp_bad
        cmp byte [sp_body+280+bx], 18
        ja sp_bad
        cmp al, [sp_body+238]
        jle .max_set
        mov [sp_body+238], al
.max_set:
        push bx
        push ax
        call sp_thac
        pop dx
        pop bx
        cmp al, [sp_body+106]
        jbe .rate
        mov [sp_body+106], al
.rate:
        mov ax, dx
        call sp_rate
        inc bx
        cmp bx, 7
        jb .current
        mov byte [sp_body+304], 0
        xor bx, bx
.mask:
        cmp byte [sp_body+273+bx], 0
        jne .include
        mov al, [sp_body+280+bx]
        or al, al
        jz .mask_next
        cmp al, [sp_body+238]
        jge .mask_next
.include:
        mov al, [sp_bits+bx]
        add [sp_body+304], al
.mask_next:
        inc bx
        cmp bx, 7
        jb .mask
        xor ax, ax
        cmp byte [sp_body+107], 6
        jne .eligible
        xor bx, bx
.first:
        mov al, [sp_body+273+bx]
        or al, al
        jnz .eligible
        inc bx
        cmp bx, 7
        jb .first
.eligible:
        cmp al, [sp_body+239]
        jle .done
        xor bx, bx
.old:
        movzx ax, byte [sp_body+280+bx]
        push bx
        push ax
        call sp_thac
        pop dx
        pop bx
        cmp al, [sp_body+106]
        jbe .old_rate
        mov [sp_body+106], al
.old_rate:
        mov ax, dx
        call sp_rate
        inc bx
        cmp bx, 7
        jb .old
.done:
        clc
        ret

; BX class slot, AL level. Both current/history use identical thresholds.
sp_rate:
        cmp bx, 2
        jb .done
        cmp bx, 3
        jbe .fighter
        cmp bx, 4
        jne .done
        cmp al, 8
        jb .done
        mov byte [sp_body+289], 3
        cmp al, 15
        jb .done
        jmp .four
.fighter:
        cmp al, 7
        jb .done
        mov byte [sp_body+289], 3
        cmp al, 13
        jb .done
.four:
        mov byte [sp_body+289], 4
.done:
        ret

; BX class slot, AX level0..18 -> AL=60-THAC. Facts expressed as rules.
sp_thac:
        cmp bx, 1
        ja .martial
        or ax, ax
        jz .forty
        dec ax
        xor dx, dx
        mov cx, 3
        div cx
        shl ax, 1
        add al, 40
        ret
.martial:
        cmp bx, 4
        ja .caster
        or ax, ax
        jnz .nonzero
        cmp bx, 2
        jne .forty
        mov al, 39
        ret
.nonzero:
        cmp ax, 2
        jbe .forty
        add al, 39
        ret
.caster:
        cmp bx, 5
        jne .thief
        mov dl, 39
        cmp al, 5
        jbe .return_dl
        mov dl, 41
        cmp al, 10
        jbe .return_dl
        mov dl, 43
        cmp al, 15
        jbe .return_dl
        mov dl, 46
        jmp .return_dl
.thief:
        mov dl, 40
        cmp al, 4
        jbe .return_dl
        mov dl, 41
        cmp al, 8
        jbe .return_dl
        mov dl, 44
        cmp al, 12
        jbe .return_dl
        mov dl, 46
        cmp al, 16
        jbe .return_dl
        mov dl, 48
.return_dl:
        mov al, dl
        ret
.forty:
        mov al, 40
        ret

sp_catalog dw 0
sp_start dw 0
sp_end dw 0
sp_cursor dw 0
sp_main_index dd 0
sp_pass db 0
sp_bits db 2,16,8,64,64,1,4
sp_slots times 13 dd 0
sp_record times 67 db 0
sp_body times 440 db 0
