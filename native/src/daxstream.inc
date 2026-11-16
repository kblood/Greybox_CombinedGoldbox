; Bounded DAX RLE streaming, preserving the existing declared input-size cap.
; decode_dax_stream: DS owns fh/dax_comp/blklen, compbuf[SCRATCH_CAP],
; blk[BLKCAP]. fh is open and positioned at the compressed member span.
; CF rejects IO/short reads, incomplete packets or output overflow. Caller
; owns closing fh and must also check close CF. ES is preserved; others scratch.
; Declared trailing packed bytes are read/checked but ignored after exact raw
; output, matching the previous decoder's opaque trailing-byte behavior.
decode_dax_stream:
        push es
        push ds
        pop es
        mov ax, [dax_comp]
        cmp ax, DAXCOMP_CAP
        ja .bad
        mov [ds_left], ax
        mov ax, [blklen]
        cmp ax, BLKCAP
        ja .bad
        mov word [ds_available], 0
        mov word [dax_out], 0
        mov di, blk
.next:
        mov ax, [dax_out]
        cmp ax, [blklen]
        je .drain
        call ds_byte
        jc .bad
        cmp al, 80h
        jae .repeat
        movzx cx, al
        inc cx
        xor bx, bx                 ; literal packet
        jmp .range
.repeat:
        neg al                     ; 80h ->128, FFh ->1
        movzx cx, al
        mov bx, 1
.range:
        mov ax, [blklen]
        sub ax, [dax_out]
        cmp cx, ax
        ja .bad
        add [dax_out], cx
        test bx, bx
        jnz .repeat_value
.literal:
        call ds_byte
        jc .bad
        stosb
        loop .literal
        jmp .next
.repeat_value:
        call ds_byte
        jc .bad
        rep stosb
        jmp .next
.drain:
        cmp word [ds_left], 0
        je .ok
        ; Buffered trailing data has already passed the exact DOS read.
        ; Check every remaining declared byte, without interpreting padding.
        call ds_refill
        jc .bad
        jmp .drain
.ok:    pop es
        clc
        ret
.bad:   pop es
        stc
        ret

; AL next compressed byte. Packet CX and output DI survive refills.
ds_byte:
        cmp word [ds_available], 0
        jne .have
        call ds_refill
        jc .bad
.have:
        mov si, [ds_cursor]
        lodsb
        mov [ds_cursor], si
        dec word [ds_available]
        clc
        ret
.bad:   stc
        ret

ds_refill:
        push bx
        push cx
        push dx
        mov cx, [ds_left]
        jcxz .bad
        cmp cx, SCRATCH_CAP
        jbe .size
        mov cx, SCRATCH_CAP
.size:
        mov bx, [fh]
        mov dx, compbuf
        mov ah, 3Fh
        int 21h
        jc .bad
        cmp ax, cx
        jne .bad
        sub [ds_left], ax
        mov [ds_available], ax
        mov word [ds_cursor], compbuf
        pop dx
        pop cx
        pop bx
        clc
        ret
.bad:
        pop dx
        pop cx
        pop bx
        stc
        ret

ds_left dw 0
ds_available dw 0
ds_cursor dw 0
