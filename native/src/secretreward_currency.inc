; Closed fixed-offer Gems primitive. Requires the shared cs strength tables.
; DS:SI=admitted439 body, EAX=request0..20, EDX=remaining0..20.
; CF0 EAX=transferred, EDX=new remaining, CX=result1/2/3. CF1 invalid.
; Only body269/411 may change. No R, pointer writes, IO or owner publication.
rc_gems:
        cmp eax, 20
        ja .bad
        cmp edx, 20
        ja .bad
        movzx bx, byte [si+17]
        cmp bx, 25
        ja .bad
        cmp bx, 18
        jb .allowance
        ja .greater
        mov cl, [si+28]
        cmp cl, 100
        ja .bad
        mov di, cs_thresholds
        mov ch, 5
.threshold:
        cmp cl, [di]
        jbe .next
        inc bx
.next:  inc di
        dec ch
        jnz .threshold
        jmp .allowance
.greater:
        add bx, 5
.allowance:
        shl bx, 1
        movsx ecx, word [cs_allowances+bx]
        add ecx, 1500
        movzx ebx, word [si+411]
        add ebx, eax
        cmp ebx, ecx                    ; capacity BEFORE source pool clamp
        ja .refused
        cmp eax, edx
        jbe .amount
        mov eax, edx
.amount:
        sub edx, eax
        add [si+269], ax                ; original word wrapping
        add [si+411], ax
        mov cx, 1
        test eax, eax
        jnz .ok
        inc cx
.ok:    clc
        ret
.refused:
        xor eax, eax
        mov cx, 3
        clc
        ret
.bad:   stc
        ret
