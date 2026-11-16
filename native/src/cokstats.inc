; CoK E6:43 equipment reconstruction for a staged character body.
; 386, 16-bit near calls, DS=ES=the caller's data segment; clobbers registers.
; cs_begin: SI=409-byte mutable body, DI=2048-byte ITEMS definitions.
; cs_item: SI=63-byte live item, EAX=stable 32-bit index (FFFFFFFF reserved).
; cs_finish: finishes the body; cs_slots contains 13 stable indices, FFFFFFFF
; for empty slots. Body equipment pointers are zero, other links untouched.
; Carry indicates rejection. Caller must discard its entire stage on failure.
; No allocation, item-count cap, original pointer dereference or file I/O.

cs_begin:
        mov [cs_body], si
        mov [cs_table], di
        movzx bx, byte [si+17]
        cmp bl, 25
        ja cs_bad
        cmp bl, 18
        jb .index
        ja .greater
        mov al, [si+28]
        cmp al, 100
        ja cs_bad
        mov di, cs_thresholds
        mov cx, 5
.threshold:
        cmp al, [di]
        jbe .next
        inc bx
.next:  inc di
        loop .threshold
        jmp .index
.greater:
        add bx, 5
.index: mov al, [cs_hits+bx]
        mov ah, [cs_damages+bx]
        cmp byte [si+276], 0
        jne .enabled
        xor ax, ax
.enabled:
        mov [cs_hit], al
        mov [cs_damage], ah
        shl bx, 1
        mov ax, [cs_allowances+bx]
        mov [cs_allowance], ax
        mov byte [si+322], 0
        mov byte [si+379], 0
        mov byte [si+380], 0
        mov word [si+381], 0
        mov word [cs_equipped_weight], 0
        mov byte [cs_magic], 0
        mov di, cs_parts
        xor ax, ax
        mov cx, 5
        rep stosb
        movzx bx, byte [si+23]
        cmp bx, 25
        ja .dex_done
        mov al, [cs_dex_ac+bx]
        mov [cs_parts], al
.dex_done:
        lea di, [si+327]
        xor ax, ax
        mov cx, 26
        rep stosw
        mov di, cs_slots
        mov eax, 0FFFFFFFFh
        mov cx, 13
        rep stosd
        mov ax, [si+269]
        mov [si+401], ax
        mov ax, [si+271]
        mov [si+403], ax
        mov ax, [si+273]
        mov [si+405], ax
        mov al, [si+275]
        mov [si+397], al
        mov al, [si+213]
        mov [si+408], al
        mov al, [si+89]
        mov [si+396], al
        clc
        ret

cs_item:
        cmp eax, 0FFFFFFFFh
        je cs_bad
        mov [cs_index], eax
        movzx bx, byte [si+46]
        cmp bx, 128
        jae cs_bad
        shl bx, 4
        add bx, [cs_table]
        mov di, [cs_body]
        inc byte [di+322]
        mov ax, [si+55]
        movzx cx, byte [si+57]
        jcxz .amount
        mul cx
.amount:
        add [di+381], ax
        cmp byte [si+52], 0
        je .done
        add [cs_equipped_weight], ax
        mov al, [bx+1]
        add [di+379], al
        movzx cx, byte [bx]
        cmp cx, 8
        jbe .slot
        cmp cx, 9
        jne .special
        cmp dword [cs_slots+36], 0FFFFFFFFh
        je .slot
        inc cx
        cmp dword [cs_slots+40], 0FFFFFFFFh
        jne .special
.slot:  push bx
        mov bx, cx
        shl bx, 2
        mov eax, [cs_index]
        mov [cs_slots+bx], eax
        pop bx
        test cx, cx
        jnz .special
        push si
        push di
        mov di, cs_weapon
        mov cx, 63
        rep movsb
        pop di
        pop si
.special:
        cmp byte [si+46], 30
        jne .aux12
        mov eax, [cs_index]
        mov [cs_slots+44], eax
        mov al, [si+50]
        mov [cs_aux11], al
.aux12: cmp byte [si+46], 12
        jne .armor
        mov eax, [cs_index]
        mov [cs_slots+48], eax
        mov al, [si+50]
        mov [cs_aux12], al
.armor: cmp byte [bx], 2
        jne .armor_bonus
        mov al, [di+213]
        cmp word [si+55], 150
        jbe .movement
        mov al, 9
        cmp word [si+55], 399
        jbe .movement
        mov al, 6
.movement:
        cmp byte [si+50], 0
        je .store_move
        cmp al, 9
        ja .store_move
        add al, 3
.store_move:
        mov [di+408], al
.armor_bonus:
        mov al, [bx+6]
        test al, 80h
        jz .done
        and ax, 007Fh
        movsx dx, byte [si+50]
        cmp byte [bx], 1
        jne .not_shield
        add al, dl
        mov [cs_parts+1], al
        jmp .done
.not_shield:
        test al, al
        jnz .base_armor
        cmp byte [bx], 9
        jne .other_bonus
        cmp dl, [cs_parts+3]
        jle .saving
        mov [cs_parts+3], dl
        jmp .saving
.other_bonus:
        add [cs_parts+2], dl
.saving:
        mov al, [si+51]
        add [di+380], al
        jmp .done
.base_armor:
        add ax, dx
        movsx cx, byte [cs_parts+4]
        cmp ax, cx
        jle .done
        mov [cs_parts+4], al
        test dx, dx
        jle .done
        cmp byte [bx], 2
        jne .done
        mov byte [cs_magic], 1
.done: clc
        ret

cs_finish:
        mov di, [cs_body]
        cmp dword [cs_slots], 0FFFFFFFFh
        jne .weapon
        mov al, [cs_hit]
        add [di+396], al
        mov al, [cs_damage]
        add [di+405], al
        jmp .armor
.weapon:
        mov si, cs_weapon
        movzx bx, byte [si+46]
        shl bx, 4
        add bx, [cs_table]
        mov al, [bx+11]
        mov [di+405], al
        test byte [bx+14], 2
        jz .strength
        movzx dx, byte [di+23]
        cmp dx, 25
        ja .strength
        push bx
        mov bx, dx
        mov al, [cs_dex_hit+bx]
        add [di+396], al
        pop bx
.strength:
        test byte [bx+14], 4
        jz .bonus
        mov al, [cs_hit]
        add [di+396], al
        mov al, [cs_damage]
        add [di+405], al
.bonus: mov al, [si+50]
        test byte [bx+14], 80h
        jz .aux12
        cmp dword [cs_slots+48], 0FFFFFFFFh
        je .aux12
        add al, [cs_aux12]
.aux12: test byte [bx+14], 1
        jz .damage
        cmp dword [cs_slots+44], 0FFFFFFFFh
        je .damage
        add al, [cs_aux11]
.damage:
        add [di+405], al
        cmp byte [di+90], 1
        ja .race5
        mov dl, [si+46]
        cmp dl, 18
        je .race_bonus
        cmp dl, 19
        je .race_bonus
        cmp dl, 22
        jb .race5
        cmp dl, 26
        ja .race5
.race_bonus:
        inc al
.race5: cmp byte [di+90], 5
        jne .hit
        cmp byte [si+46], 67
        jne .hit
        add al, 2
.hit:   add [di+396], al
        mov al, [bx+9]
        mov [di+401], al
        mov al, [bx+10]
        mov [di+403], al
.armor: cmp byte [cs_magic], 0
        je .coins
        mov byte [cs_parts+3], 0
.coins: mov ax, [di+381]
        lea si, [di+237]
        mov cx, 6
.coin:  add ax, [si]
        add si, 2
        loop .coin
        mov [di+381], ax
        sub ax, [cs_allowance]
        cmp ax, 512
        jle .ac
        mov dl, 9
        cmp ax, 768
        jle .cap
        mov dl, 6
        cmp ax, 1024
        jle .cap
        mov dl, 3
.cap:   cmp [di+408], dl
        jbe .ac
        mov [di+408], dl
.ac:    movsx ax, byte [cs_parts+4]
        movzx dx, byte [di+397]
        cmp ax, dx
        jge .sum
        mov [cs_parts+4], dl
.sum:   mov al, [cs_parts+2]
        add al, [cs_parts+3]
        add al, [cs_parts+4]
        mov ah, al
        sub ah, 2
        mov [di+398], ah
        add al, [cs_parts]
        add al, [cs_parts+1]
        mov [di+397], al
        mov byte [di+206], 1
        cmp byte [di+90], 7
        jge .done
        cmp byte [di+251], 0
        jg .level
        cmp byte [di+256], 0
        jg .level
        cmp byte [di+253], 0
        jg .level
        cmp byte [di+259], 0
        jle .done
        xor al, al
        cmp byte [di+90], 6
        jne .level_check
        lea si, [di+249]
        mov cx, 7
.find_level:
        lodsb
        test al, al
        jnz .level_check
        loop .find_level
        mov al, [di+256]
.level_check:
        cmp al, [di+215]
        jle .done
.level: mov al, [di+251]
        cmp al, [di+256]
        jae .third
        mov al, [di+256]
.third: cmp al, [di+253]
        jae .store_level
        mov al, [di+253]
.store_level:
        mov [di+206], al
.done:  clc
        ret

cs_bad: stc
        ret

cs_body dw 0
cs_table dw 0
cs_index dd 0
cs_slots times 13 dd 0FFFFFFFFh
cs_equipped_weight dw 0
cs_allowance dw 0
cs_hit db 0
cs_damage db 0
cs_magic db 0
cs_parts times 5 db 0
cs_aux11 db 0
cs_aux12 db 0
cs_weapon times 63 db 0
cs_thresholds db 0,50,75,90,99
cs_dex_ac db 0,-4,-4,-4,-3,-2,-1,0,0,0,0,0,0,0,0,1,2,3,4,4,4,5,5,5,6,6
cs_dex_hit db -4,-4,-4,-3,-2,-1,0,0,0,0,0,0,0,0,0,0,1,2,3,3,3,4,4,4,5,5
cs_hits db 0,-3,-3,-3,-2,-2,-1,-1,0,0,0,0,0,0,0,0,0,1,1,1,2,2,2,3,3,3,4,4,5,6,7
cs_damages db 0,-2,-2,-1,-1,-1,0,0,0,0,0,0,0,0,0,0,1,1,2,3,3,4,5,6,7,8,9,10,11,12,14
cs_allowances dw 0,-350,-350,-350,-250,-250,-150,-150,0,0,0,0,100,100,200,200,350,500,750,1000,1250,1500,2000,3000,4000,5000,6000,7500,9000,12000,15000
