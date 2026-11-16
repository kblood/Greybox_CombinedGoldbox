; Known Secret actor getters precede sparse variables and GETTABLE fallback.
; BX=selector -> CF0/AX=word when handled; CF1 for all other selectors/titles.
; Null is an original far-pointer zero: observe the live IVT byte at getter
; time. It never aliases actor1, nor is ambient device state frozen CLI input.
secret_field_get:
        cmp byte [is_gen2],2
        jne .other
        push cx
        push si
        mov cx,7
        mov si,sf_selectors
.scan:  cmp bx,[si]
        je .known
        add si,2
        loop .scan
        pop si
        pop cx
.other: stc
        ret
.known:
        sub si,sf_selectors
        cmp byte [selected_valid],0
        je .null
        cmp byte [who_fields_valid],1
        jne .unavailable
        ; Old six-column capabilities grant only their original selectors.
        cmp si,12
        jne .row
        cmp byte [who_field_columns],7
        jne .unavailable
.row:
        mov ax,[selected_party]
        dec ax
        cmp ax,[party_count]
        jae .unavailable
        movzx cx,byte [who_field_columns]
        shl cx,1
        imul ax,cx
        add si,ax
        mov ax,[who_fields+si]
        jmp .done
.null:  shr si,1
        movzx si,byte [sf_offsets+si]
        push es
        xor ax,ax
        mov es,ax
        mov al,[es:si]
        cmp si,107
        je .signed
        cmp si,108
        jne .unsigned
.signed:
        cbw
        jmp .device_done
.unsigned:
        xor ah,ah
.device_done:
        pop es
.done:  pop si
        pop cx
        clc
        ret
.unavailable:
        ; Returning zero here would let arithmetic/store publish a made-up
        ; result. Restore exec_one's return boundary and halt before effects.
        cmp word [field_abort_sp],0
        jne .halt
        mov ax,4c01h                   ; non-VM admission cannot continue either
        int 21h
.halt:  mov sp,[field_abort_sp]
        mov ax,[ins_off]
        mov [pc],ax
        mov [halt_pc],ax
        mov word [halt_reason],HALT_BAD_OPCODE
        call halt_at_current
        ret
sf_selectors dw 7c15h,7c18h,7c19h,7c72h,7c73h,7c76h,7ca7h
sf_offsets db 19,25,27,107,108,112,245
