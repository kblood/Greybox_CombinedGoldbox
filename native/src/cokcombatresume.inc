; After a validated GBCR v2 and successful roster update, publish CoK's final
; combat RNG into the paused GBEF before CCECL resumes. GBEF has no file CRC.
sync_combat_rng:
        cmp word [gamep], game_cok
        jne .ok
        cmp word [gbcrbuf+4], 2
        jne .fail
        mov dx, [effectreadp]
        mov ax, 3D02h
        int 21h
        jc .fail
        mov [efxfh], ax
        mov bx, ax
        mov ax, 4200h
        xor cx, cx
        mov dx, 126
        int 21h
        jc .close_fail
        mov bx, [efxfh]
        mov ah, 40h
        mov cx, 4
        mov dx, gbcrbuf+12
        int 21h
        jc .close_fail
        cmp ax, 4
        jne .close_fail
        mov bx, [efxfh]
        mov ah, 3Eh
        int 21h
        ret
.close_fail:
        mov bx, [efxfh]
        mov ah, 3Eh
        int 21h
.fail: stc
        ret
.ok:   clc
        ret

gbcr_read_len dw 0
s_arg_cok_rng db ' /J',0
