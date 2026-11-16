; Read-only raw P1 peer classifier. Caller has independently admitted GRJ.
; DX canonical peer; DS=ES; physical kc journal open, no view/retained peer.
; CF0 AX:1 exactpre,2 exactpost,3 both,0 neither. CF1 IO/invalid input:
; never turn an IO failure into a mismatch/grant. Failed close retains peer.
; Journal/peer bytes, source handle and segments unchanged. Registers scratch.
; Uses existing kc_buf512/kc_cmp512 only. Source offsets are physical once.
rpeer_match_p1:
        cld
        mov word [kc_verified], 0
        mov ax, ds
        mov bx, es
        cmp ax, bx
        jne rpeer_bad
        cmp byte [kc_view_active], 0
        jne rpeer_bad
        cmp word [kc_fh], 0ffffh
        je rpeer_bad
        cmp word [kn_peer_fh], 0ffffh
        jne rpeer_bad
        mov [rpeer_path], dx
        mov si, 24
.bounds:
        mov eax, [rr_lengths+si]
        cmp eax, 16
        jb rpeer_bad
        cmp eax, 32768
        ja rpeer_bad
        add eax, [rr_offsets+si]
        jc rpeer_bad
        cmp eax, [kc_extent]
        ja rpeer_bad
        add si, 4
        cmp si, 32
        jb .bounds
        mov dx, [rpeer_path]
        mov ax, 3d00h
        int 21h
        jc rpeer_bad
        mov [kn_peer_fh], ax
        mov bx, ax
        mov ax, 4202h
        xor cx, cx
        xor dx, dx
        int 21h
        jc rpeer_close_bad
        mov [rpeer_length], ax
        mov [rpeer_length+2], dx
        ; An independent current-position query checks the returned end-seek
        ; position before its value is used for exact-size classification.
        mov ax, 4201h
        xor cx, cx
        xor dx, dx
        int 21h
        jc rpeer_close_bad
        cmp ax, [rpeer_length]
        jne rpeer_close_bad
        cmp dx, [rpeer_length+2]
        jne rpeer_close_bad
        mov byte [rpeer_mask], 0
        mov eax, [rpeer_length]
        cmp eax, [rr_lengths+24]
        jne .post_length
        or byte [rpeer_mask], 1
.post_length:
        cmp eax, [rr_lengths+28]
        jne .length_done
        or byte [rpeer_mask], 2
.length_done:
        cmp byte [rpeer_mask], 0
        je .close                 ; exact wrong EOF is a mismatch, not IO
        mov bx, [kn_peer_fh]
        mov ax, 4200h
        xor cx, cx
        xor dx, dx
        int 21h
        jc rpeer_close_bad
        or ax, dx
        jnz rpeer_close_bad
        mov word [rpeer_cursor], 0
.chunk:
        mov ax, [rpeer_length]
        sub ax, [rpeer_cursor]
        jz .eof
        cmp ax, 512
        jbe .bounded
        mov ax, 512
.bounded:
        mov [rpeer_chunk], ax
        mov cx, ax
        mov dx, kc_cmp
        mov bx, [kn_peer_fh]
        mov ah, 3fh
        int 21h
        jc rpeer_close_bad
        cmp ax, [rpeer_chunk]
        jne rpeer_close_bad
        test byte [rpeer_mask], 1
        jz .post
        mov eax, [rr_offsets+24]
        call rpeer_compare
        jc rpeer_close_bad
        jz .post
        and byte [rpeer_mask], 2
.post:
        test byte [rpeer_mask], 2
        jz .next
        mov eax, [rr_offsets+28]
        call rpeer_compare
        jc rpeer_close_bad
        jz .next
        and byte [rpeer_mask], 1
.next:
        mov ax, [rpeer_chunk]
        add [rpeer_cursor], ax
        jmp .chunk                ; read ALL peer bytes even after mismatch
.eof:
        mov bx, [kn_peer_fh]
        mov dx, kc_cmp
        mov cx, 1
        mov ah, 3fh
        int 21h
        jc rpeer_close_bad
        test ax, ax
        jnz rpeer_close_bad
.close:
        call kn_peer_close
        jc rpeer_bad
        movzx ax, byte [rpeer_mask]
        call rpeer_restore_flags
        clc
        ret
rpeer_close_bad:
        call kn_peer_close
rpeer_bad:
        call rpeer_restore_flags
        xor ax, ax
        stc
        ret

; EAX physical side base; CF1 source IO, CF0 ZF1 equal/ZF0 different.
rpeer_compare:
        movzx edx, word [rpeer_cursor]
        add eax, edx
        mov cx, [rpeer_chunk]
        mov di, kc_buf
        call kc_read_at
        jc .bad
        mov si, kc_buf
        mov di, kc_cmp
        mov cx, [rpeer_chunk]
        repe cmpsb
        clc                        ; retain comparison ZF
        ret
.bad:   stc
        ret
rpeer_restore_flags:
        mov byte [kn_peer_exact], 1
        mov byte [kn_bank_compare], 0
        mov byte [kn_normalize], 0
        ret

rpeer_path dw 0
rpeer_length dd 0
rpeer_cursor dw 0
rpeer_chunk dw 0
rpeer_mask db 0
