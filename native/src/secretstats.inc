; Secret record/equipment normal coefficients, verified against GAME.OVR.
; DS=ES. ss_begin: SI=440-byte source, DI=2048-byte item catalogue.
; cs_item consumes each owned 63-byte inventory record with stable EAX index.
; ss_finish leaves the projected normal fields in ss_body; CF rejects input.
; Effects, position, backstab and other actors' transient state are separate.
ss_begin:
        mov [ss_source], si
        cmp byte [si+439], 0
        jne ss_bad
        movzx cx, byte [si]
        cmp cx, 1
        jb ss_bad
        cmp cx, 15
        ja ss_bad
        push si
        inc si
.name:
        cmp byte [si], 32
        jb .name_bad
        cmp byte [si], 127
        jae .name_bad
        inc si
        loop .name
        pop si
        push di
        mov di, ss_body
        mov cx, 29
        rep movsb
        mov si, [ss_source]
        mov ax, [si+106]
        mov [ss_body+89], ax
        add si, 230
        mov di, ss_body+206
        mov cx, 55
        rep movsb
        mov si, [ss_source]
        add si, 291
        mov di, ss_body+269
        mov cx, 8
        rep movsb
        mov si, [ss_source]
        add si, 353
        mov di, ss_body+323
        mov cx, 86
        rep movsb
        pop di
        mov si, ss_body
        jmp cs_begin
.name_bad:
        pop si
ss_bad:
        stc
        ret

ss_finish:
        call cs_finish
        jc ss_bad
        cmp dword [cs_slots], 0FFFFFFFFh
        je .done
        mov al, [cs_weapon+46]
        cmp byte [ss_body+90], 5
        jne .kind
        cmp al, 67
        jne .kind
        sub byte [ss_body+396], 2 ; Secret has no CoK Kender/hoopak bonus.
.kind:
        cmp byte [ss_body+90], 1
        jbe .done
        cmp al, 18
        je .bonus
        cmp al, 19
        je .bonus
        cmp al, 22
        jb .done
        cmp al, 26
        ja .done
.bonus:
        inc byte [ss_body+396] ; Secret weapon-kind bonus is not race-gated.
.done:
        clc
        ret

ss_source dw 0
ss_body times 409 db 0
%include "cokstats.inc"
