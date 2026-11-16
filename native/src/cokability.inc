; CoK DB:8E strength/charisma updates for a staged character.
; 386, 16-bit near calls, DS=ES caller data, DF clear; clobbers registers.
; ca_begin: SI=409-byte body, AL=0 strength or 5 charisma; CF invalid mode.
; ca_item: SI=63-byte live item, in chain order.
; ca_effect: SI=9-byte live effect, in chain order (first matching ID wins).
; ca_finish: publish only the selected ability bytes into the staged body.
; Call begin, all items, all effects, finish. No pointers dereferenced from
; records, allocations, record-count limits or file I/O. Caller stages owners.

ca_begin:
        cmp al, 0
        je .valid
        cmp al, 5
        je .valid
        stc
        ret
.valid:
        mov [ca_mode], al
        mov [ca_body], si
        mov byte [ca_forced], 0
        mov word [ca_candidate], 0
        mov dword [ca_seen], 0
        mov dword [ca_flags], 0
        mov al, [si+16]
        mov ah, [si+29]
        cmp byte [ca_mode], 0
        je .store
        mov al, [si+26]
.store: mov [ca_value], ax
        clc
        ret

ca_item:
        cmp byte [si+52], 0
        je ca_ok
        mov al, [si+62]
        cmp al, 128
        jbe ca_ok
        and al, 127
        mov ah, [si+61]
        mov bx, [ca_body]
        cmp byte [ca_mode], 0
        jne .charisma
        cmp al, 3
        je .hundred
        cmp al, 5
        je .giant
        cmp al, 8
        je .strength_eight
        cmp al, 13
        jne .consider
        mov byte [ca_forced], 1
        jmp .consider
.giant: test ah, ah
        jz .hundred
        cmp ah, 6
        ja .consider
        add ah, 18
        mov [ca_candidate], ah
        jmp .consider
.hundred:
        mov word [ca_candidate], 100*256+18
        jmp .consider
.strength_eight:
        test ah, ah
        jnz .consider
        mov al, [bx+16]
        cmp al, 18
        jae .consider
        inc al
        xor ah, ah
        mov [ca_candidate], ax
.consider:
        mov ax, [ca_candidate]
        call ca_consider
        jmp ca_ok
.charisma:
        cmp al, 6
        jne .charisma_eight
        dec byte [ca_value]
        jmp ca_ok
.charisma_eight:
        cmp al, 8
        jne ca_ok
        cmp ah, 5
        jne ca_ok
        cmp byte [bx+26], 18
        jae ca_ok
        inc byte [ca_value]
ca_ok: clc
        ret

ca_effect:
        xor bx, bx
        mov al, [si]
.find: cmp al, [ca_kinds+bx]
        je .found
        inc bx
        cmp bx, 4
        jb .find
        jmp ca_ok
.found: cmp byte [ca_seen+bx], 0
        jne ca_ok
        mov byte [ca_seen+bx], 1
        mov al, [si+3]
        mov [ca_flags+bx], al
        jmp ca_ok

; AL candidate strength, AH exceptional. Unsigned comparison is intentional:
; an 18/100 candidate may replace strength 24 with a lower exceptional byte.
ca_consider:
        cmp al, [ca_value]
        ja .replace
        cmp al, 18
        jne .done
        cmp ah, [ca_value+1]
        jbe .done
.replace:
        mov [ca_value], ax
.done:  ret

; AL encoded effect flags -> AL strength, AH exceptional.
ca_decode:
        and al, 127
        xor ah, ah
        cmp al, 101
        ja .high
        dec al
        mov ah, al
        mov al, 18
        ret
.high: sub al, 100
        ret

ca_finish:
        mov si, [ca_body]
        cmp byte [ca_mode], 0
        jne .charisma
        cmp byte [ca_seen], 0
        je .later
        mov al, [ca_flags]
        call ca_decode
        cmp byte [ca_value], 18
        ja .consider
        cmp byte [ca_value+1], 100
        jae .consider
        add al, [ca_value]
        cmp al, 18
        jbe .consider
        xor bx, bx
.level: mov di, [ca_levels+bx]
        add di, si
        cmp byte [di], 0
        jg .exceptional
        add bx, 2
        cmp bx, 12
        jb .level
        jmp .eighteen
.exceptional:
        sub al, 18
        mov dl, 10
        mul dl
        add al, [si+28]
        cmp al, 100
        jbe .cap_done
        mov al, 100
.cap_done:
        mov ah, al
.eighteen:
        mov al, 18
.consider:
        call ca_consider
.later: cmp byte [ca_seen+1], 0
        je .third
        mov al, [ca_flags+1]
        call ca_decode
        call ca_consider
.third: cmp byte [ca_seen+2], 0
        je .write
        mov al, [ca_flags+2]
        call ca_decode
        call ca_consider
.write: mov ax, [ca_value]
        cmp byte [ca_forced], 0
        je .strength_write
        mov ax, 3
.strength_write:
        mov [si+17], al
        mov [si+28], ah
        jmp ca_ok
.charisma:
        mov al, [ca_value]
        cmp byte [ca_seen+3], 0
        je .charisma_write
        add al, [ca_flags+3]
.charisma_write:
        mov [si+27], al
        jmp ca_ok

ca_body dw 0
ca_mode db 0
ca_forced db 0
ca_candidate dw 0
ca_value dw 0
ca_seen times 4 db 0
ca_flags times 4 db 0
ca_kinds db 26h,71h,0Ch,0Eh
ca_levels dw 251,259,256,264,253,261
