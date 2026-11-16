; Clean-room full Secret R stage. No file I/O, pointer traversal or publication.
; DS=ES; SI=SAV439+zero, DI=catalog2048. GS=owned STF, BX=start,CX=extent;
; FS=owned SFX, DX=start,EAX=extent; BP=bank1+6E4 word. Caller admits all banks.
; CF0: rp_body439, cs_slots logical offsets, rp_ready_weight/rp_movement.
; CF1: discard entire private stage. Inputs/segments remain unchanged.
rp_calculate:
        mov byte [rp_valid], 0
        mov [rp_catalog], di
        mov [rp_move_context], bp
        mov [rp_stf_start], bx
        add bx, cx
        jc rp_bad
        mov [rp_stf_end], bx
        cmp eax, 65535
        ja rp_bad
        mov [rp_sfx_start], dx
        add dx, ax
        jc rp_bad
        mov [rp_sfx_end], dx
        mov di, rp_body
        mov cx, 440
        rep movsb
        mov si, rp_body
        mov di, [rp_catalog]
        call ss_begin
        jc rp_bad
        mov si, [rp_stf_start]
.main:
        cmp si, [rp_stf_end]
        je .coins
        mov ax, [rp_stf_end]
        sub ax, si
        cmp ax, 67
        jb rp_bad
        mov [rp_cursor], si
        mov di, rp_item
        mov cx, 67
.copy:  mov al, [gs:si]
        inc si
        stosb
        loop .copy
        cmp byte [rp_item+46], 73
        jne .feed
        movzx ax, byte [rp_item+57]
        imul ax, ax, 67
        add si, ax
        jc rp_bad
        cmp si, [rp_stf_end]
        ja rp_bad
.feed:  mov [rp_next], si
        movzx eax, word [rp_cursor]
        mov si, rp_item
        call cs_item
        jc rp_bad
        mov si, [rp_next]
        jmp .main
.coins:
        xor ax, ax
        mov si, rp_body+259
        mov cx, 7
.sum:   add ax, [si]
        add si, 2
        loop .sum
        ; Supply the wrapped seven-word aggregate to the shared six-cell
        ; coefficient scratch only. No incoming P1 money cells are rewritten.
        mov [ss_body+237], ax
        xor ax, ax
        mov di, ss_body+239
        mov cx, 5
        rep stosw
        call ss_finish
        jc rp_bad
        mov al, [ss_body+322]
        mov [rp_body+352], al
        mov eax, [ss_body+379]
        mov [rp_body+409], eax
        mov ax, [ss_body+396]
        mov [rp_body+426], ax
        mov al, [ss_body+398]
        mov [rp_body+428], al
        mov eax, [ss_body+401]
        mov [rp_body+431], eax
        mov ax, [ss_body+405]
        mov [rp_body+435], ax
        mov ax, [cs_equipped_weight]
        mov [rp_ready_weight], ax
        xor bx, bx                     ; effect presence bits39,42,74
        mov si, [rp_sfx_start]
.effect:
        cmp si, [rp_sfx_end]
        je .movement
        mov ax, [rp_sfx_end]
        sub ax, si
        cmp ax, 9
        jb rp_bad
        mov al, [fs:si]
        cmp al, 39
        jne .half
        or bl, 1
.half:  cmp al, 42
        jne .double
        or bl, 2
.double:
        cmp al, 74
        jne .next_effect
        or bl, 4
.next_effect:
        add si, 9
        jmp .effect
.movement:
        mov al, [ss_body+408]
        test bl, 1
        jz .move_half
        add al, al
.move_half:
        test bl, 2
        jz .move_double
        shr al, 1
.move_double:
        test bl, 4
        jz .context
        add al, al
.context:
        cmp byte [rp_body+424], 0
        jne .return_movement
        add al, [rp_move_context]
.return_movement:
        add al, al
        mov [rp_movement], al
        shr al, 1
        mov [rp_body+438], al
        mov byte [rp_body+230], 1
        cmp byte [rp_body+107], 0
        je .ok
        cmp byte [rp_body+107], 7
        je .ok
        cmp byte [rp_body+275], 0
        jg .maximum
        cmp byte [rp_body+276], 0
        jg .maximum
        cmp byte [rp_body+277], 0
        jg .maximum
        cmp byte [rp_body+282], 0
        jle .ok
        cmp byte [rp_body+107], 6
        jne .ok
        mov si, rp_body+273
        mov cx, 6
.level: lodsb
        test al, al
        jnz .history
        loop .level
        mov al, [rp_body+279]
.history:
        cmp al, [rp_body+239]
        jle .ok
.maximum:
        mov al, [rp_body+275]
        cmp al, [rp_body+276]
        jae .third
        mov al, [rp_body+276]
.third: cmp al, [rp_body+277]
        jae .store
        mov al, [rp_body+277]
.store: mov [rp_body+230], al
.ok:    mov byte [rp_valid], 1
        clc
        ret
rp_bad: mov byte [rp_valid], 0
        stc
        ret

; DI=fixed-offer main67. Requires current successful R stage; read-only.
; CF0 AX=0 admit /1 source refusal. CF1 unsupported/missing stage.
rp_can_take:
        cmp byte [rp_valid], 1
        jne .bad
        cmp byte [di+46], 73
        je .bad
        cmp byte [di+46], 128
        jae .bad
        mov ax, [di+55]
        movzx cx, byte [di+57]
        test cx, cx
        jz .weight
        mul cx                         ; source retains only lowword
.weight:
        add ax, [rp_body+411]           ; item capacity total is word-wrapped
        mov dx, [cs_allowance]
        add dx, 1500
        cmp ax, dx
        ja .refuse
        cmp byte [rp_body+352], 15
        ja .refuse
        xor ax, ax
        clc
        ret
.refuse:
        mov ax, 1
        clc
        ret
.bad:   stc
        ret

rp_catalog dw 0
rp_move_context dw 0
rp_stf_start dw 0
rp_stf_end dw 0
rp_sfx_start dw 0
rp_sfx_end dw 0
rp_cursor dw 0
rp_next dw 0
rp_ready_weight dw 0
rp_movement db 0
rp_valid db 0
rp_body times 440 db 0
rp_item times 67 db 0
%include "secretstats.inc"
